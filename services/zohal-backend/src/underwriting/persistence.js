import { assertWorkspaceWriteAccess } from "../renovation/catalog.js";
import {
  UNDERWRITING_ENGINE_VERSION,
  runUnderwritingEngine,
} from "./engine.js";

function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase() || null;
}

async function maybeSingle(query, label) {
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load ${label}: ${error.message}`);
  return data || null;
}

async function loadLatestMandate(supabase, workspaceId) {
  if (!workspaceId) return null;
  return maybeSingle(
    supabase
      .from("acquisition_mandates")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(1),
    "acquisition mandate",
  ).catch(() => null);
}

async function loadLatestBaseScenario(supabase, opportunityId) {
  if (!opportunityId) return null;
  return maybeSingle(
    supabase
      .from("acquisition_scenarios")
      .select("*")
      .eq("opportunity_id", opportunityId)
      .eq("scenario_kind", "base")
      .order("updated_at", { ascending: false })
      .limit(1),
    "acquisition scenario",
  ).catch(() => null);
}

async function persistUnderwritingScenario(supabase, { opportunity, scenario, result, input, userId }) {
  const assumptionsJson = {
    underwriting_engine_version: UNDERWRITING_ENGINE_VERSION,
    source: "underwriting_run",
    mode: input.mode === "deep" ? "deep" : "quick",
    user_edits: input.assumptions || input || {},
    normalized: result.assumptions,
  };
  const outputsJson = {
    ...(scenario?.outputs_json && typeof scenario.outputs_json === "object" ? scenario.outputs_json : {}),
    underwriting: {
      underwriting_engine_version: UNDERWRITING_ENGINE_VERSION,
      status: result.status,
      generated_at: new Date().toISOString(),
      generated_by: userId || null,
      ...result.outputs,
    },
  };
  const payload = {
    opportunity_id: opportunity.id,
    workspace_id: opportunity.workspace_id,
    scenario_kind: "base",
    title: "Base underwriting",
    assumptions_json: assumptionsJson,
    outputs_json: outputsJson,
    editable: true,
  };

  if (scenario?.id) {
    const { data, error } = await supabase
      .from("acquisition_scenarios")
      .update(payload)
      .eq("id", scenario.id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update underwriting scenario: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase
    .from("acquisition_scenarios")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to insert underwriting scenario: ${error.message}`);
  return data;
}

export async function runAndPersistUnderwriting({
  supabase,
  opportunityId,
  input = {},
  userId = null,
  allowInternal = false,
}) {
  const { data: opportunity, error: opportunityError } = await supabase
    .from("acquisition_opportunities")
    .select("*")
    .eq("id", normalizeUuid(opportunityId))
    .maybeSingle();
  if (opportunityError) throw opportunityError;
  if (!opportunity) {
    const error = new Error("opportunity_not_found");
    error.statusCode = 404;
    throw error;
  }

  if (!allowInternal) {
    await assertWorkspaceWriteAccess(supabase, opportunity.workspace_id, userId);
  }

  const [mandate, existingScenario] = await Promise.all([
    loadLatestMandate(supabase, opportunity.workspace_id),
    loadLatestBaseScenario(supabase, opportunity.id),
  ]);
  const mode = input.mode === "deep" ? "deep" : "quick";
  const result = runUnderwritingEngine({ opportunity, mandate, input, mode });
  const scenario = input.save === false
    ? existingScenario
    : await persistUnderwritingScenario(supabase, {
      opportunity,
      scenario: existingScenario,
      result,
      input: { ...input, mode },
      userId,
    });

  return {
    opportunity_id: opportunity.id,
    workspace_id: opportunity.workspace_id,
    scenario,
    underwriting: {
      underwriting_engine_version: UNDERWRITING_ENGINE_VERSION,
      status: result.status,
      assumptions: result.assumptions,
      ...result.outputs,
    },
  };
}
