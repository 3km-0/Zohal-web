import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalyzeAcceptedPayload,
  isRetryableAnalysisError,
  normalizeUuid,
} from "../src/handlers/analysis.js";
import {
  addStableCandidateIds,
  buildBatchText,
  buildDeterministicTabularExtraction,
  isPureTabularBatch,
  resolveBatchExtractionResult,
} from "../src/analysis/batch.js";
import {
  getTemplateIntent,
  parseStructuredJsonResponse,
} from "../src/analysis/canonical.js";
import {
  getAIStageConfig,
  normalizeChatPayloadForProvider,
  remapModelForProvider,
} from "../src/analysis/ai-provider.js";
import {
  attachPackMetadata,
  buildSnapshotParitySummary,
  compareParity,
  normalizeDerivedItems,
  shouldNativeReduceRun,
  toSnapshot,
} from "../src/analysis/reduce.js";
import {
  extractPrivateLivePublicationState,
  isPrivateLivePublicationSettled,
  normalizeExperienceTemplateId,
  pickCanonicalPrivateLiveExperienceRecord,
  privateLiveMaterializeAccessFromDefaultVisibility,
} from "../src/analysis/private-live.js";

test("normalizeUuid lowercases and trims analysis ids", () => {
  assert.equal(normalizeUuid(" ABC-123 "), "abc-123");
});

test("private live helpers collapse legacy contract aliases into document_analysis", () => {
  assert.equal(normalizeExperienceTemplateId("contract_analysis"), "document_analysis");
  assert.equal(normalizeExperienceTemplateId("contract_document"), "document_analysis");
  assert.equal(normalizeExperienceTemplateId("investor_reporting_dashboard"), "document_analysis");
});

test("private live record picker prefers the canonical document-analysis row", () => {
  const picked = pickCanonicalPrivateLiveExperienceRecord([
    { experience_id: "legacy", template_id: "contract_analysis" },
    { experience_id: "canonical", template_id: "document_analysis" },
  ], "contract_analysis");

  assert.equal(picked?.experience_id, "canonical");
});

test("private live materialize access maps public visibility to org_restricted false", () => {
  assert.deepEqual(
    privateLiveMaterializeAccessFromDefaultVisibility("public_unlisted"),
    { visibility: "public_unlisted", org_restricted: false },
  );
  assert.deepEqual(
    privateLiveMaterializeAccessFromDefaultVisibility("public_indexed"),
    { visibility: "public_indexed", org_restricted: false },
  );
  assert.deepEqual(
    privateLiveMaterializeAccessFromDefaultVisibility("org_private"),
    { visibility: "org_private", org_restricted: true },
  );
  assert.deepEqual(
    privateLiveMaterializeAccessFromDefaultVisibility(null),
    { visibility: "org_private", org_restricted: true },
  );
});

test("private live publication state extraction prefers active revision and source binding fields", () => {
  const state = extractPrivateLivePublicationState({
    experience_id: "exp_1",
    active_revision: {
      active_revision_id: "rev_1",
      scaffold_status: "scaffolded",
      materialization_status: "materialized",
      last_canonical_version_id: "canon_1",
      active_runtime: "generated_dispatch",
      publication_status: "private_live",
    },
    source_binding: {
      public_url: "https://live.zohal.ai/live/doc_demo",
      published_version_id: "canon_1",
    },
  });

  assert.deepEqual(state, {
    experienceId: "exp_1",
    activeRevisionId: "rev_1",
    scaffoldStatus: "scaffolded",
    materializationStatus: "materialized",
    canonicalVersionId: "canon_1",
    publicUrl: "https://live.zohal.ai/live/doc_demo",
    activeRuntime: "generated_dispatch",
    publicationStatus: "private_live",
  });
});

test("private live publication settled check requires matching canonical version and materialized status", () => {
  assert.equal(
    isPrivateLivePublicationSettled(
      {
        canonicalVersionId: "canon_1",
        materializationStatus: "materialized",
      },
      "canon_1",
      true,
    ),
    true,
  );
  assert.equal(
    isPrivateLivePublicationSettled(
      {
        canonicalVersionId: "canon_1",
        materializationStatus: "pending",
      },
      "canon_1",
      true,
    ),
    false,
  );
  assert.equal(
    isPrivateLivePublicationSettled(
      {
        canonicalVersionId: "canon_older",
        materializationStatus: "materialized",
      },
      "canon_1",
      true,
    ),
    false,
  );
});

test("snapshot parity summary is stable for identical canonical snapshots", () => {
  const snapshot = {
    items: [
      {
        id: "item_1",
        provenance_class: "extracted",
        source_anchors: [{ document_id: "doc_1", page_number: 1 }],
      },
      {
        id: "item_2",
        provenance_class: "derived",
        source_anchors: [],
      },
    ],
    links: [
      { id: "link_1", source: "item_1", target: "item_2" },
    ],
  };

  const first = buildSnapshotParitySummary(snapshot);
  const second = buildSnapshotParitySummary({
    links: [...snapshot.links],
    items: [...snapshot.items],
  });

  assert.deepEqual(first, second);
  assert.equal(first.counts.extracted_items, 1);
  assert.equal(first.counts.derived_items, 1);
  assert.equal(first.counts.anchored_items, 1);
});

test("parity comparison flags snapshot drift when canonical counts change", () => {
  const reference = buildSnapshotParitySummary({
    items: [{ id: "item_1", provenance_class: "extracted", source_anchors: [] }],
    links: [],
  });
  const candidate = buildSnapshotParitySummary({
    items: [
      { id: "item_1", provenance_class: "extracted", source_anchors: [] },
      { id: "item_2", provenance_class: "derived", source_anchors: [] },
    ],
    links: [],
  });

  const parity = compareParity(reference, candidate);
  assert.equal(parity.ok, false);
  assert.ok(
    parity.mismatches.some((entry) => entry.field === "counts.items"),
  );
  assert.ok(
    parity.mismatches.some((entry) => entry.field === "counts.derived_items"),
  );
});

test("analysis accepted payload preserves backward-compatible queue response shape", () => {
  assert.deepEqual(
    buildAnalyzeAcceptedPayload({
      requestId: "req-123",
      actionId: "action-1",
      runId: "run-1",
      message: "Document analysis queued. Progress will update as batches complete.",
      workflowExecutionId: "wf-1",
    }),
    {
      accepted: true,
      action_id: "action-1",
      run_id: "run-1",
      message: "Document analysis queued. Progress will update as batches complete.",
      workflow_execution_id: "wf-1",
      deferred: false,
      already_enqueued: false,
      request_id: "req-123",
      execution_plane: "gcp",
    },
  );
});

test("retry classifier treats reduce-not-ready and upstream faults as retryable", () => {
  assert.equal(
    isRetryableAnalysisError({ statusCode: 202, message: "reduce_not_ready" }),
    true,
  );
  assert.equal(
    isRetryableAnalysisError({ statusCode: 503, message: "upstream timeout" }),
    true,
  );
  assert.equal(
    isRetryableAnalysisError({ statusCode: 400, message: "missing parent_run_id" }),
    false,
  );
});

test("native batch text builder preserves ordered page markers", () => {
  const text = buildBatchText([
    { page_number: 2, content_text: "Second page" },
    { page_number: 1, content_text: "First page A" },
    { page_number: 1, content_text: "First page B" },
  ]);

  assert.equal(
    text,
    "[Page 1]\nFirst page A\nFirst page B\n\n[Page 2]\nSecond page",
  );
});

test("native batch text builder includes tabular page-zero chunks", () => {
  const text = buildBatchText([
    {
      page_number: 0,
      content_text: "ExecSummary - A2:F2 - Metric: Revenue | ActualQ12026_USDm: 12.4",
      metadata_json: {
        source_type: "tabular",
        tabular_source: {
          sheet_name: "ExecSummary",
          range_ref: "A2:F2",
        },
      },
    },
  ]);

  assert.equal(
    text,
    "[Tabular source]\n[Tabular ExecSummary A2:F2] ExecSummary - A2:F2 - Metric: Revenue | ActualQ12026_USDm: 12.4",
  );
});

test("pure tabular batches are detected explicitly", () => {
  assert.equal(
    isPureTabularBatch([
      {
        page_number: 0,
        content_text: "Row A",
        metadata_json: { source_type: "tabular", tabular_source: { sheet_name: "Sheet1" } },
      },
      {
        page_number: 0,
        content_text: "Row B",
        metadata_json: { tabular_source: { sheet_name: "Sheet1" } },
      },
    ]),
    true,
  );
  assert.equal(
    isPureTabularBatch([
      {
        page_number: 1,
        content_text: "Narrative paragraph",
        metadata_json: {},
      },
      {
        page_number: 0,
        content_text: "Row A",
        metadata_json: { source_type: "tabular", tabular_source: { sheet_name: "Sheet1" } },
      },
    ]),
    false,
  );
});

test("deterministic tabular extraction is the primary strategy for pure spreadsheet batches", async () => {
  let modelCalls = 0;
  const chunks = [
    {
      id: "chunk-1",
      page_number: 0,
      content_text: "ExecSummary - A2:F2 - Metric: Revenue | ActualQ12026_USDm: 12.4 | Formula: =SUM(B2:E2)",
      metadata_json: {
        source_type: "tabular",
        tabular_source: {
          sheet_name: "ExecSummary",
          range_ref: "A2:F2",
          row_index: 2,
          columns: [
            { column_key: "Metric", formatted_value: "Revenue", inferred_type: "text" },
            { column_key: "ActualQ12026_USDm", formatted_value: "12.4", inferred_type: "number", formula: "=SUM(B2:E2)" },
          ],
        },
      },
    },
  ];

  const result = await resolveBatchExtractionResult({
    chunks,
    batchText: buildBatchText(chunks),
    extractionTargets: [{ id: "headline_measures" }],
    playbookOptions: { language: "en" },
    workspaceId: "ws_1",
    requestId: "req_1",
    analyzeBatch: async () => {
      modelCalls += 1;
      return { extracted_items: [{ target_id: "should_not_run" }] };
    },
  });

  assert.equal(modelCalls, 0);
  assert.equal(result.extractionMode, "deterministic_tabular_primary");
  assert.deepEqual(result.rawResult, buildDeterministicTabularExtraction(chunks, [{ id: "headline_measures" }]));
});

test("model extraction remains primary for non-tabular batches", async () => {
  let modelCalls = 0;
  const chunks = [
    {
      id: "chunk-1",
      page_number: 1,
      content_text: "Counterparty: Acme LLC",
      metadata_json: {},
    },
  ];

  const result = await resolveBatchExtractionResult({
    chunks,
    batchText: buildBatchText(chunks),
    extractionTargets: [{ id: "key_entities" }],
    playbookOptions: { language: "en" },
    workspaceId: "ws_1",
    requestId: "req_1",
    analyzeBatch: async () => {
      modelCalls += 1;
      return {
        extracted_items: [
          {
            target_id: "key_entities",
            target_label: "Key entities",
            display_name: "Acme LLC",
            structural_facet: "entity",
            payload: { value: "Acme LLC" },
            page_number: 1,
            source_quote: "Counterparty: Acme LLC",
            confidence: "high",
          },
        ],
      };
    },
  });

  assert.equal(modelCalls, 1);
  assert.equal(result.extractionMode, "model_primary");
  assert.equal(result.rawResult.extracted_items.length, 1);
});

test("mixed or non-tabular batches still recover with deterministic tabular extraction when the model returns empty", async () => {
  const chunks = [
    {
      id: "chunk-1",
      page_number: 0,
      content_text: "ExecSummary - A2:F2 - Metric: Revenue | ActualQ12026_USDm: 12.4",
      metadata_json: {
        source_type: "tabular",
        tabular_source: {
          sheet_name: "ExecSummary",
          range_ref: "A2:F2",
          row_index: 2,
          columns: [
            { column_key: "Metric", formatted_value: "Revenue", inferred_type: "text" },
            { column_key: "ActualQ12026_USDm", formatted_value: "12.4", inferred_type: "number" },
          ],
        },
      },
    },
    {
      id: "chunk-2",
      page_number: 1,
      content_text: "Management commentary",
      metadata_json: {},
    },
  ];

  const result = await resolveBatchExtractionResult({
    chunks,
    batchText: buildBatchText(chunks),
    extractionTargets: [{ id: "headline_measures" }],
    playbookOptions: { language: "en" },
    workspaceId: "ws_1",
    requestId: "req_1",
    analyzeBatch: async () => ({ extracted_items: [] }),
  });

  assert.equal(result.extractionMode, "model_primary_with_tabular_recovery");
  assert.equal(result.rawResult.extracted_items.length, 1);
  assert.equal(result.rawResult.extracted_items[0].source_type, "tabular");
});

test("batch candidate ids stay deterministic for extracted items", () => {
  const output = addStableCandidateIds({
    result: {
      extracted_items: [
        { display_name: "Counterparty" },
        { display_name: "Effective Date" },
      ],
    },
    documentId: "12345678-90ab-cdef-1234-567890abcdef",
    batchIndex: 2,
  });

  assert.equal(output.extracted_items[0].candidate_id, "d12345678-b2-i0");
  assert.equal(output.extracted_items[1].candidate_id, "d12345678-b2-i1");
});

test("generic template intent falls back to document-agnostic extraction targets", () => {
  const intent = getTemplateIntent({}, "document_analysis");

  assert.deepEqual(
    intent.extractionTargets.map((target) => target.structural_facet),
    ["entity", "event", "measure", "relationship", "annotation"],
  );
  assert.equal(intent.derivationIntents.length, 1);
  assert.equal(intent.projectionIntents.length, 3);
});

test("structured AI JSON parser returns fallback for empty output and throws retryable errors for malformed JSON", () => {
  assert.deepEqual(
    parseStructuredJsonResponse("", {
      fallback: { extracted_items: [] },
      errorCode: "invalid_extracted_items_json",
    }),
    { extracted_items: [] },
  );

  assert.throws(
    () => parseStructuredJsonResponse("{not-json", {
      fallback: { extracted_items: [] },
      errorCode: "invalid_extracted_items_json",
    }),
    (error) => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.retryable, true);
      assert.match(error.message, /invalid_extracted_items_json/);
      return true;
    },
  );
});

test("shared AI stage config resolves generator and verifier overrides independently", () => {
  const previousGeneratorModel = process.env.GENERATOR_MODEL;
  const previousVerifierModel = process.env.VERIFIER_MODEL;
  const previousGeneratorProvider = process.env.GENERATOR_PROVIDER;
  const previousVerifierProvider = process.env.VERIFIER_PROVIDER;

  process.env.GENERATOR_MODEL = "gpt-5.2";
  process.env.VERIFIER_MODEL = "gpt-5.2-mini";
  process.env.GENERATOR_PROVIDER = "openai";
  process.env.VERIFIER_PROVIDER = "vertex";

  try {
    assert.deepEqual(getAIStageConfig("generator"), {
      providerOverride: "openai",
      model: "gpt-5.2",
    });
    assert.deepEqual(getAIStageConfig("verifier"), {
      providerOverride: "vertex",
      model: "gpt-5.2-mini",
    });
  } finally {
    process.env.GENERATOR_MODEL = previousGeneratorModel;
    process.env.VERIFIER_MODEL = previousVerifierModel;
    process.env.GENERATOR_PROVIDER = previousGeneratorProvider;
    process.env.VERIFIER_PROVIDER = previousVerifierProvider;
  }
});

test("shared AI provider helpers preserve model remapping and OpenAI token normalization", () => {
  const previousContractModel = process.env.OPENAI_CONTRACT_MODEL;
  const previousVertexChatModel = process.env.VERTEX_MODEL_CHAT;

  process.env.OPENAI_CONTRACT_MODEL = "gpt-5.2";
  process.env.VERTEX_MODEL_CHAT = "google/gemini-2.5-flash";

  try {
    assert.deepEqual(
      remapModelForProvider("vertex", { model: "gpt-5.2", max_tokens: 100 }),
      { model: "google/gemini-2.5-flash", max_tokens: 100 },
    );
    assert.deepEqual(
      normalizeChatPayloadForProvider("openai", { model: "gpt-5.2", max_tokens: 100 }),
      { model: "gpt-5.2", max_completion_tokens: 100 },
    );
  } finally {
    process.env.OPENAI_CONTRACT_MODEL = previousContractModel;
    process.env.VERTEX_MODEL_CHAT = previousVertexChatModel;
  }
});

test("native reduce guard requires a parent run and at least one batch", () => {
  assert.deepEqual(
    shouldNativeReduceRun(
      { id: "run-1" },
      [{ id: "batch-1", status: "completed" }],
    ),
    { ok: true },
  );

  assert.deepEqual(
    shouldNativeReduceRun({}, []),
    { ok: false, reason: "missing_parent_run" },
  );
});

test("derived items start in needs_review until verifier outcomes are applied", () => {
  const derived = normalizeDerivedItems(
    [
      {
        derivation_id: "summary",
        display_name: "Analysis summary",
        structural_facet: "annotation",
        payload: { summary: "Important derived insight" },
        confidence: "medium",
        input_item_ids: ["item-extracted-1"],
      },
    ],
    [
      {
        id: "item-extracted-1",
      },
    ],
  );

  assert.equal(derived.length, 1);
  assert.equal(derived[0].provenance_class, "derived");
  assert.equal(derived[0].verification_state, "needs_review");
  assert.deepEqual(derived[0].derivation.input_item_ids, ["item-extracted-1"]);
});

test("canonical snapshot builder emits schema 3.0 with proof and source manifests", () => {
  const snapshot = attachPackMetadata(
    toSnapshot(
      {
        extracted_items: [
          {
            id: "item-extracted-1",
            provenance_class: "extracted",
            structural_facet: "entity",
            display_name: "Counterparty",
            payload: { value: "Acme LLC" },
            confidence: "high",
            verification_state: "verified",
            source_anchors: [
              {
                document_id: "doc-1",
                page_number: 2,
                chunk_id: "chunk-1",
                snippet: "Acme LLC",
                char_start: 12,
                char_end: 20,
                bbox: {
                  x: 0.1,
                  y: 0.2,
                  width: 0.3,
                  height: 0.05,
                },
              },
            ],
            anchor_integrity: "verified",
            created_at: "2026-03-28T00:00:00.000Z",
          },
        ],
        derived_items: [
          {
            id: "item-derived-1",
            provenance_class: "derived",
            structural_facet: "annotation",
            display_name: "Analysis summary",
            payload: { summary: "Main conclusion" },
            confidence: "medium",
            verification_state: "verified",
            derivation: {
              input_item_ids: ["item-extracted-1"],
              method: "llm_reasoning",
              rationale: "Based on the extracted counterparty.",
              verifier_outcome: "confirmed",
            },
            created_at: "2026-03-28T00:00:00.000Z",
          },
        ],
        links: [
          {
            id: "link-1",
            type: "supports",
            from_item_id: "item-extracted-1",
            to_item_id: "item-derived-1",
          },
        ],
      },
      {
        "doc-1": [
          {
            id: "chunk-1",
            document_id: "doc-1",
            page_number: 2,
            chunk_index: 0,
            content_text: "Acme LLC",
          },
        ],
      },
      "doc-1",
      "document_analysis",
      {
        run_id: "run-1",
        workspace_id: "ws-1",
        corpus_revision_id: "workspace:ws-1:document:doc-1",
        template_version: "3.0.0",
        review_policy: { enable_verifier: true },
        stage_entries: [
          { stage: "extract", status: "completed", at: "2026-03-28T00:00:00.000Z" },
        ],
      },
    ),
    "document_analysis",
  );

  assert.equal(snapshot.schema_version, "3.0");
  assert.equal(snapshot.template_id, "document_analysis");
  assert.equal(snapshot.items.length, 2);
  assert.equal(snapshot.links.length, 1);
  assert.equal(snapshot.proof_manifest.counts.extracted_items, 1);
  assert.equal(snapshot.proof_manifest.counts.derived_items, 1);
  assert.equal(snapshot.source_manifest.document_count, 1);
  assert.equal(snapshot.items[0].source_anchors?.[0]?.char_start, 12);
  assert.equal(snapshot.items[0].source_anchors?.[0]?.char_end, 20);
  assert.deepEqual(snapshot.items[0].source_anchors?.[0]?.bbox, {
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.05,
  });
});
