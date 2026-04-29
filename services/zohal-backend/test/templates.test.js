import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplatesListResponse,
  normalizeTemplateSpec,
  validateTemplateSpec,
} from "../src/handlers/templates.js";

test("templates list response keeps legacy envelope with additive metadata", () => {
  assert.deepEqual(buildTemplatesListResponse({
    templates: [{ id: "template-1", name: "Lease Review" }],
    requestId: "req-templates",
  }), {
    ok: true,
    templates: [{ id: "template-1", name: "Lease Review" }],
    request_id: "req-templates",
    execution_plane: "gcp",
  });
});

test("template spec normalization preserves canonical defaults", () => {
  const normalized = normalizeTemplateSpec({
    meta: { name: "NDA", kind: "document" },
    options: { language: "ar" },
  });

  assert.equal(normalized.spec_version, "template/v1");
  assert.equal(normalized.template_profile, "canonical_intent_v1");
  assert.equal(normalized.meta.name, "NDA");
  assert.equal(normalized.meta.kind, "document");
  assert.equal(normalized.canonical_profile.schema_version, "canonical-template-profile/v1");
  assert.equal(normalized.canonical_profile.identity.display_name, "NDA");
  assert.deepEqual(normalized.variables, []);
  assert.deepEqual(normalized.checks, []);
  assert.equal(normalized.options.language, "ar");
  assert.equal(normalized.options.strictness, "default");
  assert.equal(normalized.options.enable_verifier, false);
});

test("template spec validation rejects missing required metadata", () => {
  assert.deepEqual(validateTemplateSpec(null), {
    ok: false,
    error: "spec_json must be an object",
  });
  assert.deepEqual(validateTemplateSpec({}), {
    ok: false,
    error: "spec_json.meta is required",
  });
  assert.deepEqual(validateTemplateSpec({ meta: { kind: "document" } }), {
    ok: false,
    error: "spec_json.meta.name is required",
  });
  assert.deepEqual(validateTemplateSpec({ meta: { name: "Template" } }), {
    ok: false,
    error: "spec_json.meta.kind is required",
  });
  assert.deepEqual(validateTemplateSpec({ meta: { name: "Template", kind: "document" } }), {
    ok: true,
  });
});
