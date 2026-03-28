import {
  deterministicId,
  getTemplateIntent,
  normalizeConfidence,
  normalizeStructuralFacet,
  normalizeUuid,
} from "./canonical.js";

function getAIStageConfig() {
  const normalizeProvider = (value) => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "openai" || raw === "vertex") return raw;
    return undefined;
  };
  const fallbackModel = String(process.env.OPENAI_CONTRACT_MODEL || "gpt-5.2").trim();
  const providerOverride = normalizeProvider(process.env.GENERATOR_PROVIDER);
  const model = String(process.env.GENERATOR_MODEL || "").trim() || fallbackModel;
  return { ...(providerOverride ? { providerOverride } : {}), model };
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function resolveAIProvider({ workspaceId } = {}) {
  const configured = String(process.env.AI_PROVIDER || "openai").trim().toLowerCase();
  const defaultProvider = configured === "vertex" ? "vertex" : "openai";
  const rollout = String(process.env.AI_PROVIDER_ROLLOUT || "").trim().toLowerCase();
  if (!rollout || defaultProvider === "openai") return defaultProvider;
  if (rollout === "all" || rollout === "*") return "vertex";
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) return "openai";
  return new Set(parseCsv(rollout)).has(normalizedWorkspaceId)
    ? "vertex"
    : "openai";
}

function getProviderConfig(provider) {
  if (provider === "openai") {
    const openaiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");
    return {
      baseUrl: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${openaiKey}` },
    };
  }

  const baseUrl = String(process.env.VERTEX_OPENAI_BASE_URL || "").trim();
  if (!baseUrl) throw new Error("VERTEX_OPENAI_BASE_URL not configured");

  const bearer = String(process.env.VERTEX_BEARER_TOKEN || "").trim();
  const apiKey = String(process.env.VERTEX_OPENAI_API_KEY || "").trim();
  if (!bearer && !apiKey) {
    throw new Error(
      "Vertex credentials not configured (VERTEX_BEARER_TOKEN or VERTEX_OPENAI_API_KEY)",
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    headers: bearer
      ? { Authorization: `Bearer ${bearer}` }
      : { "x-goog-api-key": apiKey },
  };
}

function remapModelForProvider(provider, path, payload) {
  if (provider !== "vertex" || !payload?.model) return payload;
  const model = String(payload.model || "").trim();
  if (!model || model.startsWith("google/") || model.includes("-maas")) {
    return payload;
  }
  const vertexChatModel = String(process.env.VERTEX_MODEL_CHAT || "").trim() ||
    "google/gemini-2.0-flash-001";
  const vertexSmallModel = String(process.env.VERTEX_MODEL_SMALL || "").trim() ||
    vertexChatModel;
  const openaiContractModel = String(process.env.OPENAI_CONTRACT_MODEL || "").trim();
  const lower = model.toLowerCase();
  let mapped = model;
  if (openaiContractModel && model === openaiContractModel) {
    mapped = vertexChatModel;
  } else if (lower.includes("mini") || lower.includes("small") || lower.includes("lite")) {
    mapped = vertexSmallModel;
  } else if (lower.startsWith("gpt") || lower.startsWith("o")) {
    mapped = vertexChatModel;
  }
  return mapped === model ? payload : { ...payload, model: mapped };
}

function normalizeChatPayloadForProvider(provider, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (provider !== "openai") return payload;
  const model = String(payload.model || "").trim().toLowerCase();
  if (!(model.startsWith("gpt-5") || model.startsWith("o"))) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, "max_tokens")) return payload;
  const next = { ...payload };
  next.max_completion_tokens = typeof payload.max_completion_tokens === "number"
    ? payload.max_completion_tokens
    : payload.max_tokens;
  delete next.max_tokens;
  return next;
}

async function createChatCompletion(payload, options = {}) {
  const provider = options.providerOverride ||
    resolveAIProvider({ workspaceId: options.workspaceId });
  const providerConfig = getProviderConfig(provider);
  const headers = {
    "content-type": "application/json",
    ...providerConfig.headers,
  };
  if (options.requestId) headers["x-request-id"] = options.requestId;

  const requestPayload = normalizeChatPayloadForProvider(
    provider,
    remapModelForProvider(provider, "/chat/completions", payload),
  );
  const response = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestPayload),
    signal: options.signal,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      json?.error?.message || json?.message ||
        `AI provider request failed (${response.status})`,
    );
    error.statusCode = response.status;
    throw error;
  }
  return json;
}

function extractOutputText(response) {
  const choice = Array.isArray(response?.choices) ? response.choices[0] : null;
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => typeof part?.text === "string" ? part.text : "")
      .join("");
    if (text.trim()) return text;
  }
  return "";
}

function findChunkForQuote(chunks, pageNumber, sourceQuote) {
  const normalizedQuote = String(sourceQuote || "").trim();
  const normalizedPage = Number(pageNumber || 0);
  const pageChunks = Array.isArray(chunks)
    ? chunks.filter((chunk) => Number(chunk?.page_number || 0) === normalizedPage)
    : [];
  if (normalizedQuote) {
    const matching = pageChunks.find((chunk) =>
      String(chunk?.content_text || "").includes(normalizedQuote)
    );
    if (matching) return matching;
  }
  return pageChunks[0] || chunks[0] || null;
}

function buildSourceAnchor(candidate, chunk, documentId) {
  const quote = String(candidate?.source_quote || candidate?.snippet || "").trim();
  const snippet = quote || String(chunk?.content_text || "").slice(0, 160).trim();
  return {
    document_id: normalizeUuid(candidate?.document_id || documentId),
    page_number: Number(candidate?.page_number || chunk?.page_number || 1),
    chunk_id: chunk?.id ? String(chunk.id) : undefined,
    snippet,
  };
}

function normalizeExtractedItems(result, chunks, documentId) {
  const rows = Array.isArray(result?.extracted_items) ? result.extracted_items : [];
  return rows.map((candidate, index) => {
    const pageNumber = Number(candidate?.page_number || 0) || Number(chunks[0]?.page_number || 1) || 1;
    const chunk = findChunkForQuote(chunks, pageNumber, candidate?.source_quote);
    const payload = candidate?.payload && typeof candidate.payload === "object" && !Array.isArray(candidate.payload)
      ? candidate.payload
      : { value: candidate?.value ?? null };
    return {
      target_id: String(candidate?.target_id || `target_${index + 1}`).trim() || `target_${index + 1}`,
      display_name: String(candidate?.display_name || candidate?.target_label || candidate?.target_id || `Item ${index + 1}`).trim(),
      structural_facet: normalizeStructuralFacet(candidate?.structural_facet || "annotation"),
      payload,
      source_anchor: buildSourceAnchor(candidate, chunk, documentId),
      confidence: normalizeConfidence(candidate?.confidence),
    };
  });
}

async function analyzeBatchWithOpenAI({
  batchText,
  extractionTargets,
  playbookOptions,
  workspaceId,
  requestId,
}) {
  const stage = getAIStageConfig();
  const response = await createChatCompletion({
    model: stage.model,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "zohal_extracted_items_batch",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            extracted_items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  target_id: { type: "string" },
                  target_label: { type: "string" },
                  display_name: { type: "string" },
                  structural_facet: { type: "string" },
                  payload: { type: "object", additionalProperties: true },
                  page_number: { type: "number" },
                  source_quote: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                },
                required: [
                  "target_id",
                  "target_label",
                  "display_name",
                  "structural_facet",
                  "payload",
                  "page_number",
                  "source_quote",
                  "confidence",
                ],
              },
            },
          },
          required: ["extracted_items"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content: [
          "You are extracting source-backed items from a document batch for Zohal.",
          "Return extracted items only. Do not compute conclusions, risk assessments, summaries, totals, or other derived insights.",
          "Every item must cite a page_number and a verbatim source_quote from the batch text.",
          "Payload must stay compact and factual.",
          playbookOptions?.language === "ar" ? "Prefer Arabic labels when the source is Arabic." : "",
        ].filter(Boolean).join("\n"),
      },
      {
        role: "user",
        content: [
          "Extraction targets:",
          JSON.stringify(extractionTargets, null, 2),
          "",
          "Document batch:",
          batchText,
        ].join("\n"),
      },
    ],
    max_tokens: 4000,
  }, {
    providerOverride: stage.providerOverride,
    workspaceId,
    requestId,
  });

  const outputText = extractOutputText(response);
  return JSON.parse(outputText || "{\"extracted_items\":[]}");
}

async function fetchBatchRunOrThrow(supabase, batchRunId) {
  const { data, error } = await supabase
    .from("extraction_runs")
    .select("*")
    .eq("id", normalizeUuid(batchRunId))
    .single();
  if (error || !data) {
    const wrapped = new Error(error?.message || "Batch run not found");
    wrapped.statusCode = 404;
    throw wrapped;
  }
  return data;
}

async function fetchDocumentChunksForBatch(supabase, run, startPage, endPage) {
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, page_number, chunk_index, content_text")
    .eq("document_id", normalizeUuid(run.document_id))
    .gte("page_number", startPage)
    .lte("page_number", endPage)
    .order("page_number", { ascending: true })
    .order("chunk_index", { ascending: true });
  if (error) {
    const wrapped = new Error(`Failed to fetch chunks for batch: ${error.message}`);
    wrapped.statusCode = 500;
    throw wrapped;
  }
  return data || [];
}

function normalizeStrictnessOption(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "strict") return "strict";
  if (raw === "default") return "default";
  return undefined;
}

function normalizeLanguageOption(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "ar" || raw.startsWith("ar-") || raw === "arabic") return "ar";
  if (raw === "en" || raw.startsWith("en-") || raw === "english") return "en";
  return undefined;
}

function resolvePlaybookOptions(input, playbookSpec) {
  const requestOptions = input?.playbook_options && typeof input.playbook_options === "object"
    ? input.playbook_options
    : null;
  const specOptions = playbookSpec?.options && typeof playbookSpec.options === "object"
    ? playbookSpec.options
    : null;
  return {
    strictness: normalizeStrictnessOption(requestOptions?.strictness) ||
      normalizeStrictnessOption(specOptions?.strictness) ||
      "default",
    enable_verifier: requestOptions?.enable_verifier === true ||
      specOptions?.enable_verifier === true,
    language: normalizeLanguageOption(requestOptions?.language) ||
      normalizeLanguageOption(specOptions?.language) ||
      "en",
  };
}

export function allowedVariableNamesForTemplate() {
  return new Set();
}

export function buildBatchText(chunks) {
  const pages = new Map();
  for (const chunk of chunks || []) {
    const pageNumber = Number(chunk?.page_number || 0);
    if (!pageNumber) continue;
    if (!pages.has(pageNumber)) pages.set(pageNumber, []);
    const content = String(chunk?.content_text || "").trim();
    if (content) pages.get(pageNumber).push(content);
  }
  return Array.from(pages.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([pageNumber, parts]) => `[Page ${pageNumber}]\n${parts.join("\n")}`)
    .join("\n\n");
}

export function addStableCandidateIds({
  result,
  documentId,
  batchIndex,
}) {
  const normalizedDocumentId = normalizeUuid(documentId).replace(/-/g, "");
  const prefix = `d${normalizedDocumentId.slice(0, 8)}-b${Number(batchIndex || 0)}`;
  const extractedItems = Array.isArray(result?.extracted_items)
    ? result.extracted_items.map((item, index) => ({
      ...item,
      candidate_id: `${prefix}-i${index}`,
    }))
    : [];
  return { extracted_items: extractedItems };
}

export async function executeContractAnalysisBatch({
  supabase,
  batchRunId,
  requestId,
  log,
  analyzeBatch = analyzeBatchWithOpenAI,
}) {
  const run = await fetchBatchRunOrThrow(supabase, batchRunId);
  const input = run.input_config && typeof run.input_config === "object"
    ? run.input_config
    : {};
  const parentRunId = normalizeUuid(input.parent_run_id);
  const batchIndex = Number(input.batch_index || 0);
  const totalBatches = Number(input.total_batches || 0);
  const startPage = Number(input.start_page || 0);
  const endPage = Number(input.end_page || 0);
  const templateId = String(input.template_id || "document_analysis").trim() || "document_analysis";
  const playbookSpec = input.playbook_spec || null;
  const playbookOptions = resolvePlaybookOptions(input, playbookSpec);
  const { extractionTargets } = getTemplateIntent(playbookSpec, templateId);

  await supabase
    .from("extraction_runs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizeUuid(batchRunId));

  const chunks = await fetchDocumentChunksForBatch(supabase, run, startPage, endPage);
  const batchText = buildBatchText(chunks);

  log?.info?.("Executing canonical extracted-items batch on GCP", {
    batch_run_id: normalizeUuid(batchRunId),
    parent_run_id: parentRunId,
    batch_index: batchIndex,
    total_batches: totalBatches,
    template_id: templateId,
    extraction_targets: extractionTargets.length,
  });

  const rawResult = await analyzeBatch({
    batchText,
    extractionTargets,
    playbookOptions,
    workspaceId: run.workspace_id,
    requestId,
  });

  const normalizedResult = {
    extracted_items: normalizeExtractedItems(
      rawResult,
      chunks,
      normalizeUuid(run.document_id),
    ),
  };

  const outputSummary = {
    parent_run_id: parentRunId,
    batch_index: batchIndex,
    total_batches: totalBatches,
    document_id: normalizeUuid(run.document_id),
    start_page: startPage,
    end_page: endPage,
    extraction_targets: extractionTargets.map((target) => ({
      id: target.id,
      label: target.label,
      structural_facet: target.structural_facet,
    })),
    ...addStableCandidateIds({
      result: normalizedResult,
      documentId: run.document_id,
      batchIndex,
    }),
  };

  await supabase
    .from("extraction_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      output_summary: outputSummary,
    })
    .eq("id", normalizeUuid(batchRunId));

  return {
    ok: true,
    batch_run_id: normalizeUuid(batchRunId),
    parent_run_id: parentRunId,
    batch_index: batchIndex,
    total_batches: totalBatches,
    output_summary: outputSummary,
  };
}
