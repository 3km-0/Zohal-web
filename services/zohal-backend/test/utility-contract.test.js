import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLibraryItems } from "../src/handlers/library.js";
import {
  buildDocumentDownloadUrlResponse,
  buildDocumentSourceUploadUrlResponse,
  buildDocumentUploadUrlResponse,
  buildSupportTicketCreateResponse,
} from "../src/handlers/utility.js";

test("document download URL response preserves legacy fields with additive metadata", () => {
  assert.deepEqual(buildDocumentDownloadUrlResponse({
    downloadUrl: "https://storage.example/download",
    expiresAt: "2026-04-26T12:00:00.000Z",
    storagePath: "user/doc.pdf",
    requestId: "req-1",
  }), {
    download_url: "https://storage.example/download",
    expires_at: "2026-04-26T12:00:00.000Z",
    storage_path: "user/doc.pdf",
    request_id: "req-1",
    execution_plane: "gcp",
  });
});

test("document upload URL response preserves legacy fields with additive metadata", () => {
  assert.deepEqual(buildDocumentUploadUrlResponse({
    uploadUrl: "https://storage.example/upload",
    expiresAt: "2026-04-26T12:15:00.000Z",
    storagePath: "user/doc.pdf",
    requestId: "req-2",
  }), {
    upload_url: "https://storage.example/upload",
    storage_path: "user/doc.pdf",
    expires_at: "2026-04-26T12:15:00.000Z",
    request_id: "req-2",
    execution_plane: "gcp",
  });
});

test("document source upload URL response preserves source/canonical fields", () => {
  assert.deepEqual(buildDocumentSourceUploadUrlResponse({
    uploadUrl: "https://storage.example/source-upload",
    expiresAt: "2026-04-26T12:15:00.000Z",
    sourceStoragePath: "user/sources/doc.docx",
    pdfStoragePath: "user/doc.pdf",
    canonicalStoragePath: "user/canonical/doc.pdf",
    sourceFormat: "pdf",
    requestId: "req-3",
  }), {
    upload_url: "https://storage.example/source-upload",
    source_storage_path: "user/sources/doc.docx",
    pdf_storage_path: "user/doc.pdf",
    canonical_storage_path: "user/canonical/doc.pdf",
    source_format: "pdf",
    expires_at: "2026-04-26T12:15:00.000Z",
    request_id: "req-3",
    execution_plane: "gcp",
  });
});

test("support ticket response preserves legacy ticket envelope", () => {
  assert.deepEqual(buildSupportTicketCreateResponse({
    ticketId: "ticket-1",
    category: "bug",
    priority: "high",
    subject: "Something broke",
    emailSent: false,
    requestId: "req-4",
  }), {
    ok: true,
    ticket: {
      id: "ticket-1",
      category: "bug",
      priority: "high",
      subject: "Something broke",
      email_sent: false,
    },
    request_id: "req-4",
    execution_plane: "gcp",
  });
});

test("library manifest normalization preserves list item contract", () => {
  assert.deepEqual(normalizeLibraryItems({
    items: [{
      id: "ksa-reg",
      title: "KSA Regulation",
      url: "https://storage.googleapis.com/zohal-library/reg.pdf",
      tags: ["ksa", "regulation"],
    }],
  }), [{
    id: "ksa-reg",
    title: "KSA Regulation",
    url: "https://storage.googleapis.com/zohal-library/reg.pdf",
    object_path: "reg.pdf",
    category: null,
    kind: null,
    size_bytes: null,
    updated_at: null,
    description: null,
    source: null,
    region: null,
    tags: ["ksa", "regulation"],
  }]);
});
