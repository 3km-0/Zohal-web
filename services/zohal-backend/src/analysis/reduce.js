import {
  buildProofManifest,
  buildSourceManifest,
  buildStageTrace,
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
import { ensurePrivateLiveExperienceRefresh } from "./private-live.js";

function dedupeByKey(rows, keyFn) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function collectBatchItems(batchRuns) {
  const items = [];
  for (const run of batchRuns || []) {
    const output = run.output_summary && typeof run.output_summary === "object"
      ? run.output_summary
      : {};
    if (Array.isArray(output.extracted_items)) {
      items.push(...output.extracted_items.map((item) => ({
        ...item,
        batch_run_id: run.id,
        document_id: normalizeUuid(item?.source_anchor?.document_id || output.document_id),
      })));
    }
  }
  return items;
}

function groupChunksByDocument(rows) {
  const grouped = {};
  for (const row of rows || []) {
    const documentId = normalizeUuid(row?.document_id);
    if (!documentId) continue;
    if (!grouped[documentId]) grouped[documentId] = [];
    grouped[documentId].push(row);
  }
  return grouped;
}

function findMatchingChunk(chunksByDoc, anchor, fallbackDocumentId) {
  const documentId = normalizeUuid(anchor?.document_id || fallbackDocumentId);
  const pageNumber = Number(anchor?.page_number || 0);
  const snippet = String(anchor?.snippet || "").trim();
  const chunks = Array.isArray(chunksByDoc?.[documentId]) ? chunksByDoc[documentId] : [];
  const pageChunks = pageNumber > 0
    ? chunks.filter((chunk) => Number(chunk?.page_number || 0) === pageNumber)
    : chunks;
  if (snippet) {
    const direct = pageChunks.find((chunk) => String(chunk?.content_text || "").includes(snippet));
    if (direct) return direct;
  }
  return pageChunks[0] || chunks[0] || null;
}

function verifyAnchorIntegrity(anchor, chunksByDoc, fallbackDocumentId) {
  const chunk = findMatchingChunk(chunksByDoc, anchor, fallbackDocumentId);
  const snippet = String(anchor?.snippet || "").trim();
  if (!chunk || !snippet) return "failed";
  return String(chunk?.content_text || "").includes(snippet) ? "verified" : "failed";
}

function normalizeExtractedItems(extractedItems, chunksByDoc, fallbackDocumentId) {
  const now = new Date().toISOString();
  const deduped = dedupeByKey(
    extractedItems,
    (item) => JSON.stringify([
      item?.target_id,
      item?.display_name,
      item?.source_anchor?.document_id || fallbackDocumentId,
      item?.source_anchor?.page_number,
      item?.source_anchor?.snippet,
      item?.payload || null,
    ]),
  );
  return deduped.map((item) => {
    const sourceAnchor = item?.source_anchor && typeof item.source_anchor === "object"
      ? item.source_anchor
      : {};
    const chunk = findMatchingChunk(chunksByDoc, sourceAnchor, fallbackDocumentId);
    const normalizedAnchor = {
      document_id: normalizeUuid(sourceAnchor.document_id || fallbackDocumentId),
      page_number: Number(sourceAnchor.page_number || chunk?.page_number || 1),
      chunk_id: String(sourceAnchor.chunk_id || chunk?.id || "").trim() || undefined,
      snippet: String(sourceAnchor.snippet || "").trim(),
    };
    const anchorIntegrity = verifyAnchorIntegrity(normalizedAnchor, chunksByDoc, fallbackDocumentId);
    const id = deterministicId(
      "item",
      "extracted",
      item?.candidate_id || "",
      normalizedAnchor.document_id,
      normalizedAnchor.page_number,
      normalizedAnchor.snippet,
      item?.payload || null,
    );
    return {
      id,
      provenance_class: "extracted",
      structural_facet: normalizeStructuralFacet(item?.structural_facet || "annotation"),
      display_name: String(item?.display_name || item?.target_id || "Extracted item").trim() || "Extracted item",
      payload: item?.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
        ? item.payload
        : { value: item?.payload ?? null },
      confidence: normalizeConfidence(item?.confidence),
      verification_state: anchorIntegrity === "verified" ? "verified" : "needs_review",
      source_anchors: [normalizedAnchor],
      anchor_integrity: anchorIntegrity,
      created_at: now,
      updated_at: now,
      template_target_id: String(item?.target_id || "").trim() || undefined,
    };
  });
}

async function deriveItemsWithOpenAI({
  extractedItems,
  derivationIntents,
  workspaceId,
  requestId,
}) {
  if (!Array.isArray(extractedItems) || extractedItems.length === 0) {
    return { derived_items: [] };
  }
  const stage = getAIStageConfig("generator");
  const response = await createChatCompletion({
    model: stage.model,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "zohal_derived_items_reduce",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            derived_items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  derivation_id: { type: "string" },
                  display_name: { type: "string" },
                  structural_facet: { type: "string" },
                  payload: { type: "object", additionalProperties: true },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  rationale: { type: "string" },
                  input_item_ids: { type: "array", items: { type: "string" } },
                },
                required: [
                  "derivation_id",
                  "display_name",
                  "structural_facet",
                  "payload",
                  "confidence",
                  "rationale",
                  "input_item_ids",
                ],
              },
            },
          },
          required: ["derived_items"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content: [
          "You derive higher-order items from verified extracted items for Zohal.",
          "Only use the extracted items provided as inputs.",
          "Every derived item must cite the input_item_ids that support it.",
          "Do not invent direct source quotes or source anchors for derived items.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Derivation intents:",
          JSON.stringify(derivationIntents, null, 2),
          "",
          "Extracted items:",
          JSON.stringify(extractedItems.map((item) => ({
            id: item.id,
            display_name: item.display_name,
            structural_facet: item.structural_facet,
            payload: item.payload,
            confidence: item.confidence,
          })), null, 2),
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
    fallback: { derived_items: [] },
    errorCode: "invalid_derived_items_json",
  });
}

async function selectivelyVerifyDerivedItems({
  derivedItems,
  extractedItems,
  reviewPolicy,
  workspaceId,
  requestId,
}) {
  if (!reviewPolicy?.enable_verifier || !Array.isArray(derivedItems) || derivedItems.length === 0) {
    return derivedItems;
  }
  const targets = reviewPolicy.high_impact_only
    ? derivedItems.filter((item) => item.confidence !== "high")
    : derivedItems;
  if (targets.length === 0) return derivedItems;

  const stage = getAIStageConfig("verifier");
  const response = await createChatCompletion({
    model: stage.model,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "zohal_derived_item_verifier",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            outcomes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  verifier_outcome: { type: "string", enum: ["confirmed", "disputed", "skipped"] },
                },
                required: ["id", "verifier_outcome"],
              },
            },
          },
          required: ["outcomes"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content: [
          "You verify derived Zohal items against their stated extracted inputs.",
          "Confirm a derived item only if the stated input items support it.",
          "Return disputed when the rationale overreaches or the inputs do not support the claim.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Extracted items:",
          JSON.stringify(extractedItems.map((item) => ({
            id: item.id,
            display_name: item.display_name,
            payload: item.payload,
          })), null, 2),
          "",
          "Derived items to verify:",
          JSON.stringify(targets.map((item) => ({
            id: item.id,
            display_name: item.display_name,
            payload: item.payload,
            derivation: item.derivation,
          })), null, 2),
        ].join("\n"),
      },
    ],
    max_tokens: 1500,
  }, {
    providerOverride: stage.providerOverride,
    workspaceId,
    requestId,
  });
  const outputText = extractOutputText(response);
  const parsed = parseStructuredJsonResponse(outputText, {
    fallback: { outcomes: [] },
    errorCode: "invalid_derived_verifier_json",
  });
  const outcomes = new Map(
    (Array.isArray(parsed?.outcomes) ? parsed.outcomes : []).map((outcome) => [
      String(outcome?.id || "").trim(),
      String(outcome?.verifier_outcome || "skipped").trim(),
    ]),
  );
  return derivedItems.map((item) => {
    const verifierOutcome = outcomes.get(item.id);
    if (!verifierOutcome) return item;
    return {
      ...item,
      derivation: {
        ...(item.derivation || {}),
        verifier_outcome: verifierOutcome,
      },
      verification_state: verifierOutcome === "confirmed"
        ? "verified"
        : verifierOutcome === "disputed"
        ? "needs_review"
        : item.verification_state,
    };
  });
}

export function normalizeDerivedItems(rawDerived, extractedItems) {
  const now = new Date().toISOString();
  const extractedIds = new Set(extractedItems.map((item) => item.id));
  return dedupeByKey(rawDerived || [], (item) => JSON.stringify([
    item?.derivation_id,
    item?.display_name,
    item?.payload || null,
    item?.input_item_ids || [],
  ])).map((item) => {
    const inputItemIds = Array.isArray(item?.input_item_ids)
      ? item.input_item_ids.map((value) => String(value || "").trim()).filter((id) => extractedIds.has(id))
      : [];
    const id = deterministicId(
      "item",
      "derived",
      item?.derivation_id || "",
      item?.display_name || "",
      item?.payload || null,
      inputItemIds,
    );
    return {
      id,
      provenance_class: "derived",
      structural_facet: normalizeStructuralFacet(item?.structural_facet || "annotation"),
      display_name: String(item?.display_name || item?.derivation_id || "Derived item").trim() || "Derived item",
      payload: item?.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
        ? item.payload
        : { value: item?.payload ?? null },
      confidence: normalizeConfidence(item?.confidence),
      verification_state: "needs_review",
      derivation: {
        input_item_ids: inputItemIds,
        method: String(item?.method || item?.derivation_id || "llm_reasoning").trim() || "llm_reasoning",
        rationale: String(item?.rationale || "").trim() || undefined,
        verifier_outcome: "skipped",
      },
      created_at: now,
      updated_at: now,
    };
  });
}

function buildLinks(extractedItems, derivedItems) {
  const extractedIds = new Set(extractedItems.map((item) => item.id));
  const links = [];
  for (const item of derivedItems || []) {
    const inputIds = Array.isArray(item?.derivation?.input_item_ids)
      ? item.derivation.input_item_ids
      : [];
    for (const inputId of inputIds) {
      if (!extractedIds.has(inputId)) continue;
      links.push({
        id: deterministicId("link", inputId, item.id, "supports"),
        type: "supports",
        from_item_id: inputId,
        to_item_id: item.id,
        metadata: {
          proof_path: "lineage",
        },
      });
    }
  }
  return dedupeByKey(links, (link) => link.id);
}

function buildCorpusRevisionId(parentRun, input) {
  const bundleId = String(input?.bundle?.pack_id || input?.bundle?.bundle_id || "").trim();
  if (bundleId) return `bundle:${normalizeUuid(bundleId)}`;
  return `workspace:${normalizeUuid(parentRun.workspace_id)}:document:${normalizeUuid(parentRun.document_id)}`;
}

export function toSnapshot(reduced, chunksByDoc, primaryDocumentId, templateId, context = {}) {
  const extractedItems = Array.isArray(reduced?.extracted_items) ? reduced.extracted_items : [];
  const derivedItems = Array.isArray(reduced?.derived_items) ? reduced.derived_items : [];
  const links = Array.isArray(reduced?.links) ? reduced.links : [];
  return {
    schema_version: "3.0",
    run_id: context.run_id || null,
    workspace_id: context.workspace_id || null,
    corpus_revision_id: context.corpus_revision_id || null,
    template_id: templateId,
    template_version: String(context.template_version || "3.0.0"),
    document_id: primaryDocumentId,
    source_manifest: buildSourceManifest(chunksByDoc),
    items: [...extractedItems, ...derivedItems],
    links,
    proof_manifest: buildProofManifest(
      [...extractedItems, ...derivedItems],
      context.review_policy || {},
    ),
    stage_trace: buildStageTrace(context.stage_entries || [], {
      execution_plane: "gcp",
      primary_document_id: primaryDocumentId,
    }),
    analyzed_at: new Date().toISOString(),
  };
}

export function addComputedNoticeDeadlineIfPossible(snapshotJson) {
  return snapshotJson;
}

export function attachPackMetadata(snapshotJson, templateId) {
  return {
    ...snapshotJson,
    template_id: templateId,
  };
}

export function buildFocusedModuleChunks({ chunks, primaryDocumentId }) {
  const normalizedPrimaryDocumentId = normalizeUuid(primaryDocumentId);
  return Array.isArray(chunks)
    ? chunks.filter((chunk) => normalizeUuid(chunk?.document_id) === normalizedPrimaryDocumentId)
    : [];
}

export function buildModuleDocumentText({ chunks, primaryDocumentId }) {
  return buildFocusedModuleChunks({ chunks, primaryDocumentId })
    .map((chunk) => String(chunk?.content_text || "").trim())
    .filter(Boolean)
    .join("\n");
}

export function shouldNativeReduceRun(parentRun, batchRuns) {
  if (!parentRun?.id) return { ok: false, reason: "missing_parent_run" };
  if (!Array.isArray(batchRuns) || batchRuns.length === 0) {
    return { ok: false, reason: "missing_batch_runs" };
  }
  return { ok: true };
}

async function fetchParentAndBatches(supabase, parentRunId) {
  const normalizedParentRunId = normalizeUuid(parentRunId);
  const { data: parentRun, error: parentErr } = await supabase
    .from("extraction_runs")
    .select("*")
    .eq("id", normalizedParentRunId)
    .single();
  if (parentErr || !parentRun) {
    const wrapped = new Error(`Parent run not found: ${parentErr?.message || normalizedParentRunId}`);
    wrapped.statusCode = 404;
    throw wrapped;
  }

  const batchExtractionType = parentRun.extraction_type === "document_analysis"
    ? "document_analysis_batch"
    : "contract_analysis_batch";
  const { data: batchRuns, error: batchErr } = await supabase
    .from("extraction_runs")
    .select("id,status,output_summary,created_at,completed_at")
    .eq("extraction_type", batchExtractionType)
    .contains("input_config", { parent_run_id: normalizedParentRunId });
  if (batchErr) {
    const wrapped = new Error(`Failed to load batch runs: ${batchErr.message}`);
    wrapped.statusCode = 500;
    throw wrapped;
  }

  return { parentRun, batchRuns: batchRuns || [] };
}

async function upsertVerificationSnapshot({ supabase, parentRun, snapshotJson }) {
  const objectType = "document_analysis";
  const { data: existingVO } = await supabase
    .from("verification_objects")
    .select("*")
    .eq("document_id", parentRun.document_id)
    .eq("object_type", objectType)
    .maybeSingle();

  let verificationObjectId;
  let versionNumber;
  if (!existingVO) {
    const { data: newVO, error } = await supabase
      .from("verification_objects")
      .insert({
        workspace_id: parentRun.workspace_id,
        document_id: parentRun.document_id,
        user_id: parentRun.user_id,
        object_type: objectType,
        state: "provisional",
        visibility: "private",
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create verification object: ${error.message}`);
    verificationObjectId = newVO.id;
    versionNumber = 1;
  } else {
    verificationObjectId = existingVO.id;
    const { data: latestVersion } = await supabase
      .from("verification_object_versions")
      .select("version_number")
      .eq("verification_object_id", verificationObjectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    versionNumber = Number(latestVersion?.version_number || 0) + 1;
  }

  const { data: newVersion, error: versionError } = await supabase
    .from("verification_object_versions")
    .insert({
      verification_object_id: verificationObjectId,
      version_number: versionNumber,
      state: "provisional",
      snapshot_json: snapshotJson,
      change_notes: versionNumber === 1
        ? "Initial canonical snapshot v3 (gcp runtime)"
        : `Re-analysis canonical snapshot v3 (${versionNumber})`,
      created_by: parentRun.user_id,
    })
    .select("id")
    .single();
  if (versionError) throw new Error(`Failed to create version: ${versionError.message}`);

  await supabase
    .from("verification_objects")
    .update({ current_version_id: newVersion.id, state: "provisional" })
    .eq("id", verificationObjectId);

  return {
    verificationObjectId,
    versionId: newVersion.id,
    versionNumber,
  };
}

function buildAutomationActivity(message, extra = {}) {
  return {
    at: new Date().toISOString(),
    kind: "status",
    message,
    ...extra,
  };
}

async function markAutomationRunSucceededNode({
  supabase,
  parentRunId,
  versionId,
  verificationObjectId,
  experienceId = null,
  materialized = false,
}) {
  const normalizedParentRunId = normalizeUuid(parentRunId);
  if (!normalizedParentRunId) return;
  const completedAt = new Date().toISOString();
  const { data: automationRun } = await supabase
    .from("workspace_automation_runs")
    .select("id, automation_id, activity_json, source_fingerprint")
    .eq("parent_run_id", normalizedParentRunId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!automationRun?.id) return;
  const activity = Array.isArray(automationRun.activity_json)
    ? automationRun.activity_json
    : [];
  await supabase
    .from("workspace_automation_runs")
    .update({
      status: "succeeded",
      status_reason:
        "Canonical snapshot completed on the GCP execution plane.",
      completed_at: completedAt,
      activity_json: [
        ...activity,
        buildAutomationActivity("Canonical snapshot completed.", {
          version_id: versionId || null,
          verification_object_id: verificationObjectId || null,
          experience_id: experienceId || null,
          materialized,
          execution_plane: "gcp",
        }),
      ],
      metadata: {
        version_id: versionId || null,
        verification_object_id: verificationObjectId || null,
        experience_id: experienceId || null,
        materialized,
        execution_plane: "gcp",
      },
      updated_at: completedAt,
    })
    .eq("id", automationRun.id);
  await supabase
    .from("workspace_automations")
    .update({
      last_succeeded_at: completedAt,
      last_source_fingerprint: automationRun.source_fingerprint || null,
      updated_at: completedAt,
    })
    .eq("id", automationRun.automation_id);
}

async function markActionSucceeded({
  supabase,
  actionId,
  requestId,
  templateId,
  verificationObjectId,
  versionId,
  versionNumber,
  snapshotJson,
  privateLiveResult,
}) {
  const normalizedActionId = normalizeUuid(actionId);
  if (!normalizedActionId) return;

  const items = Array.isArray(snapshotJson?.items) ? snapshotJson.items : [];
  const links = Array.isArray(snapshotJson?.links) ? snapshotJson.links : [];

  await supabase
    .from("actions")
    .update({
      status: "succeeded",
      updated_at: new Date().toISOString(),
      output_json: {
        stage: "complete",
        request_id: requestId,
        execution_plane: "gcp",
        template_id: templateId,
        verification_object_id: verificationObjectId,
        version_id: versionId,
        version_number: versionNumber,
        schema_version: snapshotJson?.schema_version || "3.0",
        counts: {
          items: items.length,
          links: links.length,
          extracted_items: items.filter((item) => item?.provenance_class === "extracted").length,
          derived_items: items.filter((item) => item?.provenance_class === "derived").length,
        },
        private_live: privateLiveResult
          ? {
            experience_id: privateLiveResult.experience_id || null,
            run_id: privateLiveResult.run_id || null,
            candidate_id: privateLiveResult.candidate_id || null,
            revision_id: privateLiveResult.revision_id || null,
            public_url: privateLiveResult.public_url || null,
            active_runtime: privateLiveResult.active_runtime || null,
          }
          : null,
      },
    })
    .eq("id", normalizedActionId);
}

export async function executeContractAnalysisReduce({
  supabase,
  parentRunId,
  requestId,
  log,
}) {
  const { parentRun, batchRuns } = await fetchParentAndBatches(supabase, parentRunId);
  if (parentRun.status === "completed") {
    return { ok: true, already_completed: true, delegated: false };
  }

  const support = shouldNativeReduceRun(parentRun, batchRuns);
  if (!support.ok) {
    const error = new Error(support.reason);
    error.statusCode = 400;
    throw error;
  }

  const pendingOrRunning = batchRuns.filter((item) =>
    item.status === "pending" || item.status === "running"
  );
  if (pendingOrRunning.length > 0) {
    const error = new Error("batches_not_complete");
    error.statusCode = 202;
    throw error;
  }

  const completed = batchRuns.filter((item) => item.status === "completed");
  if (completed.length === 0) {
    throw new Error("No completed batch runs available for reduce");
  }

  const input = parentRun.input_config && typeof parentRun.input_config === "object"
    ? parentRun.input_config
    : {};
  const templateId = String(input.template_id || "document_analysis").trim() || "document_analysis";
  const playbookSpec = input.playbook_spec || null;
  const playbookMeta = input.playbook || null;
  const primaryDocumentId = normalizeUuid(parentRun.document_id);
  const scopeDocumentIds = Array.from(
    new Set(
      [
        primaryDocumentId,
        ...(Array.isArray(input?.bundle?.document_ids) ? input.bundle.document_ids : []),
        ...(Array.isArray(input?.document_ids) ? input.document_ids : []),
        ...completed.map((run) => normalizeUuid(run?.output_summary?.document_id)),
      ].map((value) => normalizeUuid(value)).filter(Boolean),
    ),
  );

  await supabase
    .from("extraction_runs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", normalizeUuid(parentRunId));

  const { extractionTargets, derivationIntents, projectionIntents, reviewPolicy, presentationHints } =
    getTemplateIntent(playbookSpec, templateId);
  const batchExtractedItems = collectBatchItems(completed);

  const { data: chunkRows, error: chunksError } = await supabase
    .from("document_chunks")
    .select("id, document_id, page_number, chunk_index, content_text, bounding_box")
    .in("document_id", scopeDocumentIds)
    .order("page_number", { ascending: true })
    .order("chunk_index", { ascending: true });
  if (chunksError) {
    throw new Error(`Failed to fetch document chunks: ${chunksError.message}`);
  }
  const chunksByDoc = groupChunksByDocument(chunkRows || []);

  const stageEntries = [
    { stage: "extract", status: "completed", at: new Date().toISOString(), metadata: { batch_count: completed.length } },
  ];

  const extractedItems = normalizeExtractedItems(
    batchExtractedItems,
    chunksByDoc,
    primaryDocumentId,
  );
  stageEntries.push({
    stage: "anchor_verify",
    status: "completed",
    at: new Date().toISOString(),
    metadata: {
      extracted_count: extractedItems.length,
      anchor_verified_count: extractedItems.filter((item) => item.anchor_integrity === "verified").length,
    },
  });

  const rawDerived = await deriveItemsWithOpenAI({
    extractedItems,
    derivationIntents,
    workspaceId: parentRun.workspace_id,
    requestId,
  });
  let derivedItems = normalizeDerivedItems(rawDerived?.derived_items || [], extractedItems);
  derivedItems = await selectivelyVerifyDerivedItems({
    derivedItems,
    extractedItems,
    reviewPolicy,
    workspaceId: parentRun.workspace_id,
    requestId,
  });
  stageEntries.push({
    stage: "derive",
    status: "completed",
    at: new Date().toISOString(),
    metadata: { derived_count: derivedItems.length },
  });

  const links = buildLinks(extractedItems, derivedItems);
  const snapshotJson = attachPackMetadata(
    toSnapshot(
      {
        extracted_items: extractedItems,
        derived_items: derivedItems,
        links,
      },
      chunksByDoc,
      primaryDocumentId,
      templateId,
      {
        run_id: normalizeUuid(parentRunId),
        workspace_id: normalizeUuid(parentRun.workspace_id),
        corpus_revision_id: buildCorpusRevisionId(parentRun, input),
        template_version: String(playbookMeta?.template_version || "3.0.0"),
        review_policy: reviewPolicy,
        stage_entries: stageEntries,
      },
    ),
    templateId,
  );

  const { verificationObjectId, versionId, versionNumber } = await upsertVerificationSnapshot({
    supabase,
    parentRun,
    snapshotJson,
  });

  await supabase
    .from("extraction_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      output_summary: {
        schema_version: "3.0",
        verification_object_id: verificationObjectId,
        version_id: versionId,
        execution_plane: "gcp",
        counts: {
          extracted_items: extractedItems.length,
          derived_items: derivedItems.length,
          links: links.length,
        },
      },
    })
    .eq("id", normalizeUuid(parentRunId));

  let privateLiveResult = null;
  try {
    privateLiveResult = await ensurePrivateLiveExperienceRefresh({
      supabase,
      requestId,
      workspaceId: normalizeUuid(parentRun.workspace_id),
      userId: normalizeUuid(parentRun.user_id),
      documentId: primaryDocumentId,
      templateId,
      analysisTemplateId: templateId,
      title: presentationHints.default_title ||
        playbookMeta?.name ||
        "Document analysis",
      subtitle: "Private live experience",
      summary:
        presentationHints.default_summary ||
        "Structured analysis completed. This private live experience reflects the latest canonical snapshot.",
      verificationObjectId,
      verificationObjectVersionId: versionId,
      snapshot: snapshotJson,
      projectionIntents,
      updatedAfterVerification: reviewPolicy.enable_verifier === true,
      defaultVerificationStatus: reviewPolicy.enable_verifier === true
        ? "verified"
        : "generated",
    });
  } catch (error) {
    log?.warn?.("private live materialization failed on GCP", {
      parent_run_id: normalizeUuid(parentRunId),
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await markActionSucceeded({
    supabase,
    actionId: input.action_id,
    requestId,
    templateId,
    verificationObjectId,
    versionId,
    versionNumber,
    snapshotJson,
    privateLiveResult,
  }).catch((error) => {
    log?.warn?.("Failed to mark action succeeded", {
      parent_run_id: normalizeUuid(parentRunId),
      action_id: normalizeUuid(input.action_id),
      error: error instanceof Error ? error.message : String(error),
    });
  });

  log?.info?.("Completed canonical reduce on GCP", {
    parent_run_id: normalizeUuid(parentRunId),
    verification_object_id: verificationObjectId,
    version_id: versionId,
    extracted_items: extractedItems.length,
    derived_items: derivedItems.length,
  });

  await markAutomationRunSucceededNode({
    supabase,
    parentRunId,
    versionId,
    verificationObjectId,
    experienceId: privateLiveResult?.experience_id || null,
    materialized: Boolean(privateLiveResult),
  }).catch((error) => {
    log?.warn?.("Failed to mark automation run succeeded", {
      parent_run_id: normalizeUuid(parentRunId),
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return {
    ok: true,
    delegated: false,
    contract_id: null,
    verification_object_id: verificationObjectId,
    version_id: versionId,
    version_number: versionNumber,
  };
}
