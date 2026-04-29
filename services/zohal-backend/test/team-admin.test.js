import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInviteUrl,
  buildProvisionQueuedResponse,
  buildWorkspaceMembersListResponse,
  isValidEmail,
  normalizeEmail,
  normalizeUuid,
  sha256Hex,
} from "../src/handlers/team-admin.js";

test("team admin normalizers preserve legacy input behavior", () => {
  assert.equal(normalizeUuid(" ABC-DEF "), "abc-def");
  assert.equal(normalizeEmail(" Person@Example.COM "), "person@example.com");
  assert.equal(isValidEmail("person@example.com"), true);
  assert.equal(isValidEmail("person.example.com"), false);
});

test("invite URL uses the web accept-invite contract", () => {
  assert.equal(
    buildInviteUrl({ siteUrl: "https://app.zohal.ai/", token: "abc+/=" }),
    "https://app.zohal.ai/auth/accept-invite?token=abc%2B%2F%3D",
  );
});

test("invite token hashing is deterministic sha256 hex", () => {
  assert.equal(
    sha256Hex("invite-token"),
    "f9e3c47d452a8fab2dc56ef07d766534cb2cd31c5f63de7107412acc65daa5b8",
  );
});

test("workspace members response keeps legacy envelope with additive metadata", () => {
  assert.deepEqual(buildWorkspaceMembersListResponse({
    members: [{ id: "member-1", role: "viewer" }],
    requestId: "req-1",
  }), {
    ok: true,
    members: [{ id: "member-1", role: "viewer" }],
    request_id: "req-1",
    execution_plane: "gcp",
  });
});

test("enterprise provisioning response keeps queued run contract", () => {
  assert.deepEqual(buildProvisionQueuedResponse({ runId: "run-1" }), {
    run_id: "run-1",
    status: "queued",
    estimated_steps: [
      "queued",
      "validating",
      "creating_kms",
      "creating_bucket",
      "applying_iam",
      "updating_control_plane",
      "done",
    ],
  });
});
