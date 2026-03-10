import { createClient } from "@supabase/supabase-js";

function getEnv(name) {
  return String(process.env[name] || "").trim();
}

export function getSupabaseUrl() {
  const value = getEnv("SUPABASE_URL");
  if (!value) throw new Error("SUPABASE_URL not configured");
  return value.replace(/\/+$/, "");
}

export function getInternalServiceKey() {
  const value = getEnv("INTERNAL_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!value) {
    throw new Error(
      "INTERNAL_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY not configured",
    );
  }
  return value;
}

export function createServiceClient() {
  return createClient(getSupabaseUrl(), getInternalServiceKey());
}

export function buildSupabaseInternalHeaders(requestId, extra = {}) {
  const key = getInternalServiceKey();
  return {
    authorization: `Bearer ${key}`,
    apikey: key,
    "content-type": "application/json",
    "x-request-id": requestId,
    ...extra,
  };
}
