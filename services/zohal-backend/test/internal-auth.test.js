import test from "node:test";
import assert from "node:assert/strict";
import {
  getAcceptedInternalTokens,
  getExpectedInternalToken,
  isInternalCaller,
  verifySupabaseJwt,
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

test("user jwt verification validates HS tokens through Supabase Auth", async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-token";
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: "payload-user" })).toString("base64url"),
    "signature",
  ].join(".");
  let requestedUrl = "";
  let requestedHeaders = {};
  globalThis.fetch = async (url, init = {}) => {
    requestedUrl = String(url);
    requestedHeaders = init.headers || {};
    return new Response(JSON.stringify({ id: "auth-user", email: "user@example.com" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const verified = await verifySupabaseJwt(token);
    assert.equal(verified.payload.sub, "auth-user");
    assert.equal(requestedUrl, "https://example.supabase.co/auth/v1/user");
    assert.equal(requestedHeaders.apikey, "anon-token");
    assert.equal(requestedHeaders.authorization, `Bearer ${token}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
