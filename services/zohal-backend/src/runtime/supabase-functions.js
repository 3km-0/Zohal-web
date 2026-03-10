import { buildSupabaseInternalHeaders, getSupabaseUrl } from "./supabase.js";

export async function invokeSupabaseFunction({
  functionName,
  requestId,
  body = {},
  allowStatuses = [200],
}) {
  const resp = await fetch(`${getSupabaseUrl()}/functions/v1/${functionName}`, {
    method: "POST",
    headers: buildSupabaseInternalHeaders(requestId),
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!allowStatuses.includes(resp.status)) {
    const message = json?.error || json?.message || text ||
      `${functionName} failed with ${resp.status}`;
    const error = new Error(message);
    error.statusCode = resp.status;
    error.responseJson = json;
    throw error;
  }

  return {
    status: resp.status,
    json,
    text,
  };
}
