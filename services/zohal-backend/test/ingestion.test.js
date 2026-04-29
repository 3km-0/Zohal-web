import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCleanupVectorsEnvelope,
  buildDeleteEmbeddingsEnvelope,
  buildWorkflowLaunchKey,
  groupVectorKeysByIndex,
  generatePgvectorKey,
  normalizeUuid,
  serializePgvector,
  shouldFallbackToOcr,
} from "../src/handlers/ingestion.js";

test("normalizeUuid lowercases and trims ids", () => {
  assert.equal(normalizeUuid(" ABC-DEF "), "abc-def");
});

test("workflow launch key is deterministic for the same inputs", () => {
  const first = buildWorkflowLaunchKey({
    documentId: "doc-1",
    updatedAt: "2026-03-10T12:00:00.000Z",
    source: "unknown",
  });
  const second = buildWorkflowLaunchKey({
    documentId: "DOC-1",
    updatedAt: "2026-03-10T12:00:00.000Z",
    source: "unknown",
  });
  assert.equal(first, second);
});

test("shouldFallbackToOcr identifies low-signal short text layers", () => {
  const result = shouldFallbackToOcr({
    isCloudConvertDoc: false,
    ocrAlreadyCompleted: false,
    scanned: false,
    pages: [{ page_number: 1, text: "Short text only" }],
    totalChars: 15,
    pagesWithText: 1,
  });

  assert.equal(result.shouldFallback, true);
  assert.equal(result.lowSignalTextLayer, true);
});

test("shouldFallbackToOcr skips OCR for CloudConvert-derived documents", () => {
  const result = shouldFallbackToOcr({
    isCloudConvertDoc: true,
    ocrAlreadyCompleted: false,
    scanned: true,
    pages: [],
    totalChars: 0,
    pagesWithText: 0,
  });

  assert.equal(result.shouldFallback, false);
});

test("cleanup vectors response preserves legacy cleanup contract with GCP metadata", () => {
  assert.deepEqual(buildCleanupVectorsEnvelope({
    requestId: "req-cleanup",
    documentId: "DOC-1",
    workspaceId: "WORKSPACE-1",
    validChunks: 4,
    embeddedCount: 3,
  }), {
    success: true,
    document_id: "doc-1",
    workspace_id: "workspace-1",
    valid_chunks: 4,
    vectors_before: null,
    orphaned_deleted: 0,
    vectors_after: 3,
    missing_reembedded: 3,
    scope: "document",
    note:
      "Ensured current chunks are embedded. Orphan vector deletion is intentionally skipped (Vector Buckets alpha).",
    request_id: "req-cleanup",
    execution_plane: "gcp",
  });
});

test("delete embeddings response preserves legacy cleanup counters with GCP metadata", () => {
  assert.deepEqual(buildDeleteEmbeddingsEnvelope({
    requestId: "req-delete",
    documentId: "DOC-1",
    chunksDeleted: 2,
    embeddingsDeleted: 3,
    vectorsDeleted: 4,
  }), {
    success: true,
    document_id: "doc-1",
    chunks_deleted: 2,
    embeddings_deleted: 3,
    vectors_deleted: 4,
    request_id: "req-delete",
    execution_plane: "gcp",
  });
});

test("vector cleanup groups ready vector keys by index and skips missing keys", () => {
  const grouped = groupVectorKeysByIndex([
    { vector_key: "a", index_name: "chunks-v1" },
    { vector_key: "b", index_name: "" },
    { vector_key: "", index_name: "chunks-v2" },
    { vector_key: "c", index_name: "chunks-v1" },
  ]);

  assert.deepEqual(Object.fromEntries(grouped), {
    "chunks-v1": ["a", "b", "c"],
  });
  assert.equal(grouped.has("chunks-v2"), false);
});

test("pgvector helpers serialize embeddings without Vector Bucket config", () => {
  assert.equal(serializePgvector([0.1, -2, 3.25]), "[0.1,-2,3.25]");
  assert.equal(
    generatePgvectorKey(" CHUNK-1 ", "text-embedding-3-small", "v1"),
    "pgvector:chunk-1:te3small:v1",
  );
  assert.throws(() => serializePgvector([]), /Invalid embedding vector/);
  assert.throws(() => serializePgvector([1, Number.NaN]), /Invalid embedding vector value/);
});
