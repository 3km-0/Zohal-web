import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalyzeAcceptedPayload,
  isPhase3TemplateId,
  isRetryableAnalysisError,
  normalizeUuid,
} from "../src/handlers/analysis.js";
import {
  buildExportSuccessEnvelope,
  renderContractExportHtml,
} from "../src/analysis/export-report.js";
import {
  addStableCandidateIds,
  allowedVariableNamesForTemplate,
  buildBatchText,
} from "../src/analysis/batch.js";
import {
  addComputedNoticeDeadlineIfPossible,
  attachPackMetadata,
  buildFocusedModuleChunks,
  shouldNativeReduceRun,
  toSnapshot,
} from "../src/analysis/reduce.js";

test("normalizeUuid lowercases and trims analysis ids", () => {
  assert.equal(normalizeUuid(" ABC-123 "), "abc-123");
});

test("phase 3 template guard allows only regulated contract templates", () => {
  assert.equal(isPhase3TemplateId("renewal_pack"), true);
  assert.equal(isPhase3TemplateId("lease_pack"), true);
  assert.equal(isPhase3TemplateId("vendor_invoice_exceptions"), false);
});

test("analysis accepted payload preserves backward-compatible queue response shape", () => {
  assert.deepEqual(
    buildAnalyzeAcceptedPayload({
      requestId: "req-123",
      actionId: "action-1",
      runId: "run-1",
      workflowExecutionId: "wf-1",
    }),
    {
      accepted: true,
      action_id: "action-1",
      run_id: "run-1",
      message: "Contract analysis queued. Progress will update as batches complete.",
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

test("native export success envelope preserves legacy top-level fields with gcp metadata", () => {
  assert.deepEqual(
    buildExportSuccessEnvelope("req-export", {
      html: "<html></html>",
      export_artifact: { storage_path: "exports/path.json" },
    }),
    {
      ok: true,
      data: {
        html: "<html></html>",
        export_artifact: { storage_path: "exports/path.json" },
        execution_plane: "gcp",
      },
      request_id: "req-export",
      html: "<html></html>",
      export_artifact: { storage_path: "exports/path.json" },
      execution_plane: "gcp",
    },
  );
});

test("native export renderer produces generic evidence-grade sections for regulated templates", () => {
  const html = renderContractExportHtml({
    snapshot: {
      schema_version: "2.2.0",
      template: "renewal_pack",
      variables: [
        {
          id: "var-1",
          name: "counterparty_name",
          display_name: "Counterparty",
          value: "Acme LLC",
          type: "string",
        },
      ],
      clauses: [
        {
          id: "clause-1",
          clause_title: "Termination",
          clause_type: "termination",
          description: "Either party may terminate with notice.",
        },
      ],
      obligations: [],
      risks: [],
      pack: {},
    },
    documentTitle: "Master Services Agreement",
    state: "provisional",
    versionNumber: 3,
    finalizedAt: null,
    reviewerName: null,
    settings: {
      customTitle: "",
      customSubtitle: "",
      primaryColor: "#2d8878",
      template: "decision_pack",
      language: "en",
    },
  });

  assert.match(html, /Master Services Agreement/);
  assert.match(html, /renewal pack/i);
  assert.match(html, /Counterparty/);
  assert.match(html, /Termination/);
});

test("native export renderer prefers record-backed module sections and hides rejected records", () => {
  const html = renderContractExportHtml({
    snapshot: {
      schema_version: "2.2.0",
      template: "contract_analysis",
      variables: [],
      clauses: [],
      obligations: [],
      risks: [],
      pack: {
        review: {
          rejected: {
            records: ["record-hidden"],
          },
        },
        records: [
          {
            id: "record-visible",
            module_id: "exam_questions",
            module_title: "Exam Questions",
            record_type: "question",
            title: "Question 1",
            summary: "What is the contract term?",
            status: "proposed",
            show_in_report: true,
            evidence: [{ page_number: 2, source_quote: "The initial term is 12 months." }],
          },
          {
            id: "record-hidden",
            module_id: "exam_questions",
            module_title: "Exam Questions",
            record_type: "question",
            title: "Question 2",
            summary: "Hidden record",
            status: "proposed",
            show_in_report: true,
          },
        ],
        modules: {
          exam_questions: {
            id: "exam_questions",
            title: "Exam Questions",
            status: "ok",
            show_in_report: true,
            result: {
              questions: [{ title: "Raw blob fallback should stay hidden" }],
            },
          },
        },
      },
    },
    documentTitle: "Exam Questions Export",
    state: "provisional",
    versionNumber: 1,
    finalizedAt: null,
    reviewerName: null,
    settings: {
      customTitle: "",
      customSubtitle: "",
      primaryColor: "#2d8878",
      template: "contract_analysis",
      language: "en",
    },
  });

  assert.match(html, /Exam Questions/);
  assert.match(html, /Question 1/);
  assert.doesNotMatch(html, /Question 2/);
  assert.doesNotMatch(html, /Raw blob fallback should stay hidden/);
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

test("native batch candidate ids stay deterministic across item categories", () => {
  const output = addStableCandidateIds({
    result: {
      extracted_variables: [{ name: "counterparty_name", value: "Acme" }],
      clauses: [{ clause_type: "termination", text: "Termination clause" }],
      obligations: [{ obligation_type: "notice", summary: "Give notice" }],
      risks: [{ severity: "high", description: "Short notice" }],
    },
    documentId: "12345678-90ab-cdef-1234-567890abcdef",
    batchIndex: 2,
  });

  assert.equal(output.extracted_variables[0].candidate_id, "d12345678-b2-v0");
  assert.equal(output.clauses[0].candidate_id, "d12345678-b2-c0");
  assert.equal(output.obligations[0].candidate_id, "d12345678-b2-o0");
  assert.equal(output.risks[0].candidate_id, "d12345678-b2-r0");
});

test("native batch template fallback keeps regulated allowed-variable sets", () => {
  const leaseVariables = allowedVariableNamesForTemplate("lease_pack");
  const unknownVariables = allowedVariableNamesForTemplate("unknown_template");

  assert.equal(leaseVariables.has("rent_amount"), true);
  assert.equal(unknownVariables.has("governing_law"), true);
  assert.equal(unknownVariables.has("rent_amount"), false);
});

test("native reduce guard keeps docset and advanced lanes on native path", () => {
  const support = shouldNativeReduceRun(
    {
      id: "run-1",
      workspace_id: "ws-1",
      input_config: {
        bundle: {
          document_ids: ["doc-1", "doc-2"],
        },
        context: {
          document_ids: ["ctx-1"],
        },
        playbook_spec: {
          custom_modules: [{ id: "risk_summary" }],
          modules: ["variables", "clauses", "obligations", "risks", "deadlines", "violations"],
        },
      },
    },
    [{ id: "batch-1", status: "completed" }],
  );

  assert.deepEqual(support, {
    ok: true,
    reason: "supported",
  });
});

test("native reduce snapshot computes notice deadline and pack metadata", () => {
  let snapshot = toSnapshot(
    {
      extracted_variables: [
        {
          name: "end_date",
          type: "date",
          value: "2026-08-31",
          ai_confidence: "high",
          page_number: 4,
          source_quote: "This agreement ends on August 31, 2026.",
        },
        {
          name: "notice_period_days",
          type: "duration",
          value: 30,
          unit: "days",
          ai_confidence: "high",
          page_number: 4,
          source_quote: "Thirty days prior written notice is required.",
        },
      ],
      clauses: [],
      obligations: [],
      risks: [],
    },
    {
      "doc-1": [
        {
          id: "chunk-1",
          document_id: "doc-1",
          page_number: 4,
          chunk_index: 0,
          content_text:
            "This agreement ends on August 31, 2026. Thirty days prior written notice is required.",
        },
      ],
    },
    "doc-1",
    "renewal_pack",
    new Set(["variables", "deadlines"]),
  );
  snapshot = addComputedNoticeDeadlineIfPossible(snapshot);
  snapshot = attachPackMetadata(snapshot, "renewal_pack");

  const noticeDeadline = snapshot.variables.find((item) => item.name === "notice_deadline");
  assert.equal(noticeDeadline.value, "2026-08-01");
  assert.deepEqual(snapshot.pack.modules_activated, ["renewal_actions"]);
});

test("compliance deviations module focuses on evidence-seeded chunks for large docsets", () => {
  const chunks = Array.from({ length: 90 }, (_, index) => ({
    id: `chunk-${index}`,
    document_id: "doc-1",
    page_number: Math.floor(index / 6) + 1,
    chunk_index: index % 6,
    content_text: `Chunk ${index} content`,
  }));
  const focused = buildFocusedModuleChunks({
    moduleId: "compliance_deviations",
    chunks,
    snapshotJson: {
      risks: [
        {
          evidence: {
            document_id: "doc-1",
            page_number: 5,
            chunk_id: "chunk-24",
          },
        },
      ],
    },
    primaryDocumentId: "doc-1",
  });

  assert.ok(focused.length < chunks.length);
  assert.ok(focused.some((chunk) => chunk.id === "chunk-24"));
  assert.ok(focused.some((chunk) => chunk.id === "chunk-25"));
  assert.ok(focused.some((chunk) => chunk.page_number === 5));
  assert.ok(focused.every((chunk) => chunk.page_number >= 4 && chunk.page_number <= 6));
});
