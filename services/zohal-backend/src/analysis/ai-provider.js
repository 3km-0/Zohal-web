import { normalizeUuid } from "./canonical.js";

function normalizeProvider(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "openai" || raw === "vertex") return raw;
  return undefined;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getAIStageConfig(stage = "generator") {
  const fallbackModel = String(process.env.OPENAI_CONTRACT_MODEL || "gpt-5.2").trim();
  if (stage === "verifier") {
    const providerOverride = normalizeProvider(process.env.VERIFIER_PROVIDER);
    const model = String(process.env.VERIFIER_MODEL || "").trim() || fallbackModel;
    return { ...(providerOverride ? { providerOverride } : {}), model };
  }
  const providerOverride = normalizeProvider(process.env.GENERATOR_PROVIDER);
  const model = String(process.env.GENERATOR_MODEL || "").trim() || fallbackModel;
  return { ...(providerOverride ? { providerOverride } : {}), model };
}

export function resolveAIProvider({ workspaceId } = {}) {
  const configured = String(process.env.AI_PROVIDER || "openai").trim().toLowerCase();
  const defaultProvider = configured === "vertex" ? "vertex" : "openai";
  const rollout = String(process.env.AI_PROVIDER_ROLLOUT || "").trim().toLowerCase();
  if (!rollout || defaultProvider === "openai") return defaultProvider;
  if (rollout === "all" || rollout === "*") return "vertex";
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) return "openai";
  return new Set(parseCsv(rollout)).has(normalizedWorkspaceId)
    ? "vertex"
    : "openai";
}

export function getProviderConfig(provider) {
  if (provider === "openai") {
    const openaiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");
    return {
      baseUrl: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${openaiKey}` },
    };
  }

  const baseUrl = String(process.env.VERTEX_OPENAI_BASE_URL || "").trim();
  if (!baseUrl) throw new Error("VERTEX_OPENAI_BASE_URL not configured");

  const bearer = String(process.env.VERTEX_BEARER_TOKEN || "").trim();
  const apiKey = String(process.env.VERTEX_OPENAI_API_KEY || "").trim();
  if (!bearer && !apiKey) {
    throw new Error(
      "Vertex credentials not configured (VERTEX_BEARER_TOKEN or VERTEX_OPENAI_API_KEY)",
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    headers: bearer
      ? { Authorization: `Bearer ${bearer}` }
      : { "x-goog-api-key": apiKey },
  };
}

export function remapModelForProvider(provider, payload) {
  if (provider !== "vertex" || !payload?.model) return payload;
  const model = String(payload.model || "").trim();
  if (!model || model.startsWith("google/") || model.includes("-maas")) {
    return payload;
  }
  const vertexChatModel = String(process.env.VERTEX_MODEL_CHAT || "").trim() ||
    "google/gemini-2.0-flash-001";
  const vertexSmallModel = String(process.env.VERTEX_MODEL_SMALL || "").trim() ||
    vertexChatModel;
  const openaiContractModel = String(process.env.OPENAI_CONTRACT_MODEL || "").trim();
  const lower = model.toLowerCase();
  let mapped = model;
  if (openaiContractModel && model === openaiContractModel) {
    mapped = vertexChatModel;
  } else if (lower.includes("mini") || lower.includes("small") || lower.includes("lite")) {
    mapped = vertexSmallModel;
  } else if (lower.startsWith("gpt") || lower.startsWith("o")) {
    mapped = vertexChatModel;
  }
  return mapped === model ? payload : { ...payload, model: mapped };
}

export function normalizeChatPayloadForProvider(provider, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (provider !== "openai") return payload;
  const model = String(payload.model || "").trim().toLowerCase();
  if (!(model.startsWith("gpt-5") || model.startsWith("o"))) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, "max_tokens")) return payload;
  const next = { ...payload };
  next.max_completion_tokens = typeof payload.max_completion_tokens === "number"
    ? payload.max_completion_tokens
    : payload.max_tokens;
  delete next.max_tokens;
  return next;
}

export async function createChatCompletion(payload, options = {}) {
  const provider = options.providerOverride ||
    resolveAIProvider({ workspaceId: options.workspaceId });
  const providerConfig = getProviderConfig(provider);
  const headers = {
    "content-type": "application/json",
    ...providerConfig.headers,
  };
  if (options.requestId) headers["x-request-id"] = options.requestId;

  const requestPayload = normalizeChatPayloadForProvider(
    provider,
    remapModelForProvider(provider, payload),
  );
  const response = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestPayload),
    signal: options.signal,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      json?.error?.message || json?.message ||
        `AI provider request failed (${response.status})`,
    );
    error.statusCode = response.status;
    throw error;
  }
  return json;
}

export function extractOutputText(response) {
  const choice = Array.isArray(response?.choices) ? response.choices[0] : null;
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => typeof part?.text === "string" ? part.text : "")
      .join("");
    if (text.trim()) return text;
  }
  return "";
}
