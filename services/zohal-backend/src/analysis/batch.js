import {
  deterministicId,
  getTemplateIntent,
  normalizeConfidence,
  normalizeStructuralFacet,
  normalizeUuid,
  parseStructuredJsonResponse,
} from "./canonical.js";
import {
  createChatCompletion,
  extractOutputText,
  getAIStageConfig,
} from "./ai-provider.js";

function hasNumericValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function normalizePageNumber(value, fallback = 1) {
  if (hasNumericValue(value) && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function findChunkForQuote(chunks, pageNumber, sourceQuote) {
  const normalizedQuote = String(sourceQuote || "").trim();
  const normalizedPage = normalizePageNumber(pageNumber, 0);
  const pageChunks = Array.isArray(chunks)
    ? chunks.filter((chunk) => Number(chunk?.page_number || 0) === normalizedPage)
    : [];
  if (normalizedQuote) {
    const matching = pageChunks.find((chunk) => {
      const content = String(chunk?.content_text || "").trim();
      return content && (content.includes(normalizedQuote) || normalizedQuote.includes(content));
    });
    if (matching) return matching;
  }
  return pageChunks[0] || chunks[0] || null;
}

function buildSourceAnchor(candidate, chunk, documentId) {
  const quote = String(candidate?.source_quote || candidate?.snippet || "").trim();
  const snippet = quote || String(chunk?.content_text || "").slice(0, 160).trim();
  const chunkMetadata = chunk?.metadata_json && typeof chunk.metadata_json === "object"
    ? chunk.metadata_json
    : {};
  const tabularSource = candidate?.tabular_source && typeof candidate.tabular_source === "object"
    ? candidate.tabular_source
    : chunkMetadata?.tabular_source && typeof chunkMetadata.tabular_source === "object"
    ? chunkMetadata.tabular_source
    : undefined;
  const sourceType = String(candidate?.source_type || chunkMetadata?.source_type || "").trim();
  // Preserve optional sub-page precision if a future extractor supplies it.
  // The current extraction schema does not require these fields yet.
  const charStart = Number.isFinite(Number(candidate?.char_start))
    ? Number(candidate.char_start)
    : undefined;
  const charEnd = Number.isFinite(Number(candidate?.char_end))
    ? Number(candidate.char_end)
    : undefined;
  const bbox = candidate?.bbox && typeof candidate.bbox === "object"
    ? candidate.bbox
    : undefined;
  return {
    document_id: normalizeUuid(candidate?.document_id || documentId),
    page_number: normalizePageNumber(
      candidate?.page_number,
      normalizePageNumber(chunk?.page_number, 1),
    ),
    chunk_id: chunk?.id ? String(chunk.id) : undefined,
    snippet,
    ...(sourceType ? { source_type: sourceType } : {}),
    ...(tabularSource ? { tabular_source: tabularSource } : {}),
    ...(charStart !== undefined ? { char_start: charStart } : {}),
    ...(charEnd !== undefined ? { char_end: charEnd } : {}),
    ...(bbox ? { bbox } : {}),
  };
}

function normalizeExtractedItems(result, chunks, documentId) {
  const rows = Array.isArray(result?.extracted_items) ? result.extracted_items : [];
  return rows.map((candidate, index) => {
    const pageNumber = normalizePageNumber(
      candidate?.page_number,
      normalizePageNumber(chunks[0]?.page_number, 1),
    );
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

function chooseTabularTargetId(chunk, extractionTargets) {
  const metadata = chunk?.metadata_json && typeof chunk.metadata_json === "object"
    ? chunk.metadata_json
    : {};
  const columns = Array.isArray(metadata?.tabular_source?.columns)
    ? metadata.tabular_source.columns
    : [];
  const hasNumericValue = columns.some((column) =>
    ["number", "integer", "currency", "percentage"].includes(
      String(column?.inferred_type || "").trim().toLowerCase(),
    )
  );
  const preferredId = hasNumericValue
    ? "headline_measures"
    : "workbook_structure";
  const targetIds = new Set(
    (Array.isArray(extractionTargets) ? extractionTargets : [])
      .map((target) => String(target?.id || "").trim())
      .filter(Boolean),
  );
  if (targetIds.has(preferredId)) return preferredId;
  if (targetIds.has("metric_definitions_and_labels")) return "metric_definitions_and_labels";
  return Array.from(targetIds)[0] || preferredId;
}

function buildTabularRowPayload(chunk) {
  const metadata = chunk?.metadata_json && typeof chunk.metadata_json === "object"
    ? chunk.metadata_json
    : {};
  const tabular = metadata?.tabular_source && typeof metadata.tabular_source === "object"
    ? metadata.tabular_source
    : {};
  const columns = Array.isArray(tabular.columns) ? tabular.columns : [];
  const values = {};
  const formulas = {};
  for (const column of columns) {
    const key = String(column?.column_key || column?.cell_ref || "").trim();
    if (!key) continue;
    values[key] = column?.formatted_value ?? null;
    const formula = String(column?.formula || "").trim();
    if (formula) formulas[key] = formula;
  }
  return {
    sheet_name: String(tabular.sheet_name || "").trim() || null,
    range_ref: String(tabular.range_ref || "").trim() || null,
    row_index: Number.isFinite(Number(tabular.row_index)) ? Number(tabular.row_index) : null,
    values,
    ...(Object.keys(formulas).length > 0 ? { formulas } : {}),
  };
}

function buildDeterministicTabularExtraction(chunks, extractionTargets) {
  const tabularChunks = (Array.isArray(chunks) ? chunks : []).filter((chunk) => {
    const metadata = chunk?.metadata_json && typeof chunk.metadata_json === "object"
      ? chunk.metadata_json
      : {};
    return String(metadata?.source_type || "").trim().toLowerCase() === "tabular" ||
      Boolean(metadata?.tabular_source);
  });
  if (tabularChunks.length === 0) return null;

  return {
    extracted_items: tabularChunks.map((chunk, index) => {
      const metadata = chunk?.metadata_json && typeof chunk.metadata_json === "object"
        ? chunk.metadata_json
        : {};
      const tabular = metadata?.tabular_source && typeof metadata.tabular_source === "object"
        ? metadata.tabular_source
        : {};
      const sheetName = String(tabular.sheet_name || "Sheet").trim();
      const rangeRef = String(tabular.range_ref || "").trim();
      const targetId = chooseTabularTargetId(chunk, extractionTargets);
      return {
        target_id: targetId,
        target_label: targetId.replace(/_/g, " "),
        display_name: `${sheetName}${rangeRef ? ` ${rangeRef}` : ""}`,
        structural_facet: "measure",
        payload: buildTabularRowPayload(chunk),
        page_number: normalizePageNumber(chunk?.page_number, 0),
        source_quote: String(chunk?.content_text || "").trim(),
        source_type: "tabular",
        confidence: "high",
        candidate_id: `tabular-row-${index}`,
      };
    }),
  };
}

async function analyzeBatchWithOpenAI({
  batchText,
  extractionTargets,
  playbookOptions,
  workspaceId,
  requestId,
}) {
  const stage = getAIStageConfig("generator");
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
                  source_type: { type: "string" },
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
          "For spreadsheet or tabular batches, use page_number 0, set source_type to tabular, and cite the exact row/range line as source_quote.",
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
  return parseStructuredJsonResponse(outputText, {
    fallback: { extracted_items: [] },
    errorCode: "invalid_extracted_items_json",
  });
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
    .select("id, document_id, page_number, chunk_index, chunk_type, content_text, metadata_json")
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
    const pageNumber = normalizePageNumber(chunk?.page_number, 0);
    if (!pages.has(pageNumber)) pages.set(pageNumber, []);
    const content = String(chunk?.content_text || "").trim();
    if (!content) continue;
    const metadata = chunk?.metadata_json && typeof chunk.metadata_json === "object"
      ? chunk.metadata_json
      : {};
    const tabular = metadata?.tabular_source && typeof metadata.tabular_source === "object"
      ? metadata.tabular_source
      : null;
    if (tabular) {
      const sheetName = String(tabular.sheet_name || "Sheet").trim();
      const rangeRef = String(tabular.range_ref || "").trim();
      pages.get(pageNumber).push(
        `[Tabular ${sheetName}${rangeRef ? ` ${rangeRef}` : ""}] ${content}`,
      );
    } else {
      pages.get(pageNumber).push(content);
    }
  }
  return Array.from(pages.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([pageNumber, parts]) =>
      pageNumber === 0
        ? `[Tabular source]\n${parts.join("\n")}`
        : `[Page ${pageNumber}]\n${parts.join("\n")}`
    )
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

  let rawResult = await analyzeBatch({
    batchText,
    extractionTargets,
    playbookOptions,
    workspaceId: run.workspace_id,
    requestId,
  });
  if (!Array.isArray(rawResult?.extracted_items) || rawResult.extracted_items.length === 0) {
    rawResult = buildDeterministicTabularExtraction(chunks, extractionTargets) || rawResult;
  }

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
