import { createHash } from "node:crypto";
import { allowedVariableNamesForTemplate } from "./batch.js";

function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase();
}

function titleizeVariableName(name) {
  return String(name || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const TEMPLATE_REQUIRED_VARIABLES = {
  renewal_pack: new Set([
    "counterparty_name",
    "effective_date",
    "end_date",
    "notice_period_days",
  ]),
  contract_analysis: new Set([
    "counterparty_name",
    "contract_type",
    "effective_date",
  ]),
  lease_pack: new Set(["counterparty_name"]),
  amendment_conflict_review: new Set(["contract_type"]),
  obligations_tracker: new Set(),
  playbook_compliance_review: new Set(["contract_type"]),
};

const TEMPLATE_CHECKS = {
  renewal_pack: [
    { id: "required-counterparty", type: "required", variable_name: "counterparty_name", severity: "blocker" },
    { id: "required-contract-type", type: "required", variable_name: "contract_type", severity: "warning" },
    { id: "required-effective-date", type: "required", variable_name: "effective_date", severity: "blocker" },
    { id: "required-end-date", type: "required", variable_name: "end_date", severity: "blocker" },
    { id: "required-notice-period", type: "required", variable_name: "notice_period_days", severity: "blocker" },
    { id: "range-notice-days", type: "range", variable_name: "notice_period_days", severity: "warning", min: 0, max: 3650 },
  ],
  contract_analysis: [
    { id: "required-counterparty", type: "required", variable_name: "counterparty_name", severity: "blocker" },
    { id: "required-contract-type", type: "required", variable_name: "contract_type", severity: "warning" },
    { id: "required-effective-date", type: "required", variable_name: "effective_date", severity: "warning" },
  ],
  lease_pack: [
    { id: "required-counterparty", type: "required", variable_name: "counterparty_name", severity: "warning" },
  ],
  amendment_conflict_review: [
    { id: "required-contract-type", type: "required", variable_name: "contract_type", severity: "warning" },
  ],
  obligations_tracker: [],
  playbook_compliance_review: [
    { id: "required-contract-type", type: "required", variable_name: "contract_type", severity: "warning" },
  ],
};

const TEMPLATE_MODULES = {
  renewal_pack: [
    {
      module_id: "renewal_actions",
      title: "Renewal Actions",
      trigger_signals: ["auto_renewal", "notice_period_days", "end_date"],
    },
  ],
  contract_analysis: [],
  lease_pack: [
    {
      module_id: "lease_conflicts",
      title: "Lease Conflicts",
      trigger_signals: ["rent_amount", "renewal_options", "early_termination"],
    },
  ],
  amendment_conflict_review: [
    {
      module_id: "amendment_conflicts",
      title: "Amendment Conflicts",
      trigger_signals: ["payment_terms", "end_date", "notice_period_days"],
    },
  ],
  obligations_tracker: [
    {
      module_id: "obligation_dependencies",
      title: "Obligation Dependencies",
      trigger_signals: ["effective_date", "end_date", "notice_period_days"],
    },
  ],
  playbook_compliance_review: [
    {
      module_id: "compliance_deviations",
      title: "Compliance Deviations",
      trigger_signals: ["contract_type", "governing_law"],
    },
  ],
};

function getTemplateVariableDefs(templateId) {
  const key = String(templateId || "contract_analysis").trim();
  const required = TEMPLATE_REQUIRED_VARIABLES[key] || new Set();
  return Array.from(allowedVariableNamesForTemplate(key)).map((name) => ({
    name,
    display_name: titleizeVariableName(name),
    type: "text",
    required: required.has(name),
  }));
}

const TEMPLATE_METADATA = {
  renewal_pack: { template_id: "renewal_pack", template_version: "v2" },
  contract_analysis: { template_id: "contract_analysis", template_version: "v2" },
  lease_pack: { template_id: "lease_pack", template_version: "v2" },
  amendment_conflict_review: {
    template_id: "amendment_conflict_review",
    template_version: "v1",
  },
  obligations_tracker: {
    template_id: "obligations_tracker",
    template_version: "v1",
  },
  playbook_compliance_review: {
    template_id: "playbook_compliance_review",
    template_version: "v1",
  },
};

function getTemplateDefinition(templateId) {
  const key = String(templateId || "contract_analysis").trim();
  const base = TEMPLATE_METADATA[key] || TEMPLATE_METADATA.contract_analysis;
  return {
    ...base,
    variables_allowed: getTemplateVariableDefs(key),
    modules: TEMPLATE_MODULES[key] || [],
    checks: TEMPLATE_CHECKS[key] || [],
  };
}

function readBool(name, defaultValue = false) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function resolveAnalysisV3FlagsForWorkspace(workspaceId) {
  const enabled = readBool("ANALYSIS_V3_ENABLED", false);
  const allowlist = new Set(
    String(process.env.ANALYSIS_V3_WORKSPACE_ALLOWLIST || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
  const allowed = allowlist.size === 0
    ? true
    : allowlist.has(normalizeUuid(workspaceId));
  if (!allowed) {
    return { enabled: false, web_enabled: false, ios_enabled: false };
  }
  return {
    enabled,
    web_enabled: readBool("ANALYSIS_V3_WEB_ENABLED", enabled),
    ios_enabled: readBool("ANALYSIS_V3_IOS_ENABLED", enabled),
  };
}

function getAIStageConfig(stage) {
  const normalizeProvider = (value) => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "openai" || raw === "vertex") return raw;
    return undefined;
  };
  const legacy = String(process.env.OPENAI_CONTRACT_MODEL || "gpt-5.2").trim();
  if (stage === "generator") {
    const providerOverride = normalizeProvider(process.env.GENERATOR_PROVIDER);
    const model = String(process.env.GENERATOR_MODEL || "").trim() || legacy;
    return { ...(providerOverride ? { providerOverride } : {}), model };
  }
  if (stage === "judge") {
    const providerOverride = normalizeProvider(process.env.JUDGE_PROVIDER);
    const model = String(process.env.JUDGE_MODEL || "").trim() || legacy;
    return { ...(providerOverride ? { providerOverride } : {}), model };
  }
  const providerOverride = normalizeProvider(process.env.VERIFIER_PROVIDER);
  const model = String(process.env.VERIFIER_MODEL || "").trim() || legacy;
  return { ...(providerOverride ? { providerOverride } : {}), model };
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function resolveAIProvider({ workspaceId } = {}) {
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

function getProviderConfig(provider) {
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

function remapModelForProvider(provider, path, payload) {
  if (provider !== "vertex" || !payload?.model) return payload;
  const model = String(payload.model || "").trim();
  if (!model || model.startsWith("google/") || model.includes("-maas")) {
    return payload;
  }
  const vertexChatModel = String(process.env.VERTEX_MODEL_CHAT || "").trim() ||
    "google/gemini-2.0-flash-001";
  const vertexSmallModel = String(process.env.VERTEX_MODEL_SMALL || "").trim() ||
    vertexChatModel;
  const vertexContractModel = String(process.env.VERTEX_MODEL_CONTRACT || "").trim() ||
    vertexChatModel;
  const openaiContractModel = String(process.env.OPENAI_CONTRACT_MODEL || "").trim();
  const lower = model.toLowerCase();
  let mapped = model;
  if (openaiContractModel && model === openaiContractModel) {
    mapped = vertexContractModel;
  } else if (
    lower.includes("mini") ||
    lower.includes("small") ||
    lower.includes("lite")
  ) {
    mapped = vertexSmallModel;
  } else if (lower.startsWith("gpt") || lower.startsWith("o")) {
    mapped = vertexChatModel;
  }
  return mapped === model ? payload : { ...payload, model: mapped };
}

async function createChatCompletion(payload, options = {}) {
  const provider = options.providerOverride ||
    resolveAIProvider({ workspaceId: options.workspaceId });
  const providerConfig = getProviderConfig(provider);
  const headers = {
    "content-type": "application/json",
    ...providerConfig.headers,
  };
  if (options.requestId) headers["x-request-id"] = options.requestId;
  const response = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(remapModelForProvider(provider, "/chat/completions", payload)),
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

function safeJsonParse(raw) {
  const text = String(raw || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Failed to parse reduce JSON");
  }
}

function normalizeLanguageOption(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "ar" || raw.startsWith("ar-") || raw === "arabic") return "ar";
  if (raw === "en" || raw.startsWith("en-") || raw === "english") return "en";
  return undefined;
}

function humanLanguageName(value) {
  const code = normalizeLanguageOption(value);
  if (code === "ar") return "Arabic";
  if (code === "en") return "English";
  const raw = String(value ?? "").trim();
  return raw || null;
}

function resolveRunLanguagePreference(inputConfig, playbookSpec) {
  const requestOptions = inputConfig?.playbook_options &&
      typeof inputConfig.playbook_options === "object"
    ? inputConfig.playbook_options
    : null;
  const playbookOptions = inputConfig?.playbook?.options &&
      typeof inputConfig.playbook.options === "object"
    ? inputConfig.playbook.options
    : null;
  const specOptions =
    playbookSpec?.options && typeof playbookSpec.options === "object"
      ? playbookSpec.options
      : null;
  return normalizeLanguageOption(requestOptions?.language) ||
    normalizeLanguageOption(playbookOptions?.language) ||
    normalizeLanguageOption(specOptions?.language) ||
    null;
}

function repairJsonString(raw) {
  let text = String(raw || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return text;
  text = text.slice(start, end + 1);
  text = text.replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "");
  text = text.replace(/,(\s*[\}\]])/g, "$1");
  text = text.replace(/("|\d|true|false|null|\}|\])(\s*\n\s*)("|\{|\[)/g, "$1,$2$3");
  text = text.replace(/([\}\]])(\s+)([\{\[\"])/g, "$1,$2$3");
  return text;
}

function aggressiveJsonRepair(raw) {
  let text = String(raw || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return text;
  text = text.slice(start, end + 1);
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/,(\s*[\}\]])/g, "$1");
  text = text.replace(/(")\s*\n\s*(")/g, "$1,\n$2");
  text = text.replace(/(true|false|null|\d+)\s*\n\s*(")/g, "$1,\n$2");
  text = text.replace(/([\}\]])\s*\n\s*([\{\[\"])/g, "$1,\n$2");
  text = text.replace(/,\s*,/g, ",");
  return text;
}

function safeJsonParseQuiet(raw) {
  const text = String(raw || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(repairJsonString(text));
    } catch {
      return JSON.parse(aggressiveJsonRepair(text));
    }
  }
}

function severityScore(value) {
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function normalizeRiskLevel(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (raw === "high") return "high";
  if (raw === "medium") return "medium";
  return "low";
}

function normalizeConfidence(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (raw === "high") return "high";
  if (raw === "low") return "low";
  return "medium";
}

function normalizeSeverity(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (raw === "critical") return "critical";
  if (raw === "high") return "high";
  if (raw === "low") return "low";
  return "medium";
}

function normalizeClauses(input) {
  const items = Array.isArray(input) ? input : [];
  return items.map((item) => {
    if (typeof item === "string") {
      return { clause_type: "other", text: item, risk_level: "low" };
    }
    if (!item || typeof item !== "object") return null;
    const text = item.text || item.description || item.summary || item.source_quote || "";
    if (!String(text).trim()) return null;
    return {
      candidate_id: typeof item.candidate_id === "string" ? item.candidate_id : undefined,
      document_id: typeof item.document_id === "string" ? normalizeUuid(item.document_id) : undefined,
      clause_type: String(
        item.clause_type || item.type || item.clause_name || item.title || item.name || "other",
      ),
      clause_title: item.clause_title || item.title || item.name || item.clause_name
        ? String(item.clause_title || item.title || item.name || item.clause_name)
        : undefined,
      clause_number: item.clause_number || item.clause_id
        ? String(item.clause_number || item.clause_id)
        : undefined,
      text: String(text),
      risk_level: normalizeRiskLevel(item.risk_level),
      page_number: typeof item.page_number === "number" ? item.page_number : undefined,
      is_missing_standard_protection: !!item.is_missing_standard_protection,
      source_quote: item.source_quote ? String(item.source_quote).slice(0, 120) : undefined,
    };
  }).filter(Boolean);
}

function normalizeObligations(input) {
  const items = Array.isArray(input) ? input : [];
  return items.map((item) => {
    if (typeof item === "string") {
      return { obligation_type: "other", summary: item, confidence: "medium" };
    }
    if (!item || typeof item !== "object") return null;
    const summary = item.summary || item.obligation || item.description || item.name || item.action || item.text || "";
    if (!String(summary).trim()) return null;
    return {
      candidate_id: typeof item.candidate_id === "string" ? item.candidate_id : undefined,
      document_id: typeof item.document_id === "string" ? normalizeUuid(item.document_id) : undefined,
      obligation_type: String(item.obligation_type || item.type || "other"),
      due_at: item.due_at ? String(item.due_at) : undefined,
      recurrence: item.recurrence ? String(item.recurrence) : undefined,
      responsible_party: item.responsible_party || item.party
        ? String(item.responsible_party || item.party)
        : undefined,
      summary: String(summary),
      action: item.action ? String(item.action) : undefined,
      condition: item.condition ? String(item.condition) : undefined,
      confidence: normalizeConfidence(item.confidence),
      source_clause_type: item.source_clause_type ? String(item.source_clause_type) : undefined,
      page_number: typeof item.page_number === "number" ? item.page_number : undefined,
      source_quote: item.source_quote ? String(item.source_quote).slice(0, 120) : undefined,
    };
  }).filter(Boolean);
}

function normalizeRisks(input) {
  const items = Array.isArray(input) ? input : [];
  return items.map((item) => {
    if (typeof item === "string") {
      return { severity: "medium", description: item };
    }
    if (!item || typeof item !== "object") return null;
    const description = item.description || item.risk || item.name || item.title || item.summary || item.text || "";
    if (!String(description).trim()) return null;
    return {
      candidate_id: typeof item.candidate_id === "string" ? item.candidate_id : undefined,
      document_id: typeof item.document_id === "string" ? normalizeUuid(item.document_id) : undefined,
      severity: normalizeSeverity(item.severity || item.risk_level),
      description: String(description),
      explanation: item.explanation ? String(item.explanation) : undefined,
      source_quote: item.source_quote ? String(item.source_quote).slice(0, 120) : undefined,
      page_number: typeof item.page_number === "number" ? item.page_number : undefined,
    };
  }).filter(Boolean);
}

function dedupeByKey(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function deterministicReduce(candidates) {
  const varsByName = new Map();
  for (const item of candidates.extracted_variables || []) {
    const existing = varsByName.get(item.name);
    if (!existing || (item.ai_confidence === "high" && existing.ai_confidence !== "high")) {
      varsByName.set(item.name, item);
    }
  }

  const clausesByType = new Map();
  for (const item of candidates.clauses || []) {
    const key = `${item.clause_type}:${String(item.text || "").slice(0, 50)}`;
    if (!clausesByType.has(key)) clausesByType.set(key, item);
  }

  const scoredObligations = (candidates.obligations || []).map((item) => {
    let score = 0;
    if (item.due_at) score += 20;
    if (/pay|payment|fee|amount/i.test(item.summary || item.action || "")) score += 15;
    if (/notice|terminat|renew/i.test(item.summary || item.action || "")) score += 10;
    if (item.confidence === "high") score += 5;
    if (item.source_quote) score += 5;
    return { obligation: item, score };
  }).sort((a, b) => b.score - a.score);

  const uniqueObligations = [];
  const seenObligationKeys = new Set();
  for (const { obligation } of scoredObligations) {
    const key = String(obligation.summary || obligation.action || "").toLowerCase().slice(0, 60);
    if (seenObligationKeys.has(key)) continue;
    seenObligationKeys.add(key);
    uniqueObligations.push(obligation);
  }

  const risksByDesc = new Map();
  for (const item of candidates.risks || []) {
    const key = String(item.description || "").toLowerCase().slice(0, 60);
    const existing = risksByDesc.get(key);
    if (!existing || severityScore(item.severity) > severityScore(existing.severity)) {
      risksByDesc.set(key, item);
    }
  }

  return {
    extracted_variables: Array.from(varsByName.values()).slice(0, 12),
    clauses: Array.from(clausesByType.values()).slice(0, 15),
    obligations: uniqueObligations.slice(0, 25),
    risks: Array.from(risksByDesc.values()).slice(0, 12),
  };
}

async function reduceWithOpenAI(candidates, workspaceId, requestId, totalBatches = 6, pagesPerBatch = 7) {
  const generatorConfig = getAIStageConfig("generator");
  const verifierConfig = getAIStageConfig("verifier");
  const effectivePagesPerBatch = Number.isFinite(pagesPerBatch) && pagesPerBatch > 0
    ? pagesPerBatch
    : 7;
  const estimatedPages = Math.max(1, Math.ceil(totalBatches * effectivePagesPerBatch));
  const scaleFactor = Math.max(1, Math.ceil(estimatedPages / 42));
  const caps = {
    variables: Math.min(12 * scaleFactor, 30),
    clauses: Math.min(15 * scaleFactor, 60),
    obligations: Math.min(25 * scaleFactor, 100),
    risks: Math.min(12 * scaleFactor, 50),
  };

  const variableMap = new Map();
  const clauseMap = new Map();
  const obligationMap = new Map();
  const riskMap = new Map();
  for (const item of candidates.extracted_variables || []) {
    if (item.candidate_id) variableMap.set(item.candidate_id, item);
  }
  for (const item of candidates.clauses || []) {
    if (item.candidate_id) clauseMap.set(item.candidate_id, item);
  }
  for (const item of candidates.obligations || []) {
    if (item.candidate_id) obligationMap.set(item.candidate_id, item);
  }
  for (const item of candidates.risks || []) {
    if (item.candidate_id) riskMap.set(item.candidate_id, item);
  }

  if (variableMap.size === 0 && clauseMap.size === 0 && obligationMap.size === 0 && riskMap.size === 0) {
    return deterministicReduce(candidates);
  }

  const payload = {
    variables: Array.from(variableMap.entries()).map(([id, item]) => ({
      id,
      name: item.name,
      value: String(item.value ?? "").slice(0, 60),
      page: item.page_number,
    })),
    clauses: Array.from(clauseMap.entries()).map(([id, item]) => ({
      id,
      type: item.clause_type,
      title: String(item.clause_title || "").slice(0, 40),
      risk: item.risk_level,
      page: item.page_number,
    })),
    obligations: Array.from(obligationMap.entries()).map(([id, item]) => ({
      id,
      type: item.obligation_type,
      summary: String(item.summary || item.action || "").slice(0, 60),
      due: item.due_at,
      page: item.page_number,
    })),
    risks: Array.from(riskMap.entries()).map(([id, item]) => ({
      id,
      severity: item.severity,
      desc: String(item.description || "").slice(0, 60),
      page: item.page_number,
    })),
  };

  const system = `You are reducing contract-analysis candidates into a final set.\n` +
    `Return ONLY JSON with arrays of candidate IDs to keep.\n` +
    `Be conservative: keep the best-supported, least-duplicative candidates.\n` +
    `Maximum counts: variables=${caps.variables}, clauses=${caps.clauses}, obligations=${caps.obligations}, risks=${caps.risks}.\n` +
    `JSON schema:\n` +
    `{"variables":["id"],"clauses":["id"],"obligations":["id"],"risks":["id"]}`;

  const callModel = async (model, providerOverride) => {
    const json = await createChatCompletion({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0,
      max_tokens: 1600,
      response_format: { type: "json_object" },
    }, {
      workspaceId,
      requestId,
      providerOverride,
    });
    return safeJsonParse(json?.choices?.[0]?.message?.content || "{}");
  };

  let selection;
  try {
    selection = await callModel(generatorConfig.model, generatorConfig.providerOverride);
  } catch {
    try {
      selection = await callModel(verifierConfig.model || "gpt-5.2", "openai");
    } catch {
      return deterministicReduce(candidates);
    }
  }

  return {
    extracted_variables: (selection.variables || []).map((id) => variableMap.get(id)).filter(Boolean),
    clauses: (selection.clauses || []).map((id) => clauseMap.get(id)).filter(Boolean),
    obligations: (selection.obligations || []).map((id) => obligationMap.get(id)).filter(Boolean),
    risks: (selection.risks || []).map((id) => riskMap.get(id)).filter(Boolean),
  };
}

function normalizeForMatching(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordOverlapScore(needle, haystack) {
  const normalizedNeedle = normalizeForMatching(needle);
  const normalizedHaystack = normalizeForMatching(haystack);
  if (!normalizedNeedle || !normalizedHaystack) return 0;
  const words = normalizedNeedle.split(" ").filter((item) => item.length >= 4);
  if (words.length === 0) return 0;
  let matched = 0;
  for (const word of words) {
    if (normalizedHaystack.includes(word)) matched++;
  }
  return matched / words.length;
}

function generateId() {
  return crypto.randomUUID();
}

function getChunksForDoc(chunksByDoc, documentId, fallbackDocumentId) {
  const normalized = normalizeUuid(documentId);
  if (normalized && Array.isArray(chunksByDoc[normalized]) && chunksByDoc[normalized].length) {
    return chunksByDoc[normalized];
  }
  return chunksByDoc[normalizeUuid(fallbackDocumentId)] || [];
}

function resolveEvidence(sourceQuote, pageNumber, chunksByDoc, documentIdForEvidence, fallbackDocumentId, fallbackText) {
  const quote = String(sourceQuote || "").trim();
  const page = typeof pageNumber === "number" ? pageNumber : null;
  if (!page) return null;

  const docId = normalizeUuid(documentIdForEvidence || fallbackDocumentId);
  const chunks = getChunksForDoc(chunksByDoc, docId, fallbackDocumentId);
  const onPage = chunks.filter((item) => item.page_number === page);
  if (onPage.length === 0) {
    const snippet = quote || String(fallbackText || "").trim();
    return snippet
      ? { page_number: page, snippet: snippet.slice(0, 220), document_id: docId }
      : null;
  }

  const exactMatch = quote ? onPage.find((item) => String(item.content_text || "").includes(quote)) : undefined;
  let match = exactMatch;
  if (!match) {
    const needle = quote || String(fallbackText || "").trim();
    if (needle) {
      let best = onPage[0];
      let bestScore = -1;
      for (const item of onPage) {
        const score = wordOverlapScore(needle, item.content_text || "");
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
      match = best;
    } else {
      match = onPage[0];
    }
  }

  const snippet = exactMatch
    ? quote
    : (String(match?.content_text || "").trim().slice(0, 220) ||
      String(fallbackText || "").trim().slice(0, 220));

  return snippet
    ? {
      page_number: page,
      chunk_id: match?.id,
      bbox: match?.bounding_box ?? null,
      snippet,
      document_id: docId,
    }
    : null;
}

export function toSnapshot(reduced, chunksByDoc, primaryDocumentId, templateId, enabledModules) {
  const totalChunks = Object.values(chunksByDoc).reduce(
    (acc, items) => acc + (Array.isArray(items) ? items.length : 0),
    0,
  );
  const enabled = enabledModules || new Set(["variables", "clauses", "obligations", "risks", "deadlines"]);
  if (enabled.has("deadlines")) enabled.add("variables");
  return {
    schema_version: "2.0",
    template: getTemplateDefinition(templateId).template_id,
    variables: enabled.has("variables")
      ? (reduced.extracted_variables || []).map((item) => ({
        id: generateId(),
        name: item.name,
        type: item.type,
        value: item.value ?? null,
        unit: item.unit ?? null,
        display_name: item.display_name ?? item.name,
        verification_state: "extracted",
        ai_confidence: item.ai_confidence ?? "medium",
        evidence: resolveEvidence(
          item.source_quote,
          item.page_number,
          chunksByDoc,
          item.document_id,
          primaryDocumentId,
          String(item.value ?? "").trim(),
        ),
      }))
      : [],
    clauses: enabled.has("clauses")
      ? (reduced.clauses || []).map((item) => ({
        id: generateId(),
        clause_type: item.clause_type,
        clause_title: item.clause_title ?? null,
        clause_number: item.clause_number ?? null,
        text: item.text,
        risk_level: item.risk_level,
        is_missing_standard_protection: item.is_missing_standard_protection ?? false,
        verification_state: "extracted",
        evidence: resolveEvidence(
          item.source_quote,
          item.page_number,
          chunksByDoc,
          item.document_id,
          primaryDocumentId,
          item.text,
        ),
      }))
      : [],
    obligations: enabled.has("obligations")
      ? (reduced.obligations || []).map((item) => ({
        id: generateId(),
        obligation_type: item.obligation_type || "general_obligation",
        due_at: item.due_at ?? null,
        recurrence: item.recurrence ?? null,
        responsible_party: item.responsible_party ?? null,
        summary: item.summary ?? null,
        action: item.action ?? null,
        condition: item.condition ?? null,
        verification_state: "extracted",
        ai_confidence: item.confidence ?? "medium",
        evidence: resolveEvidence(
          item.source_quote,
          item.page_number,
          chunksByDoc,
          item.document_id,
          primaryDocumentId,
          item.summary || item.action || "",
        ),
      }))
      : [],
    risks: enabled.has("risks")
      ? (reduced.risks || []).map((item) => ({
        id: generateId(),
        severity: item.severity,
        description: item.description,
        explanation: item.explanation ?? null,
        evidence: resolveEvidence(
          item.source_quote,
          item.page_number,
          chunksByDoc,
          item.document_id,
          primaryDocumentId,
          item.description,
        ),
        resolved: false,
      }))
      : [],
    analyzed_at: new Date().toISOString(),
    chunks_analyzed: totalChunks,
    document_id: primaryDocumentId,
  };
}

export function addComputedNoticeDeadlineIfPossible(snapshotJson) {
  const variables = Array.isArray(snapshotJson?.variables) ? snapshotJson.variables : [];
  const endVar = variables.find((item) => String(item?.name || "") === "end_date");
  const noticeVar = variables.find((item) => String(item?.name || "") === "notice_period_days");
  if (!endVar || !noticeVar) return snapshotJson;
  const endStr = typeof endVar.value === "string" ? endVar.value : null;
  const noticeN = typeof noticeVar.value === "number"
    ? Math.floor(noticeVar.value)
    : typeof noticeVar.value === "string"
    ? parseInt(noticeVar.value, 10)
    : NaN;
  if (!endStr || !/^\d{4}-\d{2}-\d{2}$/.test(endStr) || !Number.isFinite(noticeN) || noticeN <= 0 || noticeN > 3650) {
    return snapshotJson;
  }
  if (variables.some((item) => String(item?.name || "") === "notice_deadline")) {
    return snapshotJson;
  }
  const endDate = new Date(`${endStr}T00:00:00.000Z`);
  if (Number.isNaN(endDate.getTime())) return snapshotJson;
  endDate.setUTCDate(endDate.getUTCDate() - noticeN);
  const computedIso = endDate.toISOString().split("T")[0];
  return {
    ...snapshotJson,
    variables: [
      ...variables,
      {
        id: generateId(),
        name: "notice_deadline",
        type: "date",
        value: computedIso,
        unit: null,
        display_name: "Notice Deadline",
        verification_state: "extracted",
        ai_confidence: "medium",
        evidence: null,
        computed: {
          kind: "deterministic",
          sources: [
            { variable_name: "end_date", variable_id: endVar.id ?? null },
            { variable_name: "notice_period_days", variable_id: noticeVar.id ?? null },
          ],
        },
      },
    ],
  };
}

export function attachPackMetadata(snapshotJson, templateId) {
  const def = getTemplateDefinition(templateId);
  const variables = Array.isArray(snapshotJson?.variables) ? snapshotJson.variables : [];
  const presentNames = new Set(variables.map((item) => String(item?.name || "")).filter(Boolean));
  const modulesActivated = (def.modules || [])
    .filter((moduleDef) =>
      Array.isArray(moduleDef?.trigger_signals) &&
      moduleDef.trigger_signals.some((signal) => presentNames.has(signal))
    )
    .map((moduleDef) => moduleDef.module_id);

  const noticeDeadlineVar = variables.find((item) => String(item?.name || "") === "notice_deadline");
  const modules = {};
  for (const moduleId of modulesActivated) {
    modules[moduleId] = {
      status: "active",
      computed: noticeDeadlineVar?.value
        ? { notice_deadline: noticeDeadlineVar.value }
        : {},
    };
  }

  return {
    ...snapshotJson,
    pack: {
      ...(snapshotJson.pack || {}),
      template_id: def.template_id,
      template_version: def.template_version,
      modules_activated: modulesActivated,
      modules,
    },
  };
}

const VERIFIER_TARGET_VARIABLES = [
  "effective_date",
  "end_date",
  "notice_period_days",
  "auto_renewal",
  "termination_for_convenience",
  "term_length_months",
];

function getChunkTextForEvidence(evidence, chunksByDoc, defaultDocumentId) {
  const docId = String(evidence?.document_id || defaultDocumentId || "")
    .toLowerCase()
    .trim();
  const chunks = chunksByDoc[docId] ||
    chunksByDoc[String(defaultDocumentId || "").toLowerCase()] ||
    [];
  const page = typeof evidence?.page_number === "number"
    ? evidence.page_number
    : undefined;
  const chunkId = typeof evidence?.chunk_id === "string"
    ? evidence.chunk_id
    : undefined;
  if (chunkId) {
    const match = chunks.find((item) => item.id === chunkId);
    if (match?.content_text) {
      return {
        text: match.content_text,
        page: match.page_number,
        chunkId: match.id,
        documentId: docId,
      };
    }
  }
  if (page) {
    const onPage = chunks.filter((item) => item.page_number === page);
    const text = onPage.slice(0, 6).map((item) => item.content_text || "").join("\n");
    if (text) {
      return { text, page, chunkId: onPage[0]?.id, documentId: docId };
    }
  }
  return { text: "" };
}

function inferNumberWords(n) {
  if (!Number.isFinite(n)) return null;
  const num = Math.floor(n);
  if (num < 0 || num > 120) return null;

  const ones = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];

  if (num < 20) return ones[num];
  if (num === 100) return "one hundred";
  if (num > 100) return `one hundred ${inferNumberWords(num - 100)}`.trim();
  const t = Math.floor(num / 10);
  const o = num % 10;
  return o === 0 ? tens[t] : `${tens[t]} ${ones[o]}`;
}

function anchorsInteger(quote, value, unitHint) {
  const n = typeof value === "number"
    ? Math.floor(value)
    : typeof value === "string"
    ? parseInt(value, 10)
    : NaN;

  if (!Number.isFinite(n)) {
    return { ok: false, strong: false, reason: "no_numeric_value" };
  }

  const normalizedQuote = normalizeForMatching(quote);
  const digitOk = new RegExp(`\\b${n}\\b`).test(normalizedQuote);
  const wordForm = inferNumberWords(n);
  const wordOk = wordForm ? normalizedQuote.includes(wordForm) : false;
  const baseOk = digitOk || wordOk;
  if (!baseOk) {
    return { ok: false, strong: false, reason: "number_not_anchored" };
  }

  if (!unitHint) return { ok: true, strong: true };
  const unitOk = unitHint === "days"
    ? (normalizedQuote.includes("day") || normalizedQuote.includes("days"))
    : unitHint === "months"
    ? (normalizedQuote.includes("month") || normalizedQuote.includes("months"))
    : true;

  return { ok: true, strong: unitOk, reason: unitOk ? undefined : "unit_missing" };
}

function anchorsDate(quote, isoDate) {
  if (typeof isoDate !== "string" || !isoDate.trim()) {
    return { ok: false, strong: false, reason: "no_date_value" };
  }
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { ok: false, strong: false, reason: "date_not_iso" };
  const [, year, month, day] = match;

  const normalizedQuote = normalizeForMatching(quote);
  if (!normalizedQuote.includes(year)) {
    return { ok: false, strong: false, reason: "year_missing" };
  }

  const monthNum = String(parseInt(month, 10));
  const dayNum = String(parseInt(day, 10));
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const monthName = monthNames[parseInt(month, 10) - 1];
  const monthOk = (monthName && normalizedQuote.includes(monthName)) ||
    new RegExp(`\\b${month}\\b`).test(normalizedQuote) ||
    new RegExp(`\\b${monthNum}\\b`).test(normalizedQuote);
  const dayOk = new RegExp(`\\b${day}\\b`).test(normalizedQuote) ||
    new RegExp(`\\b${dayNum}\\b`).test(normalizedQuote);

  if (monthOk) return { ok: true, strong: true };
  if (dayOk) return { ok: true, strong: false, reason: "month_missing_day_present" };
  return { ok: true, strong: false, reason: "month_missing" };
}

function anchorsBoolean(quote, value, kind) {
  if (typeof value !== "boolean") return { ok: false, strong: false };
  const normalizedQuote = normalizeForMatching(quote);
  const hasNegation = /\b(no|not|without)\b/.test(normalizedQuote);

  const truePhrases = kind === "auto_renewal"
    ? [
      "automatic renewal",
      "automatically renew",
      "auto renew",
      "shall renew",
      "renew automatically",
    ]
    : [
      "terminate for convenience",
      "termination for convenience",
      "without cause",
      "for any reason",
      "at any time",
    ];
  const falsePhrases = kind === "auto_renewal"
    ? [
      "does not automatically renew",
      "not automatically renew",
      "no automatic renewal",
      "nonrenewal",
    ]
    : [
      "may not terminate for convenience",
      "no termination for convenience",
      "not terminate for convenience",
    ];

  const trueHit = truePhrases.some((phrase) => normalizedQuote.includes(normalizeForMatching(phrase)));
  const falseHit = falsePhrases.some((phrase) => normalizedQuote.includes(normalizeForMatching(phrase)));

  if (value === true) {
    if (falseHit) return { ok: false, strong: false, contradicts: true };
    if (trueHit) return { ok: true, strong: true };
    const weak = kind === "auto_renewal"
      ? /\brenew\w*\b/.test(normalizedQuote)
      : /\bterminat\w*\b/.test(normalizedQuote);
    return { ok: weak && !hasNegation, strong: false };
  }

  if (trueHit && !falseHit) return { ok: false, strong: false, contradicts: true };
  if (falseHit) return { ok: true, strong: true };
  return { ok: true, strong: false };
}

function runDeterministicVerifier({ snapshotJson, chunksByDoc, defaultDocumentId }) {
  const results = {};
  let green = 0;
  let yellow = 0;
  let red = 0;

  const vars = Array.isArray(snapshotJson?.variables) ? snapshotJson.variables : [];
  const byName = new Map();
  for (const variable of vars) {
    if (variable?.name) byName.set(String(variable.name), variable);
  }

  for (const name of VERIFIER_TARGET_VARIABLES) {
    const variable = byName.get(name);
    if (!variable) {
      results[name] = { status: "yellow", reasons: ["missing_variable"] };
      yellow++;
      continue;
    }

    const evidence = variable.evidence;
    const quote = typeof evidence?.snippet === "string" ? evidence.snippet : "";
    const pageNumber = typeof evidence?.page_number === "number" ? evidence.page_number : undefined;
    const chunkId = typeof evidence?.chunk_id === "string" ? evidence.chunk_id : undefined;

    if (!quote || quote.length < 10) {
      results[name] = {
        status: "yellow",
        reasons: ["no_evidence_quote"],
        page_number: pageNumber,
        chunk_id: chunkId,
      };
      yellow++;
      continue;
    }

    const { text: chunkText } = getChunkTextForEvidence(
      evidence,
      chunksByDoc,
      defaultDocumentId,
    );
    const integrityScore = chunkText
      ? (() => {
        const normalizedQuote = normalizeForMatching(quote);
        const normalizedChunk = normalizeForMatching(chunkText);
        if (normalizedQuote && normalizedChunk && normalizedChunk.includes(normalizedQuote)) {
          return 1;
        }
        return wordOverlapScore(quote, chunkText);
      })()
      : 0;

    if (integrityScore < 0.35) {
      results[name] = {
        status: "red",
        reasons: ["quote_integrity_failed"],
        page_number: pageNumber,
        chunk_id: chunkId,
        integrity_score: integrityScore,
      };
      red++;
      continue;
    }

    let anchorOk = true;
    let strong = false;
    const reasons = [];
    if (name === "notice_period_days") {
      const result = anchorsInteger(quote, variable.value, "days");
      anchorOk = result.ok;
      strong = result.strong;
      if (result.reason) reasons.push(result.reason);
    } else if (name === "term_length_months") {
      const result = anchorsInteger(quote, variable.value, "months");
      anchorOk = result.ok;
      strong = result.strong;
      if (result.reason) reasons.push(result.reason);
    } else if (name === "effective_date" || name === "end_date") {
      const result = anchorsDate(quote, variable.value);
      anchorOk = result.ok;
      strong = result.strong;
      if (result.reason) reasons.push(result.reason);
    } else if (name === "auto_renewal" || name === "termination_for_convenience") {
      const result = anchorsBoolean(quote, variable.value, name);
      if (result.contradicts) {
        anchorOk = false;
        strong = false;
        reasons.push("boolean_contradiction");
      } else {
        anchorOk = result.ok;
        strong = result.strong;
        if (result.ok && !result.strong) reasons.push("weak_boolean_anchor");
        if (!result.ok) reasons.push("boolean_not_anchored");
      }
    } else {
      reasons.push("unhandled_variable");
    }

    const status = strong && anchorOk ? "green" : "yellow";
    if (status === "green") green++;
    else yellow++;
    results[name] = {
      status,
      reasons,
      page_number: pageNumber,
      chunk_id: chunkId,
      integrity_score: integrityScore,
    };
  }

  return {
    version: "v1",
    checked_variables: [...VERIFIER_TARGET_VARIABLES],
    results,
    summary: { green, yellow, red },
  };
}

function enrichSnapshotWithVerifier(snapshotJson, verifier) {
  const vars = Array.isArray(snapshotJson?.variables) ? snapshotJson.variables : [];
  const results = verifier?.results || {};
  return {
    ...snapshotJson,
    variables: vars.map((variable) => {
      const name = String(variable?.name || "");
      if (!name || !(name in results)) return variable;
      return {
        ...variable,
        verifier: {
          status: results[name]?.status,
          reasons: results[name]?.reasons || [],
          ...(results[name]?.semantic
            ? {
              semantic: {
                status: results[name].semantic?.status,
                support_span: results[name].semantic?.support_span,
                counter_span: results[name].semantic?.counter_span,
                explanation: results[name].semantic?.explanation,
              },
            }
            : {}),
          ...(results[name]?.judge
            ? {
              judge: {
                status: results[name].judge?.status,
                support_span: results[name].judge?.support_span,
                counter_span: results[name].judge?.counter_span,
                explanation: results[name].judge?.explanation,
              },
            }
            : {}),
        },
      };
    }),
  };
}

function clipForVerifierContext(text, maxChars) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  return normalized.length <= maxChars ? normalized : normalized.slice(0, maxChars);
}

async function llmSemanticVerify({
  providerOverride,
  model,
  variableName,
  extractedValue,
  quote,
  context,
  requestId,
}) {
  const system =
    "You are an adversarial verifier for an evidence-grade contract extraction system.\n" +
    "Your job: determine whether the QUOTE (and surrounding CONTEXT) supports the extracted claim.\n" +
    "Be strict. If ambiguous, return yellow.\n\n" +
    "Return ONLY JSON with this schema:\n" +
    "{\n" +
    '  "status": "green"|"yellow"|"red",\n' +
    '  "support_span": "verbatim substring that proves it (optional)",\n' +
    '  "counter_span": "verbatim substring that contradicts it (optional)",\n' +
    '  "explanation": "brief reason"\n' +
    "}\n";

  const json = await createChatCompletion({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ variableName, extractedValue, quote, context }) },
    ],
    temperature: 0,
    max_tokens: 450,
    response_format: { type: "json_object" },
  }, {
    providerOverride,
    requestId,
  });

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    return { status: "yellow", explanation: "no_response_content", provider: providerOverride, model };
  }

  try {
    const parsed = safeJsonParseQuiet(content);
    return {
      status: parsed?.status === "green" || parsed?.status === "red" ? parsed.status : "yellow",
      support_span: typeof parsed?.support_span === "string" ? parsed.support_span.slice(0, 220) : undefined,
      counter_span: typeof parsed?.counter_span === "string" ? parsed.counter_span.slice(0, 220) : undefined,
      explanation: typeof parsed?.explanation === "string" ? parsed.explanation.slice(0, 400) : undefined,
      provider: providerOverride,
      model,
    };
  } catch (error) {
    return {
      status: "yellow",
      explanation: `parse_error_${error?.message || "unknown"}`.slice(0, 400),
      provider: providerOverride,
      model,
    };
  }
}

async function runSemanticVerifierForTargetVariables({
  snapshotJson,
  verifier,
  chunksByDoc,
  defaultDocumentId,
  requestId,
}) {
  const verifierConfig = getAIStageConfig("verifier");
  const providerOverride = verifierConfig.providerOverride || "openai";
  const model = verifierConfig.model || "gpt-5.2";
  const vars = Array.isArray(snapshotJson?.variables) ? snapshotJson.variables : [];
  const byName = new Map(vars.map((variable) => [String(variable?.name || ""), variable]));
  const nextResults = { ...(verifier?.results || {}) };

  for (const name of VERIFIER_TARGET_VARIABLES) {
    const result = nextResults[name];
    if (!result || result.status !== "yellow") continue;
    const variable = byName.get(name);
    const evidence = variable?.evidence;
    const quote = typeof evidence?.snippet === "string" ? evidence.snippet : "";
    if (!quote || quote.length < 10) continue;
    if (typeof result.integrity_score === "number" && result.integrity_score < 0.35) continue;
    const { text: chunkText } = getChunkTextForEvidence(evidence, chunksByDoc, defaultDocumentId);
    const semantic = await llmSemanticVerify({
      providerOverride,
      model,
      variableName: name,
      extractedValue: variable?.value,
      quote: String(quote).slice(0, 220),
      context: clipForVerifierContext(chunkText || "", 1600),
      requestId,
    });
    const reasons = Array.isArray(result.reasons) ? [...result.reasons] : [];
    if (semantic.status === "green") reasons.push("semantic_green");
    if (semantic.status === "red") reasons.push("semantic_red");
    nextResults[name] = { ...result, status: semantic.status, reasons, semantic };
  }

  let green = 0;
  let yellow = 0;
  let red = 0;
  for (const value of Object.values(nextResults)) {
    if (value.status === "green") green++;
    else if (value.status === "red") red++;
    else yellow++;
  }
  return { ...verifier, results: nextResults, summary: { green, yellow, red } };
}

async function runJudgeForTargetVariables({
  snapshotJson,
  verifier,
  chunksByDoc,
  defaultDocumentId,
  requestId,
}) {
  const judgeConfig = getAIStageConfig("judge");
  const providerOverride = judgeConfig.providerOverride || "vertex";
  const model = judgeConfig.model || String(process.env.OPENAI_CONTRACT_MODEL || "gpt-5.2").trim();
  const vars = Array.isArray(snapshotJson?.variables) ? snapshotJson.variables : [];
  const byName = new Map(vars.map((variable) => [String(variable?.name || ""), variable]));
  const nextResults = { ...(verifier?.results || {}) };

  for (const name of VERIFIER_TARGET_VARIABLES) {
    const result = nextResults[name];
    if (!result || result.status !== "yellow") continue;
    const variable = byName.get(name);
    const evidence = variable?.evidence;
    const quote = typeof evidence?.snippet === "string" ? evidence.snippet : "";
    if (!quote || quote.length < 10) continue;
    const { text: chunkText } = getChunkTextForEvidence(evidence, chunksByDoc, defaultDocumentId);
    const judged = await llmSemanticVerify({
      providerOverride,
      model,
      variableName: name,
      extractedValue: variable?.value,
      quote: String(quote).slice(0, 220),
      context: clipForVerifierContext(chunkText || "", 1600),
      requestId,
    });
    const reasons = Array.isArray(result.reasons) ? [...result.reasons] : [];
    reasons.push("judge_invoked");
    if (judged.status === "green") reasons.push("judge_green");
    if (judged.status === "red") reasons.push("judge_red");
    nextResults[name] = { ...result, status: judged.status, reasons, judge: judged };
  }

  let green = 0;
  let yellow = 0;
  let red = 0;
  for (const value of Object.values(nextResults)) {
    if (value.status === "green") green++;
    else if (value.status === "red") red++;
    else yellow++;
  }
  return { ...verifier, results: nextResults, summary: { green, yellow, red } };
}

const LEGACY_COMPAT_CONTRACT_TEMPLATES = new Set([
  "contract_analysis",
  "renewal_pack",
  "lease_pack",
  "amendment_conflict_review",
  "obligations_tracker",
  "playbook_compliance_review",
]);

function asObjectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asStringClean(value) {
  return String(value ?? "").trim();
}

function toRecordStatus(value) {
  const normalized = asStringClean(value).toLowerCase();
  if (normalized === "confirmed") return "confirmed";
  if (normalized === "rejected") return "rejected";
  if (normalized === "resolved") return "resolved";
  return "proposed";
}

function normalizeRecordEvidenceArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const page = typeof item.page_number === "number" ? item.page_number : undefined;
      const snippet = asStringClean(item.snippet || item.source_quote);
      if (!page || !snippet) return null;
      return {
        page_number: page,
        chunk_id: asStringClean(item.chunk_id) || undefined,
        bbox: item.bbox ?? null,
        snippet,
        source_quote: asStringClean(item.source_quote || item.snippet) || snippet,
        document_id: asStringClean(item.document_id) || undefined,
      };
    })
    .filter(Boolean);
}

function getPrimaryEvidenceFromRecord(record) {
  const evidence = normalizeRecordEvidenceArray(record?.evidence);
  if (!evidence.length) return null;
  const first = evidence[0];
  return {
    page_number: typeof first.page_number === "number" ? first.page_number : undefined,
    chunk_id: asStringClean(first.chunk_id) || undefined,
    bbox: first.bbox ?? null,
    snippet: asStringClean(first.snippet || first.source_quote),
    document_id: asStringClean(first.document_id) || undefined,
  };
}

function riskLevelToSeverity(level) {
  const normalized = asStringClean(level).toLowerCase();
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  return "low";
}

function severityToRiskLevel(level) {
  const normalized = asStringClean(level).toLowerCase();
  if (normalized === "critical" || normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  return "low";
}

function classifyRecordForLegacy(record) {
  const recordType = asStringClean(record?.record_type).toLowerCase();
  const fields = asObjectOrEmpty(record?.fields);
  if (
    recordType.includes("clause") ||
    (asStringClean(fields.clause_type) && asStringClean(fields.text || record?.summary))
  ) return "clause";
  if (
    recordType.includes("obligation") ||
    recordType.includes("deadline") ||
    asStringClean(fields.obligation_type) ||
    asStringClean(fields.due_at)
  ) return "obligation";
  if (
    recordType.includes("risk") ||
    recordType.includes("flag") ||
    recordType.includes("issue") ||
    asStringClean(fields.description)
  ) return "risk";
  return null;
}

function deriveV3RecordsFromLegacy(snapshotJson) {
  const now = new Date().toISOString();
  const records = [];
  const clauses = Array.isArray(snapshotJson?.clauses) ? snapshotJson.clauses : [];
  const obligations = Array.isArray(snapshotJson?.obligations) ? snapshotJson.obligations : [];
  const risks = Array.isArray(snapshotJson?.risks) ? snapshotJson.risks : [];

  for (const clause of clauses) {
    const id = asStringClean(clause?.id) || generateId();
    const text = asStringClean(clause?.text);
    if (!text) continue;
    records.push({
      id,
      record_type: "clause",
      title: asStringClean(clause?.clause_title || clause?.clause_type) || "Clause",
      summary: text,
      status: "proposed",
      severity: riskLevelToSeverity(clause?.risk_level),
      rationale: asStringClean(clause?.is_missing_standard_protection ? "missing_standard_protection" : ""),
      fields: {
        clause_type: asStringClean(clause?.clause_type) || "clause",
        clause_title: asStringClean(clause?.clause_title) || null,
        clause_number: asStringClean(clause?.clause_number) || null,
        text,
        risk_level: asStringClean(clause?.risk_level) || "low",
        is_missing_standard_protection: !!clause?.is_missing_standard_protection,
        verification_state: asStringClean(clause?.verification_state) || "extracted",
      },
      evidence: clause?.evidence ? [clause.evidence] : [],
      provenance: { origin: "ai", source: "legacy_projection", created_at: now, updated_at: now },
    });
  }

  for (const obligation of obligations) {
    const id = asStringClean(obligation?.id) || generateId();
    const summary = asStringClean(obligation?.summary || obligation?.action || obligation?.obligation_type);
    if (!summary) continue;
    records.push({
      id,
      record_type: "obligation",
      title: asStringClean(obligation?.obligation_type) || "Obligation",
      summary,
      status: "proposed",
      severity: asStringClean(obligation?.ai_confidence) === "low" ? "medium" : undefined,
      fields: {
        obligation_type: asStringClean(obligation?.obligation_type) || null,
        due_at: asStringClean(obligation?.due_at) || null,
        recurrence: asStringClean(obligation?.recurrence) || null,
        responsible_party: asStringClean(obligation?.responsible_party) || null,
        summary: asStringClean(obligation?.summary) || null,
        action: asStringClean(obligation?.action) || null,
        condition: asStringClean(obligation?.condition) || null,
        ai_confidence: asStringClean(obligation?.ai_confidence) || "medium",
        verification_state: asStringClean(obligation?.verification_state) || "extracted",
      },
      evidence: obligation?.evidence ? [obligation.evidence] : [],
      provenance: { origin: "ai", source: "legacy_projection", created_at: now, updated_at: now },
    });
  }

  for (const risk of risks) {
    const id = asStringClean(risk?.id) || generateId();
    const description = asStringClean(risk?.description);
    if (!description) continue;
    records.push({
      id,
      record_type: "risk",
      title: description.slice(0, 120),
      summary: asStringClean(risk?.explanation) || description,
      status: risk?.resolved ? "resolved" : "proposed",
      severity: asStringClean(risk?.severity) || "medium",
      fields: {
        description,
        explanation: asStringClean(risk?.explanation) || null,
        resolved: !!risk?.resolved,
      },
      evidence: risk?.evidence ? [risk.evidence] : [],
      provenance: { origin: "ai", source: "legacy_projection", created_at: now, updated_at: now },
    });
  }

  return records;
}

function deriveLegacyFromV3Records(records) {
  const clauses = [];
  const obligations = [];
  const risks = [];

  for (const record of records || []) {
    const kind = classifyRecordForLegacy(record);
    if (!kind) continue;
    const fields = asObjectOrEmpty(record?.fields);
    const evidence = getPrimaryEvidenceFromRecord(record);
    const id = asStringClean(record?.id) || generateId();

    if (kind === "clause") {
      const text = asStringClean(fields.text || record.summary || record.title);
      if (!text) continue;
      clauses.push({
        id,
        clause_type: asStringClean(fields.clause_type || record.title) || "clause",
        clause_title: asStringClean(fields.clause_title || record.title) || null,
        clause_number: asStringClean(fields.clause_number) || null,
        text,
        risk_level: severityToRiskLevel(fields.risk_level || record.severity),
        is_missing_standard_protection: fields.is_missing_standard_protection === true,
        verification_state: "extracted",
        evidence,
      });
      continue;
    }

    if (kind === "obligation") {
      const summary = asStringClean(fields.summary || record.summary);
      const action = asStringClean(fields.action);
      if (!summary && !action) continue;
      const ai = asStringClean(fields.ai_confidence).toLowerCase();
      obligations.push({
        id,
        obligation_type: asStringClean(fields.obligation_type || record.title) || "other",
        due_at: asStringClean(fields.due_at) || null,
        recurrence: asStringClean(fields.recurrence) || null,
        responsible_party: asStringClean(fields.responsible_party) || null,
        summary: summary || null,
        action: action || null,
        condition: asStringClean(fields.condition) || null,
        verification_state: "extracted",
        ai_confidence: ai === "high" ? "high" : ai === "low" ? "low" : "medium",
        evidence,
      });
      continue;
    }

    const description = asStringClean(fields.description || record.title || record.summary);
    if (!description) continue;
    risks.push({
      id,
      severity: asStringClean(record.severity || fields.severity) || "medium",
      description,
      explanation: asStringClean(fields.explanation || record.summary) || null,
      evidence,
      resolved: record.status === "resolved" || fields.resolved === true,
    });
  }

  return { clauses, obligations, risks };
}

function harmonizeV3AndLegacySnapshot({ snapshotJson, templateId, enabledModules, analysisV3Enabled }) {
  if (!analysisV3Enabled) return snapshotJson;
  if (!LEGACY_COMPAT_CONTRACT_TEMPLATES.has(String(templateId || "").trim())) {
    return snapshotJson;
  }

  const pack = asObjectOrEmpty(snapshotJson?.pack);
  const recordsIn = Array.isArray(pack.records) ? pack.records : [];
  const derived = recordsIn.length > 0 ? recordsIn : deriveV3RecordsFromLegacy(snapshotJson);
  const deduped = new Map();
  for (const raw of derived) {
    const id = asStringClean(raw?.id) || generateId();
    if (deduped.has(id)) continue;
    deduped.set(id, {
      ...raw,
      id,
      record_type: asStringClean(raw?.record_type) || "record",
      title: asStringClean(raw?.title) || undefined,
      summary: asStringClean(raw?.summary) || undefined,
      status: toRecordStatus(raw?.status),
      severity: asStringClean(raw?.severity) || undefined,
      rationale: asStringClean(raw?.rationale) || undefined,
      fields: asObjectOrEmpty(raw?.fields),
      evidence: normalizeRecordEvidenceArray(raw?.evidence),
      provenance: asObjectOrEmpty(raw?.provenance),
    });
  }
  const records = Array.from(deduped.values());

  let next = {
    ...snapshotJson,
    pack: {
      ...pack,
      records,
    },
  };

  if (records.length > 0) {
    const legacy = deriveLegacyFromV3Records(records);
    const clausesExisting = Array.isArray(next?.clauses) ? next.clauses : [];
    const obligationsExisting = Array.isArray(next?.obligations) ? next.obligations : [];
    const risksExisting = Array.isArray(next?.risks) ? next.risks : [];
    const shouldHydrateClauses = enabledModules.has("clauses") && clausesExisting.length === 0 && legacy.clauses.length > 0;
    const shouldHydrateObligations = enabledModules.has("obligations") && obligationsExisting.length === 0 && legacy.obligations.length > 0;
    const shouldHydrateRisks = enabledModules.has("risks") && risksExisting.length === 0 && legacy.risks.length > 0;

    if (shouldHydrateClauses || shouldHydrateObligations || shouldHydrateRisks) {
      next = {
        ...next,
        clauses: shouldHydrateClauses ? legacy.clauses : clausesExisting,
        obligations: shouldHydrateObligations ? legacy.obligations : obligationsExisting,
        risks: shouldHydrateRisks ? legacy.risks : risksExisting,
      };
    }

    next = {
      ...next,
      pack: {
        ...(next.pack || {}),
        compatibility: {
          ...asObjectOrEmpty((next.pack || {}).compatibility),
          legacy_projection: {
            generated_at: new Date().toISOString(),
            source: recordsIn.length > 0 ? "records" : "legacy",
            records_count: records.length,
            hydrated_legacy: {
              clauses: shouldHydrateClauses,
              obligations: shouldHydrateObligations,
              risks: shouldHydrateRisks,
            },
          },
        },
      },
    };
  }

  return next;
}

function normalizeConflictValue(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "nan";
  return String(value).trim();
}

function computeVariableConflictDiscrepancies({
  candidates,
  templateId,
  chunksByDoc,
  primaryDocumentId,
  precedencePolicy,
}) {
  const allowed = new Set(getTemplateDefinition(templateId).variables_allowed.map((item) => item.name));
  allowed.delete("notice_deadline");
  const byName = new Map();
  for (const candidate of candidates || []) {
    const name = String(candidate?.name || "").trim();
    if (!name || !allowed.has(name)) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(candidate);
  }

  const now = new Date().toISOString();
  const discrepancies = [];
  const conflictNames = new Set();
  for (const [name, items] of byName.entries()) {
    const groups = new Map();
    for (const item of items) {
      const docId = typeof item.document_id === "string" ? String(item.document_id).toLowerCase() : "";
      if (!docId) continue;
      const key = normalizeConflictValue(item.value);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const distinctValues = Array.from(groups.keys()).filter((key) => key !== "null");
    if (distinctValues.length <= 1) continue;
    conflictNames.add(name);
    discrepancies.push({
      id: generateId(),
      kind: "variable_conflict",
      variable_name: name,
      precedence_policy: precedencePolicy,
      values: distinctValues.slice(0, 6).map((key) => {
        const candidate = groups.get(key)?.[0];
        const docId = String(candidate?.document_id || "").toLowerCase();
        return {
          candidate_id: candidate?.candidate_id ?? null,
          document_id: docId,
          value: candidate?.value ?? null,
          ai_confidence: candidate?.ai_confidence ?? "medium",
          evidence: resolveEvidence(
            candidate?.source_quote,
            candidate?.page_number,
            chunksByDoc,
            docId,
            primaryDocumentId,
            String(candidate?.value ?? "").trim(),
          ),
        };
      }),
      created_at: now,
    });
  }

  return { conflictNames, discrepancies };
}

function parseNumberLike(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compareValues(left, right, operator) {
  const leftN = parseNumberLike(left);
  const rightN = parseNumberLike(right);
  const op = String(operator || "").trim();
  if (leftN !== null && rightN !== null) {
    if (op === "<=") return leftN <= rightN;
    if (op === ">=") return leftN >= rightN;
    if (op === "<") return leftN < rightN;
    if (op === ">") return leftN > rightN;
  }
  const leftS = String(left ?? "").trim();
  const rightS = String(right ?? "").trim();
  if (!leftS && !rightS) return null;
  if (op === "==" || op === "=") return leftS === rightS;
  if (op === "!=") return leftS !== rightS;
  return null;
}

function computePlaybookExceptions({ snapshotJson, templateId, verifier, playbookSpec }) {
  const def = getTemplateDefinition(templateId);
  const vars = Array.isArray(snapshotJson?.variables) ? snapshotJson.variables : [];
  const byName = new Map(vars.map((variable) => [String(variable?.name || "").trim(), variable]));
  const now = new Date().toISOString();
  const exceptions = [];
  const specVars = Array.isArray(playbookSpec?.variables) ? playbookSpec.variables : null;
  const specChecks = Array.isArray(playbookSpec?.checks) ? playbookSpec.checks : null;

  if (specVars) {
    for (const variableDef of specVars) {
      if (!variableDef || typeof variableDef !== "object" || variableDef.required !== true) continue;
      const key = String(variableDef.key || "").trim();
      if (!key) continue;
      const variable = byName.get(key);
      const hasValue = variable && variable.value !== null && variable.value !== undefined &&
        String(variable.value).trim() !== "";
      if (!hasValue) {
        exceptions.push({
          id: generateId(),
          type: "missing_required",
          severity: "blocker",
          message: `Missing required variable: ${key}`,
          variable_name: key,
          variable_id: variable?.id,
          created_at: now,
        });
      }
    }
  } else {
    for (const variableDef of def.variables_allowed || []) {
      if (!variableDef.required) continue;
      const variable = byName.get(variableDef.name);
      const hasValue = variable && variable.value !== null && variable.value !== undefined &&
        String(variable.value).trim() !== "";
      if (!hasValue) {
        exceptions.push({
          id: generateId(),
          type: "missing_required",
          severity: "blocker",
          message: `Missing required variable: ${variableDef.display_name || variableDef.name}`,
          variable_name: variableDef.name,
          variable_id: variable?.id,
          created_at: now,
        });
      }
    }
  }

  const checksToRun = specChecks ?? def.checks ?? [];
  for (const check of checksToRun) {
    if (!check || typeof check !== "object") continue;
    const severity = check.severity === "blocker" ? "blocker" : "warning";
    const variableKey = String(check.variable_key || check.variable_name || "").trim();
    const variable = byName.get(variableKey);

    if (check.type === "required") {
      const hasValue = variable && variable.value !== null && variable.value !== undefined &&
        String(variable.value).trim() !== "";
      if (!hasValue) {
        exceptions.push({
          id: generateId(),
          type: "check_failed",
          severity,
          message: `Required check failed: ${variableKey}`,
          variable_name: variableKey,
          variable_id: variable?.id,
          created_at: now,
        });
      }
      continue;
    }

    if (!variable) continue;
    if (check.type === "range") {
      const number = parseNumberLike(variable.value);
      if (number === null) continue;
      const min = typeof check.min === "number" ? check.min : undefined;
      const max = typeof check.max === "number" ? check.max : undefined;
      if ((min !== undefined && number < min) || (max !== undefined && number > max)) {
        exceptions.push({
          id: generateId(),
          type: "check_failed",
          severity,
          message: `Range check failed for ${variableKey}: ${number}${min !== undefined ? ` < ${min}` : ""}${max !== undefined ? ` > ${max}` : ""}`,
          variable_name: variableKey,
          variable_id: variable?.id,
          created_at: now,
        });
      }
      continue;
    }

    if (check.type === "enum") {
      const allowed = Array.isArray(check.allowed_values)
        ? check.allowed_values.map((item) => String(item))
        : [];
      const value = String(variable.value ?? "");
      if (value && allowed.length && !allowed.includes(value)) {
        exceptions.push({
          id: generateId(),
          type: "check_failed",
          severity,
          message: `Enum check failed for ${variableKey}: "${value}" not in [${allowed.join(", ")}]`,
          variable_name: variableKey,
          variable_id: variable?.id,
          created_at: now,
        });
      }
    }
  }

  if (verifier?.results) {
    for (const [name, result] of Object.entries(verifier.results)) {
      const variable = byName.get(name);
      if (result?.status === "red") {
        exceptions.push({
          id: generateId(),
          type: "verifier_red",
          severity: "blocker",
          message: `Verifier red: ${name} (${(result.reasons || []).join(", ") || "unsupported"})`,
          variable_name: name,
          variable_id: variable?.id,
          created_at: now,
        });
      } else if (result?.status === "yellow") {
        exceptions.push({
          id: generateId(),
          type: "verifier_yellow",
          severity: "warning",
          message: `Verifier yellow: ${name} (${(result.reasons || []).join(", ") || "needs_review"})`,
          variable_name: name,
          variable_id: variable?.id,
          created_at: now,
        });
      }
    }
  }

  return {
    exceptions,
    summary: exceptions.reduce((acc, exception) => {
      if (exception.severity === "blocker") acc.blocker++;
      else acc.warning++;
      return acc;
    }, { blocker: 0, warning: 0 }),
  };
}

function computeAnalysisV3Verdicts({ playbookSpec, snapshotJson, verifier }) {
  const rules = Array.isArray(playbookSpec?.rules) ? playbookSpec.rules.slice(0, 120) : [];
  if (!rules.length) return { rules: [], verdicts: [], exceptions: [] };
  const now = new Date().toISOString();
  const vars = Array.isArray(snapshotJson?.variables) ? snapshotJson.variables : [];
  const byName = new Map(vars.map((variable) => [String(variable?.name || "").trim(), variable]));
  const verdicts = [];
  const exceptions = [];

  for (const rawRule of rules) {
    const rule = rawRule && typeof rawRule === "object" ? rawRule : null;
    if (!rule) continue;
    const ruleId = String(rule.id || "").trim() || generateId();
    const type = String(rule.type || "").trim();
    const severity = rule?.severity === "blocker" ? "blocker" : "warning";
    let status = "uncertain";
    let explanation = "";

    if (type === "required") {
      const key = String(rule.variable_key || rule.variable_name || "").trim();
      const variable = byName.get(key);
      const hasValue = variable && variable.value !== null && variable.value !== undefined &&
        String(variable.value).trim() !== "";
      status = hasValue ? "pass" : "fail";
      explanation = hasValue ? `Required variable present: ${key}` : `Missing required variable: ${key}`;
    } else if (type === "range") {
      const key = String(rule.variable_key || rule.variable_name || "").trim();
      const variable = byName.get(key);
      const number = parseNumberLike(variable?.value);
      if (number === null) {
        status = "uncertain";
        explanation = `Range check skipped (non-numeric): ${key}`;
      } else {
        const min = typeof rule.min === "number" ? rule.min : undefined;
        const max = typeof rule.max === "number" ? rule.max : undefined;
        const passed = (min === undefined || number >= min) && (max === undefined || number <= max);
        status = passed ? "pass" : "fail";
        explanation = passed
          ? `Range check passed: ${key}`
          : `Range check failed: ${key}=${number}${min !== undefined ? ` min=${min}` : ""}${max !== undefined ? ` max=${max}` : ""}`;
      }
    } else if (type === "enum") {
      const key = String(rule.variable_key || rule.variable_name || "").trim();
      const variable = byName.get(key);
      const allowed = Array.isArray(rule.allowed_values) ? rule.allowed_values.map((item) => String(item)) : [];
      const value = String(variable?.value ?? "").trim();
      if (!value || !allowed.length) {
        status = "uncertain";
        explanation = `Enum check skipped: ${key}`;
      } else {
        status = allowed.includes(value) ? "pass" : "fail";
        explanation = status === "pass" ? `Enum check passed: ${key}` : `Enum check failed: ${key}="${value}"`;
      }
    } else if (type === "compare") {
      const leftKey = String(rule.left_variable_key || rule.left || "").trim();
      const rightKey = String(rule.right_variable_key || rule.right || "").trim();
      const operator = String(rule.operator || "<=").trim();
      const result = compareValues(byName.get(leftKey)?.value, byName.get(rightKey)?.value, operator);
      if (result === null) {
        status = "uncertain";
        explanation = `Compare rule unresolved: ${leftKey} ${operator} ${rightKey}`;
      } else {
        status = result ? "pass" : "fail";
        explanation = result
          ? `Compare rule passed: ${leftKey} ${operator} ${rightKey}`
          : `Compare rule failed: ${leftKey} ${operator} ${rightKey}`;
      }
    } else if (type === "semantic_conflict") {
      status = "uncertain";
      explanation = "Semantic rule requires verifier pass";
    } else if (type === "verifier_status") {
      const key = String(rule.variable_key || "").trim();
      const expected = String(rule.expected || "green").trim().toLowerCase();
      const actual = String(verifier?.results?.[key]?.status || "").trim().toLowerCase();
      if (!actual) {
        status = "uncertain";
        explanation = `Verifier status unavailable for ${key}`;
      } else {
        status = actual === expected ? "pass" : "fail";
        explanation = `Verifier status for ${key}: expected=${expected} got=${actual}`;
      }
    } else {
      explanation = `Unsupported rule type: ${type || "unknown"}`;
    }

    verdicts.push({
      id: generateId(),
      rule_id: ruleId,
      status,
      severity,
      explanation,
      confidence: status === "uncertain" ? "low" : "high",
      evidence: [],
    });

    if (status === "fail" || status === "uncertain") {
      exceptions.push({
        id: generateId(),
        kind: "analysis_v3_rule",
        rule_id: ruleId,
        severity: status === "fail" ? severity : "warning",
        status,
        message: explanation,
        created_at: now,
      });
    }
  }

  return { rules, verdicts, exceptions };
}

function asUuidOrRandom(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(normalized)
  ) {
    return normalized;
  }
  return crypto.randomUUID();
}

function asStringOrNull(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function asNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function applyModuleOutputsToSnapshot({
  snapshotJson,
  moduleOutputs,
  chunksByDoc,
  primaryDocumentId,
}) {
  let next = snapshotJson;
  const byId = new Map();
  for (const output of moduleOutputs || []) {
    const id = String(output?.id || "").trim();
    if (id) byId.set(id, output);
  }

  const variablesModule = byId.get("variables");
  if (variablesModule?.status === "ok") {
    const rows = Array.isArray(variablesModule.result?.variables)
      ? variablesModule.result.variables
      : [];
    if (rows.length) {
      next = {
        ...next,
        variables: rows.slice(0, 50).map((row) => {
          const name = asStringOrNull(row?.name) || "";
          const value = row?.value ?? null;
          const docId = asStringOrNull(row?.document_id) || primaryDocumentId;
          return {
            id: generateId(),
            name,
            type: asStringOrNull(row?.type) || "text",
            value,
            unit: asStringOrNull(row?.unit),
            display_name: asStringOrNull(row?.display_name) ||
              asStringOrNull(row?.displayName) ||
              name,
            verification_state: "extracted",
            ai_confidence: row?.ai_confidence === "high"
              ? "high"
              : row?.ai_confidence === "low"
              ? "low"
              : "medium",
            evidence: resolveEvidence(
              asStringOrNull(row?.source_quote),
              asNumberOrNull(row?.page_number),
              chunksByDoc,
              docId,
              primaryDocumentId,
              String(value ?? "").trim(),
            ),
          };
        }).filter((row) => !!String(row?.name || "").trim()),
      };
    }
  }

  const clausesModule = byId.get("clauses");
  if (clausesModule?.status === "ok") {
    const rows = Array.isArray(clausesModule.result?.clauses)
      ? clausesModule.result.clauses
      : [];
    if (rows.length) {
      next = {
        ...next,
        clauses: rows.slice(0, 80).map((row) => {
          const text = asStringOrNull(row?.text) || "";
          const docId = asStringOrNull(row?.document_id) || primaryDocumentId;
          return {
            id: generateId(),
            clause_type: asStringOrNull(row?.clause_type) || "clause",
            clause_title: asStringOrNull(row?.clause_title),
            clause_number: asStringOrNull(row?.clause_number),
            text,
            risk_level: asStringOrNull(row?.risk_level),
            is_missing_standard_protection: asBoolOrNull(row?.is_missing_standard_protection) ?? false,
            verification_state: "extracted",
            evidence: resolveEvidence(
              asStringOrNull(row?.source_quote),
              asNumberOrNull(row?.page_number),
              chunksByDoc,
              docId,
              primaryDocumentId,
              text,
            ),
          };
        }).filter((row) => !!String(row?.text || "").trim()),
      };
    }
  }

  const obligationsModule = byId.get("obligations");
  if (obligationsModule?.status === "ok") {
    const rows = Array.isArray(obligationsModule.result?.obligations)
      ? obligationsModule.result.obligations
      : [];
    if (rows.length) {
      next = {
        ...next,
        obligations: rows.slice(0, 120).map((row) => {
          const docId = asStringOrNull(row?.document_id) || primaryDocumentId;
          const summary = asStringOrNull(row?.summary);
          const action = asStringOrNull(row?.action);
          return {
            id: generateId(),
            obligation_type: asStringOrNull(row?.obligation_type) || "general_obligation",
            due_at: asStringOrNull(row?.due_at),
            recurrence: asStringOrNull(row?.recurrence),
            responsible_party: asStringOrNull(row?.responsible_party),
            summary,
            action,
            condition: asStringOrNull(row?.condition),
            verification_state: "extracted",
            ai_confidence: row?.ai_confidence === "high"
              ? "high"
              : row?.ai_confidence === "low"
              ? "low"
              : "medium",
            evidence: resolveEvidence(
              asStringOrNull(row?.source_quote),
              asNumberOrNull(row?.page_number),
              chunksByDoc,
              docId,
              primaryDocumentId,
              summary || action || "",
            ),
          };
        }).filter((row) =>
          !!String(row?.summary || row?.action || row?.obligation_type || "").trim()
        ),
      };
    }
  }

  const risksModule = byId.get("risks");
  if (risksModule?.status === "ok") {
    const rows = Array.isArray(risksModule.result?.risks)
      ? risksModule.result.risks
      : [];
    if (rows.length) {
      next = {
        ...next,
        risks: rows.slice(0, 80).map((row) => {
          const description = asStringOrNull(row?.description) || "";
          const docId = asStringOrNull(row?.document_id) || primaryDocumentId;
          return {
            id: generateId(),
            severity: asStringOrNull(row?.severity),
            description,
            explanation: asStringOrNull(row?.explanation),
            evidence: resolveEvidence(
              asStringOrNull(row?.source_quote),
              asNumberOrNull(row?.page_number),
              chunksByDoc,
              docId,
              primaryDocumentId,
              description,
            ),
            resolved: false,
          };
        }).filter((row) => !!String(row?.description || "").trim()),
      };
    }
  }

  return next;
}

function normalizeModulesV2(playbookSpec) {
  const raw = Array.isArray(playbookSpec?.modules_v2) ? playbookSpec.modules_v2 : [];
  const outputs = [];
  const seen = new Set();
  for (const item of raw.slice(0, 20)) {
    const id = String(item?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    outputs.push({
      id,
      title: String(item?.title || id).trim() || id,
      prompt: String(item?.prompt || ""),
      json_schema: item?.json_schema && typeof item.json_schema === "object" && !Array.isArray(item.json_schema)
        ? item.json_schema
        : {},
      enabled: item?.enabled === false ? false : true,
      show_in_report: item?.show_in_report === true,
    });
  }
  return outputs;
}

function buildCustomModulesDocumentText(chunks, maxCharsPerPage, maxTotalChars) {
  const byDoc = new Map();
  for (const chunk of chunks || []) {
    const docId = String(chunk?.document_id || "").toLowerCase() || "unknown";
    if (!byDoc.has(docId)) byDoc.set(docId, new Map());
    const pages = byDoc.get(docId);
    if (!pages.has(chunk.page_number)) pages.set(chunk.page_number, []);
    pages.get(chunk.page_number).push(String(chunk.content_text || ""));
  }

  const docIds = Array.from(byDoc.keys()).sort();
  const sections = [];
  let total = 0;
  for (const docId of docIds) {
    const pages = byDoc.get(docId);
    const docHeader = `\n\n[Document ${docId}]`;
    if (total + docHeader.length > maxTotalChars) break;
    sections.push(docHeader);
    total += docHeader.length;
    for (const page of Array.from(pages.keys()).sort((a, b) => a - b)) {
      const body = (pages.get(page) || []).join("\n").trim();
      if (!body) continue;
      const clipped = body.slice(0, maxCharsPerPage).trim();
      const section = `\n\n[Page ${page}]\n${clipped}`;
      if (total + section.length > maxTotalChars) break;
      sections.push(section);
      total += section.length;
    }
  }
  return sections.join("").trim();
}

function sanitizeCustomModuleEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .slice(0, 8)
    .map((item) => {
      const page = typeof item?.page_number === "number" ? item.page_number : undefined;
      const quote = typeof item?.source_quote === "string" ? item.source_quote : "";
      if (!page || !quote.trim()) return null;
      return { page_number: page, source_quote: quote.trim().slice(0, 120) };
    })
    .filter(Boolean);
}

async function runCustomModules({ chunks, modules, language, workspaceId, requestId }) {
  const generatorConfig = getAIStageConfig("generator");
  const verifierConfig = getAIStageConfig("verifier");
  const model = generatorConfig.model;
  const languageName = humanLanguageName(language);
  const docText = buildCustomModulesDocumentText(chunks, 1600, 40000);
  if (!docText) return [];

  const outputs = [];
  for (const moduleDef of (modules || []).slice(0, 5)) {
    const id = String(moduleDef.id || "").trim();
    const title = String(moduleDef.title || "").trim();
    const prompt = String(moduleDef.prompt || "");
    const showInReport = moduleDef.show_in_report === true;
    if (!id || !title || !prompt || moduleDef.enabled === false) continue;
    const system =
      "You are an evidence-grade contract analyzer.\n" +
      "You will be given contract excerpts with page markers like [Page N].\n" +
      "Return JSON ONLY with this exact wrapper shape:\n" +
      "{\n" +
      '  "result": <MUST conform to the JSON Schema below>,\n' +
      '  "evidence": [{ "page_number": 1, "source_quote": "..." }],\n' +
      '  "ai_confidence": "low|medium|high"\n' +
      "}\n" +
      `MODULE:\n- id: ${id}\n- title: ${title}\n- prompt: ${prompt}\n` +
      (languageName
        ? `OUTPUT LANGUAGE:\n- Write all NON-EVIDENCE narrative text in ${languageName}.\n- Keep evidence quotes verbatim.\n`
        : "") +
      `JSON SCHEMA FOR result:\n${JSON.stringify(moduleDef.json_schema || {})}\n`;

    try {
      let json;
      try {
        json = await createChatCompletion({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: docText },
          ],
          temperature: 0,
          max_tokens: 2500,
          response_format: { type: "json_object" },
        }, {
          workspaceId,
          requestId,
          providerOverride: generatorConfig.providerOverride,
        });
      } catch {
        json = await createChatCompletion({
          model: verifierConfig.model || "gpt-5.2",
          messages: [
            { role: "system", content: system },
            { role: "user", content: docText },
          ],
          temperature: 0,
          max_tokens: 2500,
          response_format: { type: "json_object" },
        }, {
          workspaceId,
          requestId,
          providerOverride: "openai",
        });
      }

      const content = json?.choices?.[0]?.message?.content;
      if (!content) {
        outputs.push({ id, title, status: "error", error: "no_content", show_in_report: showInReport });
        continue;
      }
      const parsed = safeJsonParseQuiet(content);
      if (JSON.stringify(parsed).length > 20000) {
        outputs.push({ id, title, status: "error", error: "output_too_large", show_in_report: showInReport });
        continue;
      }
      outputs.push({
        id,
        title,
        status: "ok",
        result: parsed?.result ?? null,
        evidence: sanitizeCustomModuleEvidence(parsed?.evidence),
        ai_confidence: parsed?.ai_confidence === "high"
          ? "high"
          : parsed?.ai_confidence === "low"
          ? "low"
          : "medium",
        show_in_report: showInReport,
      });
    } catch (error) {
      outputs.push({
        id,
        title,
        status: "error",
        error: error?.message || "unknown_error",
        show_in_report: showInReport,
      });
    }
  }
  return outputs;
}

async function runModulesV2({ chunks, modules, language, workspaceId, requestId }) {
  const generatorConfig = getAIStageConfig("generator");
  const verifierConfig = getAIStageConfig("verifier");
  const model = generatorConfig.model;
  const languageName = humanLanguageName(language);
  const docText = buildCustomModulesDocumentText(chunks, 1600, 40000);
  if (!docText) return [];

  const outputs = [];
  for (const moduleDef of (modules || []).slice(0, 20)) {
    const id = String(moduleDef.id || "").trim();
    const title = String(moduleDef.title || "").trim();
    const prompt = String(moduleDef.prompt || "");
    const showInReport = moduleDef.show_in_report === true;
    if (!id || !title || !prompt || moduleDef.enabled === false) continue;

    const system =
      "You are an evidence-grade document analyzer.\n" +
      "You will be given excerpts with markers like [Document <id>] and [Page N].\n" +
      "Return JSON ONLY with this exact wrapper shape:\n" +
      "{\n" +
      '  "result": <MUST conform to the JSON Schema below>,\n' +
      '  "evidence": [{ "page_number": 1, "source_quote": "..." }],\n' +
      '  "ai_confidence": "low|medium|high"\n' +
      "}\n" +
      `MODULE:\n- id: ${id}\n- title: ${title}\n- prompt: ${prompt}\n` +
      (languageName
        ? `OUTPUT LANGUAGE:\n- Write all NON-EVIDENCE narrative text in ${languageName}.\n- Keep evidence quotes verbatim.\n`
        : "") +
      `JSON SCHEMA FOR result:\n${JSON.stringify(moduleDef.json_schema || {})}\n`;

    try {
      let json;
      try {
        json = await createChatCompletion({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: docText },
          ],
          temperature: 0,
          max_tokens: 2500,
          response_format: { type: "json_object" },
        }, {
          workspaceId,
          requestId,
          providerOverride: generatorConfig.providerOverride,
        });
      } catch {
        json = await createChatCompletion({
          model: verifierConfig.model || "gpt-5.2",
          messages: [
            { role: "system", content: system },
            { role: "user", content: docText },
          ],
          temperature: 0,
          max_tokens: 2500,
          response_format: { type: "json_object" },
        }, {
          workspaceId,
          requestId,
          providerOverride: "openai",
        });
      }
      const content = json?.choices?.[0]?.message?.content;
      if (!content) {
        outputs.push({ id, title, status: "error", error: "no_content", show_in_report: showInReport });
        continue;
      }
      const parsed = safeJsonParseQuiet(content);
      if (JSON.stringify(parsed).length > 40000) {
        outputs.push({ id, title, status: "error", error: "output_too_large", show_in_report: showInReport });
        continue;
      }
      outputs.push({
        id,
        title,
        status: "ok",
        result: parsed?.result ?? null,
        evidence: sanitizeCustomModuleEvidence(parsed?.evidence),
        ai_confidence: parsed?.ai_confidence === "high"
          ? "high"
          : parsed?.ai_confidence === "low"
          ? "low"
          : "medium",
        show_in_report: showInReport,
      });
    } catch (error) {
      outputs.push({
        id,
        title,
        status: "error",
        error: error?.message || "unknown_error",
        show_in_report: showInReport,
      });
    }
  }
  return outputs;
}

function pickVar(vars, name) {
  const item = (vars || []).find((candidate) => candidate.name === name);
  return item?.value ?? null;
}

function normalizeDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  const match = raw.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i,
  );
  if (!match) return null;
  const monthMap = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  return `${match[2]}-${monthMap[match[1].toLowerCase()]}-01`;
}

function normalizeContractType(value) {
  if (!value) return null;
  const lower = String(value).toLowerCase();
  if (lower.includes("master service") || lower.includes("msa")) return "MSA";
  if (lower.includes("non-disclosure") || lower.includes("nda") || lower.includes("confidential")) {
    return "NDA";
  }
  if (lower.includes("statement of work") || lower.includes("sow")) return "SOW";
  if (lower.includes("employment") || lower.includes("employee")) return "employment";
  if (lower.includes("lease") || lower.includes("rental")) return "lease";
  if (lower.includes("license")) return "license";
  if (lower.includes("service") || lower.includes("consulting")) return "services";
  if (lower.includes("partnership") || lower.includes("joint venture")) return "partnership";
  return "other";
}

function normalizeInteger(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isNaN(value)) return Math.floor(value);
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizeBoolean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    if (["true", "yes", "1"].includes(lower)) return true;
    if (["false", "no", "0"].includes(lower)) return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
}

export function shouldNativeReduceRun(parentRun, batchRuns) {
  if (!parentRun?.id) return { ok: false, reason: "missing_parent_run" };
  if (!Array.isArray(batchRuns) || batchRuns.length === 0) {
    return { ok: false, reason: "missing_batch_runs" };
  }
  return { ok: true, reason: "supported" };
}

function buildStageTrace({ totalBatches, completedBatches, verifierInvoked, rulesCount }) {
  return [
    {
      stage: "propose",
      status: completedBatches > 0 ? "completed" : "skipped",
      total_batches: totalBatches,
      completed_batches: completedBatches,
    },
    { stage: "normalize", status: "completed" },
    { stage: "retrieve", status: rulesCount > 0 ? "completed" : "skipped" },
    { stage: "verify", status: verifierInvoked ? "completed" : "skipped" },
    { stage: "decide", status: "completed" },
  ];
}

function computeEvidenceCoverage(snapshotJson) {
  let covered = 0;
  let total = 0;
  for (const key of ["variables", "clauses", "obligations", "risks"]) {
    const rows = Array.isArray(snapshotJson?.[key]) ? snapshotJson[key] : [];
    for (const row of rows) {
      total += 1;
      const evidence = row?.evidence;
      const ok = !!(
        evidence &&
        typeof evidence === "object" &&
        typeof evidence.page_number === "number" &&
        String(evidence.snippet || "").trim()
      );
      if (ok) covered += 1;
    }
  }
  return { covered, total, ratio: total > 0 ? covered / total : 1 };
}

async function upsertVerificationSnapshot({ supabase, parentRun, snapshotJson }) {
  const { data: existingVO } = await supabase
    .from("verification_objects")
    .select("*")
    .eq("document_id", parentRun.document_id)
    .eq("object_type", "contract_analysis")
    .maybeSingle();

  let verificationObjectId;
  let versionNumber;
  if (!existingVO) {
    const { data: newVO, error } = await supabase
      .from("verification_objects")
      .insert({
        workspace_id: parentRun.workspace_id,
        document_id: parentRun.document_id,
        user_id: parentRun.user_id,
        object_type: "contract_analysis",
        state: "provisional",
        visibility: "private",
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create verification object: ${error.message}`);
    verificationObjectId = newVO.id;
    versionNumber = 1;
  } else {
    verificationObjectId = existingVO.id;
    const { data: latestVersion } = await supabase
      .from("verification_object_versions")
      .select("version_number")
      .eq("verification_object_id", verificationObjectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    versionNumber = Number(latestVersion?.version_number || 0) + 1;
  }

  const { data: newVersion, error: versionError } = await supabase
    .from("verification_object_versions")
    .insert({
      verification_object_id: verificationObjectId,
      version_number: versionNumber,
      state: "provisional",
      snapshot_json: snapshotJson,
      change_notes: versionNumber === 1
        ? "Initial AI analysis (gcp native reduce)"
        : `Re-analysis (gcp native reduce v${versionNumber})`,
      created_by: parentRun.user_id,
    })
    .select("id")
    .single();
  if (versionError) throw new Error(`Failed to create version: ${versionError.message}`);

  await supabase
    .from("verification_objects")
    .update({ current_version_id: newVersion.id, state: "provisional" })
    .eq("id", verificationObjectId);

  return {
    verificationObjectId,
    versionId: newVersion.id,
    versionNumber,
  };
}

function actionAsString(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function actionAsInteger(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function normalizeActionEvidenceList(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence.filter((item) => item && typeof item === "object" && !Array.isArray(item));
}

function normalizeActionWorkflowState(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "needs_review") return "needs_review";
  if (raw === "verified" || raw === "finalized") return "confirmed";
  if (raw === "resolved") return "resolved";
  if (raw === "dismissed" || raw === "rejected") return "dismissed";
  return "extracted";
}

function normalizeActionKind(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw ? raw.replace(/\s+/g, "_") : "action";
}

function normalizeActionIsoDate(value) {
  const raw = actionAsString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function deterministicUuid(seed) {
  const hex = createHash("sha256").update(String(seed)).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16], 16) % 4];
  const normalized = hex.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

function getSnapshotVariableValue(snapshot, name) {
  const variables = Array.isArray(snapshot?.variables) ? snapshot.variables : [];
  const match = variables.find((variable) =>
    String(variable?.name || "").trim().toLowerCase() === String(name || "").trim().toLowerCase(),
  );
  return match?.value;
}

function getSnapshotVariableEvidence(snapshot, name) {
  const variables = Array.isArray(snapshot?.variables) ? snapshot.variables : [];
  const match = variables.find((variable) =>
    String(variable?.name || "").trim().toLowerCase() === String(name || "").trim().toLowerCase(),
  );
  return match?.evidence && typeof match.evidence === "object" && !Array.isArray(match.evidence)
    ? match.evidence
    : null;
}

function computeNoticeDeadlineIso(snapshot) {
  const explicit = normalizeActionIsoDate(getSnapshotVariableValue(snapshot, "notice_deadline"));
  if (explicit) return explicit;
  const endDateRaw = actionAsString(getSnapshotVariableValue(snapshot, "end_date"));
  const noticeDays = actionAsInteger(getSnapshotVariableValue(snapshot, "notice_period_days"));
  if (!endDateRaw || noticeDays == null) return null;
  const endDate = new Date(endDateRaw);
  if (Number.isNaN(endDate.getTime())) return null;
  endDate.setUTCDate(endDate.getUTCDate() - noticeDays);
  return endDate.toISOString();
}

function buildRecordDerivedActionRow(record, { workspaceId, documentId, verificationObjectId, versionId }) {
  const fields = record?.fields && typeof record.fields === "object" && !Array.isArray(record.fields)
    ? record.fields
    : {};
  const dueAt = normalizeActionIsoDate(fields.due_at ?? fields.due_date ?? fields.deadline_at);
  const id = actionAsString(record?.id);
  if (!dueAt || !id) return null;
  const evidenceJson = normalizeActionEvidenceList(record?.evidence);
  const primaryEvidence = evidenceJson[0] || null;
  return {
    id,
    workspace_id: workspaceId,
    document_id: documentId,
    verification_object_id: verificationObjectId,
    version_id: versionId || null,
    source_record_id: id,
    action_kind: normalizeActionKind(fields.action_kind ?? record?.record_type ?? "action"),
    title: actionAsString(record?.title) ?? actionAsString(fields.title) ?? null,
    summary: actionAsString(record?.summary) ?? actionAsString(fields.summary) ?? null,
    action_text: actionAsString(fields.action_text) ?? actionAsString(fields.action) ?? null,
    condition_text: actionAsString(fields.condition_text) ?? actionAsString(fields.condition) ?? null,
    responsible_party: actionAsString(fields.responsible_party) ?? actionAsString(fields.owner) ?? null,
    due_at: dueAt,
    recurrence: actionAsString(fields.recurrence),
    workflow_state: normalizeActionWorkflowState(fields.workflow_state ?? record?.status),
    task_id: actionAsString(fields.task_id),
    primary_page_number: actionAsInteger(fields.primary_page_number ?? primaryEvidence?.page_number),
    evidence_document_id: actionAsString(fields.evidence_document_id ?? primaryEvidence?.document_id),
    evidence_json: evidenceJson,
    metadata_json: {
      source: "analysis_record",
      record_type: actionAsString(record?.record_type),
      severity: actionAsString(record?.severity),
      ...fields,
    },
    provenance_json: record?.provenance && typeof record.provenance === "object" && !Array.isArray(record.provenance)
      ? record.provenance
      : {},
  };
}

function buildObligationDerivedActionRow(obligation, { workspaceId, documentId, verificationObjectId, versionId }) {
  const id = actionAsString(obligation?.id);
  const dueAt = normalizeActionIsoDate(obligation?.due_at);
  if (!id || !dueAt) return null;
  const evidence = obligation?.evidence && typeof obligation.evidence === "object" && !Array.isArray(obligation.evidence)
    ? obligation.evidence
    : null;
  return {
    id,
    workspace_id: workspaceId,
    document_id: documentId,
    verification_object_id: verificationObjectId,
    version_id: versionId || null,
    source_record_id: null,
    action_kind: normalizeActionKind(obligation?.obligation_type || "obligation"),
    title: actionAsString(obligation?.summary) ?? actionAsString(obligation?.action) ?? actionAsString(obligation?.obligation_type) ?? "Obligation",
    summary: actionAsString(obligation?.summary),
    action_text: actionAsString(obligation?.action),
    condition_text: actionAsString(obligation?.condition),
    responsible_party: actionAsString(obligation?.responsible_party),
    due_at: dueAt,
    recurrence: actionAsString(obligation?.recurrence),
    workflow_state: normalizeActionWorkflowState(obligation?.verification_state),
    task_id: null,
    primary_page_number: actionAsInteger(evidence?.page_number),
    evidence_document_id: actionAsString(evidence?.document_id),
    evidence_json: evidence ? [evidence] : [],
    metadata_json: {
      source: "snapshot_obligation",
      obligation_type: actionAsString(obligation?.obligation_type),
      ai_confidence: actionAsString(obligation?.ai_confidence),
    },
    provenance_json: {},
  };
}

function buildNoticeDeadlineActionRow(snapshot, { workspaceId, documentId, verificationObjectId, versionId }) {
  const dueAt = computeNoticeDeadlineIso(snapshot);
  if (!dueAt) return null;
  const endDateEvidence = getSnapshotVariableEvidence(snapshot, "end_date");
  const noticeDays = actionAsInteger(getSnapshotVariableValue(snapshot, "notice_period_days"));
  return {
    id: deterministicUuid(`${verificationObjectId}:notice_deadline:${dueAt}`),
    workspace_id: workspaceId,
    document_id: documentId,
    verification_object_id: verificationObjectId,
    version_id: versionId || null,
    source_record_id: null,
    action_kind: "notice_deadline",
    title: "Notice Deadline",
    summary: noticeDays == null
      ? "Last day to provide notice"
      : `Last day to provide ${noticeDays}-day notice`,
    action_text: "Send non-renewal or termination notice before the deadline.",
    condition_text: null,
    responsible_party: null,
    due_at: dueAt,
    recurrence: null,
    workflow_state: "confirmed",
    task_id: null,
    primary_page_number: actionAsInteger(endDateEvidence?.page_number),
    evidence_document_id: actionAsString(endDateEvidence?.document_id),
    evidence_json: endDateEvidence ? [endDateEvidence] : [],
    metadata_json: {
      source: "computed_notice_deadline",
      variable_name: "notice_deadline",
      notice_period_days: noticeDays,
      computed_from: ["end_date", "notice_period_days"],
    },
    provenance_json: {
      origin: "system",
      computation: "end_date_minus_notice_period_days",
    },
  };
}

function buildAnalysisActionsFromSnapshot(snapshot, args) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const rows = [];
  const seenIds = new Set();
  const packRecords = Array.isArray(snapshot?.pack?.records) ? snapshot.pack.records : [];
  for (const record of packRecords) {
    const row = buildRecordDerivedActionRow(record, args);
    if (!row || seenIds.has(row.id)) continue;
    rows.push(row);
    seenIds.add(row.id);
  }
  const obligations = Array.isArray(snapshot?.obligations) ? snapshot.obligations : [];
  for (const obligation of obligations) {
    const row = buildObligationDerivedActionRow(obligation, args);
    if (!row || seenIds.has(row.id)) continue;
    rows.push(row);
    seenIds.add(row.id);
  }
  const noticeDeadline = buildNoticeDeadlineActionRow(snapshot, args);
  if (noticeDeadline && !seenIds.has(noticeDeadline.id)) {
    rows.push(noticeDeadline);
  }
  return rows.sort((a, b) => {
    const dueA = a.due_at || "";
    const dueB = b.due_at || "";
    if (dueA && dueB && dueA !== dueB) return dueA.localeCompare(dueB);
    return a.action_kind.localeCompare(b.action_kind);
  });
}

async function syncAnalysisActions({
  supabase,
  parentRun,
  snapshotJson,
  verificationObjectId,
  versionId,
}) {
  const workspaceId = normalizeUuid(parentRun.workspace_id);
  const documentId = normalizeUuid(parentRun.document_id);
  const rows = buildAnalysisActionsFromSnapshot(snapshotJson, {
    workspaceId,
    documentId,
    verificationObjectId,
    versionId,
  });
  await supabase.from("analysis_actions").delete().eq("verification_object_id", verificationObjectId);
  if (rows.length > 0) {
    await supabase.from("analysis_actions").insert(rows);
  }
  return rows;
}

async function syncAnalysisV3Projections({
  supabase,
  snapshotJson,
  verificationObjectId,
  workspaceId,
  documentId,
}) {
  const pack = snapshotJson?.pack || {};
  const records = Array.isArray(pack.records) ? pack.records : [];
  const verdicts = Array.isArray(pack.verdicts) ? pack.verdicts : [];
  const exceptions = Array.isArray(pack.exceptions_v3) ? pack.exceptions_v3 : [];

  await supabase.from("analysis_records").delete().eq("verification_object_id", verificationObjectId);
  await supabase.from("analysis_verdicts").delete().eq("verification_object_id", verificationObjectId);
  await supabase.from("analysis_exceptions").delete().eq("verification_object_id", verificationObjectId);

  if (records.length > 0) {
    await supabase.from("analysis_records").insert(
      records.slice(0, 400).map((record) => ({
        id: asUuidOrRandom(record?.id),
        workspace_id: workspaceId,
        document_id: documentId,
        verification_object_id: verificationObjectId,
        record_type: String(record?.record_type || "record"),
        title: record?.title ? String(record.title) : null,
        summary: record?.summary ? String(record.summary) : null,
        status: record?.status ? String(record.status) : "proposed",
        severity: record?.severity ? String(record.severity) : null,
        rationale: record?.rationale ? String(record.rationale) : null,
        fields_json: record?.fields && typeof record.fields === "object" && !Array.isArray(record.fields)
          ? record.fields
          : {},
        evidence_json: Array.isArray(record?.evidence) ? record.evidence : [],
        provenance_json: record?.provenance && typeof record.provenance === "object"
          ? record.provenance
          : {},
      })),
    );
  }

  if (verdicts.length > 0) {
    await supabase.from("analysis_verdicts").insert(
      verdicts.slice(0, 600).map((verdict) => ({
        id: asUuidOrRandom(verdict?.id),
        workspace_id: workspaceId,
        document_id: documentId,
        verification_object_id: verificationObjectId,
        rule_id: String(verdict?.rule_id || verdict?.ruleId || "unknown_rule"),
        status: String(verdict?.status || "uncertain"),
        severity: String(verdict?.severity || "warning"),
        confidence: verdict?.confidence ? String(verdict.confidence) : null,
        explanation: verdict?.explanation ? String(verdict.explanation) : null,
        evidence_json: Array.isArray(verdict?.evidence) ? verdict.evidence : [],
        metadata_json: verdict?.metadata && typeof verdict.metadata === "object"
          ? verdict.metadata
          : {},
      })),
    );
  }

  if (exceptions.length > 0) {
    await supabase.from("analysis_exceptions").insert(
      exceptions.slice(0, 600).map((exception) => ({
        id: asUuidOrRandom(exception?.id),
        workspace_id: workspaceId,
        document_id: documentId,
        verification_object_id: verificationObjectId,
        exception_type: String(exception?.kind || exception?.type || "analysis_v3_rule"),
        severity: String(exception?.severity || "warning"),
        status: String(exception?.status || "open"),
        message: String(exception?.message || exception?.title || "Analysis exception"),
        payload_json: exception && typeof exception === "object" ? exception : {},
      })),
    );
  }
}

async function fetchParentAndBatches(supabase, parentRunId) {
  const { data: parentRun, error: parentErr } = await supabase
    .from("extraction_runs")
    .select("*")
    .eq("id", normalizeUuid(parentRunId))
    .single();
  if (parentErr || !parentRun) {
    const wrapped = new Error(`Parent run not found: ${parentErr?.message || parentRunId}`);
    wrapped.statusCode = 404;
    throw wrapped;
  }

  const { data: batchRuns, error: batchErr } = await supabase
    .from("extraction_runs")
    .select("id,status,output_summary,created_at,completed_at")
    .eq("extraction_type", "contract_analysis_batch")
    .contains("input_config", { parent_run_id: normalizeUuid(parentRunId) });
  if (batchErr) {
    const wrapped = new Error(`Failed to load batch runs: ${batchErr.message}`);
    wrapped.statusCode = 500;
    throw wrapped;
  }

  return { parentRun, batchRuns: batchRuns || [] };
}

function mergeBatchCandidates(batchRuns) {
  const allVars = [];
  const allClauses = [];
  const allObligations = [];
  const allRisks = [];
  for (const run of batchRuns || []) {
    const output = run.output_summary && typeof run.output_summary === "object"
      ? run.output_summary
      : {};
    const batchDocId = typeof output.document_id === "string"
      ? normalizeUuid(output.document_id)
      : undefined;
    if (Array.isArray(output.extracted_variables)) {
      allVars.push(...output.extracted_variables.map((item) => ({
        ...item,
        document_id: typeof item?.document_id === "string"
          ? normalizeUuid(item.document_id)
          : batchDocId,
      })));
    }
    allClauses.push(...normalizeClauses(
      Array.isArray(output.clauses)
        ? output.clauses.map((item) => ({
          ...item,
          document_id: typeof item?.document_id === "string"
            ? normalizeUuid(item.document_id)
            : batchDocId,
        }))
        : output.clauses,
    ));
    allObligations.push(...normalizeObligations(
      Array.isArray(output.obligations)
        ? output.obligations.map((item) => ({
          ...item,
          document_id: typeof item?.document_id === "string"
            ? normalizeUuid(item.document_id)
            : batchDocId,
        }))
        : output.obligations,
    ));
    allRisks.push(...normalizeRisks(
      Array.isArray(output.risks)
        ? output.risks.map((item) => ({
          ...item,
          document_id: typeof item?.document_id === "string"
            ? normalizeUuid(item.document_id)
            : batchDocId,
        }))
        : output.risks,
    ));
  }
  return {
    all_extracted_variables: allVars,
    all_clauses: allClauses,
    all_obligations: allObligations,
    all_risks: allRisks,
    extracted_variables: dedupeByKey(allVars, (item) => `${item.name}:${item.value}`).slice(0, 30),
    clauses: dedupeByKey(allClauses, (item) =>
      `${item.clause_type}:${String(item.text || "").slice(0, 120)}`).slice(0, 50),
    obligations: dedupeByKey(allObligations, (item) =>
      `${item.obligation_type}:${String(item.summary || item.action || "").slice(0, 120)}`).slice(0, 100),
    risks: dedupeByKey(allRisks, (item) =>
      `${item.severity}:${String(item.description || "").slice(0, 120)}`).slice(0, 40),
  };
}

function buildDocsetProgressContext(parentRun) {
  const input = parentRun?.input_config && typeof parentRun.input_config === "object"
    ? parentRun.input_config
    : {};
  const bundle = input.bundle || null;
  const documentIds = bundle && Array.isArray(bundle.document_ids)
    ? bundle.document_ids
    : Array.isArray(input.document_ids)
    ? input.document_ids
    : [];
  return documentIds.length > 1
    ? {
      docset: {
        mode: String(bundle?.docset_mode || input.docset_mode || "").toLowerCase() === "saved"
          ? "saved"
          : "ephemeral",
        document_count: documentIds.length,
        pack_id: typeof bundle?.pack_id === "string" ? normalizeUuid(bundle.pack_id) : null,
        primary_document_id: typeof bundle?.primary_document_id === "string"
          ? normalizeUuid(bundle.primary_document_id)
          : normalizeUuid(parentRun?.document_id),
      },
    }
    : null;
}

export async function executeContractAnalysisReduce({
  supabase,
  parentRunId,
  requestId,
  log,
}) {
  const { parentRun, batchRuns } = await fetchParentAndBatches(supabase, parentRunId);
  if (parentRun.status === "completed") {
    return { ok: true, already_completed: true, delegated: false };
  }

  const support = shouldNativeReduceRun(parentRun, batchRuns);
  if (!support.ok) {
    const error = new Error(support.reason);
    error.statusCode = 400;
    throw error;
  }

  const pendingOrRunning = batchRuns.filter((item) =>
    item.status === "pending" || item.status === "running"
  );
  const completed = batchRuns.filter((item) => item.status === "completed");
  const failedCount = batchRuns.filter((item) => item.status === "failed").length;
  const totalBatches = batchRuns.length;
  const actionId = parentRun.input_config?.action_id
    ? normalizeUuid(parentRun.input_config.action_id)
    : null;
  const docsetProgressContext = buildDocsetProgressContext(parentRun);
  const input = parentRun.input_config && typeof parentRun.input_config === "object"
    ? parentRun.input_config
    : {};
  const templateId = String(input.template_id || "contract_analysis");
  const playbookSpec = input.playbook_spec || null;
  const playbookMeta = input.playbook || null;
  const primaryDocumentId = normalizeUuid(parentRun.document_id);
  const verifierEnabled = readBool("CONTRACT_ANALYSIS_VERIFIER_ENABLED", false);
  const llmVerifierEnabled = readBool("CONTRACT_ANALYSIS_LLM_VERIFIER_ENABLED", false);
  const judgeEnabled = readBool("CONTRACT_ANALYSIS_JUDGE_ENABLED", false);
  const analysisV3Flags = resolveAnalysisV3FlagsForWorkspace(parentRun.workspace_id);

  if (pendingOrRunning.length > 0) {
    if (actionId) {
      const { data: existingAction } = await supabase
        .from("actions")
        .select("output_json")
        .eq("id", actionId)
        .maybeSingle();
      await supabase
        .from("actions")
        .update({
          updated_at: new Date().toISOString(),
          output_json: {
            ...(existingAction?.output_json && typeof existingAction.output_json === "object"
              ? existingAction.output_json
              : {}),
            stage: "waiting_for_batches",
            total_batches: totalBatches,
            completed_batches: completed.length,
            failed_batches: failedCount,
            pending_batches: pendingOrRunning.length,
            ...(docsetProgressContext || {}),
          },
        })
        .eq("id", actionId);
    }
    const error = new Error("batches_not_complete");
    error.statusCode = 202;
    throw error;
  }

  if (completed.length === 0) {
    throw new Error("No completed batch runs available for reduce");
  }

  await supabase
    .from("extraction_runs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", normalizeUuid(parentRunId));

  const merged = mergeBatchCandidates(completed);
  if (actionId) {
    const { data: existingAction } = await supabase
      .from("actions")
      .select("output_json")
      .eq("id", actionId)
      .maybeSingle();
    await supabase
      .from("actions")
      .update({
        status: "running",
        updated_at: new Date().toISOString(),
        output_json: {
          ...(existingAction?.output_json && typeof existingAction.output_json === "object"
            ? existingAction.output_json
            : {}),
          stage: "reduce",
          run_id: normalizeUuid(parentRunId),
          ...(docsetProgressContext || {}),
        },
      })
      .eq("id", actionId)
      .throwOnError();
  }

  const reduced = await reduceWithOpenAI(
    merged,
    parentRun.workspace_id,
    requestId,
    totalBatches,
    typeof input.pages_per_batch === "number" ? input.pages_per_batch : 7,
  );

  const inputBundle = input.bundle || null;
  const scopeFromInput = Array.isArray(inputBundle?.document_ids)
    ? inputBundle.document_ids.map((item) => String(item || "").toLowerCase()).filter(Boolean)
    : Array.isArray(input.document_ids)
    ? input.document_ids.map((item) => String(item || "").toLowerCase()).filter(Boolean)
    : null;
  const scopeFromBatches = Array.from(
    new Set(
      completed
        .map((item) => String(item?.output_summary?.document_id || "").toLowerCase())
        .filter(Boolean),
    ),
  );
  const scopeDocumentIds = Array.from(
    new Set([...(scopeFromInput || []), ...scopeFromBatches, primaryDocumentId]),
  ).filter(Boolean);

  const { data: chunkRows, error: chunksError } = await supabase
    .from("document_chunks")
    .select("id, document_id, page_number, chunk_index, content_text, bounding_box")
    .in("document_id", scopeDocumentIds)
    .order("page_number", { ascending: true })
    .order("chunk_index", { ascending: true });
  if (chunksError) {
    throw new Error(`Failed to fetch document chunks: ${chunksError.message}`);
  }
  const allChunks = chunkRows || [];
  if (!allChunks.length) throw new Error("No document chunks available to finalize analysis");
  const chunksByDoc = {};
  for (const chunk of allChunks) {
    const docId = String(chunk?.document_id || "").toLowerCase();
    if (!docId) continue;
    if (!chunksByDoc[docId]) chunksByDoc[docId] = [];
    chunksByDoc[docId].push(chunk);
  }
  for (const docId of scopeDocumentIds) {
    if (!chunksByDoc[String(docId).toLowerCase()]?.length) {
      throw new Error(`No document chunks available for scope document ${docId}`);
    }
  }
  const chunksCombined = Object.values(chunksByDoc).flat();

  const enabledModules = new Set(Array.isArray(playbookSpec?.modules)
    ? playbookSpec.modules.map((item) => String(item || "").trim()).filter(Boolean)
    : ["variables", "clauses", "obligations", "risks", "deadlines"]);
  if (enabledModules.has("deadlines")) enabledModules.add("variables");
  if (!enabledModules.has("obligations")) enabledModules.delete("deadlines");

  let snapshotJson = toSnapshot(
    reduced,
    chunksByDoc,
    primaryDocumentId,
    templateId,
    enabledModules,
  );
  if (enabledModules.has("deadlines")) {
    snapshotJson = addComputedNoticeDeadlineIfPossible(snapshotJson);
  }
  snapshotJson = attachPackMetadata(snapshotJson, templateId);
  snapshotJson = {
    ...snapshotJson,
    pack: {
      ...(snapshotJson.pack || {}),
      capabilities: {
        analysis_v3: {
          enabled: analysisV3Flags.enabled,
          web_enabled: analysisV3Flags.web_enabled,
          ios_enabled: analysisV3Flags.ios_enabled,
        },
      },
      ...(analysisV3Flags.enabled
        ? {
          records: Array.isArray((snapshotJson.pack || {}).records) ? snapshotJson.pack.records : [],
          rules: Array.isArray((snapshotJson.pack || {}).rules) ? snapshotJson.pack.rules : [],
          verdicts: Array.isArray((snapshotJson.pack || {}).verdicts) ? snapshotJson.pack.verdicts : [],
          exceptions_v3: Array.isArray((snapshotJson.pack || {}).exceptions_v3)
            ? snapshotJson.pack.exceptions_v3
            : [],
        }
        : {}),
    },
  };

  const moduleOrder = ["variables", "clauses", "obligations", "deadlines", "risks"];
  const orderedModulesEnabled = moduleOrder.filter((key) => enabledModules.has(key));
  const outputsEnabled = (() => {
    const raw = Array.isArray(playbookSpec?.outputs) ? playbookSpec.outputs : null;
    if (raw && raw.length) {
      return Array.from(new Set(raw.map((item) => String(item || "").trim()).filter(Boolean)));
    }
    return ["overview", ...orderedModulesEnabled];
  })();

  const runtimeExecution = input.execution && typeof input.execution === "object"
    ? input.execution
    : {};
  snapshotJson = {
    ...snapshotJson,
    pack: {
      ...(snapshotJson.pack || {}),
      runtime: {
        execution_plane: "gcp",
        request_id: requestId,
        workflow_execution_id: runtimeExecution.workflow_execution_id || null,
        data_plane: input.data_plane || null,
      },
      playbook: {
        ...((snapshotJson.pack || {}).playbook || {}),
        ...(playbookMeta || {}),
        modules: Array.isArray(playbookSpec?.modules) ? playbookSpec.modules : null,
        outputs: Array.isArray(playbookSpec?.outputs) ? playbookSpec.outputs : null,
        modules_enabled: orderedModulesEnabled,
        outputs_enabled: outputsEnabled,
      },
    },
  };

  try {
    const modulesV2All = normalizeModulesV2(playbookSpec);
    const coreModuleIds = new Set(["variables", "clauses", "obligations", "risks", "deadlines"]);
    const modulesV2 = modulesV2All.filter((item) => !coreModuleIds.has(String(item?.id || "").trim()));
    if (modulesV2.length > 0) {
      let moduleChunks = chunksCombined;
      const contextDocIds = Array.isArray(input?.context?.document_ids)
        ? Array.from(new Set(input.context.document_ids.map((item) => String(item || "").toLowerCase()).filter(Boolean))).slice(0, 20)
        : [];
      const contextIdsToFetch = contextDocIds.filter((id) => !chunksByDoc[id]?.length);
      if (contextIdsToFetch.length > 0) {
        const { data: contextRows, error: contextError } = await supabase
          .from("document_chunks")
          .select("id, document_id, page_number, chunk_index, content_text, bounding_box")
          .in("document_id", contextIdsToFetch)
          .order("page_number", { ascending: true })
          .order("chunk_index", { ascending: true });
        if (!contextError && Array.isArray(contextRows) && contextRows.length > 0) {
          moduleChunks = moduleChunks.concat(contextRows);
        }
      }

      const moduleOutputs = await runModulesV2({
        chunks: moduleChunks,
        modules: modulesV2,
        language: resolveRunLanguagePreference(input, playbookSpec),
        workspaceId: parentRun.workspace_id,
        requestId,
      });
      const enabledIds = modulesV2.filter((item) => item.enabled !== false).map((item) => item.id);
      const mergedModulesEnabled = Array.from(new Set([...orderedModulesEnabled, ...enabledIds]));
      const modulesMap = {};
      for (const item of moduleOutputs) {
        const id = String(item?.id || "").trim();
        if (!id) continue;
        modulesMap[id] = {
          id,
          title: item.title,
          status: item.status,
          result: item.result ?? null,
          evidence: item.evidence ?? [],
          ai_confidence: item.ai_confidence ?? null,
          error: item.error ?? null,
          show_in_report: item.show_in_report === true,
        };
      }
      snapshotJson = {
        ...snapshotJson,
        pack: {
          ...(snapshotJson.pack || {}),
          modules: {
            ...((snapshotJson.pack || {}).modules || {}),
            ...modulesMap,
          },
          modules_activated: Array.from(new Set([...(snapshotJson.pack?.modules_activated || []), ...enabledIds])),
          playbook: {
            ...((snapshotJson.pack || {}).playbook || {}),
            modules_enabled: mergedModulesEnabled,
            modules_v2: modulesV2All,
          },
        },
      };
      snapshotJson = applyModuleOutputsToSnapshot({
        snapshotJson,
        moduleOutputs,
        chunksByDoc,
        primaryDocumentId,
      });
    }
  } catch (error) {
    log?.warn?.("modules_v2 failed in native reduce", { error: error?.message || String(error) });
  }

  try {
    const customModules = (Array.isArray(playbookSpec?.custom_modules) ? playbookSpec.custom_modules : [])
      .slice(0, 5)
      .map((item) => ({
        id: String(item?.id || "").trim(),
        title: String(item?.title || "").trim(),
        prompt: String(item?.prompt || ""),
        json_schema: item?.json_schema && typeof item.json_schema === "object" && !Array.isArray(item.json_schema)
          ? item.json_schema
          : {},
        enabled: item?.enabled === false ? false : true,
        show_in_report: item?.show_in_report === true,
      }))
      .filter((item) => !!item.id && !!item.title && !!item.prompt);
    if (customModules.length > 0) {
      let customChunks = chunksCombined;
      const contextDocIds = Array.isArray(input?.context?.document_ids)
        ? Array.from(new Set(input.context.document_ids.map((item) => String(item || "").toLowerCase()).filter(Boolean))).slice(0, 20)
        : [];
      const contextIdsToFetch = contextDocIds.filter((id) => !chunksByDoc[id]?.length);
      if (contextIdsToFetch.length > 0) {
        const { data: contextRows, error: contextError } = await supabase
          .from("document_chunks")
          .select("id, document_id, page_number, chunk_index, content_text, bounding_box")
          .in("document_id", contextIdsToFetch)
          .order("page_number", { ascending: true })
          .order("chunk_index", { ascending: true });
        if (!contextError && Array.isArray(contextRows) && contextRows.length > 0) {
          customChunks = customChunks.concat(contextRows);
        }
      }
      const customOutputs = await runCustomModules({
        chunks: customChunks,
        modules: customModules,
        language: resolveRunLanguagePreference(input, playbookSpec),
        workspaceId: parentRun.workspace_id,
        requestId,
      });
      snapshotJson = {
        ...snapshotJson,
        pack: {
          ...(snapshotJson.pack || {}),
          playbook: {
            ...((snapshotJson.pack || {}).playbook || {}),
            custom_modules: customOutputs,
          },
        },
      };
    }
  } catch (error) {
    log?.warn?.("custom modules failed in native reduce", { error: error?.message || String(error) });
  }

  if (scopeDocumentIds.length > 1) {
    try {
      const precedencePolicy = String(inputBundle?.precedence_policy || input.precedence_policy || "manual");
      const docsetMode = String(inputBundle?.docset_mode || input.docset_mode || "ephemeral").toLowerCase() === "saved"
        ? "saved"
        : "ephemeral";
      const primaryDocForDocset = String(
        inputBundle?.primary_document_id || input.primary_document_id || primaryDocumentId,
      ).toLowerCase();
      const bundleId = inputBundle?.bundle_id ? String(inputBundle.bundle_id).toLowerCase() : null;
      const packId = inputBundle?.pack_id ? String(inputBundle.pack_id).toLowerCase() : null;
      let documentHashes = {};
      const { data: documentRows, error: documentError } = await supabase
        .from("documents")
        .select("id, content_fingerprint, updated_at")
        .in("id", scopeDocumentIds);
      if (!documentError && Array.isArray(documentRows)) {
        for (const document of documentRows) {
          const id = String(document?.id || "").toLowerCase();
          if (!id) continue;
          const fingerprint = document?.content_fingerprint ? String(document.content_fingerprint) : null;
          const updatedAt = document?.updated_at ? String(document.updated_at) : null;
          documentHashes[id] = fingerprint
            ? `fingerprint:${fingerprint}`
            : (updatedAt ? `updated_at:${updatedAt}` : "unknown");
        }
      }
      snapshotJson = {
        ...snapshotJson,
        pack: {
          ...(snapshotJson.pack || {}),
          bundle: {
            bundle_id: bundleId || packId,
            pack_id: packId || bundleId,
            document_ids: scopeDocumentIds,
            document_hashes: documentHashes,
            precedence_policy: precedencePolicy,
            docset_mode: docsetMode,
            primary_document_id: primaryDocForDocset,
            saved_docset_name: docsetMode === "saved"
              ? String(inputBundle?.saved_docset_name || input.saved_docset_name || "").trim() || undefined
              : undefined,
            member_roles: Array.isArray(inputBundle?.member_roles)
              ? inputBundle.member_roles.map((item) => ({
                document_id: String(item?.document_id || "").toLowerCase(),
                role: String(item?.role || "other").trim().toLowerCase() || "other",
                sort_order: typeof item?.sort_order === "number" ? item.sort_order : 0,
              })).filter((item) => !!item.document_id)
              : undefined,
            resolved_member_roles: Array.isArray(inputBundle?.member_roles)
              ? inputBundle.member_roles.map((item) => ({
                document_id: String(item?.document_id || "").toLowerCase(),
                role: String(item?.role || "other").trim().toLowerCase() || "other",
                sort_order: typeof item?.sort_order === "number" ? item.sort_order : 0,
              })).filter((item) => !!item.document_id)
              : undefined,
          },
        },
      };

      const { conflictNames, discrepancies } = computeVariableConflictDiscrepancies({
        candidates: merged.all_extracted_variables || [],
        templateId,
        chunksByDoc,
        primaryDocumentId,
        precedencePolicy,
      });
      if (discrepancies.length > 0) {
        snapshotJson = {
          ...snapshotJson,
          pack: {
            ...(snapshotJson.pack || {}),
            discrepancies,
          },
          variables: (Array.isArray(snapshotJson?.variables) ? snapshotJson.variables : []).map((variable) => {
            const name = String(variable?.name || "").trim();
            if (!name || !conflictNames.has(name)) return variable;
            return { ...variable, verification_state: "needs_review" };
          }),
        };
      }
    } catch (error) {
      log?.warn?.("bundle manifest/conflicts failed in native reduce", { error: error?.message || String(error) });
    }
  }

  let verifier = null;
  if (verifierEnabled) {
    try {
      verifier = runDeterministicVerifier({
        snapshotJson,
        chunksByDoc,
        defaultDocumentId: primaryDocumentId,
      });
      if (llmVerifierEnabled) {
        verifier = await runSemanticVerifierForTargetVariables({
          snapshotJson,
          verifier,
          chunksByDoc,
          defaultDocumentId: primaryDocumentId,
          requestId,
        });
      }
      if (judgeEnabled) {
        verifier = await runJudgeForTargetVariables({
          snapshotJson,
          verifier,
          chunksByDoc,
          defaultDocumentId: primaryDocumentId,
          requestId,
        });
      }
      snapshotJson = enrichSnapshotWithVerifier(snapshotJson, verifier);
      snapshotJson = {
        ...snapshotJson,
        variables: (Array.isArray(snapshotJson?.variables) ? snapshotJson.variables : []).map((variable) => {
          const name = String(variable?.name || "").trim();
          const status = verifier?.results?.[name]?.status;
          if (!status || status === "green" || variable?.verification_state === "needs_review") return variable;
          return { ...variable, verification_state: "needs_review" };
        }),
      };
    } catch (error) {
      log?.warn?.("verifier failed in native reduce", { error: error?.message || String(error) });
      verifier = null;
    }
  }

  let exceptionsSummary = null;
  try {
    const { exceptions, summary } = computePlaybookExceptions({
      snapshotJson,
      templateId,
      verifier,
      playbookSpec,
    });
    exceptionsSummary = summary;
    snapshotJson = {
      ...snapshotJson,
      pack: {
        ...(snapshotJson.pack || {}),
        exceptions,
        exceptions_summary: summary,
      },
    };
  } catch (error) {
    log?.warn?.("playbook exceptions failed in native reduce", { error: error?.message || String(error) });
  }

  if (analysisV3Flags.enabled) {
    try {
      const { rules, verdicts, exceptions } = computeAnalysisV3Verdicts({
        playbookSpec,
        snapshotJson,
        verifier,
      });
      snapshotJson = {
        ...snapshotJson,
        pack: {
          ...(snapshotJson.pack || {}),
          rules,
          verdicts,
          exceptions_v3: exceptions,
        },
      };
    } catch (error) {
      log?.warn?.("analysis_v3 verdict computation failed in native reduce", {
        error: error?.message || String(error),
      });
    }
  }

  snapshotJson = harmonizeV3AndLegacySnapshot({
    snapshotJson,
    templateId,
    enabledModules,
    analysisV3Enabled: analysisV3Flags.enabled,
  });

  const { verificationObjectId, versionId, versionNumber } = await upsertVerificationSnapshot({
    supabase,
    parentRun,
    snapshotJson,
  });
  await syncAnalysisActions({
    supabase,
    parentRun,
    snapshotJson,
    verificationObjectId,
    versionId,
  });
  const contractId = null;

  if (analysisV3Flags.enabled) {
    try {
      await syncAnalysisV3Projections({
        supabase,
        snapshotJson,
        verificationObjectId,
        workspaceId: normalizeUuid(parentRun.workspace_id),
        documentId: normalizeUuid(parentRun.document_id),
      });
    } catch (error) {
      log?.warn?.("analysis_v3 projections sync failed in native reduce", {
        error: error?.message || String(error),
      });
    }
  }

  const v3Verdicts = Array.isArray(snapshotJson?.pack?.verdicts) ? snapshotJson.pack.verdicts : [];
  const uncertainCount = v3Verdicts.filter((item) => String(item?.status || "") === "uncertain").length;
  const failCount = v3Verdicts.filter((item) => String(item?.status || "") === "fail").length;
  const passCount = v3Verdicts.filter((item) => String(item?.status || "") === "pass").length;
  const rulesCount = Array.isArray(snapshotJson?.pack?.rules) ? snapshotJson.pack.rules.length : 0;
  const verifierInvoked = !!(verifierEnabled && verifier);
  const analysisV3Metrics = {
    verifier_invoked: verifierInvoked,
    verifier_invocation_rate: verifierInvoked ? 1 : 0,
    verdicts_total: v3Verdicts.length,
    verdicts_pass: passCount,
    verdicts_fail: failCount,
    verdicts_uncertain: uncertainCount,
    uncertain_rate: v3Verdicts.length > 0 ? uncertainCount / v3Verdicts.length : 0,
    evidence_coverage: computeEvidenceCoverage(snapshotJson),
    override_rate: null,
    estimated_cost_usd: null,
    stage_trace: buildStageTrace({
      totalBatches,
      completedBatches: completed.length,
      verifierInvoked,
      rulesCount,
    }),
  };

  await supabase
    .from("extraction_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      output_summary: {
        ...(parentRun.output_summary && typeof parentRun.output_summary === "object"
          ? parentRun.output_summary
          : {}),
        contract_id: contractId,
        verification_object_id: verificationObjectId,
        version_id: versionId,
        failed_batches: failedCount,
        ...(verifierEnabled ? { verifier: verifier ?? null } : {}),
        playbook: {
          template_id: templateId,
          template_version: getTemplateDefinition(templateId).template_version,
          exceptions_summary: exceptionsSummary,
        },
        analysis_v3: analysisV3Metrics,
        reduced_counts: {
          variables: reduced.extracted_variables?.length || 0,
          clauses: reduced.clauses?.length || 0,
          obligations: reduced.obligations?.length || 0,
          risks: reduced.risks?.length || 0,
        },
      },
    })
    .eq("id", normalizeUuid(parentRunId));

  if (actionId) {
    const { data: existingAction } = await supabase
      .from("actions")
      .select("output_json")
      .eq("id", actionId)
      .maybeSingle();
    await supabase
      .from("actions")
      .update({
        status: "succeeded",
        updated_at: new Date().toISOString(),
        output_json: {
          ...(existingAction?.output_json && typeof existingAction.output_json === "object"
            ? existingAction.output_json
            : {}),
          stage: "complete",
          run_id: normalizeUuid(parentRunId),
          contract_id: contractId,
          verification_object_id: verificationObjectId,
          version_id: versionId,
          version_number: versionNumber,
          failed_batches: failedCount,
          ...(verifierEnabled ? { verifier: verifier ?? null } : {}),
          exceptions_summary: exceptionsSummary,
          analysis_v3: analysisV3Metrics,
          reduced_counts: {
            variables: reduced.extracted_variables?.length || 0,
            clauses: reduced.clauses?.length || 0,
            obligations: reduced.obligations?.length || 0,
            risks: reduced.risks?.length || 0,
          },
          ...(docsetProgressContext || {}),
        },
      })
      .eq("id", actionId)
      .throwOnError();
  }

  log?.info?.("Completed native contract reduce on GCP", {
    parent_run_id: normalizeUuid(parentRunId),
    contract_id: contractId,
    verification_object_id: verificationObjectId,
    version_id: versionId,
  });

  return {
    ok: true,
    delegated: false,
    parent_run_id: normalizeUuid(parentRunId),
    contract_id: contractId,
    verification_object_id: verificationObjectId,
    version_id: versionId,
  };
}
