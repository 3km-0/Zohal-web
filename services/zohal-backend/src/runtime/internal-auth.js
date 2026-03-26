import { createRemoteJWKSet, jwtVerify } from "jose";

function stripBearer(value) {
  const raw = String(value || "").trim();
  return raw.toLowerCase().startsWith("bearer ")
    ? raw.slice("bearer ".length).trim()
    : raw;
}

export function getExpectedInternalToken() {
  return getAcceptedInternalTokens()[0] || "";
}

export function getAcceptedInternalTokens() {
  const candidates = [
    process.env.INTERNAL_FUNCTION_JWT,
    process.env.INTERNAL_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ];

  const accepted = [];

  for (const candidate of candidates) {
    const trimmed = String(candidate || "").trim();
    if (trimmed.length > 0 && !accepted.includes(trimmed)) accepted.push(trimmed);
  }

  return accepted;
}

export function isInternalCaller(headers) {
  const accepted = getAcceptedInternalTokens();
  if (accepted.length === 0) return false;

  const provided = [
    String(headers["x-internal-function-jwt"] || "").trim(),
    stripBearer(headers.authorization),
    String(headers.apikey || "").trim(),
  ];

  return provided.some((value) => value.length > 0 && accepted.includes(value));
}

export function requireInternalCaller(headers) {
  if (!isInternalCaller(headers)) {
    const error = new Error("unauthorized_internal_caller");
    error.statusCode = 401;
    throw error;
  }
}

let jwks = null;

function getSupabaseJwks() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(
    /\/+$/,
    "",
  );
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL not configured");
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwks;
}

export async function verifySupabaseJwt(token) {
  return await jwtVerify(token, getSupabaseJwks());
}
