import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAutomationDedupeKey,
  buildCorpusResolutionResult,
  computeNextScheduledRunAt,
  normalizeUuid,
  resolveTemplateRuntimeIdFromSpec,
} from "../src/handlers/automations.js";

test("automation helpers preserve ids, dedupe keys, and schedule contracts", () => {
  assert.equal(normalizeUuid(" WORKSPACE-ID "), "workspace-id");
  assert.equal(
    buildAutomationDedupeKey({
      workspaceId: "WORKSPACE-ID",
      automationId: "AUTO-ID",
      triggerKind: "manual",
      sourceDocumentId: "DOC-ID",
      nonce: "request-1",
    }),
    '{"automation_id":"auto-id","local_day_bucket":null,"nonce":"request-1","source_document_id":"doc-id","source_fingerprint":null,"trigger_kind":"manual","workspace_id":"workspace-id"}',
  );
  assert.equal(
    computeNextScheduledRunAt("UTC", "09:00:00", new Date("2026-04-29T08:00:00.000Z")),
    "2026-04-29T09:00:00.000Z",
  );
  assert.equal(
    computeNextScheduledRunAt("UTC", "09:00:00", new Date("2026-04-29T10:00:00.000Z")),
    "2026-04-30T09:00:00.000Z",
  );
});

test("automation corpus and template helpers keep runtime payload shape", () => {
  const corpus = buildCorpusResolutionResult({
    workspaceId: "workspace-1",
    primaryDocumentId: "doc-2",
    scopeDocumentIds: ["doc-1", "doc-2"],
    defaultCorpusId: "corpus-default",
  });
  assert.equal(corpus.corpus_id, "corpus-default");
  assert.equal(corpus.source_manifest.primary_document_id, "doc-2");
  assert.deepEqual(corpus.source_manifest.member_roles, [
    { document_id: "doc-1", role: "other", sort_order: 0 },
    { document_id: "doc-2", role: "primary", sort_order: 1 },
  ]);
  assert.equal(
    resolveTemplateRuntimeIdFromSpec({ id: "tenant_report", runtime: { template_id: "runtime_template" } }),
    "tenant_report",
  );
});
