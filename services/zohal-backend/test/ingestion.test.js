import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkflowLaunchKey,
  normalizeUuid,
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
