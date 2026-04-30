import {
  createChatCompletion,
  extractOutputText,
  getAIStageConfig,
} from "../analysis/ai-provider.js";
import {
  assertWorkspaceWriteAccess,
  loadRenovationCatalog,
  resolveRequestedCity,
} from "./catalog.js";
import { extractPropertyMetrics, estimateQuantities } from "./quantities.js";
import { estimateCapex } from "./pricing.js";
import {
  ESTIMATOR_VERSION,
  interpretScopeInput,
  normalizeFinishLevel,
  normalizeStrategy,
} from "./scope.js";
import { saveCapexEstimate } from "./persistence.js";

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function hasAIKey() {
  return Boolean(String(process.env.OPENAI_API_KEY || process.env.VERTEX_OPENAI_API_KEY || process.env.VERTEX_BEARER_TOKEN || "").trim());
}

const RENOVATION_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "interpret_renovation_scope",
      description: "Map messy renovation intent into Zohal's strict strategy, finish level, scope, unknowns, and missing evidence schema. Do not price anything.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          strategy: { type: "string", enum: ["cosmetic_refresh", "rental_ready", "value_add", "premium_repositioning", "custom_scope"] },
          finish_level: { type: "string", enum: ["economy", "standard", "mid_grade", "premium", "luxury"] },
          included_scope: { type: "array", items: { type: "string" } },
          excluded_scope: { type: "array", items: { type: "string" } },
          unknowns: { type: "array", items: { type: "string" } },
          missing_evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { type: "string" },
                label: { type: "string" },
                suggested_action: { type: "string" },
              },
              required: ["type", "label", "suggested_action"],
            },
          },
        },
        required: ["strategy", "finish_level", "included_scope", "excluded_scope", "unknowns", "missing_evidence"],
      },
    },
  },
];

function parseToolArguments(completion) {
  const choice = Array.isArray(completion?.choices) ? completion.choices[0] : null;
  const toolCall = choice?.message?.tool_calls?.find((item) =>
    item?.function?.name === "interpret_renovation_scope"
  );
  if (!toolCall?.function?.arguments) return null;
  return parseJsonObject(toolCall.function.arguments);
}

async function interpretScopeWithAI({ input, opportunity, requestId, workspaceId }) {
  if (input.use_ai === false || !hasAIKey()) return null;
  const system = [
    "You are Zohal's Renovation Capex Agent operating inside an Acquisition Workspace.",
    "Use the interpret_renovation_scope tool for renovation intent.",
    "You may interpret messy renovation intent, but you must not calculate or invent prices, rates, or totals.",
    "Use concise snake_case scope codes that can map to renovation assemblies.",
  ].join("\n");
  const user = JSON.stringify({
    user_notes: input.user_notes || input.notes || "",
    requested_strategy: input.strategy || null,
    requested_finish_level: input.finish_level || input.finishLevel || null,
    opportunity_summary: opportunity.summary || null,
    opportunity_metadata: opportunity.metadata_json || {},
  });
  try {
    const config = getAIStageConfig("generator");
    const completion = await createChatCompletion({
      model: config.model,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: RENOVATION_AGENT_TOOLS,
      tool_choice: { type: "function", function: { name: "interpret_renovation_scope" } },
    }, { requestId, workspaceId, providerOverride: config.providerOverride });
    const parsed = parseToolArguments(completion) || parseJsonObject(extractOutputText(completion));
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...parsed,
      strategy: normalizeStrategy(parsed.strategy || input.strategy),
      finish_level: normalizeFinishLevel(parsed.finish_level || input.finish_level),
    };
  } catch {
    return null;
  }
}

function buildExplanation(estimate) {
  if (!estimate?.base_total) {
    return {
      label: estimate?.planning_estimate_label || "Planning estimate - not a contractor quote",
      summary: "Scope was structured, but pricing is blocked until an active renovation rate card exists.",
      next_action: "Seed an active Riyadh rate card, then regenerate the capex estimate.",
    };
  }
  return {
    label: estimate.planning_estimate_label,
    summary: `Estimated capex range is ${estimate.low_total}-${estimate.high_total} ${estimate.currency}, with ${estimate.confidence_label} confidence.`,
    next_action: estimate.missing_evidence?.[0]?.suggested_action || "Confirm key quantities before using this in a final offer.",
  };
}

export async function runRenovationCapexAgent({
  supabase,
  opportunityId,
  input = {},
  requestId,
  userId = null,
  allowInternal = false,
}) {
  const { data: opportunity, error: opportunityError } = await supabase
    .from("acquisition_opportunities")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();
  if (opportunityError) throw opportunityError;
  if (!opportunity) {
    const error = new Error("opportunity_not_found");
    error.statusCode = 404;
    throw error;
  }

  let workspace = null;
  if (!allowInternal) {
    workspace = await assertWorkspaceWriteAccess(supabase, opportunity.workspace_id, userId);
  } else if (opportunity.workspace_id) {
    const { data } = await supabase
      .from("workspaces")
      .select("id, owner_id, org_id")
      .eq("id", opportunity.workspace_id)
      .maybeSingle();
    workspace = data || null;
  }

  const aiScope = await interpretScopeWithAI({
    input,
    opportunity,
    requestId,
    workspaceId: opportunity.workspace_id,
  });
  const scope = interpretScopeInput({
    ...input,
    ...(aiScope || {}),
    scope_overrides: {
      include: aiScope?.included_scope || input.scope_overrides?.include || input.include_scope || [],
      exclude: aiScope?.excluded_scope || input.scope_overrides?.exclude || input.exclude_scope || [],
    },
  }, opportunity);
  if (Array.isArray(aiScope?.unknowns)) scope.unknowns = aiScope.unknowns;
  if (Array.isArray(aiScope?.missing_evidence)) scope.missing_evidence = aiScope.missing_evidence;

  const metrics = extractPropertyMetrics(opportunity, input);
  const quantities = estimateQuantities(metrics);
  const cityResolution = resolveRequestedCity(metrics, opportunity, input);
  const catalog = await loadRenovationCatalog(supabase, {
    cityCode: cityResolution.requestedCityCode,
    workspaceId: opportunity.workspace_id,
    orgId: workspace?.org_id || null,
  });
  const estimate = estimateCapex({
    catalog,
    scope,
    quantities,
    metrics,
    requestedCityCode: cityResolution.requestedCityCode,
    cityFallbackUsed: cityResolution.cityFallbackUsed,
  });
  estimate.missing_evidence = [
    ...(estimate.missing_evidence || []),
    ...(scope.missing_evidence || []),
  ];

  let saveResult = null;
  if (input.save !== false) {
    saveResult = await saveCapexEstimate(supabase, {
      opportunityId,
      scenarioId: input.scenario_id || input.acquisition_scenario_id || null,
      orgId: workspace?.org_id || input.org_id || null,
      eventType: input.event_type || "generated",
      rateCardId: estimate.rate_card_id || null,
      estimatorVersion: ESTIMATOR_VERSION,
      inputJson: {
        ...input,
        interpreted_scope: scope,
        quantities,
      },
      outputJson: estimate,
      createdBy: userId,
    });
  }

  return {
    estimate,
    scope,
    catalog_status: {
      city: estimate.city,
      city_fallback_used: estimate.city_fallback_used,
      pricing_available: catalog.pricing_available,
      rate_card_id: estimate.rate_card_id,
      missing_rate_card: !catalog.pricing_available,
    },
    event: saveResult,
    explanation: buildExplanation(estimate),
  };
}
