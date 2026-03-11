import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { resolveDataPlane } from "../runtime/data-plane.js";
import {
  createHttpTask,
  buildDeterministicKey,
  getRuntimeSecret,
  startWorkflowExecution,
} from "../runtime/gcp.js";
import {
  generateSignedDownloadUrl,
  joinObjectPath,
} from "../runtime/gcs.js";
import {
  getExpectedInternalToken,
  requireInternalCaller,
} from "../runtime/internal-auth.js";
import { sendJson } from "../runtime/http.js";
import { invokeSupabaseFunction } from "../runtime/supabase-functions.js";
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
const INSIGHTS_DOC_TYPES = new Set([
  "contract",
  "legal_filing",
  "invoice",
  "financial_report",
  "meeting_notes",
  "other",
]);

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

async function invokeSupabaseStep({
  functionName,
  requestId,
  body,
  allowStatuses,
}) {
  return await invokeSupabaseFunction({
    functionName,
    requestId,
    body,
    allowStatuses,
  });
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
    request_id: requestId,
    execution_plane: "gcp",
  };
}

async function runEmbedStep({ supabase, requestId, payload }) {
  const response = await invokeSupabaseStep({
    functionName: "embed-and-store",
    requestId,
    body: {
      document_id: normalizeUuid(payload.document_id),
      workspace_id: normalizeUuid(payload.workspace_id),
      force: false,
    },
  });

  await appendIngestionRuntime(supabase, payload.document_id, {
    current_step: "embed",
  });

  return buildGcpEnvelope(requestId, response.json || { success: true });
}

async function runClassifyStep({ supabase, requestId, payload }) {
  const response = await invokeSupabaseStep({
    functionName: "classify-document",
    requestId,
    body: {
      document_id: normalizeUuid(payload.document_id),
    },
  });

  await appendIngestionRuntime(supabase, payload.document_id, {
    current_step: "classify",
  });

  return buildGcpEnvelope(requestId, response.json || { success: true });
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

  const response = await invokeSupabaseStep({
    functionName: "extract-insights",
    requestId,
    body: {
      document_id: normalizeUuid(payload.document_id),
      workspace_id: normalizeUuid(payload.workspace_id),
      user_id: normalizeUuid(payload.user_id),
      document_type: effectiveType || undefined,
    },
  });

  await appendIngestionRuntime(supabase, payload.document_id, {
    current_step: "extract_insights",
  });

  return buildGcpEnvelope(requestId, response.json || { success: true });
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
  };
}

export function buildOcrPollTaskPayload(payload, sourceOverride) {
  const source = String(sourceOverride || payload.source || "unknown").trim().toLowerCase() ||
    "unknown";
  const taskPayload = {
    kind: "ocr_poll",
    document_id: normalizeUuid(payload.document_id),
    workspace_id: normalizeUuid(payload.workspace_id),
    user_id: normalizeUuid(payload.user_id),
    source,
  };

  const workflowExecutionId = String(payload.workflow_execution_id || "").trim();
  if (workflowExecutionId) {
    taskPayload.workflow_execution_id = workflowExecutionId;
  }

  const originalRequestId = String(payload.request_id || "").trim();
  if (originalRequestId) {
    taskPayload.request_id = originalRequestId;
  }

  return taskPayload;
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
    requireInternalCaller(req.headers);
    const supabase = createServiceClient();
    const body = await handler.readJsonBody(req);
    const payload = parsePayload(body);
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
    execute: async ({ req, supabase, body, payload, requestId, log }) => {
      ensureRequiredFields(payload, [
        "document_id",
        "workspace_id",
        "user_id",
      ]);
      const result = await performStartOcr({ supabase, payload });

      const status = String(result.status || "").trim().toLowerCase();
      if (status === "processing" || status === "completed") {
        await scheduleIngestionTask({
          req,
          requestId,
          payload: buildOcrPollTaskPayload(payload, body.source),
          delaySeconds: status === "completed" ? 0 : DOCUMENT_INGESTION_OCR_POLL_DELAY_SECONDS,
        });
        log.info("Scheduled OCR poll task", {
          document_id: payload.document_id,
          status,
        });
      }

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
      ensureRequiredFields(payload, ["document_id", "workspace_id"]);
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

async function runPassthroughHandler({ requestId, functionName, body }) {
  const result = await invokeSupabaseStep({
    functionName,
    requestId,
    body,
  });
  return buildGcpEnvelope(requestId, result.json || { success: true });
}

export async function handleIngestionReconcileStatus(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ body, requestId }) =>
      await runPassthroughHandler({
        requestId,
        functionName: "reconcile-document-status",
        body,
      }),
  }, { requestId, log });
}

export async function handleIngestionDeleteEmbeddings(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ body, requestId }) =>
      await runPassthroughHandler({
        requestId,
        functionName: "delete-document-embeddings",
        body,
      }),
  }, { requestId, log });
}

export async function handleIngestionCleanupVectors(req, res, { requestId, log, readJsonBody }) {
  return await handleWrappedStep(req, res, {
    readJsonBody,
    execute: async ({ body, requestId }) =>
      await runPassthroughHandler({
        requestId,
        functionName: "cleanup-document-vectors",
        body,
      }),
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
        return await runPassthroughHandler({
          requestId,
          functionName: "reconcile-document-status",
          body,
        });
      }

      if (payload.kind === "delete_embeddings") {
        return await runPassthroughHandler({
          requestId,
          functionName: "delete-document-embeddings",
          body,
        });
      }

      if (payload.kind === "cleanup_vectors") {
        return await runPassthroughHandler({
          requestId,
          functionName: "cleanup-document-vectors",
          body,
        });
      }

      const error = new Error(`Unsupported task kind: ${payload.kind}`);
      error.statusCode = 400;
      throw error;
    },
  }, { requestId, log });
}
