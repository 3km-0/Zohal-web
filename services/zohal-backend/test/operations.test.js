import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPressureStripEnvelope,
  computeUrgencyBucket,
  mapOrganizationSuggestion,
  normalizeUuid,
} from "../src/handlers/operations.js";

test("operations helpers preserve uuid and urgency behavior", () => {
  assert.equal(normalizeUuid(" ABC-DEF "), "abc-def");
  assert.equal(computeUrgencyBucket({ priority: "high" }), "urgent");
  assert.equal(
    computeUrgencyBucket({ slaDueAt: new Date(Date.now() - 1000).toISOString() }),
    "urgent",
  );
  assert.equal(computeUrgencyBucket({ status: "open" }), "backlog");
});

test("pressure strip response keeps iOS aliases with GCP metadata", () => {
  assert.deepEqual(buildPressureStripEnvelope({
    strip: {
      open: 3,
      overdue: 1,
      awaiting_vendor: 2,
      sla_breach: 1,
      computed_at: "2026-04-29T00:00:00.000Z",
    },
    requestId: "req-ops",
  }), {
    ok: true,
    data: {
      data: {
        open: 3,
        overdue: 1,
        awaiting_vendor: 2,
        sla_breach: 1,
        computed_at: "2026-04-29T00:00:00.000Z",
        open_count: 3,
        overdue_count: 1,
        awaiting_vendor_count: 2,
        sla_breach_count: 1,
      },
    },
    request_id: "req-ops",
    execution_plane: "gcp",
  });
});

test("organization suggestion maps AI document numbers to stable document ids", () => {
  const response = mapOrganizationSuggestion({
    workspaceId: "workspace-1",
    documents: [
      { id: "doc-1", title: "Lease" },
      { id: "doc-2", title: "Invoice" },
      { id: "doc-3", title: "Receipt" },
    ],
    aiSuggestion: {
      folders: [
        {
          name: "Contracts",
          icon: "invalid-icon",
          color: "#ffffff",
          document_numbers: [1],
          reasoning: "Contract documents",
        },
      ],
      unassigned: [2],
      overall_reasoning: "Grouped by document purpose.",
      confidence: 0.7,
    },
  });

  assert.deepEqual(response.suggested_folders, [
    {
      name: "Contracts",
      icon: "folder.fill",
      color: "#2d8878",
      document_ids: ["doc-1"],
      reasoning: "Contract documents",
    },
  ]);
  assert.deepEqual(response.unassigned_document_ids, ["doc-2", "doc-3"]);
  assert.equal(response.reasoning, "Grouped by document purpose.");
  assert.equal(response.confidence, 0.7);
  assert.equal(response.execution_plane, "gcp");
});
