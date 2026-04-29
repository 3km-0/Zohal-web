import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import * as XLSX from "xlsx";
import { resolveDataPlane } from "../runtime/data-plane.js";
import {
  createChatCompletion,
  createEmbedding,
  resolveAIProvider,
} from "../runtime/ai-provider.js";
import {
  createHttpTask,
  buildDeterministicKey,
  getRuntimeSecret,
  startWorkflowExecution,
} from "../runtime/gcp.js";
import {
  generateSignedDownloadUrl,
  joinObjectPath,
  uploadBufferToGCS,
} from "../runtime/gcs.js";
import {
  getExpectedInternalToken,
  requireInternalCaller,
} from "../runtime/internal-auth.js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient } from "../runtime/supabase.js";

const DOCUMENT_INGESTION_QUEUE_NAME = String(
  process.env.GCP_DOCUMENT_INGESTION_TASK_QUEUE || "document-ingestion-jobs",
).trim();
const DOCUMENT_INGESTION_TASKS_LOCATION = String(
  process.env.GCP_TASKS_LOCATION || process.env.GCP_WORKFLOWS_LOCATION || "",
).trim();
const DOCUMENT_INGESTION_WORKFLOW = String(
  process.env.GCP_DOCUMENT_INGESTION_WORKFLOW || "document-ingestion-v1",
).trim();
const DOCUMENT_INGESTION_WORKFLOWS_LOCATION = String(
  process.env.GCP_WORKFLOWS_LOCATION || "",
).trim();
const DOCUMENT_INGESTION_PER_USER_CAP = Math.max(
  0,
  Number(process.env.DOCUMENT_INGESTION_PER_USER_CAP || 2),
);
const DOCUMENT_INGESTION_OCR_POLL_DELAY_SECONDS = Math.max(
  5,
  Number(process.env.DOCUMENT_INGESTION_OCR_POLL_DELAY_SECONDS || 60),
);
const TABULAR_SOURCE_FORMATS = new Set(["xlsx", "csv"]);
const INSIGHTS_DOC_TYPES = new Set([
  "contract",
  "legal_filing",
  "invoice",
  "financial_report",
  "meeting_notes",
  "other",
]);
const EMBEDDING_DEFAULT_MODEL = "text-embedding-3-small";
const EMBEDDING_DEFAULT_INDEX = "chunks-v1";
const EMBEDDING_DEFAULT_VERSION = "v1";
const PGVECTOR_INDEX_NAME = "document_chunks.embedding";
const PGVECTOR_KEY_PREFIX = "pgvector";
const RECONCILE_STUCK_THRESHOLD_MINUTES = 30;
const VISION_OCR_MAX_PAGES = 50;
const VISION_OCR_MAX_IMAGE_SIZE_MB = 10;

function getIngestionServiceBaseUrl(req) {
  const configured = String(process.env.INGESTION_SERVICE_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = String(req.headers.host || "").trim();
  if (!host) {
    throw new Error("INGESTION_SERVICE_BASE_URL not configured");
  }
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").trim();
  const proto = forwardedProto || "https";
  return `${proto}://${host}`;
}

export function normalizeUuid(id) {
  return String(id || "").trim().toLowerCase();
}

function stripBearer(value) {
  const raw = String(value || "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice("bearer ".length).trim() : raw;
}

function buildGcpEnvelope(requestId, body = {}) {
  return {
    ...body,
    request_id: requestId,
    execution_plane: "gcp",
  };
}

function getSourceMetadata(doc) {
  if (doc?.source_metadata && typeof doc.source_metadata === "object") {
    return doc.source_metadata;
  }
  return {};
}

function getDocumentSourceFormat(doc) {
  const sourceMetadata = getSourceMetadata(doc);
  const sourceFormat = String(
    sourceMetadata.source_format ||
      sourceMetadata.original_extension ||
      "",
  ).trim().toLowerCase();
  return sourceFormat;
}

function isTabularSourceFormat(value) {
  return TABULAR_SOURCE_FORMATS.has(String(value || "").trim().toLowerCase());
}

function hasDateLikePattern(text) {
  const value = String(text || "");
  if (!value) return false;
  const numericDate =
    /\b(?:19|20)\d{2}[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:0?[1-9]|[12]\d|3[01])\b|\b(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:19|20)?\d{2}\b/u;
  const monthWords =
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|(?:يناير|فبراير|مارس|ابريل|أبريل|مايو|يونيو|يوليو|اغسطس|أغسطس|سبتمبر|اكتوبر|أكتوبر|نوفمبر|ديسمبر)/iu;
  return numericDate.test(value) || monthWords.test(value);
}

function computeTextLayerMetrics({ pages, totalChars, pagesWithText }) {
  const pageCount = Array.isArray(pages) ? pages.length : 0;
  const avgCharsPerPage = pageCount > 0 ? totalChars / pageCount : 0;
  const textCoverage = pageCount > 0 ? pagesWithText / pageCount : 0;
  const combinedText = (pages || []).map((page) => String(page?.text || "")).join("\n");
  const hasDate = hasDateLikePattern(combinedText);
  const lowSignalTextLayer = pageCount > 0 &&
    pageCount <= 4 &&
    (
      textCoverage < 0.75 ||
      (avgCharsPerPage < 1200 && !hasDate)
    );

  return {
    pageCount,
    avgCharsPerPage,
    textCoverage,
    hasDate,
    lowSignalTextLayer,
  };
}

export function shouldFallbackToOcr({
  isCloudConvertDoc,
  ocrAlreadyCompleted,
  scanned,
  pages,
  totalChars,
  pagesWithText,
}) {
  const metrics = computeTextLayerMetrics({
    pages,
    totalChars,
    pagesWithText,
  });

  const shouldFallback = !isCloudConvertDoc &&
    !ocrAlreadyCompleted &&
    (
      scanned === true ||
      metrics.lowSignalTextLayer === true ||
      metrics.pageCount === 0
    );

  return {
    shouldFallback,
    ...metrics,
  };
}

export function buildWorkflowLaunchKey({ documentId, updatedAt, source }) {
  return buildDeterministicKey([
    normalizeUuid(documentId),
    String(updatedAt || "").trim(),
    String(source || "unknown").trim().toLowerCase(),
  ]);
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

async function computeHash(content) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(content || "")),
  );
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function splitIntoChunks(text, targetTokens = 400, overlapTokens = 50) {
  const chunks = [];
  const paragraphs = String(text || "").split(/\n\s*\n/);
  let currentChunk = "";
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    const paragraphTokens = estimateTokens(trimmedParagraph);
    if (currentTokens + paragraphTokens > targetTokens && currentChunk) {
      chunks.push(currentChunk.trim());
      const words = currentChunk.trim().split(/\s+/);
      const overlapWords = Math.ceil(overlapTokens / 1.5);
      const overlap = words.slice(-overlapWords).join(" ");
      currentChunk = overlap
        ? `${overlap}\n\n${trimmedParagraph}`
        : trimmedParagraph;
      currentTokens = estimateTokens(currentChunk);
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmedParagraph;
      currentTokens += paragraphTokens;
    }

    if (paragraphTokens > targetTokens) {
      const sentences = trimmedParagraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const sentenceTokens = estimateTokens(sentence);
        if (currentTokens + sentenceTokens > targetTokens && currentChunk) {
          chunks.push(currentChunk.trim());
          const words = currentChunk.trim().split(/\s+/);
          const overlapWords = Math.ceil(overlapTokens / 1.5);
          const overlap = words.slice(-overlapWords).join(" ");
          currentChunk = overlap ? `${overlap} ${sentence}` : sentence;
          currentTokens = estimateTokens(currentChunk);
        } else {
          currentChunk += ` ${sentence}`;
          currentTokens += sentenceTokens;
        }
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((chunk) => estimateTokens(chunk) >= 5);
}

function detectLanguage(text) {
  const value = String(text || "");
  const arabicChars = (value.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars = value.length || 1;
  return arabicChars / totalChars > 0.3 ? "ar" : "en";
}

function getMathpixProfile() {
  return {
    conversion_formats: {
      md: true,
      docx: false,
      "tex.zip": false,
    },
    math_inline_delimiters: ["$", "$"],
    math_display_delimiters: ["$$", "$$"],
    rm_spaces: true,
    enable_tables_fallback: true,
  };
}

async function checkAndIncrementHourlyUsage(supabase, userId, usageType, amount) {
  const { data, error } = await supabase.rpc("check_and_increment_hourly_usage", {
    p_user_id: normalizeUuid(userId),
    p_usage_type: usageType,
    p_amount: amount,
  });

  if (error) {
    const message = String(error.message || error);
    if (
      message.toLowerCase().includes("check_and_increment_hourly_usage") &&
      message.toLowerCase().includes("does not exist")
    ) {
      return {
        allowed: true,
        current: 0,
        limit: Number.MAX_SAFE_INTEGER,
        tier: "free",
      };
    }
    throw new Error(`hourly_usage_check_failed: ${message}`);
  }

  return data;
}

async function shouldThrottleUser(supabase, userId) {
  if (DOCUMENT_INGESTION_PER_USER_CAP <= 0) return false;
  const { count, error } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", normalizeUuid(userId))
    .eq("processing_status", "processing");

  if (error) return false;
  return (count || 0) >= DOCUMENT_INGESTION_PER_USER_CAP;
}

async function resolveStorageRouting({ supabase, workspaceId, storagePath }) {
  let bucketOverride = null;
  let effectivePrefix = null;

  try {
    if (workspaceId) {
      const plane = await resolveDataPlane({ workspaceId, supabase });
      if (
        plane.mode === "enterprise_firebase" &&
        plane.enterprise?.documents?.bucket
      ) {
        const prefix = plane.enterprise.documents.prefix ||
          (plane.enterprise.tenant_id
            ? `tenants/${String(plane.enterprise.tenant_id)}`
            : `workspaces/${workspaceId}`);
        const normalizedPath = String(storagePath || "");
        const looksEnterprise = normalizedPath === prefix ||
          normalizedPath.startsWith(`${prefix}/`);
        if (looksEnterprise) {
          bucketOverride = plane.enterprise.documents.bucket;
          effectivePrefix = null;
        }
      }
    }
  } catch {
    bucketOverride = null;
    effectivePrefix = null;
  }

  return { bucketOverride, effectivePrefix };
}

async function fetchDocumentOrThrow(supabase, documentId) {
  const { data, error } = await supabase
    .from("documents")
    .select([
      "id",
      "user_id",
      "workspace_id",
      "storage_path",
      "storage_bucket",
      "privacy_mode",
      "page_count",
      "ocr_status",
      "text_extraction_completed",
      "embedding_completed",
      "processing_status",
      "document_type",
      "title",
      "updated_at",
      "source_metadata",
    ].join(", "))
    .eq("id", normalizeUuid(documentId))
    .single();

  if (error || !data) {
    const message = error?.message || "Document not found";
    const wrapped = new Error(message);
    wrapped.statusCode = error?.code === "PGRST116" ? 404 : 404;
    throw wrapped;
  }

  return data;
}

async function requireDocumentCleanupAccess({ supabase, req, document }) {
  const token = stripBearer(req.headers.authorization || req.headers.Authorization || "");
  if (!token) {
    const error = new Error("Missing authorization token");
    error.statusCode = 401;
    throw error;
  }

  const { data, error } = await supabase.auth.getUser(token);
  const userId = normalizeUuid(data?.user?.id);
  if (error || !userId) {
    const authError = new Error("Invalid authorization token");
    authError.statusCode = 401;
    throw authError;
  }

  if (normalizeUuid(document.user_id) === userId) return userId;
  const workspaceId = normalizeUuid(document.workspace_id);
  if (!workspaceId) {
    const forbidden = new Error("forbidden");
    forbidden.statusCode = 403;
    throw forbidden;
  }

  const [{ data: workspace }, { data: member }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("owner_id", userId)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!workspace?.id && !member?.id) {
    const forbidden = new Error("forbidden");
    forbidden.statusCode = 403;
    throw forbidden;
  }
  return userId;
}

async function requireIngestionCaller({ supabase, req, payload }) {
  try {
    requireInternalCaller(req.headers);
    return { kind: "internal", userId: null };
  } catch {
    // Fall through to user auth for direct client calls.
  }

  const token = stripBearer(req.headers.authorization || req.headers.Authorization || "");
  if (!token) {
    const error = new Error("Missing authorization token");
    error.statusCode = 401;
    throw error;
  }
  const { data, error } = await supabase.auth.getUser(token);
  const userId = normalizeUuid(data?.user?.id);
  if (error || !userId) {
    const authError = new Error("Invalid authorization token");
    authError.statusCode = 401;
    throw authError;
  }

  if (payload.user_id && normalizeUuid(payload.user_id) !== userId) {
    const forbidden = new Error("forbidden");
    forbidden.statusCode = 403;
    throw forbidden;
  }

  if (payload.document_id) {
    const document = await fetchDocumentOrThrow(supabase, payload.document_id);
    if (normalizeUuid(document.user_id) === userId) {
      return { kind: "user", userId };
    }
    const workspaceId = normalizeUuid(document.workspace_id || payload.workspace_id);
    if (workspaceId) {
      const [{ data: owned }, { data: member }] = await Promise.all([
        supabase.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", userId).maybeSingle(),
        supabase.from("workspace_members").select("id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
      ]);
      if (owned?.id || member?.id) return { kind: "user", userId };
    }
  }

  if (!payload.document_id && payload.workspace_id) {
    const workspaceId = normalizeUuid(payload.workspace_id);
    const [{ data: owned }, { data: member }] = await Promise.all([
      supabase.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", userId).maybeSingle(),
      supabase.from("workspace_members").select("id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
    ]);
    if (owned?.id || member?.id) return { kind: "user", userId };
  }

  const forbidden = new Error("forbidden");
  forbidden.statusCode = 403;
  throw forbidden;
}

async function updateDocumentState(supabase, documentId, mutator) {
  const document = await fetchDocumentOrThrow(supabase, documentId);
  const existing = getSourceMetadata(document);
  const existingRuntime = existing.ingestion_runtime &&
      typeof existing.ingestion_runtime === "object"
    ? existing.ingestion_runtime
    : {};
  const patch = await mutator({
    document,
    sourceMetadata: existing,
    runtimeMetadata: existingRuntime,
  });

  if (!patch) return document;

  const nextSourceMetadata = patch.source_metadata
    ? patch.source_metadata
    : {
      ...existing,
      ...(patch.sourceMetadataPatch || {}),
      ingestion_runtime: {
        ...existingRuntime,
        ...(patch.ingestionRuntimePatch || {}),
      },
    };

  const update = {
    updated_at: new Date().toISOString(),
    ...(("processing_status" in patch) ? { processing_status: patch.processing_status } : {}),
    ...(("embedding_completed" in patch) ? { embedding_completed: patch.embedding_completed } : {}),
    ...(("text_extraction_completed" in patch)
      ? { text_extraction_completed: patch.text_extraction_completed }
      : {}),
    ...(("ocr_status" in patch) ? { ocr_status: patch.ocr_status } : {}),
    source_metadata: nextSourceMetadata,
  };

  const { error } = await supabase
    .from("documents")
    .update(update)
    .eq("id", normalizeUuid(documentId));
  if (error) {
    throw new Error(`document_update_failed: ${error.message}`);
  }

  return {
    ...document,
    ...update,
  };
}

async function appendIngestionRuntime(supabase, documentId, patch) {
  return await updateDocumentState(supabase, documentId, () => ({
    ingestionRuntimePatch: patch,
  }));
}

async function setProcessingState(supabase, documentId, processingStatus, patch = {}) {
  return await updateDocumentState(supabase, documentId, () => ({
    processing_status: processingStatus,
    ingestionRuntimePatch: patch,
  }));
}

async function markDocumentFailed(supabase, documentId, errorCode, details = {}) {
  await updateDocumentState(supabase, documentId, ({ runtimeMetadata }) => ({
    processing_status: "failed",
    ingestionRuntimePatch: {
      ...details,
      current_step: details.current_step || runtimeMetadata.current_step || "failed",
      last_error_code: errorCode,
      last_error_at: new Date().toISOString(),
      retry_count: Number(runtimeMetadata.retry_count || 0) + 1,
    },
  }));
}

function getInternalTaskHeaders(requestId) {
  const token = getExpectedInternalToken();
  if (!token) {
    throw new Error("Missing internal token for Cloud Tasks / workflow calls");
  }
  return {
    authorization: `Bearer ${token}`,
    apikey: token,
    "x-internal-function-jwt": token,
    "x-request-id": requestId,
    "content-type": "application/json",
  };
}

async function scheduleIngestionTask({
  req,
  requestId,
  payload,
  delaySeconds = 0,
}) {
  if (!DOCUMENT_INGESTION_TASKS_LOCATION) {
    throw new Error("GCP_TASKS_LOCATION not configured");
  }

  const baseUrl = getIngestionServiceBaseUrl(req);
  return await createHttpTask({
    queueName: DOCUMENT_INGESTION_QUEUE_NAME,
    location: DOCUMENT_INGESTION_TASKS_LOCATION,
    url: `${baseUrl}/ingestion/tasks`,
    payload,
    delaySeconds,
    headers: getInternalTaskHeaders(requestId),
  });
}

function getSignedDownloadArgs({ storagePath, routing }) {
  return {
    expiresInSeconds: 60 * 60,
    ...(routing.bucketOverride
      ? { bucketNameOverride: routing.bucketOverride }
      : {}),
    ...(routing.effectivePrefix ? { pathPrefix: routing.effectivePrefix } : {}),
  };
}

async function getDocumentDownloadUrl({ supabase, document }) {
  const storagePath = String(document.storage_path || "");
  if (!storagePath || storagePath === "local") {
    throw new Error("Document must be uploaded to cloud for processing");
  }
  const routing = await resolveStorageRouting({
    supabase,
    workspaceId: document.workspace_id ? String(document.workspace_id) : null,
    storagePath,
  });
  return generateSignedDownloadUrl(
    storagePath,
    getSignedDownloadArgs({ storagePath, routing }),
  ).url;
}

async function loadProcessingContext(supabase, payload) {
  const document = await fetchDocumentOrThrow(supabase, payload.document_id);
  const sourceMetadata = getSourceMetadata(document);
  return {
    document,
    sourceMetadata,
    source: String(payload.source || "unknown").trim().toLowerCase() || "unknown",
    isCloudConvertDoc: String(sourceMetadata.conversion_method || "").includes("cloudconvert"),
  };
}

async function runChunkStep({ supabase, requestId, payload, pages }) {
  const document = await fetchDocumentOrThrow(supabase, payload.document_id);
  const existingChunks = await supabase
    .from("document_chunks")
    .select("content_hash")
    .eq("document_id", normalizeUuid(payload.document_id));
  const existingHashes = new Set(
    (existingChunks.data || []).map((row) => row.content_hash).filter(Boolean),
  );

  const chunkSize = 400;
  const chunkOverlap = 50;
  const batches = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    if (!page?.text || String(page.text).trim().length < 10) continue;
    const pageChunks = splitIntoChunks(page.text, chunkSize, chunkOverlap);
    for (const chunkText of pageChunks) {
      const contentHash = await computeHash(chunkText);
      if (existingHashes.has(contentHash)) continue;
      existingHashes.add(contentHash);
      batches.push({
        document_id: normalizeUuid(payload.document_id),
        workspace_id: normalizeUuid(payload.workspace_id || document.workspace_id),
        user_id: normalizeUuid(payload.user_id || document.user_id),
        page_number: Number(page.page_number || 0),
        chunk_index: globalChunkIndex++,
        chunk_type: "paragraph",
        content_text: chunkText,
        content_hash: contentHash,
        language: detectLanguage(chunkText),
      });
    }
  }

  const batchSize = 100;
  for (let index = 0; index < batches.length; index += batchSize) {
    const batch = batches.slice(index, index + batchSize);
    if (batch.length === 0) continue;
    const { error } = await supabase
      .from("document_chunks")
      .insert(batch);
    if (error) {
      throw new Error(`chunk_insert_failed: ${error.message}`);
    }
  }

  await updateDocumentState(supabase, payload.document_id, ({ runtimeMetadata }) => ({
    processing_status: "processing",
    text_extraction_completed: true,
    ingestionRuntimePatch: {
      ...runtimeMetadata,
      current_step: "chunk",
    },
  }));

  return {
    success: true,
    document_id: normalizeUuid(payload.document_id),
    chunks_created: batches.length,
    chunks_skipped: Math.max(0, (pages || []).length - batches.length),
    chunks: batches.map((chunk) => ({
      id: chunk.content_hash,
      page_number: chunk.page_number,
      chunk_index: chunk.chunk_index,
      content_hash: chunk.content_hash,
      content_preview: String(chunk.content_text || "").slice(0, 120),
    })),
    request_id: requestId,
    execution_plane: "gcp",
  };
}

function safeModelShort(model) {
  return String(model || "").replace("text-embedding-3-", "te3");
}

export function serializePgvector(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Invalid embedding vector");
  }
  return `[${values.map((value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("Invalid embedding vector value");
    return String(number);
  }).join(",")}]`;
}

export function generatePgvectorKey(chunkId, model, version) {
  return `${PGVECTOR_KEY_PREFIX}:${normalizeUuid(chunkId)}:${safeModelShort(model)}:${version}`;
}

async function getEmbeddingConfig(supabase, workspaceId) {
  const { data } = await supabase.rpc("get_active_embedding_config", {
    p_workspace_id: normalizeUuid(workspaceId),
  });
  return data?.[0] || {
    index_name: EMBEDDING_DEFAULT_INDEX,
    model: EMBEDDING_DEFAULT_MODEL,
    version: EMBEDDING_DEFAULT_VERSION,
  };
}

async function cleanupExistingEmbeddings({
  supabase,
  chunkIds,
  log,
}) {
  if (!chunkIds.length) return;
  try {
    await supabase.from("document_chunks").update({ embedding: null }).in("id", chunkIds);
    await supabase.from("chunk_embeddings").delete().in("chunk_id", chunkIds);
  } catch (error) {
    log?.warn?.("Embedding cleanup skipped", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runEmbedStep({ supabase, requestId, payload }) {
  const documentId = normalizeUuid(payload.document_id);
  const workspaceId = normalizeUuid(payload.workspace_id);
  const chunkIdsInput = Array.isArray(payload.chunk_ids) ? payload.chunk_ids : [];
  const force = payload.force === true;
  if (!workspaceId || (!documentId && chunkIdsInput.length === 0)) {
    const error = new Error("Missing workspace_id and document_id or chunk_ids");
    error.statusCode = 400;
    throw error;
  }

  const document = documentId ? await fetchDocumentOrThrow(supabase, documentId) : null;
  const config = await getEmbeddingConfig(supabase, workspaceId);
  let chunksQuery = supabase
    .from("document_chunks")
    .select("id, content_text, content_hash, embedding, workspace_id, user_id, document_id, page_number, language, metadata_json")
    .eq("workspace_id", workspaceId);
  if (chunkIdsInput.length > 0) {
    chunksQuery = chunksQuery.in("id", chunkIdsInput);
  } else {
    chunksQuery = chunksQuery.eq("document_id", documentId);
  }
  const { data: chunks, error: chunksError } = await chunksQuery;
  if (chunksError) {
    throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
  }

  const rows = (chunks || []).filter((chunk) => String(chunk?.content_text || "").trim());
  if (rows.length === 0) {
    return buildGcpEnvelope(requestId, {
      success: true,
      embedded_count: 0,
      skipped_count: 0,
      failed_count: 0,
      results: [],
      embedding_time_ms: 0,
      storage_time_ms: 0,
    });
  }

  const chunkIds = rows.map((chunk) => chunk.id).filter(Boolean);

  if (force) {
    await cleanupExistingEmbeddings({
      supabase,
      chunkIds,
    });
  }

  let existingHashes = new Set();
  if (!force && chunkIds.length > 0) {
    const { data: existingEmbeddings } = await supabase
      .from("chunk_embeddings")
      .select("content_hash")
      .in("chunk_id", chunkIds)
      .eq("embedding_model", config.model)
      .eq("embedding_version", config.version)
      .eq("status", "ready");
    existingHashes = new Set(
      (existingEmbeddings || []).map((row) => row.content_hash).filter(Boolean),
    );
  }

  const shouldSkipEmbedding = (chunk) => {
    if (force) return false;
    const hasPgvectorEmbedding = Boolean(String(chunk.embedding || "").trim());
    return hasPgvectorEmbedding && existingHashes.has(chunk.content_hash);
  };
  const chunksToEmbed = rows.filter((chunk) => !shouldSkipEmbedding(chunk));
  const results = rows
    .filter(shouldSkipEmbedding)
    .map((chunk) => ({ chunk_id: chunk.id, status: "skipped" }));
  let embeddedCount = 0;
  let failedCount = 0;
  let totalEmbeddingTime = 0;
  let totalStorageTime = 0;

  for (let index = 0; index < chunksToEmbed.length; index += 50) {
    const batch = chunksToEmbed.slice(index, index + 50);
    try {
      const embeddingStart = Date.now();
      const embeddingData = await createEmbedding({
        model: config.model,
        input: batch.map((chunk) => String(chunk.content_text || "")),
      }, {
        workspaceId,
        requestId,
      });
      totalEmbeddingTime += Date.now() - embeddingStart;

      const embeddingByIndex = new Map(
        (embeddingData?.data || []).map((item) => [Number(item.index), item.embedding]),
      );
      const vectors = batch.map((chunk, batchIndex) => {
        const embedding = embeddingByIndex.get(batchIndex);
        if (!embedding) throw new Error(`Missing embedding for batch index ${batchIndex}`);
        return {
          chunk,
          key: generatePgvectorKey(chunk.id, config.model, config.version),
          embedding,
          embeddingLiteral: serializePgvector(embedding),
        };
      });

      const storageStart = Date.now();
      for (const vector of vectors) {
        const { error: updateError } = await supabase
          .from("document_chunks")
          .update({ embedding: vector.embeddingLiteral })
          .eq("id", vector.chunk.id);
        if (updateError) throw new Error(`Embedding storage error: ${updateError.message}`);
      }
      totalStorageTime += Date.now() - storageStart;

      const readyRecords = batch.map((chunk, batchIndex) => ({
        chunk_id: chunk.id,
        vector_key: vectors[batchIndex].key,
        index_name: PGVECTOR_INDEX_NAME,
        embedding_model: config.model,
        embedding_version: config.version,
        dimension: Array.isArray(vectors[batchIndex].embedding)
          ? vectors[batchIndex].embedding.length
          : 1536,
        content_hash: chunk.content_hash,
        status: "ready",
      }));
      const { error: upsertError } = await supabase
        .from("chunk_embeddings")
        .upsert(readyRecords, { onConflict: "chunk_id,embedding_model,embedding_version" });
      if (upsertError) throw new Error(`Embedding record upsert failed: ${upsertError.message}`);

      for (const chunk of batch) {
        results.push({ chunk_id: chunk.id, status: "embedded" });
        embeddedCount += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failedCount += batch.length;
      results.push(...batch.map((chunk) => ({
        chunk_id: chunk.id,
        status: "failed",
        error: message,
      })));
      await supabase
        .from("chunk_embeddings")
        .upsert(batch.map((chunk) => ({
          chunk_id: chunk.id,
          vector_key: "",
          index_name: PGVECTOR_INDEX_NAME,
          embedding_model: config.model,
          embedding_version: config.version,
          dimension: 1536,
          content_hash: chunk.content_hash,
          status: "failed",
          error: message,
        })), { onConflict: "chunk_id,embedding_model,embedding_version" });
    }
  }

  if (documentId && failedCount === 0) {
    await updateDocumentState(supabase, documentId, ({ runtimeMetadata }) => ({
      embedding_completed: true,
      processing_status: document?.processing_status === "failed" ? "processing" : document?.processing_status,
      ingestionRuntimePatch: {
        ...runtimeMetadata,
        current_step: "embed",
      },
    }));
  }

  if (documentId) {
    await appendIngestionRuntime(supabase, payload.document_id, {
      current_step: "embed",
    });
  }

  return buildGcpEnvelope(requestId, {
    success: failedCount === 0,
    embedded_count: embeddedCount,
    skipped_count: rows.length - chunksToEmbed.length,
    failed_count: failedCount,
    results,
    embedding_time_ms: totalEmbeddingTime,
    storage_time_ms: totalStorageTime,
  });
}

async function runClassifyStep({ supabase, requestId, payload }) {
  const documentId = normalizeUuid(payload.document_id);
  const { data: docInfo } = await supabase
    .from("documents")
    .select("original_filename, title, document_type, source_metadata")
    .eq("id", documentId)
    .maybeSingle();
  const effectiveFilename = String(payload.filename || docInfo?.original_filename || docInfo?.title || "");
  let textContent = "";

  if (Array.isArray(payload.page_texts) && payload.page_texts.length > 0) {
    textContent = payload.page_texts.slice(0, 5).join("\n\n--- Page Break ---\n\n");
  } else {
    const { data: chunks } = await supabase
      .from("document_chunks")
      .select("content_text")
      .eq("document_id", documentId)
      .order("page_number")
      .limit(20);
    textContent = (chunks || []).map((chunk) => String(chunk.content_text || "")).filter(Boolean).join("\n\n");
  }

  const rawText = textContent.toLowerCase();
  const looksContract = [
    "agreement",
    "contract",
    "governing law",
    "termination",
    "indemnif",
    "warrant",
    "party",
    "الشروط",
    "عقد",
    "اتفاقية",
  ].some((signal) => rawText.includes(signal));
  const looksGovernmentRegistry = [
    "ministry",
    "authority",
    "commercial register",
    "certificate",
    "license",
    "وزارة",
    "السجل التجاري",
    "رخصة",
    "شهادة",
  ].filter((signal) => rawText.includes(signal)).length >= 2;

  let result = {
    document_type: looksGovernmentRegistry ? "legal_filing" : looksContract ? "contract" : "other",
    confidence: looksGovernmentRegistry || looksContract ? 0.82 : 0.55,
    confidence_level: looksGovernmentRegistry || looksContract ? "medium" : "low",
    recommended_analysis_kinds: [],
    recommended_template_ids: ["acquisition_workspace"],
    suggested_tools: ["summarize", "extract_entities", "ask"],
    tool_category: looksGovernmentRegistry || looksContract ? "legal" : "general",
    reasoning: "Heuristic backend classification.",
  };

  if (textContent.trim().length > 200) {
    try {
      resolveAIProvider({ workspaceId: normalizeUuid(payload.workspace_id) || null });
      const completion = await createChatCompletion({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "Classify the document. Return JSON only with document_type, confidence, suggested_tools, tool_category, reasoning. Allowed document_type values: textbook, lecture_notes, problem_set, paper, personal_notes, contract, financial_report, meeting_notes, invoice, legal_filing, research, other.",
          },
          {
            role: "user",
            content: `Filename: ${effectiveFilename}\n\nDocument text excerpt:\n${textContent.slice(0, 12000)}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }, {
        workspaceId: normalizeUuid(payload.workspace_id) || null,
        requestId,
      });
      const parsed = JSON.parse(String(completion?.choices?.[0]?.message?.content || "{}"));
      if (parsed && typeof parsed === "object") {
        const allowedTypes = new Set([
          "textbook",
          "lecture_notes",
          "problem_set",
          "paper",
          "personal_notes",
          "contract",
          "financial_report",
          "meeting_notes",
          "invoice",
          "legal_filing",
          "research",
          "other",
        ]);
        const docType = allowedTypes.has(String(parsed.document_type || ""))
          ? String(parsed.document_type)
          : result.document_type;
        result = {
          ...result,
          ...parsed,
          document_type: docType,
          confidence: Math.max(0, Math.min(1, Number(parsed.confidence || result.confidence))),
          confidence_level: Number(parsed.confidence || result.confidence) >= 0.85
            ? "high"
            : Number(parsed.confidence || result.confidence) >= 0.6
            ? "medium"
            : "low",
          recommended_template_ids: ["acquisition_workspace"],
        };
      }
    } catch {
      // Keep deterministic heuristic result when the AI provider is unavailable.
    }
  }

  const sourceMetadata = docInfo?.source_metadata && typeof docInfo.source_metadata === "object"
    ? docInfo.source_metadata
    : {};
  await supabase
    .from("documents")
    .update({
      document_type: result.document_type,
      source_metadata: {
        ...sourceMetadata,
        classification: {
          document_type: result.document_type,
          confidence: result.confidence,
          confidence_level: result.confidence_level,
          recommended_template_ids: result.recommended_template_ids,
          reasoning: result.reasoning,
          classified_at: new Date().toISOString(),
          execution_plane: "gcp",
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  await appendIngestionRuntime(supabase, payload.document_id, {
    current_step: "classify",
  });

  return buildGcpEnvelope(requestId, result);
}

async function runInsightsStep({ supabase, requestId, payload, documentType }) {
  const effectiveType = String(documentType || "").trim().toLowerCase();
  if (!INSIGHTS_DOC_TYPES.has(effectiveType)) {
    return buildGcpEnvelope(requestId, {
      success: true,
      skipped: true,
      document_type: effectiveType || null,
    });
  }

  const startedAt = Date.now();
  const documentId = normalizeUuid(payload.document_id);
  const workspaceId = normalizeUuid(payload.workspace_id);
  const userId = normalizeUuid(payload.user_id);
  const { data: run, error: runError } = await supabase
    .from("extraction_runs")
    .insert({
      document_id: documentId,
      workspace_id: workspaceId,
      user_id: userId,
      extraction_type: "insights",
      model: "gpt-4o",
      prompt_version: "gcp_dynamic_v1",
      status: "running",
      input_config: { mode: "dynamic", execution_plane: "gcp" },
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runError) {
    throw new Error(`Failed to create extraction run: ${runError.message}`);
  }

  const { data: chunks, error: chunksError } = await supabase
    .from("document_chunks")
    .select("id, content_text, page_number")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });
  if (chunksError) {
    throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
  }

  const sourceChunks = (chunks || []).slice(0, 120);
  const context = sourceChunks
    .map((chunk, index) => `[Chunk ${index + 1}, Page ${chunk.page_number}]\n${String(chunk.content_text || "").slice(0, 2500)}`)
    .join("\n\n---\n\n")
    .slice(0, 50000);
  let insights = [];

  if (context.trim()) {
    try {
      const completion = await createChatCompletion({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "Extract important document facts. Return JSON only as {\"insights\":[{\"kind\":\"amount|deadline|date|entity|identifier|obligation|term|contact|location|key_fact\",\"label\":\"English label\",\"value\":\"original value\",\"importance\":\"why it matters\",\"confidence\":0.0,\"source_quote\":\"short exact quote\"}]}",
          },
          {
            role: "user",
            content: `Document type: ${effectiveType}\n\n${context}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }, {
        workspaceId,
        requestId,
      });
      const parsed = JSON.parse(String(completion?.choices?.[0]?.message?.content || "{}"));
      insights = Array.isArray(parsed?.insights) ? parsed.insights.slice(0, 200) : [];
    } catch {
      insights = [];
    }
  }

  const rows = insights.map((insight, index) => {
    const sourceQuote = String(insight.source_quote || "").slice(0, 300);
    const sourceChunk = sourceQuote
      ? sourceChunks.find((chunk) => String(chunk.content_text || "").toLowerCase().includes(sourceQuote.toLowerCase().slice(0, 40))) || sourceChunks[0]
      : sourceChunks[0];
    const label = String(insight.label || `Insight ${index + 1}`).trim();
    const value = insight.value ?? null;
    const kind = String(insight.kind || "key_fact").trim().toLowerCase() || "key_fact";
    return {
      document_id: documentId,
      workspace_id: workspaceId,
      user_id: userId,
      kind,
      payload: {
        label,
        value,
        importance: String(insight.importance || ""),
        searchable_text: `${label}: ${value ?? ""} ${String(insight.importance || "")}`.trim(),
      },
      text_value: value == null ? null : String(value),
      chunk_id: sourceChunk?.id || null,
      source_refs: [{
        chunk_id: sourceChunk?.id || null,
        page: Number(sourceChunk?.page_number || 0),
        quote: sourceQuote,
      }],
      confidence: Math.max(0, Math.min(1, Number(insight.confidence || 0.6))),
      run_id: run.id,
    };
  });

  if (rows.length > 0) {
    await supabase.from("insights").delete().eq("document_id", documentId);
    for (let index = 0; index < rows.length; index += 100) {
      const { error } = await supabase.from("insights").insert(rows.slice(index, index + 100));
      if (error) {
        throw new Error(`insights_insert_failed: ${error.message}`);
      }
    }
  }

  await supabase
    .from("extraction_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      output_summary: {
        insights_count: rows.length,
        execution_plane: "gcp",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  await appendIngestionRuntime(supabase, payload.document_id, {
    current_step: "extract_insights",
  });

  return buildGcpEnvelope(requestId, {
    success: true,
    document_id: documentId,
    run_id: run.id,
    insights_count: rows.length,
    insights: rows,
    embedded_count: 0,
    processing_time_ms: Date.now() - startedAt,
  });
}

function columnKey(columnIndex) {
  let index = columnIndex;
  let label = "";
  while (index >= 0) {
    label = String.fromCharCode(65 + (index % 26)) + label;
    index = Math.floor(index / 26) - 1;
  }
  return label || "A";
}

function normalizeHeader(rawHeaders, width) {
  const seen = new Map();
  return Array.from({ length: width }, (_, index) => {
    const raw = String(rawHeaders[index] ?? "").trim();
    const base = raw || columnKey(index);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function detectHeaderIndex(rows) {
  const scanLimit = Math.min(rows.length, 5);
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < scanLimit; index += 1) {
    const row = rows[index] || [];
    const populated = row.filter((cell) => String(cell ?? "").trim().length > 0);
    if (populated.length === 0) continue;
    let score = populated.length;
    score += populated.filter((cell) => typeof cell === "string").length * 0.5;
    score -= populated.filter((cell) => typeof cell === "number").length * 0.25;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function inferPrimitiveType(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(stringValue)) return "number";
  if (/^\d{4}-\d{2}-\d{2}/.test(stringValue)) return "date";
  return "string";
}

function parseTabularDocument(fileBytes, format, workbookName = "") {
  const workbook = XLSX.read(fileBytes, {
    type: "array",
    raw: false,
    cellFormula: true,
    cellNF: false,
    cellStyles: false,
  });
  const sheets = (workbook.SheetNames || []).map((sheetName, sheetIndex) => {
    const sheet = workbook.Sheets[sheetName];
    const rangeRef = sheet?.["!ref"] || "A1:A1";
    const range = XLSX.utils.decode_range(rangeRef);
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const width = Math.max(
      range.e.c - range.s.c + 1,
      rows.reduce((max, row) => Math.max(max, row.length), 0),
    );
    const headerIndex = detectHeaderIndex(rows);
    const inferredHeader = normalizeHeader(rows[headerIndex] || [], width);
    const manifestRows = [];
    for (let rowOffset = headerIndex + 1; rowOffset < rows.length; rowOffset += 1) {
      const rawRow = rows[rowOffset] || [];
      const values = {};
      const cells = [];
      let hasMeaningfulValue = false;
      for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
        const absoluteRow = range.s.r + rowOffset;
        const absoluteColumn = range.s.c + columnIndex;
        const ref = XLSX.utils.encode_cell({ r: absoluteRow, c: absoluteColumn });
        const header = inferredHeader[columnIndex] || columnKey(columnIndex);
        const worksheetCell = sheet?.[ref];
        const rawValue = worksheetCell?.v ?? rawRow[columnIndex] ?? null;
        const formattedValue = String(worksheetCell?.w ?? rawValue ?? "").trim();
        if (formattedValue) hasMeaningfulValue = true;
        values[header] = formattedValue;
        cells.push({
          row_index: absoluteRow + 1,
          column_index: absoluteColumn + 1,
          column_key: header,
          cell_ref: ref,
          formatted_value: formattedValue,
          raw_value: rawValue,
          formula: typeof worksheetCell?.f === "string" ? worksheetCell.f : null,
          inferred_type: inferPrimitiveType(worksheetCell?.v ?? rawRow[columnIndex] ?? null),
        });
      }
      if (!hasMeaningfulValue) continue;
      const startRef = XLSX.utils.encode_cell({ r: range.s.r + rowOffset, c: range.s.c });
      const endRef = XLSX.utils.encode_cell({
        r: range.s.r + rowOffset,
        c: range.s.c + Math.max(width - 1, 0),
      });
      manifestRows.push({
        row_index: range.s.r + rowOffset + 1,
        range_ref: `${startRef}:${endRef}`,
        values,
        cells,
      });
    }
    return {
      sheet_name: sheetName,
      sheet_index: sheetIndex,
      visibility: "visible",
      used_range: rangeRef,
      inferred_header: inferredHeader,
      rows: manifestRows,
    };
  });
  return {
    schema_version: "tabular_manifest_v1",
    source_format: format,
    workbook_name: workbookName,
    sheet_order: workbook.SheetNames || [],
    sheets,
    stats: {
      sheet_count: sheets.length,
      row_count: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
      cell_count: sheets.reduce(
        (sum, sheet) => sum + sheet.rows.reduce((rowSum, row) => rowSum + row.cells.length, 0),
        0,
      ),
    },
  };
}

function buildTabularSnippet(sheetName, rangeRef, values) {
  const compact = Object.entries(values || {})
    .map(([key, value]) => [key, String(value || "").trim()])
    .filter(([, value]) => value.length > 0);
  return [`Sheet: ${sheetName}`, `Range: ${rangeRef}`, ...compact.map(([key, value]) => `${key}: ${value}`)].join("\n");
}

async function buildTabularChunks({ documentId, workspaceId, userId, manifest }) {
  const chunks = [];
  let chunkIndex = 0;
  for (const sheet of manifest.sheets || []) {
    for (const row of sheet.rows || []) {
      const contentText = buildTabularSnippet(sheet.sheet_name, row.range_ref, row.values);
      chunks.push({
        document_id: normalizeUuid(documentId),
        workspace_id: normalizeUuid(workspaceId),
        user_id: normalizeUuid(userId),
        page_number: 0,
        chunk_index: chunkIndex++,
        chunk_type: row.cells?.some((cell) => cell.formula) ? "tabular_formula" : "tabular_row",
        content_text: contentText,
        content_hash: await computeHash(contentText),
        language: detectLanguage(contentText),
        metadata_json: {
          source_type: "tabular",
          tabular_source: {
            sheet_name: sheet.sheet_name,
            range_ref: row.range_ref,
            row_index: row.row_index,
            columns: row.cells,
          },
        },
      });
    }
  }
  return chunks;
}

async function runTabularPipeline({ supabase, requestId, payload, document }) {
  const sourceMetadata = getSourceMetadata(document);
  const sourceFormat = getDocumentSourceFormat(document);
  if (!isTabularSourceFormat(sourceFormat)) {
    const error = new Error(`Document ${payload.document_id} is not a supported tabular format`);
    error.statusCode = 400;
    throw error;
  }
  const sourceStoragePath = String(sourceMetadata.source_storage_path || document.storage_path || "").trim();
  if (!sourceStoragePath) {
    throw new Error("Missing source storage path for tabular document");
  }
  const fileResponse = await fetch(
    generateSignedDownloadUrl(sourceStoragePath, { expiresInSeconds: 15 * 60 }).url,
    { cache: "no-store" },
  );
  if (!fileResponse.ok) {
    throw new Error(`Failed to fetch source file: ${fileResponse.status}`);
  }
  const manifest = parseTabularDocument(
    new Uint8Array(await fileResponse.arrayBuffer()),
    sourceFormat,
    String(document.title || ""),
  );
  const manifestStoragePath = `${normalizeUuid(payload.user_id)}/${normalizeUuid(payload.document_id)}.tabular.json`;
  await uploadBufferToGCS(
    manifestStoragePath,
    Buffer.from(JSON.stringify(manifest)),
    "application/json",
  );
  const chunks = await buildTabularChunks({
    documentId: payload.document_id,
    workspaceId: payload.workspace_id,
    userId: payload.user_id,
    manifest,
  });
  await supabase.from("document_chunks").delete().eq("document_id", normalizeUuid(payload.document_id));
  for (let index = 0; index < chunks.length; index += 100) {
    const { error } = await supabase.from("document_chunks").insert(chunks.slice(index, index + 100));
    if (error) throw new Error(`tabular_chunk_insert_failed: ${error.message}`);
  }
  const extractResult = {
    success: true,
    document_id: normalizeUuid(payload.document_id),
    chunks_created: chunks.length,
    manifest_storage_path: manifestStoragePath,
    source_format: sourceFormat,
    sheet_count: manifest.stats.sheet_count,
  };
  await updateDocumentState(supabase, payload.document_id, () => ({
    text_extraction_completed: true,
    embedding_completed: false,
    processing_status: "processing",
    sourceMetadataPatch: {
      source_format: sourceFormat,
      conversion_method: "none",
      conversion_status: "completed",
      tabular_manifest_storage_path: manifestStoragePath,
      tabular_manifest_version: manifest.schema_version,
      tabular_sheet_count: manifest.stats.sheet_count,
      tabular_row_count: manifest.stats.row_count,
      tabular_cell_count: manifest.stats.cell_count,
    },
    ingestionRuntimePatch: {
      current_step: "extract_tabular",
    },
  }));

  await appendIngestionRuntime(supabase, payload.document_id, {
    current_step: "extract_tabular",
  });

  const embedResult = await runEmbedStep({ supabase, requestId, payload });
  const classifyResult = await runClassifyStep({ supabase, requestId, payload });
  const documentType = String(classifyResult.document_type || "").trim().toLowerCase();
  const insightsResult = await runInsightsStep({
    supabase,
    requestId,
    payload,
    documentType,
  });

  await setProcessingState(supabase, payload.document_id, "completed", {
    current_step: "completed",
  });

  return buildGcpEnvelope(requestId, {
    success: true,
    document_id: normalizeUuid(payload.document_id),
    source_format: getDocumentSourceFormat(document),
    tabular: true,
    extract: extractResult,
    embed: embedResult,
    classify: classifyResult,
    insights: insightsResult,
  });
}

async function runPostOcrPipeline({ req, supabase, requestId, payload, log }) {
  const document = await fetchDocumentOrThrow(supabase, payload.document_id);
  const mdPath = String(document.source_metadata?.ocr_markdown_storage_path || "").trim();
  let pages = [];

  if (mdPath) {
    const { data, error } = await supabase.storage.from("documents").download(mdPath);
    if (!error && data) {
      const content = await data.text();
      pages = content
        .split(/\n---\n/)
        .map((text, index) => ({
          page_number: index + 1,
          text: text.trim(),
        }))
        .filter((page) => page.text.length > 0);
    }
  }

  if (pages.length > 0) {
    await runChunkStep({ supabase, requestId, payload, pages });
  }

  await runEmbedStep({ supabase, requestId, payload });
  const classifyResult = await runClassifyStep({ supabase, requestId, payload });
  const documentType = String(classifyResult.document_type || classifyResult?.document_type || "").trim().toLowerCase();
  const insightsResult = await runInsightsStep({
    supabase,
    requestId,
    payload,
    documentType,
  });

  await updateDocumentState(supabase, payload.document_id, ({ runtimeMetadata }) => ({
    processing_status: "completed",
    ingestionRuntimePatch: {
      ...runtimeMetadata,
      current_step: "completed",
      last_error_code: null,
      ocr_job_id: runtimeMetadata.ocr_job_id || null,
    },
  }));

  return buildGcpEnvelope(requestId, {
    success: true,
    document_id: normalizeUuid(payload.document_id),
    post_ocr: true,
    classify: classifyResult,
    insights: insightsResult,
  });
}

async function performExtractText({ supabase, payload }) {
  const document = await fetchDocumentOrThrow(supabase, payload.document_id);
  if (document.privacy_mode === true) {
    const error = new Error("Text extraction is disabled for Privacy Mode documents");
    error.statusCode = 403;
    throw error;
  }

  const sourceFormat = getDocumentSourceFormat(document);
  if (isTabularSourceFormat(sourceFormat)) {
    const summary = [
      `Tabular source format: ${sourceFormat}.`,
      `Document title: ${String(document.title || "Untitled workbook").trim()}.`,
      "Route this document through the spreadsheet extraction pipeline.",
    ].join(" ");
    return {
      success: true,
      document_id: normalizeUuid(payload.document_id),
      page_count: 1,
      pages_with_text: 1,
      total_chars: summary.length,
      scanned: false,
      low_signal_text_layer: false,
      should_fallback_to_ocr: false,
      is_tabular: true,
      source_format: sourceFormat,
      pages: [
        {
          page_number: 1,
          text: summary,
        },
      ],
    };
  }

  const downloadUrl = await getDocumentDownloadUrl({ supabase, document });
  const pdfResp = await fetch(downloadUrl);
  if (!pdfResp.ok) {
    const error = new Error(`Failed to download PDF: ${pdfResp.status}`);
    error.statusCode = 502;
    throw error;
  }

  const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes,
    disableWorker: true,
  });
  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages || 0, 250);
  const pages = [];
  let totalChars = 0;
  let pagesWithText = 0;

  for (let index = 1; index <= pageCount; index++) {
    const page = await pdf.getPage(index);
    const textContent = await page.getTextContent();
    const text = (textContent.items || [])
      .map((item) => String(item?.str || "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!text) continue;
    pagesWithText += 1;
    totalChars += text.length;
    pages.push({
      page_number: index,
      text,
    });
  }

  const scanned = pageCount <= 0 || totalChars < 2000 || (pagesWithText / (pageCount || 1)) < 0.3;
  const sourceMetadata = getSourceMetadata(document);
  const fallbackDecision = shouldFallbackToOcr({
    isCloudConvertDoc: String(sourceMetadata.conversion_method || "").includes("cloudconvert"),
    ocrAlreadyCompleted: String(document.ocr_status || "").toLowerCase() === "completed",
    scanned,
    pages,
    totalChars,
    pagesWithText,
  });
  return {
    success: true,
    document_id: normalizeUuid(payload.document_id),
    page_count: pageCount,
    pages_with_text: pagesWithText,
    total_chars: totalChars,
    scanned,
    low_signal_text_layer: fallbackDecision.lowSignalTextLayer,
    should_fallback_to_ocr: fallbackDecision.shouldFallback,
    is_cloudconvert_doc: String(sourceMetadata.conversion_method || "").includes("cloudconvert"),
    pages,
  };
}

async function performStartOcr({ supabase, payload }) {
  const document = await fetchDocumentOrThrow(supabase, payload.document_id);
  if (document.privacy_mode === true) {
    const error = new Error("OCR is disabled for Privacy Mode documents");
    error.statusCode = 403;
    throw error;
  }

  const estimatedPages = Math.max(1, Math.min(Number(document.page_count || 50), 5000));
  const usage = await checkAndIncrementHourlyUsage(
    supabase,
    document.user_id,
    "ocr_pages",
    estimatedPages,
  );
  if (!usage.allowed) {
    const error = new Error(`Hourly OCR limit reached: ${usage.current}/${usage.limit}`);
    error.statusCode = 429;
    throw error;
  }

  const existing = await supabase
    .from("mathpix_pdf_jobs")
    .select("id, status, mathpix_pdf_id")
    .eq("document_id", normalizeUuid(payload.document_id))
    .maybeSingle();
  if (existing.data?.mathpix_pdf_id) {
    await updateDocumentState(supabase, payload.document_id, ({ runtimeMetadata }) => ({
      processing_status: "processing",
      ocr_status: existing.data.status === "completed" ? "completed" : "processing",
      ingestionRuntimePatch: {
        ...runtimeMetadata,
        current_step: "ocr_processing",
        ocr_job_id: existing.data.mathpix_pdf_id,
      },
    }));
    return {
      success: true,
      status: existing.data.status,
      job_id: existing.data.id,
      mathpix_pdf_id: existing.data.mathpix_pdf_id,
    };
  }

  const downloadUrl = await getDocumentDownloadUrl({ supabase, document });
  const mathpixAppId = await getRuntimeSecret({
    envName: "MATHPIX_APP_ID",
    secretNameEnv: "MATHPIX_APP_ID_SECRET",
  });
  const mathpixAppKey = await getRuntimeSecret({
    envName: "MATHPIX_APP_KEY",
    secretNameEnv: "MATHPIX_APP_KEY_SECRET",
  });
  if (!mathpixAppId || !mathpixAppKey) {
    throw new Error("OCR service not configured");
  }

  const mathpixResponse = await fetch("https://api.mathpix.com/v3/pdf", {
    method: "POST",
    headers: {
      app_id: mathpixAppId,
      app_key: mathpixAppKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: downloadUrl,
      ...getMathpixProfile(),
      metadata: {
        zohal_document_id: normalizeUuid(payload.document_id),
        zohal_user_id: normalizeUuid(document.user_id),
        improve_mathpix: false,
      },
    }),
  });

  if (!mathpixResponse.ok) {
    await markDocumentFailed(supabase, payload.document_id, "ocr_submit_failed", {
      current_step: "start_ocr",
    });
    throw new Error(`Failed to submit PDF for OCR: ${mathpixResponse.status}`);
  }

  const mathpixData = await mathpixResponse.json();
  const mathpixPdfId = String(mathpixData?.pdf_id || "").trim();
  if (!mathpixPdfId) {
    throw new Error("Invalid response from OCR service");
  }

  const { data: job, error } = await supabase
    .from("mathpix_pdf_jobs")
    .insert({
      document_id: normalizeUuid(payload.document_id),
      mathpix_pdf_id: mathpixPdfId,
      status: "processing",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(`ocr_job_insert_failed: ${error.message}`);
  }

  await updateDocumentState(supabase, payload.document_id, ({ runtimeMetadata }) => ({
    processing_status: "processing",
    ocr_status: "processing",
    ingestionRuntimePatch: {
      ...runtimeMetadata,
      current_step: "ocr_processing",
      ocr_job_id: mathpixPdfId,
    },
  }));

  return {
    success: true,
    status: "processing",
    job_id: job?.id || null,
    mathpix_pdf_id: mathpixPdfId,
  };
}

async function performVisionOcr({ supabase, payload, pageImages, requestId, log }) {
  const documentId = normalizeUuid(payload.document_id);
  const document = await fetchDocumentOrThrow(supabase, documentId);
  if (!Array.isArray(pageImages) || pageImages.length === 0) {
    const error = new Error("Missing page_images");
    error.statusCode = 400;
    throw error;
  }
  if (pageImages.length > VISION_OCR_MAX_PAGES) {
    return buildGcpEnvelope(requestId, {
      success: false,
      error: `Document has ${pageImages.length} pages. OCR is limited to ${VISION_OCR_MAX_PAGES} pages.`,
      pages_processed: 0,
      total_text_length: 0,
      embedding_triggered: false,
    });
  }
  if (String(document.document_type || "").toLowerCase() === "textbook") {
    return buildGcpEnvelope(requestId, {
      success: false,
      error: "OCR skipped for textbooks",
      pages_processed: 0,
      total_text_length: 0,
      embedding_triggered: false,
    });
  }
  if (Number(document.page_count || 0) > VISION_OCR_MAX_PAGES) {
    return buildGcpEnvelope(requestId, {
      success: false,
      error: `Document has ${document.page_count} pages. OCR is limited to ${VISION_OCR_MAX_PAGES} pages.`,
      pages_processed: 0,
      total_text_length: 0,
      embedding_triggered: false,
    });
  }

  const usage = await checkAndIncrementHourlyUsage(
    supabase,
    document.user_id,
    "ocr_pages",
    Math.min(pageImages.length, VISION_OCR_MAX_PAGES),
  );
  if (!usage.allowed) {
    const error = new Error(`Hourly OCR limit reached: ${usage.current}/${usage.limit} pages this hour.`);
    error.statusCode = 429;
    throw error;
  }

  await supabase
    .from("documents")
    .update({
      ocr_status: "processing",
      text_extraction_completed: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  const extractedPages = [];
  let totalTextLength = 0;

  for (const pageImage of pageImages) {
    const pageNumber = Number(pageImage?.page_number || pageImage?.pageNumber || 0);
    const imageBase64 = String(pageImage?.image_base64 || pageImage?.imageBase64 || "").trim();
    if (!pageNumber || !imageBase64) continue;
    const estimatedSizeMb = (imageBase64.length * 0.75) / (1024 * 1024);
    if (estimatedSizeMb > VISION_OCR_MAX_IMAGE_SIZE_MB) {
      log?.warn?.("Vision OCR page skipped because image is too large", {
        document_id: documentId,
        page_number: pageNumber,
        estimated_size_mb: Number(estimatedSizeMb.toFixed(2)),
      });
      continue;
    }

    try {
      const completion = await createChatCompletion({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an OCR assistant. Extract all text from the image exactly as it appears. Preserve the original language, numbers, dates, and formatting. Output only the extracted text.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`,
                  detail: "high",
                },
              },
              {
                type: "text",
                text: "Extract all text from this document image.",
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0,
      }, {
        requestId,
      });
      const text = String(completion?.choices?.[0]?.message?.content || "").trim();
      if (text) {
        extractedPages.push({ page_number: pageNumber, text });
        totalTextLength += text.length;
      }
    } catch (error) {
      log?.warn?.("Vision OCR page failed", {
        document_id: documentId,
        page_number: pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let embeddingTriggered = false;
  if (extractedPages.length > 0 && totalTextLength > 50) {
    await runDeleteEmbeddingsNative({ supabase, payload, requestId, log });
    const pages = extractedPages.sort((a, b) => a.page_number - b.page_number);
    await runChunkStep({ supabase, requestId, payload, pages });
    const embedResult = await runEmbedStep({
      supabase,
      requestId,
      payload: { ...payload, force: false },
      log,
    });
    embeddingTriggered = embedResult?.success !== false;
  }

  const finalStatus = extractedPages.length > 0 ? "completed" : "failed";
  await supabase
    .from("documents")
    .update({
      ocr_status: finalStatus,
      text_extraction_completed: finalStatus === "completed",
      embedding_completed: embeddingTriggered,
      has_text_layer: extractedPages.length > 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return buildGcpEnvelope(requestId, {
    success: extractedPages.length > 0,
    pages_processed: extractedPages.length,
    total_text_length: totalTextLength,
    embedding_triggered: embeddingTriggered,
  });
}

async function performFetchOcr({ supabase, payload }) {
  const mathpixAppId = await getRuntimeSecret({
    envName: "MATHPIX_APP_ID",
    secretNameEnv: "MATHPIX_APP_ID_SECRET",
  });
  const mathpixAppKey = await getRuntimeSecret({
    envName: "MATHPIX_APP_KEY",
    secretNameEnv: "MATHPIX_APP_KEY_SECRET",
  });
  if (!mathpixAppId || !mathpixAppKey) {
    throw new Error("OCR service not configured");
  }

  const { data: job, error: jobError } = await supabase
    .from("mathpix_pdf_jobs")
    .select("id, mathpix_pdf_id, status")
    .eq("document_id", normalizeUuid(payload.document_id))
    .single();
  if (jobError || !job) {
    const error = new Error("No OCR job found for this document");
    error.statusCode = 404;
    throw error;
  }

  const headers = {
    app_id: mathpixAppId,
    app_key: mathpixAppKey,
  };
  const statusResponse = await fetch(`https://api.mathpix.com/v3/pdf/${job.mathpix_pdf_id}`, {
    headers,
  });
  if (!statusResponse.ok) {
    throw new Error(`Failed to check OCR status: ${statusResponse.status}`);
  }

  const statusData = await statusResponse.json();
  if (statusData.status !== "completed") {
    await appendIngestionRuntime(supabase, payload.document_id, {
      current_step: "ocr_processing",
      ocr_job_id: job.mathpix_pdf_id,
    });
    return {
      success: true,
      status: String(statusData.status || "processing"),
      percent_done: Number(statusData.percent_done || 0),
      mathpix_pdf_id: job.mathpix_pdf_id,
    };
  }

  const [mdResponse, linesResponse, document] = await Promise.all([
    fetch(`https://api.mathpix.com/v3/pdf/${job.mathpix_pdf_id}.md`, { headers }),
    fetch(`https://api.mathpix.com/v3/pdf/${job.mathpix_pdf_id}.lines.json`, {
      headers,
    }),
    fetchDocumentOrThrow(supabase, payload.document_id),
  ]);

  const mdContent = mdResponse.ok ? await mdResponse.text() : "";
  const linesData = linesResponse.ok ? await linesResponse.json() : null;

  let mdStoragePath = "";
  if (mdContent) {
    mdStoragePath = joinObjectPath(
      "",
      `${normalizeUuid(document.user_id)}/ocr/${normalizeUuid(payload.document_id)}.md`,
    );
    const { error } = await supabase.storage.from("documents").upload(
      mdStoragePath,
      mdContent,
      {
        contentType: "text/markdown",
        upsert: true,
      },
    );
    if (error) {
      throw new Error(`ocr_markdown_upload_failed: ${error.message}`);
    }
  }

  let linesInserted = 0;
  if (Array.isArray(linesData?.pages)) {
    const linesToInsert = [];
    for (const page of linesData.pages) {
      for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex += 1) {
        const line = page.lines[lineIndex];
        let xMin = 1;
        let yMin = 1;
        let xMax = 0;
        let yMax = 0;
        if (Array.isArray(line.cnt) && line.cnt.length > 0) {
          xMin = Math.min(...line.cnt.map((point) => point.x));
          xMax = Math.max(...line.cnt.map((point) => point.x));
          yMin = Math.min(...line.cnt.map((point) => point.y));
          yMax = Math.max(...line.cnt.map((point) => point.y));
        }

        linesToInsert.push({
          document_id: normalizeUuid(payload.document_id),
          page_number: page.page,
          line_index: lineIndex,
          line_type: line.type || "text",
          content_text: line.text || null,
          content_latex: line.latex || null,
          x_min: xMin,
          y_min: yMin,
          x_max: xMax,
          y_max: yMax,
          confidence: line.confidence || null,
        });
      }
    }

    await supabase.from("pdf_lines").delete().eq("document_id", normalizeUuid(payload.document_id));
    const batchSize = 500;
    for (let index = 0; index < linesToInsert.length; index += batchSize) {
      const batch = linesToInsert.slice(index, index + batchSize);
      const { error } = await supabase.from("pdf_lines").insert(batch);
      if (error) {
        throw new Error(`ocr_lines_insert_failed: ${error.message}`);
      }
      linesInserted += batch.length;
    }
  }

  const { error: updateJobError } = await supabase
    .from("mathpix_pdf_jobs")
    .update({
      status: "completed",
      page_count: Number(statusData.num_pages || linesData?.pages?.length || 0),
      mmd_storage_path: mdStoragePath || null,
      completed_at: new Date().toISOString(),
    })
    .eq("document_id", normalizeUuid(payload.document_id));
  if (updateJobError) {
    throw new Error(`ocr_job_update_failed: ${updateJobError.message}`);
  }

  await updateDocumentState(supabase, payload.document_id, ({ sourceMetadata, runtimeMetadata }) => ({
    ocr_status: "completed",
    source_metadata: {
      ...sourceMetadata,
      ocr_markdown_storage_path: mdStoragePath || sourceMetadata.ocr_markdown_storage_path || null,
      ingestion_runtime: {
        ...runtimeMetadata,
        current_step: "ocr_completed",
        ocr_job_id: job.mathpix_pdf_id,
      },
    },
  }));

  return {
    success: true,
    status: "completed",
    pages_processed: Number(statusData.num_pages || 0),
    lines_inserted: linesInserted,
    md_storage_path: mdStoragePath || null,
    mathpix_pdf_id: job.mathpix_pdf_id,
  };
}

async function completeFromExtractedText({ supabase, requestId, payload, extractResult }) {
  const pages = Array.isArray(extractResult.pages) ? extractResult.pages : [];
  const chunkResult = await runChunkStep({
    supabase,
    requestId,
    payload,
    pages,
  });
  const embedResult = await runEmbedStep({ supabase, requestId, payload });
  const classifyResult = await runClassifyStep({ supabase, requestId, payload });
  const documentType = String(classifyResult.document_type || "").trim().toLowerCase();
  const insightsResult = await runInsightsStep({
    supabase,
    requestId,
    payload,
    documentType,
  });

  await setProcessingState(supabase, payload.document_id, "completed", {
    current_step: "completed",
  });

  return buildGcpEnvelope(requestId, {
    success: true,
    document_id: normalizeUuid(payload.document_id),
    pages_processed: pages.length,
    chunk: chunkResult,
    embed: embedResult,
    classify: classifyResult,
    insights: insightsResult,
  });
}

async function launchWorkflowIfReady({ req, supabase, requestId, payload, log }) {
  const document = await fetchDocumentOrThrow(supabase, payload.document_id);
  const launchKey = buildWorkflowLaunchKey({
    documentId: document.id,
    updatedAt: document.updated_at,
    source: payload.source,
  });
  const existingRuntime = getSourceMetadata(document).ingestion_runtime || {};

  if (
    existingRuntime.launch_key === launchKey &&
    ["pending", "processing"].includes(String(document.processing_status || ""))
  ) {
    return {
      already_enqueued: true,
      workflow_execution_id: existingRuntime.workflow_execution_id || null,
      launch_key: launchKey,
    };
  }

  const throttled = await shouldThrottleUser(supabase, document.user_id);
  if (throttled) {
    await scheduleIngestionTask({
      req,
      requestId,
      payload: {
        kind: "retry_start",
        ...payload,
      },
      delaySeconds: DOCUMENT_INGESTION_OCR_POLL_DELAY_SECONDS,
    });

    await updateDocumentState(supabase, payload.document_id, ({ runtimeMetadata }) => ({
      processing_status: "pending",
      ingestionRuntimePatch: {
        ...runtimeMetadata,
        current_step: "queued_retry",
        launch_key: launchKey,
      },
    }));

    return {
      deferred: true,
      launch_key: launchKey,
    };
  }

  if (!DOCUMENT_INGESTION_WORKFLOWS_LOCATION) {
    throw new Error("GCP_WORKFLOWS_LOCATION not configured");
  }

  const execution = await startWorkflowExecution({
    workflowName: DOCUMENT_INGESTION_WORKFLOW,
    location: DOCUMENT_INGESTION_WORKFLOWS_LOCATION,
    argument: {
      ...payload,
      service_base_url: getIngestionServiceBaseUrl(req),
      internal_token: getExpectedInternalToken(),
      request_id: requestId,
    },
  });

  const workflowExecutionId = String(execution?.name || "").trim();
  await updateDocumentState(supabase, payload.document_id, ({ runtimeMetadata }) => ({
    processing_status: "processing",
    ingestionRuntimePatch: {
      ...runtimeMetadata,
      execution_plane: "gcp",
      workflow_execution_id: workflowExecutionId,
      launch_key: launchKey,
      current_step: "workflow_started",
      last_error_code: null,
      last_error_at: null,
    },
  }));

  log.info("Started document ingestion workflow", {
    document_id: payload.document_id,
    workflow_execution_id: workflowExecutionId,
  });

  return {
    workflow_execution_id: workflowExecutionId,
    launch_key: launchKey,
  };
}

function parsePayload(body) {
  return {
    document_id: normalizeUuid(body.document_id),
    workspace_id: normalizeUuid(body.workspace_id),
    user_id: normalizeUuid(body.user_id),
    source: String(body.source || "unknown").trim().toLowerCase() || "unknown",
    request_id: String(body.request_id || "").trim(),
    workflow_execution_id: String(body.workflow_execution_id || "").trim(),
    kind: String(body.kind || "").trim(),
    filename: String(body.filename || "").trim(),
    page_texts: Array.isArray(body.page_texts) ? body.page_texts.map((text) => String(text || "")) : [],
    all_page_texts: Array.isArray(body.all_page_texts) ? body.all_page_texts.map((text) => String(text || "")) : [],
    trigger_embedding: body.trigger_embedding !== false,
    chunk_ids: Array.isArray(body.chunk_ids)
      ? body.chunk_ids.map((id) => normalizeUuid(id)).filter(Boolean)
      : [],
  };
}

function ensureRequiredFields(payload, fields) {
  for (const field of fields) {
    if (!payload[field]) {
      const error = new Error(`Missing ${field}`);
      error.statusCode = 400;
      throw error;
    }
  }
}

async function handleWrappedStep(req, res, handler, { requestId, log }) {
  try {
    const supabase = createServiceClient();
    const body = await handler.readJsonBody(req);
    const payload = parsePayload(body);
    const caller = await requireIngestionCaller({ supabase, req, payload });
    if (!payload.user_id && caller.userId) payload.user_id = caller.userId;
    if (payload.document_id && (!payload.workspace_id || !payload.user_id)) {
      const document = await fetchDocumentOrThrow(supabase, payload.document_id);
      if (!payload.workspace_id) payload.workspace_id = normalizeUuid(document.workspace_id);
      if (!payload.user_id) payload.user_id = normalizeUuid(document.user_id);
    }
    const result = await handler.execute({
      req,
      res,
      supabase,
      requestId,
      log,
      body,
      payload,
    });
    return sendJson(res, 200, result);
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    log.error("Ingestion handler failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, status, buildGcpEnvelope(requestId, {
      error: error instanceof Error ? error.message : "Internal server error",
    }));
  }
}

export async function handleIngestionStart(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ req, supabase, body, payload, requestId, log }) => {
      ensureRequiredFields(payload, [
        "document_id",
        "workspace_id",
        "user_id",
      ]);
      const document = await fetchDocumentOrThrow(supabase, payload.document_id);
      if (normalizeUuid(document.workspace_id) !== payload.workspace_id) {
        const error = new Error("workspace_id does not match document");
        error.statusCode = 400;
        throw error;
      }
      if (normalizeUuid(document.user_id) !== payload.user_id) {
        const error = new Error("user_id does not match document");
        error.statusCode = 400;
        throw error;
      }

      await appendIngestionRuntime(supabase, payload.document_id, {
        execution_plane: "gcp",
        current_step: "start",
        request_id: requestId,
      });

      const launch = await launchWorkflowIfReady({
        req,
        supabase,
        requestId,
        payload: {
          ...payload,
          source: body.source || "unknown",
        },
        log,
      });

      return buildGcpEnvelope(requestId, {
        success: true,
        enqueued: true,
        document_id: payload.document_id,
        workflow_execution_id: launch.workflow_execution_id || null,
        deferred: launch.deferred === true,
        already_enqueued: launch.already_enqueued === true,
      });
    },
  }, { requestId, log });
}

export async function handleIngestionExtractText(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, payload, requestId }) => {
      ensureRequiredFields(payload, ["document_id"]);
      const result = await performExtractText({ supabase, payload });
      await appendIngestionRuntime(supabase, payload.document_id, {
        current_step: "extract_text",
      });
      return buildGcpEnvelope(requestId, result);
    },
  }, { requestId, log });
}

export async function handleIngestionRunTextPipeline(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, body, payload, requestId }) => {
      ensureRequiredFields(payload, [
        "document_id",
        "workspace_id",
        "user_id",
      ]);
      const document = await fetchDocumentOrThrow(supabase, payload.document_id);
      const sourceFormat = getDocumentSourceFormat(document);
      if (
        String(document.ocr_status || "").toLowerCase() === "completed" &&
        document.embedding_completed === true
      ) {
        const classifyResult = await runClassifyStep({ supabase, requestId, payload });
        const documentType = String(classifyResult.document_type || "").trim().toLowerCase();
        const insightsResult = await runInsightsStep({
          supabase,
          requestId,
          payload,
          documentType,
        });

        await setProcessingState(supabase, payload.document_id, "completed", {
          current_step: "completed",
        });

        return buildGcpEnvelope(requestId, {
          success: true,
          document_id: payload.document_id,
          skipped_to_classify: true,
          classify: classifyResult,
          insights: insightsResult,
        });
      }

      if (isTabularSourceFormat(sourceFormat)) {
        return await runTabularPipeline({
          supabase,
          requestId,
          payload,
          document,
        });
      }

      const pages = Array.isArray(body.pages) ? body.pages : null;
      const extractResult = pages
        ? {
          pages,
          total_chars: pages.reduce((sum, page) => sum + String(page.text || "").length, 0),
          pages_with_text: pages.length,
          scanned: false,
        }
        : await performExtractText({ supabase, payload });

      return await completeFromExtractedText({
        supabase,
        requestId,
        payload,
        extractResult,
      });
    },
  }, { requestId, log });
}

export async function handleIngestionStartOcr(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, body, payload, requestId, log }) => {
      if (Array.isArray(body.page_images) && body.page_images.length > 0) {
        ensureRequiredFields(payload, ["document_id"]);
        return await performVisionOcr({
          supabase,
          payload,
          pageImages: body.page_images,
          requestId,
          log,
        });
      }
      ensureRequiredFields(payload, [
        "document_id",
        "workspace_id",
        "user_id",
      ]);
      const result = await performStartOcr({ supabase, payload });
      return buildGcpEnvelope(requestId, result);
    },
  }, { requestId, log });
}

export async function handleIngestionFetchOcr(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, payload, requestId }) => {
      ensureRequiredFields(payload, ["document_id"]);
      const result = await performFetchOcr({ supabase, payload });
      return buildGcpEnvelope(requestId, result);
    },
  }, { requestId, log });
}

export async function handleIngestionChunk(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, body, payload, requestId }) => {
      ensureRequiredFields(payload, [
        "document_id",
        "workspace_id",
        "user_id",
      ]);
      if (!Array.isArray(body.pages) || body.pages.length === 0) {
        const error = new Error("Missing pages");
        error.statusCode = 400;
        throw error;
      }
      return await runChunkStep({
        supabase,
        requestId,
        payload,
        pages: body.pages,
      });
    },
  }, { requestId, log });
}

export async function handleIngestionEmbed(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, payload, requestId }) => {
      ensureRequiredFields(payload, ["workspace_id"]);
      if (!payload.document_id && (!Array.isArray(payload.chunk_ids) || payload.chunk_ids.length === 0)) {
        const error = new Error("Missing document_id or chunk_ids");
        error.statusCode = 400;
        throw error;
      }
      return await runEmbedStep({ supabase, requestId, payload });
    },
  }, { requestId, log });
}

export async function handleIngestionClassify(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, payload, requestId }) => {
      ensureRequiredFields(payload, ["document_id"]);
      return await runClassifyStep({ supabase, requestId, payload });
    },
  }, { requestId, log });
}

export async function handleIngestionExtractInsights(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, body, payload, requestId }) => {
      ensureRequiredFields(payload, [
        "document_id",
        "workspace_id",
        "user_id",
      ]);
      return await runInsightsStep({
        supabase,
        requestId,
        payload,
        documentType: body.document_type,
      });
    },
  }, { requestId, log });
}

export function buildCleanupVectorsEnvelope({
  requestId,
  documentId,
  workspaceId,
  validChunks,
  embeddedCount,
  kind,
}) {
  return buildGcpEnvelope(requestId, {
    ...(kind ? { kind } : {}),
    success: true,
    document_id: normalizeUuid(documentId),
    workspace_id: normalizeUuid(workspaceId),
    valid_chunks: Number(validChunks || 0),
    vectors_before: null,
    orphaned_deleted: 0,
    vectors_after: Number(embeddedCount || 0),
    missing_reembedded: Number(embeddedCount || 0),
    scope: "document",
    note: "Ensured current chunks are embedded in document_chunks.embedding.",
  });
}

async function runReconcileDocumentStatusNative({ supabase, requestId, body }) {
  const dryRun = body?.dry_run === true;
  const threshold = new Date(Date.now() - RECONCILE_STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();
  const result = {
    success: true,
    request_id: requestId,
    dry_run: dryRun,
    processing_status_fixed: 0,
    ocr_status_fixed: 0,
    embedding_status_fixed: 0,
    details: {
      processing_stuck: [],
      ocr_stuck: [],
      embedding_incomplete: [],
    },
    timestamp: new Date().toISOString(),
    execution_plane: "gcp",
  };

  const { data: stuckProcessing } = await supabase
    .from("documents")
    .select("id, title, processing_status, updated_at")
    .eq("processing_status", "processing")
    .lt("updated_at", threshold)
    .is("deleted_at", null);
  for (const doc of stuckProcessing || []) {
    result.details.processing_stuck.push(doc.id);
    const [{ data: chunks }, { data: toc }] = await Promise.all([
      supabase.from("document_chunks").select("id").eq("document_id", doc.id).limit(1),
      supabase.from("document_toc").select("id").eq("document_id", doc.id).limit(1),
    ]);
    const hasArtifacts = (chunks || []).length > 0 || (toc || []).length > 0;
    if (!dryRun) {
      await supabase
        .from("documents")
        .update({
          processing_status: hasArtifacts ? "completed" : "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc.id);
    }
    result.processing_status_fixed += 1;
  }

  const { data: stuckOcr } = await supabase
    .from("documents")
    .select("id, title, ocr_status, storage_path, updated_at")
    .in("ocr_status", ["processing", "pending"])
    .lt("updated_at", threshold)
    .is("deleted_at", null);
  for (const doc of stuckOcr || []) {
    result.details.ocr_stuck.push(doc.id);
    let newStatus = !doc.storage_path || doc.storage_path === "local" ? "not_needed" : null;
    if (!newStatus) {
      const { data: job } = await supabase
        .from("mathpix_pdf_jobs")
        .select("status, mathpix_pdf_id")
        .eq("document_id", doc.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (job?.status === "completed") newStatus = "completed";
      else if (job?.status === "error" || job?.status === "failed") newStatus = "failed";
      else newStatus = doc.ocr_status === "pending" && !job ? "not_needed" : "failed";
    }
    if (!dryRun) {
      await supabase
        .from("documents")
        .update({ ocr_status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", doc.id);
    }
    result.ocr_status_fixed += 1;
  }

  const { data: incompleteEmbedding } = await supabase
    .from("documents")
    .select("id, title")
    .eq("embedding_completed", false)
    .eq("processing_status", "completed")
    .is("deleted_at", null)
    .limit(100);
  for (const doc of incompleteEmbedding || []) {
    const { count } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", doc.id);
    if ((count || 0) <= 0) continue;
    result.details.embedding_incomplete.push(doc.id);
    if (!dryRun) {
      await supabase
        .from("documents")
        .update({ embedding_completed: true, updated_at: new Date().toISOString() })
        .eq("id", doc.id);
    }
    result.embedding_status_fixed += 1;
  }

  return result;
}

export function buildDeleteEmbeddingsEnvelope({
  requestId,
  documentId,
  chunksDeleted,
  embeddingsDeleted,
  vectorsDeleted,
}) {
  return buildGcpEnvelope(requestId, {
    success: true,
    document_id: normalizeUuid(documentId),
    chunks_deleted: Number(chunksDeleted || 0),
    embeddings_deleted: Number(embeddingsDeleted || 0),
    vectors_deleted: Number(vectorsDeleted || 0),
  });
}

async function runDeleteEmbeddingsNative({ supabase, payload, requestId, log }) {
  ensureRequiredFields(payload, ["document_id"]);
  const documentId = normalizeUuid(payload.document_id);

  const { data: chunks, error: chunksError } = await supabase
    .from("document_chunks")
    .select("id")
    .eq("document_id", documentId);
  if (chunksError) {
    throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
  }

  const chunkIds = (chunks || []).map((chunk) => chunk.id).filter(Boolean);
  const vectorsDeleted = 0;
  let embeddingsDeleted = 0;
  if (chunkIds.length > 0) {
    const { error: embeddingsError, count } = await supabase
      .from("chunk_embeddings")
      .delete({ count: "exact" })
      .in("chunk_id", chunkIds);
    if (embeddingsError) {
      log?.warn?.("Could not delete chunk embeddings", { error: embeddingsError.message });
    } else {
      embeddingsDeleted = count || 0;
    }
  }

  const { error: deleteChunksError, count: chunksDeletedCount } = await supabase
    .from("document_chunks")
    .delete({ count: "exact" })
    .eq("document_id", documentId);
  if (deleteChunksError) {
    throw new Error(`Failed to delete chunks: ${deleteChunksError.message}`);
  }

  for (const table of ["insights", "selections"]) {
    try {
      await supabase.from(table).delete({ count: "exact" }).eq("document_id", documentId);
    } catch (error) {
      log?.warn?.(`Could not delete ${table}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return buildDeleteEmbeddingsEnvelope({
    requestId,
    documentId,
    chunksDeleted: chunksDeletedCount || 0,
    embeddingsDeleted,
    vectorsDeleted,
  });
}

export async function handleIngestionReconcileStatus(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, body, requestId }) =>
      await runReconcileDocumentStatusNative({ supabase, requestId, body }),
  }, { requestId, log });
}

export async function handleIngestionDeleteEmbeddings(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, payload, requestId, log }) =>
      await runDeleteEmbeddingsNative({ supabase, payload, requestId, log }),
  }, { requestId, log });
}

export async function handleDocumentDeleteEmbeddings(req, res, { requestId, log, readJsonBody }) {
  try {
    const supabase = createServiceClient();
    const body = await readJsonBody(req);
    const payload = parsePayload(body);
    ensureRequiredFields(payload, ["document_id"]);
    const document = await fetchDocumentOrThrow(supabase, payload.document_id);
    await requireDocumentCleanupAccess({ supabase, req, document });
    const result = await runDeleteEmbeddingsNative({ supabase, payload, requestId, log });
    return sendJson(res, 200, result);
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    log.error("Document embeddings delete failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, status, buildGcpEnvelope(requestId, {
      error: error instanceof Error ? error.message : "Internal server error",
    }));
  }
}

export async function handleIngestionCleanupVectors(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ supabase, body, payload, requestId }) => {
      const cleanupScope = body.scope === "workspace" ? "workspace" : "document";
      ensureRequiredFields(payload, ["workspace_id"]);
      if (cleanupScope === "workspace") {
        const error = new Error("workspace-scoped cleanup is not supported; run cleanup per document.");
        error.statusCode = 400;
        throw error;
      }
      ensureRequiredFields(payload, ["document_id"]);

      const { data: validChunks, error: chunksError } = await supabase
        .from("document_chunks")
        .select("id")
        .eq("document_id", payload.document_id);
      if (chunksError) {
        throw new Error(`cleanup_valid_chunks_query_failed: ${chunksError.message}`);
      }

      const embedResponse = await runEmbedStep({
        supabase,
        requestId,
        payload: {
          ...payload,
          force: true,
        },
      });
      const embeddedCount = Number(embedResponse.embedded_count || 0);

      return buildCleanupVectorsEnvelope({
        requestId,
        documentId: payload.document_id,
        workspaceId: payload.workspace_id,
        validChunks: (validChunks || []).length,
        embeddedCount,
      });
    },
  }, { requestId, log });
}

export async function handleIngestionTask(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ req, supabase, body, payload, requestId, log }) => {
      ensureRequiredFields(payload, ["kind", "document_id"]);

      if (payload.kind === "retry_start") {
        const document = await fetchDocumentOrThrow(supabase, payload.document_id);
        const response = await launchWorkflowIfReady({
          req,
          supabase,
          requestId,
          payload: {
            document_id: payload.document_id,
            workspace_id: normalizeUuid(body.workspace_id || document.workspace_id),
            user_id: normalizeUuid(body.user_id || document.user_id),
            source: body.source || "unknown",
          },
          log,
        });
        return buildGcpEnvelope(requestId, {
          success: true,
          kind: payload.kind,
          ...response,
        });
      }

      if (payload.kind === "ocr_poll") {
        const fetchResult = await performFetchOcr({ supabase, payload });
        if (fetchResult.status !== "completed") {
          await scheduleIngestionTask({
            req,
            requestId,
            payload: body,
            delaySeconds: DOCUMENT_INGESTION_OCR_POLL_DELAY_SECONDS,
          });
          return buildGcpEnvelope(requestId, {
            success: true,
            kind: payload.kind,
            status: fetchResult.status,
            percent_done: fetchResult.percent_done || 0,
            rescheduled: true,
          });
        }

        return await runPostOcrPipeline({
          req,
          supabase,
          requestId,
          payload,
          log,
        });
      }

      if (payload.kind === "reconcile_document") {
        return await runReconcileDocumentStatusNative({ supabase, requestId, body });
      }

      if (payload.kind === "delete_embeddings") {
        return await runDeleteEmbeddingsNative({ supabase, payload, requestId, log });
      }

      if (payload.kind === "cleanup_vectors") {
        ensureRequiredFields(payload, ["workspace_id"]);
        const { data: validChunks, error: chunksError } = await supabase
          .from("document_chunks")
          .select("id")
          .eq("document_id", payload.document_id);
        if (chunksError) {
          throw new Error(`cleanup_valid_chunks_query_failed: ${chunksError.message}`);
        }
        const embedResponse = await runEmbedStep({
          supabase,
          requestId,
          payload: {
            ...payload,
            force: true,
          },
        });
        const embeddedCount = Number(embedResponse.embedded_count || 0);
        return buildCleanupVectorsEnvelope({
          requestId,
          documentId: payload.document_id,
          workspaceId: payload.workspace_id,
          validChunks: (validChunks || []).length,
          embeddedCount,
          kind: payload.kind,
        });
      }

      const error = new Error(`Unsupported task kind: ${payload.kind}`);
      error.statusCode = 400;
      throw error;
    },
  }, { requestId, log });
}
