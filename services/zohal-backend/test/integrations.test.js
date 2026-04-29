import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWhatsappChannelStatusResponse,
  getDocumentSourceStoragePath,
  getFileExtension,
  guessContentType,
  normalizeUuid,
} from "../src/handlers/integrations.js";

test("integration helpers normalize ids and source storage paths", () => {
  assert.equal(normalizeUuid(" USER-ID "), "user-id");
  assert.equal(
    getDocumentSourceStoragePath("USER-ID", "DOC-ID", "DOCX"),
    "user-id/sources/doc-id.docx",
  );
});

test("integration import content type helpers preserve import file contracts", () => {
  assert.equal(getFileExtension("contract.PDF"), "pdf");
  assert.equal(getFileExtension("spreadsheet", "text/csv"), "csv");
  assert.equal(
    guessContentType("docx"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  assert.equal(guessContentType("unknown"), "application/octet-stream");
});

test("whatsapp channel status preserves client envelope with GCP metadata", () => {
  assert.deepEqual(buildWhatsappChannelStatusResponse({
    workspaceId: "workspace-1",
    enabled: true,
    pending: false,
    phoneNumber: "+966500000001",
    now: new Date("2026-04-29T10:00:00.000Z"),
  }), {
    ok: true,
    workspace_id: "workspace-1",
    channel: "whatsapp",
    status: "connected",
    capabilities: {
      import: true,
      bot_ingestion: true,
    },
    connection: {
      phone_number: "+966500000001",
      provider: "meta_whatsapp_business",
    },
    updated_at: "2026-04-29T10:00:00.000Z",
    execution_plane: "gcp",
  });
});
