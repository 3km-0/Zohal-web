import test from "node:test";
import assert from "node:assert/strict";
import {
  decideWhatsappMode,
  detectLanguageFromText,
  extractOrdinalSelection,
} from "../src/handlers/whatsapp.js";

test("detectLanguageFromText prefers Arabic when Arabic script is present", () => {
  assert.equal(detectLanguageFromText("أبغى فيلا في الرياض"), "ar");
  assert.equal(detectLanguageFromText("Need a villa in Riyadh"), "en");
});

test("extractOrdinalSelection understands compare and numbered follow-ups", () => {
  assert.deepEqual(extractOrdinalSelection("show me the first one"), [0]);
  assert.deepEqual(extractOrdinalSelection("قارن أول خيارين"), "compare");
  assert.deepEqual(extractOrdinalSelection("compare first and second"), [0, 1]);
});

test("decideWhatsappMode preserves legacy workspace text by default", () => {
  const route = decideWhatsappMode({
    textBody: "What changed in the workspace?",
    messageType: "text",
    hasMedia: false,
    conversation: null,
    workspaceSession: { workspace_id: "workspace-1" },
  });

  assert.equal(route.handled, false);
  assert.equal(route.reason, "legacy_workspace_text");
});

test("decideWhatsappMode routes buyer searches into discovery", () => {
  const route = decideWhatsappMode({
    textBody: "Show me a villa in north Riyadh under 2m",
    messageType: "text",
    hasMedia: false,
    conversation: null,
    workspaceSession: null,
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "discovery");
});

test("decideWhatsappMode routes awaiting-upload media into progression", () => {
  const route = decideWhatsappMode({
    textBody: "",
    messageType: "document",
    hasMedia: true,
    conversation: { awaiting_upload_kind: "finance_docs", mode: "progression" },
    workspaceSession: null,
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "progression");
});
