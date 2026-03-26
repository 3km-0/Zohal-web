import test from "node:test";
import assert from "node:assert/strict";
import {
  getAcceptedInternalTokens,
  getExpectedInternalToken,
  isInternalCaller,
} from "../src/runtime/internal-auth.js";

test("internal auth prefers existing shared token envs", () => {
  process.env.INTERNAL_FUNCTION_JWT = "";
  process.env.INTERNAL_SERVICE_ROLE_KEY = "internal-service-token";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-token";

  assert.equal(getExpectedInternalToken(), "internal-service-token");
});

test("internal auth accepts internal header and bearer token", () => {
  process.env.INTERNAL_FUNCTION_JWT = "";
  process.env.INTERNAL_SERVICE_ROLE_KEY = "internal-service-token";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";

  assert.equal(
    isInternalCaller({ "x-internal-function-jwt": "internal-service-token" }),
    true,
  );
  assert.equal(
    isInternalCaller({ authorization: "Bearer internal-service-token" }),
    true,
  );
  assert.equal(isInternalCaller({ apikey: "wrong-token" }), false);
});

test("internal auth accepts any configured trusted token", () => {
  process.env.INTERNAL_FUNCTION_JWT = "internal-jwt-token";
  process.env.INTERNAL_SERVICE_ROLE_KEY = "internal-service-token";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-token";

  assert.deepEqual(getAcceptedInternalTokens(), [
    "internal-jwt-token",
    "internal-service-token",
    "service-role-token",
  ]);
  assert.equal(isInternalCaller({ apikey: "service-role-token" }), true);
});
