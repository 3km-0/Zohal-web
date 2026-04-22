import test from "node:test";
import assert from "node:assert/strict";
import {
  decideWhatsappMode,
  detectLanguageFromText,
  extractProjectSignals,
} from "../src/handlers/whatsapp.js";

test("detectLanguageFromText prefers Arabic when Arabic script is present", () => {
  assert.equal(detectLanguageFromText("أبغى فيلا في الرياض"), "ar");
  assert.equal(detectLanguageFromText("Need a villa in Riyadh"), "en");
});

test("extractProjectSignals infers project kind, workflow, and materials", () => {
  const signals = extractProjectSignals("Need help reviewing a permit submission with drawings and site photos in Riyadh");

  assert.equal(signals.projectKind, "permit_support");
  assert.equal(signals.workflowFocus, "permit_support");
  assert.equal(signals.assetType, "unknown");
  assert.deepEqual(signals.locationHints, ["riyadh"]);
  assert.deepEqual(signals.materialTypes.sort(), ["drawings", "permit_docs", "site_photos"].sort());
});

test("decideWhatsappMode preserves legacy workspace text by default", () => {
  const route = decideWhatsappMode({
    textBody: "Please help with this",
    messageType: "text",
    hasMedia: false,
    conversation: null,
    workspaceSession: { workspace_id: "workspace-1" },
  });

  assert.equal(route.handled, false);
  assert.equal(route.reason, "legacy_workspace_text");
});

test("decideWhatsappMode routes renovation intake into project intake", () => {
  const route = decideWhatsappMode({
    textBody: "I need a contractor to renovate my kitchen and bathrooms",
    hasMedia: false,
    conversation: null,
    workspaceSession: null,
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "project_intake");
});

test("decideWhatsappMode routes linked workspace follow-ups into workspace context", () => {
  const route = decideWhatsappMode({
    textBody: "What changed in the latest BOQ and what is still missing?",
    hasMedia: false,
    conversation: { mode: "workspace_context", active_workspace_id: "workspace-1" },
    workspaceSession: { workspace_id: "workspace-1" },
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "workspace_context");
});

test("decideWhatsappMode routes progression uploads into progression", () => {
  const route = decideWhatsappMode({
    textBody: "",
    hasMedia: true,
    conversation: { awaiting_upload_kind: "site_photos", mode: "progression" },
    workspaceSession: null,
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "progression");
});

test("decideWhatsappMode routes permit and escalation requests into progression", () => {
  const route = decideWhatsappMode({
    textBody: "Please escalate this permit approval and operator review today",
    hasMedia: false,
    conversation: null,
    workspaceSession: null,
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "progression");
});
