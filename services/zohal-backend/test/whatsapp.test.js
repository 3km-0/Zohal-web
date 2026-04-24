import test from "node:test";
import assert from "node:assert/strict";
import {
  decideWhatsappMode,
  detectLanguageFromText,
  extractAcquisitionSignals,
} from "../src/handlers/whatsapp.js";

test("detectLanguageFromText prefers Arabic when Arabic script is present", () => {
  assert.equal(detectLanguageFromText("أبغى فيلا في الرياض"), "ar");
  assert.equal(detectLanguageFromText("Need a villa in Riyadh"), "en");
});

test("extractAcquisitionSignals infers opportunity kind, locations, and missing info", () => {
  const signals = extractAcquisitionSignals("Broker sent a villa in North Riyadh asking SAR 3.2m with photos");

  assert.equal(signals.opportunityKind, "property_submission");
  assert.equal(signals.acquisitionFocus, "screening");
  assert.equal(signals.propertyType, "villa");
  assert(signals.locations.includes("riyadh"));
  assert(signals.materialTypes.includes("photos"));
  assert.equal(signals.recommendation, "watch");
});

test("decideWhatsappMode routes workspace text into coordination", () => {
  const route = decideWhatsappMode({
    textBody: "Please help with this",
    messageType: "text",
    hasMedia: false,
    conversation: null,
    workspaceSession: { workspace_id: "workspace-1" },
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "workspace_coordination");
});

test("decideWhatsappMode routes buy-box text into mandate intake", () => {
  const route = decideWhatsappMode({
    textBody: "Looking for villas in North Riyadh around SAR 3m with renovation upside",
    hasMedia: false,
    conversation: null,
    workspaceSession: null,
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "mandate_intake");
});

test("decideWhatsappMode routes broker submissions into opportunity submission", () => {
  const route = decideWhatsappMode({
    textBody: "Broker sent this villa listing, is it worth screening?",
    hasMedia: false,
    conversation: { mode: "mandate_intake", active_workspace_id: "workspace-1" },
    workspaceSession: { workspace_id: "workspace-1" },
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "screening");
});

test("decideWhatsappMode routes media in a workspace into document ingestion", () => {
  const route = decideWhatsappMode({
    textBody: "",
    hasMedia: true,
    conversation: { awaiting_upload_kind: "none", mode: "workspace_coordination", active_workspace_id: "workspace-1" },
    workspaceSession: { workspace_id: "workspace-1" },
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "document_ingestion");
});

test("decideWhatsappMode routes screening requests into screening", () => {
  const route = decideWhatsappMode({
    textBody: "Please screen this deal and draft a reply to the broker",
    hasMedia: false,
    conversation: null,
    workspaceSession: null,
  });

  assert.equal(route.handled, true);
  assert.equal(route.mode, "screening");
});
