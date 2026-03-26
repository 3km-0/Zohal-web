const PHASE3_TEMPLATE_ALLOWED_VARIABLES = {
  renewal_pack: [
    "counterparty_name",
    "contract_type",
    "effective_date",
    "end_date",
    "term_length_months",
    "notice_period_days",
    "auto_renewal",
    "termination_for_convenience",
    "notice_deadline",
  ],
  contract_analysis: [
    "counterparty_name",
    "contract_type",
    "effective_date",
    "end_date",
    "term_length_months",
    "notice_period_days",
    "auto_renewal",
    "termination_for_convenience",
    "notice_deadline",
    "governing_law",
    "payment_terms",
    "liability_cap",
    "indemnification",
    "ip_ownership",
    "confidentiality_term",
    "assignment_allowed",
    "dispute_resolution",
    "notices",
  ],
  lease_pack: [
    "counterparty_name",
    "property_address",
    "effective_date",
    "end_date",
    "term_length_months",
    "rent_amount",
    "rent_frequency",
    "deposit_amount",
    "maintenance_responsibility",
    "insurance_requirements",
    "renewal_options",
    "early_termination",
  ],
  amendment_conflict_review: [
    "contract_type",
    "effective_date",
    "end_date",
    "payment_terms",
    "notice_period_days",
    "auto_renewal",
    "termination_for_convenience",
  ],
  obligations_tracker: [
    "contract_type",
    "effective_date",
    "end_date",
    "notice_period_days",
  ],
  playbook_compliance_review: [
    "contract_type",
    "governing_law",
    "effective_date",
    "notice_period_days",
  ],
};

function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase();
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
  if (!model) return payload;
  if (model.startsWith("google/") || model.includes("-maas")) return payload;

  const vertexChatModel = String(process.env.VERTEX_MODEL_CHAT || "").trim() ||
    "google/gemini-2.0-flash-001";
  const vertexSmallModel = String(process.env.VERTEX_MODEL_SMALL || "").trim() ||
    vertexChatModel;
  const vertexContractModel = String(process.env.VERTEX_MODEL_CONTRACT || "").trim() ||
    vertexChatModel;
  const vertexEmbeddingModel = String(process.env.VERTEX_MODEL_EMBEDDING || "").trim();
  const openaiContractModel = String(process.env.OPENAI_CONTRACT_MODEL || "").trim();
  const lower = model.toLowerCase();

  let mapped = model;
  if (path === "/embeddings" || lower.includes("embedding")) {
    if (vertexEmbeddingModel) mapped = vertexEmbeddingModel;
  } else if (openaiContractModel && model === openaiContractModel) {
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

function normalizeChatPayloadForProvider(provider, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (provider !== "openai") return payload;
  const model = String(payload.model || "").trim().toLowerCase();
  if (!(model.startsWith("gpt-5") || model.startsWith("o"))) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, "max_tokens")) return payload;
  const maxCompletionTokens = payload.max_completion_tokens;
  const next = { ...payload };
  next.max_completion_tokens = typeof maxCompletionTokens === "number"
    ? maxCompletionTokens
    : payload.max_tokens;
  delete next.max_tokens;
  return next;
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

  const requestPayload = normalizeChatPayloadForProvider(
    provider,
    remapModelForProvider(provider, "/chat/completions", payload),
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
  if (json?.error?.message) {
    const error = new Error(String(json.error.message));
    error.statusCode = 502;
    throw error;
  }
  return json;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeStrictnessOption(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "strict") return "strict";
  if (raw === "default") return "default";
  return undefined;
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

function resolvePlaybookOptions(input, playbookSpec) {
  const requestOptions = input?.playbook_options && typeof input.playbook_options === "object"
    ? input.playbook_options
    : null;
  const playbookOptions = input?.playbook?.options && typeof input.playbook?.options === "object"
    ? input.playbook.options
    : null;
  const specOptions = playbookSpec?.options && typeof playbookSpec.options === "object"
    ? playbookSpec.options
    : null;
  const source = requestOptions || playbookOptions || specOptions;
  if (!source) return null;
  const strictness = normalizeStrictnessOption(source.strictness);
  const language = normalizeLanguageOption(source.language);
  if (!strictness && !language) return null;
  return {
    ...(strictness ? { strictness } : {}),
    ...(language ? { language } : {}),
  };
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

function safeJsonParse(raw) {
  const text = String(raw || "").trim();
  try {
    return JSON.parse(text);
  } catch (firstError) {
    try {
      return JSON.parse(repairJsonString(text));
    } catch {
      try {
        return JSON.parse(aggressiveJsonRepair(text));
      } catch {
        const preview = text.substring(0, 500);
        throw new Error(
          `Failed to parse OpenAI JSON after repair. Original: ${
            firstError?.message || firstError
          }. Preview: ${preview}`,
        );
      }
    }
  }
}

function sanitizeVariableCandidates(vars, allowedNames) {
  if (!Array.isArray(vars) || !vars.length) return [];
  return vars
    .filter((item) =>
      item && typeof item.name === "string" && allowedNames.has(item.name)
    )
    .map((item) => ({
      name: item.name,
      display_name: item.display_name,
      type: item.type,
      value: item.value ?? null,
      unit: item.unit || undefined,
      ai_confidence: item.ai_confidence || "medium",
      page_number: item.page_number,
      source_quote: item.source_quote
        ? String(item.source_quote).slice(0, 120)
        : undefined,
    }));
}

function compressBatchTextKeepPages(batchText, maxCharsPerPage) {
  const text = String(batchText || "");
  const pageRegex = /\n\n\[Page\s+(\d+)\]\n/g;
  const matches = Array.from(text.matchAll(pageRegex));
  if (!matches.length) return text.slice(0, Math.max(1000, maxCharsPerPage));

  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const pageNo = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const pageBody = text.slice(start, end).trim();
    out.push(`\n\n[Page ${pageNo}]\n${pageBody.slice(0, maxCharsPerPage).trim()}`);
  }
  return out.join("").trim();
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
      return {
        clause_type: "other",
        clause_title: undefined,
        clause_number: undefined,
        text: item,
        risk_level: "low",
        page_number: undefined,
        is_missing_standard_protection: false,
        source_quote: undefined,
      };
    }
    if (!item || typeof item !== "object") return null;
    const text = item.text || item.description || item.summary || item.source_quote || "";
    if (!String(text).trim()) return null;
    return {
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
      return {
        obligation_type: "other",
        due_at: undefined,
        recurrence: undefined,
        responsible_party: undefined,
        summary: item,
        action: undefined,
        condition: undefined,
        confidence: "medium",
        source_clause_type: undefined,
        page_number: undefined,
        source_quote: undefined,
      };
    }
    if (!item || typeof item !== "object") return null;
    const summary = item.summary || item.obligation || item.description || item.name || item.action || item.text || "";
    if (!String(summary).trim()) return null;
    return {
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
      return {
        severity: "medium",
        description: item,
        explanation: undefined,
        source_quote: undefined,
        page_number: undefined,
      };
    }
    if (!item || typeof item !== "object") return null;
    const description = item.description || item.risk || item.name || item.title || item.summary || item.text || "";
    if (!String(description).trim()) return null;
    return {
      severity: normalizeSeverity(item.severity || item.risk_level),
      description: String(description),
      explanation: item.explanation ? String(item.explanation) : undefined,
      source_quote: item.source_quote ? String(item.source_quote).slice(0, 120) : undefined,
      page_number: typeof item.page_number === "number" ? item.page_number : undefined,
    };
  }).filter(Boolean);
}

export function allowedVariableNamesForTemplate(templateId) {
  const key = String(templateId || "contract_analysis").trim();
  return new Set(
    PHASE3_TEMPLATE_ALLOWED_VARIABLES[key] ||
      PHASE3_TEMPLATE_ALLOWED_VARIABLES.contract_analysis,
  );
}

function isRetryableProviderError(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 429 || status === 408 || status === 409 || status >= 500 ||
    message.includes("rate limit") || message.includes("timeout");
}

async function analyzeBatchWithOpenAI({
  batchText,
  allowedVariableNames,
  playbookSpec,
  playbookOptions,
  workspaceId,
  requestId,
}) {
  const generatorConfig = getAIStageConfig("generator");
  const verifierConfig = getAIStageConfig("verifier");
  const allowedList = allowedVariableNames.length
    ? allowedVariableNames.join(", ")
    : "(none)";
  const strictness = normalizeStrictnessOption(playbookOptions?.strictness) || "default";
  const languageName = humanLanguageName(playbookOptions?.language);

  const playbookVars = Array.isArray(playbookSpec?.variables) ? playbookSpec.variables : [];
  const playbookChecks = Array.isArray(playbookSpec?.checks) ? playbookSpec.checks : [];
  const requestedModules = Array.isArray(playbookSpec?.modules)
    ? playbookSpec.modules.map((item) => String(item || "").trim()).filter(Boolean)
    : null;
  const enabled = new Set(
    requestedModules || ["variables", "clauses", "obligations", "risks", "deadlines"],
  );
  if (enabled.has("deadlines")) enabled.add("variables");

  const playbookVarLines = playbookVars
    .slice(0, 40)
    .map((item) => {
      const key = String(item?.key || "").trim();
      const type = String(item?.type || "").trim();
      const required = item?.required === true ? "required" : "optional";
      return key ? `- ${key} (${type}, ${required})` : null;
    })
    .filter(Boolean)
    .join("\n");

  const playbookCheckLines = playbookChecks
    .slice(0, 30)
    .map((item) => {
      const type = String(item?.type || "").trim();
      const key = String(item?.variable_key || item?.variable_name || "").trim();
      if (!type || !key) return null;
      if (type === "range") {
        return `- range(${key}) min=${item?.min ?? ""} max=${item?.max ?? ""}`.trim();
      }
      if (type === "enum") {
        return `- enum(${key}) allowed=[${
          Array.isArray(item?.allowed_values) ? item.allowed_values.join(", ") : ""
        }]`.trim();
      }
      if (type === "required") return `- required(${key})`;
      return `- ${type}(${key})`;
    })
    .filter(Boolean)
    .join("\n");

  const playbookDirective = playbookSpec
    ? `\nPLAYBOOK (schema-first):\n` +
      `Only extract the variables defined by this playbook.\n` +
      `Enabled modules: ${Array.from(enabled).join(", ")}\n` +
      `If a module is NOT enabled, return an EMPTY array for its key.\n` +
      (playbookVarLines ? `Variables:\n${playbookVarLines}\n` : "") +
      (playbookCheckLines ? `Checks (for awareness; reducer enforces):\n${playbookCheckLines}\n` : "")
    : "";

  const languageDirective = languageName
    ? `\nOUTPUT LANGUAGE:\n` +
      `- Write ALL human-facing narrative fields in: ${languageName}\n` +
      `  Specifically, these fields MUST be in ${languageName}:\n` +
      `  - clauses[].clause_title\n` +
      `  - clauses[].text\n` +
      `  - obligations[].summary\n` +
      `  - obligations[].action\n` +
      `  - obligations[].condition\n` +
      `  - risks[].description\n` +
      `  - risks[].explanation\n` +
      `- DO NOT translate evidence fields. source_quote MUST remain verbatim from the excerpt.\n` +
      `- DO NOT translate extracted variable values (extracted_variables[].value). Keep them as found in the contract.\n`
    : "";

  const basePrompt = `You are an evidence-grade contract extractor.\n` +
    `You will receive a PART of a larger contract, with explicit page markers like [Page N].\n\n` +
    `Return ONLY what is explicitly supported by verbatim quotes in this excerpt.\n` +
    `Return JSON ONLY.\n\n` +
    `RULES:\n` +
    `- source_quote MUST be verbatim from the excerpt.\n` +
    `- Keep source_quote <= 120 characters.\n` +
    `- extracted_variables.name MUST be one of: ${allowedList}.\n` +
    `- clauses: up to 6, obligations: up to 10, risks: up to 6.\n` +
    `- clauses[].text is NOT an evidence quote. Put verbatim proof only in source_quote.\n\n` +
    `OUTPUT SCHEMA (NO STRINGS; every item must be an object):\n` +
    `{\n` +
    `  "extracted_variables": [{ "name": "...", "type": "text|date|money|duration|boolean|number", "value": "...", "unit": "...?", "ai_confidence": "low|medium|high", "page_number": 1, "source_quote": "..." }],\n` +
    `  "clauses": [{ "clause_type": "termination|payment|liability|governing_law|confidentiality|other", "clause_title": "...?", "clause_number": "...?", "text": "...", "risk_level": "low|medium|high", "page_number": 1, "source_quote": "..." }],\n` +
    `  "obligations": [{ "obligation_type": "notice|payment|delivery|compliance|other", "responsible_party": "employer|contractor|both|other", "summary": "...", "confidence": "low|medium|high", "page_number": 1, "source_quote": "..." }],\n` +
    `  "risks": [{ "severity": "low|medium|high|critical", "description": "...", "page_number": 1, "source_quote": "..." }]\n` +
    `}\n` +
    languageDirective +
    playbookDirective;

  const strictPrompt = basePrompt +
    `\nSTRICT MODE:\n` +
    `- extracted_variables: max 6\n` +
    `- clauses: max 3\n` +
    `- obligations: max 5\n` +
    `- risks: max 3\n`;

  const maxAttempts = 3;
  let parseFailures = 0;
  let backoffMs = 500;
  const allowedNameSet = new Set(allowedVariableNames);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const systemPrompt = strictness === "strict" || parseFailures >= 1
      ? strictPrompt
      : basePrompt;
    const effectiveText = parseFailures >= 1
      ? compressBatchTextKeepPages(batchText, 1800)
      : batchText;

    try {
      const json = await createChatCompletion({
        model: generatorConfig.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: effectiveText },
        ],
        temperature: 0,
        max_tokens: parseFailures >= 1 ? 1800 : 3000,
        response_format: { type: "json_object" },
      }, {
        workspaceId,
        requestId,
        providerOverride: generatorConfig.providerOverride,
      });

      const content = json?.choices?.[0]?.message?.content;
      if (!content) throw new Error("No response content");
      try {
        const parsed = safeJsonParse(content) || {};
        if (!enabled.has("variables")) parsed.extracted_variables = [];
        if (!enabled.has("clauses")) parsed.clauses = [];
        if (!enabled.has("obligations")) parsed.obligations = [];
        if (!enabled.has("risks")) parsed.risks = [];
        return {
          extracted_variables: sanitizeVariableCandidates(parsed.extracted_variables, allowedNameSet),
          clauses: normalizeClauses(parsed.clauses),
          obligations: normalizeObligations(parsed.obligations),
          risks: normalizeRisks(parsed.risks),
        };
      } catch {
        parseFailures++;
      }
    } catch (error) {
      if (!isRetryableProviderError(error) && attempt === maxAttempts) {
        throw error;
      }
      parseFailures++;
    }

    await sleep(Math.min(backoffMs, 4000));
    backoffMs *= 2;
  }

  try {
    const json = await createChatCompletion({
      model: verifierConfig.model || "gpt-5.2",
      messages: [
        { role: "system", content: strictPrompt },
        { role: "user", content: compressBatchTextKeepPages(batchText, 1800) },
      ],
      temperature: 0,
      max_tokens: 1800,
      response_format: { type: "json_object" },
    }, {
      workspaceId,
      requestId,
      providerOverride: "openai",
    });
    const content = json?.choices?.[0]?.message?.content;
    if (content) {
      const parsed = safeJsonParse(content) || {};
      if (!enabled.has("variables")) parsed.extracted_variables = [];
      if (!enabled.has("clauses")) parsed.clauses = [];
      if (!enabled.has("obligations")) parsed.obligations = [];
      if (!enabled.has("risks")) parsed.risks = [];
      return {
        extracted_variables: sanitizeVariableCandidates(parsed.extracted_variables, allowedNameSet),
        clauses: normalizeClauses(parsed.clauses),
        obligations: normalizeObligations(parsed.obligations),
        risks: normalizeRisks(parsed.risks),
      };
    }
  } catch {
    // Best-effort empty batch fallback below.
  }

  return {
    extracted_variables: [],
    clauses: [],
    obligations: [],
    risks: [],
  };
}

export function buildBatchText(chunks) {
  const pages = new Map();
  for (const chunk of chunks || []) {
    const pageNumber = Number(chunk?.page_number || 0);
    if (!pages.has(pageNumber)) pages.set(pageNumber, []);
    pages.get(pageNumber).push(String(chunk?.content_text || ""));
  }
  return Array.from(pages.keys())
    .sort((a, b) => a - b)
    .map((pageNumber) => `\n\n[Page ${pageNumber}]\n${pages.get(pageNumber).join("\n")}`)
    .join("")
    .trim();
}

export function addStableCandidateIds({
  result,
  documentId,
  batchIndex,
}) {
  const docId = normalizeUuid(documentId);
  const docShort = docId.replace(/-/g, "").slice(0, 8);
  const tagItems = (items, prefix) =>
    (items || []).map((item, idx) => ({
      ...item,
      document_id: docId,
      candidate_id: `d${docShort}-b${batchIndex}-${prefix}${idx}`,
    }));

  return {
    extracted_variables: tagItems(result?.extracted_variables || [], "v"),
    clauses: tagItems(result?.clauses || [], "c"),
    obligations: tagItems(result?.obligations || [], "o"),
    risks: tagItems(result?.risks || [], "r"),
  };
}

async function fetchBatchRunOrThrow(supabase, batchRunId) {
  const { data, error } = await supabase
    .from("extraction_runs")
    .select("*")
    .eq("id", normalizeUuid(batchRunId))
    .single();
  if (error || !data) {
    const wrapped = new Error(`Batch run not found: ${error?.message || batchRunId}`);
    wrapped.statusCode = 404;
    throw wrapped;
  }
  return data;
}

async function fetchDocumentChunksForBatch(supabase, run, startPage, endPage) {
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, page_number, chunk_index, content_text")
    .eq("document_id", normalizeUuid(run.document_id))
    .gte("page_number", startPage)
    .lte("page_number", endPage)
    .order("page_number", { ascending: true })
    .order("chunk_index", { ascending: true });
  if (error) {
    const wrapped = new Error(`Failed to fetch chunks for batch: ${error.message}`);
    wrapped.statusCode = 500;
    throw wrapped;
  }
  return data || [];
}

export async function executeContractAnalysisBatch({
  supabase,
  batchRunId,
  requestId,
  log,
  analyzeBatch = analyzeBatchWithOpenAI,
}) {
  const run = await fetchBatchRunOrThrow(supabase, batchRunId);
  const input = run.input_config && typeof run.input_config === "object"
    ? run.input_config
    : {};
  const batchExtractionType = String(
    run.extraction_type || "contract_analysis_batch",
  ).trim() || "contract_analysis_batch";
  const parentRunId = normalizeUuid(input.parent_run_id);
  const batchIndex = Number(input.batch_index || 0);
  const totalBatches = Number(input.total_batches || 0);
  const startPage = Number(input.start_page || 0);
  const endPage = Number(input.end_page || 0);
  const actionId = input.action_id ? normalizeUuid(input.action_id) : null;
  const templateId = String(input.template_id || "contract_analysis").trim();
  const playbookSpec = input.playbook_spec || null;
  const playbookOptions = resolvePlaybookOptions(input, playbookSpec);
  const inputBundle = input.bundle && typeof input.bundle === "object"
    ? input.bundle
    : null;
  const docsetProgressContext =
    inputBundle && Array.isArray(inputBundle.document_ids)
      ? {
        docset: {
          mode: String(inputBundle.docset_mode || "").toLowerCase() === "saved"
            ? "saved"
            : "ephemeral",
          document_count: inputBundle.document_ids.length,
          pack_id: typeof inputBundle.pack_id === "string"
            ? normalizeUuid(inputBundle.pack_id)
            : null,
          primary_document_id: typeof inputBundle.primary_document_id === "string"
            ? normalizeUuid(inputBundle.primary_document_id)
            : null,
        },
      }
      : null;

  await supabase
    .from("extraction_runs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizeUuid(batchRunId));

  const chunks = await fetchDocumentChunksForBatch(supabase, run, startPage, endPage);
  const batchText = buildBatchText(chunks);

  let allowedNames = Array.isArray(input.allowed_variable_names)
    ? input.allowed_variable_names.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (!allowedNames.length && Array.isArray(playbookSpec?.variables)) {
    allowedNames = playbookSpec.variables
      .map((item) => String(item?.key || "").trim())
      .filter(Boolean);
  }
  if (!allowedNames.length) {
    allowedNames = Array.from(allowedVariableNamesForTemplate(templateId));
  }

  log?.info?.("Executing native contract batch on GCP", {
    batch_run_id: normalizeUuid(batchRunId),
    parent_run_id: parentRunId,
    batch_index: batchIndex,
    total_batches: totalBatches,
    template_id: templateId,
    chunk_count: chunks.length,
    provider_default: resolveAIProvider({ workspaceId: run.workspace_id }),
  });

  const result = await analyzeBatch({
    batchText,
    allowedVariableNames: allowedNames,
    playbookSpec,
    playbookOptions,
    workspaceId: run.workspace_id,
    requestId,
  });

  const outputSummary = {
    parent_run_id: parentRunId,
    batch_index: batchIndex,
    total_batches: totalBatches,
    document_id: normalizeUuid(run.document_id),
    start_page: startPage,
    end_page: endPage,
    ...addStableCandidateIds({
      result,
      documentId: run.document_id,
      batchIndex,
    }),
  };

  await supabase
    .from("extraction_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      output_summary: outputSummary,
    })
    .eq("id", normalizeUuid(batchRunId));

  if (actionId) {
    const { data: existingAction } = await supabase
      .from("actions")
      .select("output_json")
      .eq("id", actionId)
      .maybeSingle();
    const existingOutputJson =
      existingAction?.output_json && typeof existingAction.output_json === "object"
        ? existingAction.output_json
        : {};
    const { count } = await supabase
      .from("extraction_runs")
      .select("*", { count: "exact", head: true })
      .eq("extraction_type", batchExtractionType)
      .contains("input_config", { parent_run_id: parentRunId })
      .in("status", ["completed", "failed"]);

    await supabase
      .from("actions")
      .update({
        status: "running",
        updated_at: new Date().toISOString(),
        output_json: {
          ...existingOutputJson,
          stage: "map",
          batch_index: count ?? batchIndex,
          completed_batches: count ?? batchIndex,
          total_batches: totalBatches,
          start_page: startPage,
          end_page: endPage,
          ...(docsetProgressContext || {}),
        },
      })
      .eq("id", actionId)
      .throwOnError();
  }

  return {
    ok: true,
    batch_run_id: normalizeUuid(batchRunId),
    parent_run_id: parentRunId,
    batch_index: batchIndex,
    total_batches: totalBatches,
    output_summary: outputSummary,
  };
}
