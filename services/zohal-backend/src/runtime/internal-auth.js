import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";

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

function getSupabaseUrl() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(
    /\/+$/,
    "",
  );
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL not configured");
  }
  return supabaseUrl;
}

function getSupabaseAnonKey() {
  const value = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  ).trim();
  if (!value) throw new Error("SUPABASE_ANON_KEY not configured");
  return value;
}

function makeAuthError(message) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function getSupabaseJwks() {
  const supabaseUrl = getSupabaseUrl();
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwks;
}

async function verifySupabaseTokenWithAuthEndpoint(token) {
  const resp = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: getSupabaseAnonKey(),
      authorization: `Bearer ${token}`,
    },
  });
  let json = null;
  try {
    json = await resp.json();
  } catch {
    json = null;
  }
  if (!resp.ok || !json?.id) {
    throw makeAuthError("invalid_or_expired_user_token");
  }
  return {
    payload: {
      sub: json.id,
      email: json.email || null,
      role: json.role || null,
    },
    user: json,
  };
}

export async function verifySupabaseJwt(token) {
  let alg = "";
  try {
    alg = String(decodeProtectedHeader(token)?.alg || "");
  } catch {
    throw makeAuthError("invalid_user_token");
  }

  if (alg.startsWith("HS")) {
    return await verifySupabaseTokenWithAuthEndpoint(token);
  }

  try {
    return await jwtVerify(token, getSupabaseJwks());
  } catch (error) {
    if (String(error?.message || "").includes("Unsupported \"alg\" value")) {
      return await verifySupabaseTokenWithAuthEndpoint(token);
    }
    throw makeAuthError("invalid_or_expired_user_token");
  }
}
