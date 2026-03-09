import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConvertError,
  buildConvertSuccess,
  getServiceRoleKey,
} from "../src/handlers/convert-to-pdf.js";

test("convert-to-pdf success payload preserves legacy fields with additive metadata", () => {
  const payload = buildConvertSuccess({
    documentId: "doc-123",
    pageCount: 4,
    queuedForIngestion: true,
    requestId: "req-123",
  });

  assert.deepEqual(payload, {
    success: true,
    document_id: "doc-123",
    page_count: 4,
    queued_for_ingestion: true,
    request_id: "req-123",
    execution_plane: "gcp",
  });
});

test("convert-to-pdf error payload stays backward compatible with additive metadata", () => {
  const payload = buildConvertError({
    message: "Missing document_id",
    requestId: "req-456",
  });

  assert.deepEqual(payload, {
    error: "Missing document_id",
    request_id: "req-456",
    execution_plane: "gcp",
  });
});

test("service client key resolution only uses Supabase service role key", () => {
  const key = getServiceRoleKey({
    INTERNAL_SERVICE_ROLE_KEY: "internal-only-token",
    SUPABASE_SERVICE_ROLE_KEY: "supabase-service-role",
  });

  assert.equal(key, "supabase-service-role");
});
