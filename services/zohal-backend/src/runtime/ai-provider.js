const AI_PROVIDER_TEMPORARY_ISSUE_MESSAGE =
  "The AI service is temporarily unavailable right now. Please try again in a moment.";

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

export function resolveAIProvider({ providerOverride } = {}) {
  const requested = String(providerOverride || "").trim().toLowerCase();
  if (requested === "vertex") return "vertex";
  const configured = env("AI_PROVIDER", "openai").toLowerCase();
  return configured === "vertex" ? "vertex" : "openai";
}

function normalizeProviderErrorMessage(status, json) {
  const errorObject = json?.error && typeof json.error === "object" ? json.error : null;
  const code = String(errorObject?.code ?? errorObject?.type ?? json?.code ?? "").toLowerCase();
  const message = String(errorObject?.message ?? json?.message ?? "").trim();
  const combined = `${code} ${message}`.toLowerCase();
  if (
    status === 429 ||
    status >= 500 ||
    combined.includes("insufficient_quota") ||
    combined.includes("billing details") ||
    combined.includes("temporarily unavailable") ||
    combined.includes("timeout") ||
    combined.includes("rate limit")
  ) {
    return AI_PROVIDER_TEMPORARY_ISSUE_MESSAGE;
  }
  return message || `AI provider request failed (${status})`;
}

async function providerConfig(provider) {
  if (provider === "openai") {
    const key = env("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY not configured");
    return {
      baseUrl: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${key}` },
    };
  }

  const baseUrl = env("VERTEX_OPENAI_BASE_URL");
  const bearer = env("VERTEX_BEARER_TOKEN");
  const apiKey = env("VERTEX_OPENAI_API_KEY");
  if (!baseUrl || (!bearer && !apiKey)) {
    throw new Error("Vertex OpenAI-compatible credentials not configured");
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : { "x-goog-api-key": apiKey },
  };
}

function remapModel(provider, path, payload) {
  if (provider !== "vertex" || !payload?.model) return payload;
  const model = String(payload.model).trim();
  if (model.startsWith("google/")) return payload;
  if (path === "/embeddings") {
    const embeddingModel = env("VERTEX_MODEL_EMBEDDING");
    return embeddingModel ? { ...payload, model: embeddingModel } : payload;
  }
  const chatModel = env("VERTEX_MODEL_CHAT", "google/gemini-2.0-flash-001");
  return { ...payload, model: chatModel };
}

async function callOpenAICompatible(path, payload, options = {}) {
  const provider = resolveAIProvider(options);
  const cfg = await providerConfig(provider);
  const resp = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...cfg.headers,
      ...(options.requestId ? { "x-request-id": options.requestId } : {}),
    },
    body: JSON.stringify(remapModel(provider, path, payload)),
    signal: options.signal,
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok || json?.error) {
    throw new Error(normalizeProviderErrorMessage(resp.status, json));
  }
  return json;
}

export async function createChatCompletion(payload, options = {}) {
  return await callOpenAICompatible("/chat/completions", payload, options);
}

export async function createEmbedding(payload, options = {}) {
  return await callOpenAICompatible("/embeddings", payload, {
    ...options,
    providerOverride: "openai",
  });
}
