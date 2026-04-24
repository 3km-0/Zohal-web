import { createHash } from "node:crypto";
import {
  createChatCompletion,
  extractOutputText,
} from "../analysis/ai-provider.js";
import { createHttpTask } from "../runtime/gcp.js";
import {
  getExpectedInternalToken,
  requireInternalCaller,
} from "../runtime/internal-auth.js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient } from "../runtime/supabase.js";

const SEARCH_TASK_QUEUE = String(
  process.env.GCP_ACQUISITION_SEARCH_TASK_QUEUE || "acquisition-search-runs",
).trim();
const TASKS_LOCATION = String(
  process.env.GCP_TASKS_LOCATION || process.env.GCP_WORKFLOWS_LOCATION || "",
).trim();
const BROWSER_WORKER_URL = String(
  process.env.ACQUISITION_BROWSER_WORKER_URL || "",
).trim().replace(/\/+$/, "");

const ALLOWED_SOURCES = new Set(["aqar", "bayut", "haraj", "developer_page", "broker_page"]);
const MVP_SOURCES = ["aqar", "bayut"];
const CANDIDATE_STATUSES = new Set([
  "submitted",
  "screening",
  "needs_info",
  "watch",
  "pursue",
  "pass",
  "promoted",
  "archived",
]);
const OPPORTUNITY_STAGES = new Set([
  "submitted",
  "screening",
  "needs_info",
  "workspace_created",
  "watch",
  "pursue",
  "negotiation",
  "offer",
  "formal_diligence",
  "passed",
  "closed",
  "archived",
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUuid(value) {
  return normalizeText(value).toLowerCase() || null;
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function buildSourceFingerprint(candidate = {}) {
  const source = normalizeText(candidate.source).toLowerCase();
  const url = normalizeText(candidate.source_url || candidate.sourceUrl).toLowerCase().replace(/\/+$/, "");
  const title = normalizeText(candidate.title).toLowerCase();
  const district = normalizeText(candidate.district).toLowerCase();
  const price = normalizeText(candidate.asking_price || candidate.askingPrice);
  const seed = [source, url || title, district, price].join("|");
  return createHash("sha256").update(seed).digest("hex");
}

export function normalizeSources(value) {
  const input = Array.isArray(value) ? value : MVP_SOURCES;
  const normalized = input
    .map((source) => normalizeText(source).toLowerCase())
    .filter((source) => ALLOWED_SOURCES.has(source));
  const unique = [...new Set(normalized)];
  return unique.length ? unique : MVP_SOURCES;
}

export function normalizeSearchLimits(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  return {
    max_result_pages_per_source: clampNumber(input.max_result_pages_per_source, 1, 1, 3),
    max_detail_pages_per_source: clampNumber(input.max_detail_pages_per_source, 8, 1, 20),
    per_source_timeout_ms: clampNumber(input.per_source_timeout_ms, 45_000, 10_000, 120_000),
    per_run_timeout_ms: clampNumber(input.per_run_timeout_ms, 120_000, 30_000, 300_000),
    retry_transient_failures: input.retry_transient_failures === false ? false : true,
  };
}

export function normalizeConfidence(value) {
  if (typeof value === "number") {
    if (value >= 0.75) return "high";
    if (value >= 0.45) return "medium";
    return "low";
  }
  const normalized = normalizeText(value).toLowerCase();
  return ["low", "medium", "high"].includes(normalized) ? normalized : "medium";
}

function numericConfidence(value) {
  const confidence = normalizeConfidence(value);
  if (confidence === "high") return 0.82;
  if (confidence === "low") return 0.32;
  return 0.58;
}

function mapDecisionToCandidateStatus(decision) {
  if (decision === "insufficient_info") return "needs_info";
  return CANDIDATE_STATUSES.has(decision) ? decision : "screening";
}

export function buildScreeningOutput(candidate = {}, mandate = null) {
  const missing = [];
  if (!candidate.city && !candidate.district) missing.push("location");
  if (!candidate.asking_price && !candidate.askingPrice) missing.push("asking_price");
  if (!candidate.property_type && !candidate.propertyType) missing.push("property_type");
  if (!candidate.area_sqm && !candidate.areaSqm) missing.push("area");
  const hasPhotos = Array.isArray(candidate.photo_refs_json || candidate.photoRefs) &&
    (candidate.photo_refs_json || candidate.photoRefs).length > 0;
  if (!hasPhotos) missing.push("photos");

  const mandateBudget = mandate?.budget_range_json && typeof mandate.budget_range_json === "object"
    ? mandate.budget_range_json
    : {};
  const price = Number(candidate.asking_price || candidate.askingPrice || 0);
  const budgetMax = Number(mandateBudget.max || mandateBudget.maximum || 0);
  const overBudget = budgetMax > 0 && price > budgetMax;
  const decision = missing.length >= 3
    ? "insufficient_info"
    : overBudget
      ? "watch"
      : "pursue";
  const confidence = missing.length >= 3 ? "low" : missing.length ? "medium" : "high";

  const evidenceBackedFacts = [
    candidate.title ? { field: "title", value: candidate.title, basis: "source_visible" } : null,
    price ? { field: "asking_price", value: price, basis: "source_visible" } : null,
    candidate.district || candidate.city
      ? { field: "location", value: [candidate.city, candidate.district].filter(Boolean).join(" / "), basis: "source_visible" }
      : null,
    candidate.property_type || candidate.propertyType
      ? { field: "property_type", value: candidate.property_type || candidate.propertyType, basis: "source_visible" }
      : null,
  ].filter(Boolean);

  return {
    decision,
    confidence,
    reasons: [
      overBudget ? "Asking price appears above the saved mandate budget." : "Candidate can be compared against the saved mandate.",
      missing.length ? "Some diligence inputs are still missing." : "Core visible facts are available for a first screen.",
    ],
    evidenceBackedFacts,
    assumptions: missing.length ? [{
      field: "screening_assumption",
      value: "Recommendation is preliminary until missing information is resolved.",
      basis: "user_assumption",
    }] : [],
    missingInformation: missing.map((item) => ({
      type: item === "photos" ? "missing_document" : "missing_fact",
      title: item.replace(/_/g, " "),
      priority: item === "asking_price" ? "high" : "medium",
      status: "open",
    })),
    nextAction: {
      type: decision === "pursue" ? "create_workspace" : decision === "watch" ? "monitor" : decision === "pass" ? "pass" : "request_info",
      label: decision === "pursue" ? "Create workspace" : decision === "watch" ? "Monitor candidate" : decision === "pass" ? "Pass" : "Request missing information",
      payload: {},
    },
  };
}

function parseModelScreening(text) {
  const raw = normalizeText(text);
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  try {
    const parsed = JSON.parse(candidate);
    if (!["pursue", "watch", "pass", "insufficient_info"].includes(parsed.decision)) return null;
    return {
      decision: parsed.decision,
      confidence: normalizeConfidence(parsed.confidence),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 6).map(String) : [],
      evidenceBackedFacts: Array.isArray(parsed.evidenceBackedFacts) ? parsed.evidenceBackedFacts.slice(0, 10) : [],
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.slice(0, 10) : [],
      missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation.slice(0, 10) : [],
      nextAction: parsed.nextAction && typeof parsed.nextAction === "object"
        ? parsed.nextAction
        : { type: parsed.decision === "pursue" ? "create_workspace" : "request_info", label: "Review next action", payload: {} },
    };
  } catch {
    return null;
  }
}

async function buildModelScreeningOutput(candidate, mandate, { requestId } = {}) {
  const providerOverride = normalizeText(process.env.ACQUISITION_SCREENING_PROVIDER || "vertex");
  const model = normalizeText(process.env.ACQUISITION_SCREENING_MODEL || "google/gemini-2.0-flash-001");
  const response = await createChatCompletion({
    model,
    temperature: 0.1,
    max_tokens: 900,
    messages: [
      {
        role: "system",
        content: [
          "You screen Saudi real estate acquisition candidates.",
          "Return only compact JSON with decision, confidence, reasons, evidenceBackedFacts, assumptions, missingInformation, and nextAction.",
          "Allowed decisions: pursue, watch, pass, insufficient_info.",
          "Keep facts, assumptions, and missing information separate.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({ candidate, mandate }),
      },
    ],
  }, {
    providerOverride: providerOverride === "openai" ? "openai" : "vertex",
    workspaceId: candidate.workspace_id,
    requestId,
  });
  return parseModelScreening(extractOutputText(response));
}

function buildEnvelope(requestId, body = {}) {
  return {
    ...body,
    request_id: requestId,
    execution_plane: "gcp",
  };
}

function getInternalTaskHeaders(requestId) {
  const token = getExpectedInternalToken();
  if (!token) throw new Error("Missing internal token for Cloud Tasks / worker calls");
  return {
    authorization: `Bearer ${token}`,
    apikey: token,
    "x-internal-function-jwt": token,
    "x-request-id": requestId,
    "content-type": "application/json",
  };
}

function buildServiceBaseUrl(req) {
  const configured = String(process.env.ACQUISITION_SERVICE_BASE_URL || process.env.ANALYSIS_SERVICE_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = String(req.headers.host || "").trim();
  if (!host) throw new Error("ACQUISITION_SERVICE_BASE_URL not configured");
  const proto = String(req.headers["x-forwarded-proto"] || "").trim() || "https";
  return `${proto}://${host}`;
}

async function scheduleSearchRunTask({ req, requestId, searchRunId }) {
  if (!TASKS_LOCATION) {
    return { enqueued: false, reason: "GCP_TASKS_LOCATION not configured" };
  }
  const task = await createHttpTask({
    queueName: SEARCH_TASK_QUEUE,
    location: TASKS_LOCATION,
    url: `${buildServiceBaseUrl(req)}/internal/acquisition/search-run`,
    payload: { search_run_id: searchRunId, request_id: requestId },
    headers: getInternalTaskHeaders(requestId),
  });
  return { enqueued: true, task_name: task.name || null };
}

async function fetchMandate(supabase, mandateId) {
  if (!mandateId) return null;
  const { data, error } = await supabase
    .from("acquisition_mandates")
    .select("*")
    .eq("id", mandateId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load mandate: ${error.message}`);
  return data || null;
}

async function fetchCandidate(supabase, candidateId) {
  const { data, error } = await supabase
    .from("acquisition_candidate_opportunities")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load candidate: ${error.message}`);
  if (!data) {
    const notFound = new Error("Candidate not found");
    notFound.statusCode = 404;
    throw notFound;
  }
  return data;
}

async function insertEvent(supabase, payload) {
  const { data, error } = await supabase
    .from("acquisition_events")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to insert acquisition event: ${error.message}`);
  return data;
}

async function createCandidateClaimRows(supabase, candidate, screeningOutput) {
  const confidence = numericConfidence(screeningOutput.confidence);
  const rows = [
    ...(screeningOutput.evidenceBackedFacts || []).map((fact) => ({
      candidate_id: candidate.id,
      workspace_id: candidate.workspace_id,
      fact_key: fact.field || "fact",
      value_json: { value: fact.value ?? null },
      basis_label: fact.basis === "source_visible" ? "counterparty_provided" : "uncertain",
      confidence,
      source_channel: candidate.source,
      evidence_refs_json: [{ source_url: candidate.source_url, captured_at: candidate.captured_at }],
    })),
    ...(screeningOutput.assumptions || []).map((fact) => ({
      candidate_id: candidate.id,
      workspace_id: candidate.workspace_id,
      fact_key: fact.field || "assumption",
      value_json: { value: fact.value ?? null },
      basis_label: "modeled_output",
      confidence,
      source_channel: "screening",
      evidence_refs_json: [],
    })),
  ];
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from("acquisition_claims")
    .insert(rows)
    .select("*");
  if (error) throw new Error(`Failed to insert candidate claims: ${error.message}`);
  return data || [];
}

async function createCandidateDiligenceRows(supabase, candidate, screeningOutput) {
  const rows = (screeningOutput.missingInformation || []).map((item) => ({
    candidate_id: candidate.id,
    workspace_id: candidate.workspace_id,
    title: item.title || "Missing information",
    item_type: item.type || "missing_info",
    priority: item.priority || "medium",
    status: item.status || "open",
    owner_kind: "broker",
    evidence_refs_json: [{ source_url: candidate.source_url, captured_at: candidate.captured_at }],
  }));
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from("acquisition_diligence_items")
    .insert(rows)
    .select("*");
  if (error) throw new Error(`Failed to insert candidate diligence: ${error.message}`);
  return data || [];
}

async function upsertCandidateSource(supabase, candidate, sourceDraft, searchRunId) {
  await supabase.from("acquisition_candidate_sources").upsert({
    candidate_id: candidate.id,
    search_run_id: searchRunId || candidate.search_run_id || null,
    workspace_id: candidate.workspace_id,
    source: candidate.source,
    source_url: candidate.source_url,
    source_fingerprint: candidate.source_fingerprint,
    limited_evidence_snapshot_json: sourceDraft.limited_evidence_snapshot_json || sourceDraft.sourceSnapshot || {},
    metadata_json: { title: candidate.title, source: candidate.source },
  }, { onConflict: "candidate_id,source,source_fingerprint" });
}

export async function upsertCandidateDraft(supabase, draft, context = {}) {
  const source = normalizeText(draft.source).toLowerCase();
  if (!source) throw new Error("Candidate source is required");
  const fingerprint = normalizeText(draft.source_fingerprint) || buildSourceFingerprint(draft);
  const payload = {
    workspace_id: context.workspaceId || draft.workspace_id || null,
    search_run_id: context.searchRunId || draft.search_run_id || null,
    mandate_id: context.mandateId || draft.mandate_id || null,
    investor_id: context.investorId || draft.investor_id || null,
    source,
    source_url: draft.source_url || draft.sourceUrl || null,
    source_fingerprint: fingerprint,
    limited_evidence_snapshot_json: draft.limited_evidence_snapshot_json || draft.sourceSnapshot || {},
    captured_at: draft.captured_at || draft.capturedAt || new Date().toISOString(),
    title: draft.title || null,
    asking_price: draft.asking_price ?? draft.askingPrice ?? null,
    city: draft.city || null,
    district: draft.district || null,
    property_type: draft.property_type || draft.propertyType || null,
    area_sqm: draft.area_sqm ?? draft.areaSqm ?? null,
    bedroom_count: draft.bedroom_count ?? draft.bedroomCount ?? null,
    bathroom_count: draft.bathroom_count ?? draft.bathroomCount ?? null,
    photo_refs_json: draft.photo_refs_json || draft.photoRefs || [],
    short_description: draft.short_description || draft.shortDescription || null,
    terms_policy: ["allowed", "restricted", "unknown"].includes(draft.terms_policy || draft.termsPolicy)
      ? draft.terms_policy || draft.termsPolicy
      : "unknown",
    status: CANDIDATE_STATUSES.has(draft.status) ? draft.status : "submitted",
  };
  const { data, error } = await supabase
    .from("acquisition_candidate_opportunities")
    .upsert(payload, { onConflict: "workspace_id,source_fingerprint" })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to upsert candidate: ${error?.message || "unknown"}`);
  await upsertCandidateSource(supabase, data, draft, context.searchRunId);
  return data;
}

async function screenCandidate(supabase, candidateId, options = {}) {
  const candidate = await fetchCandidate(supabase, candidateId);
  const mandate = await fetchMandate(supabase, candidate.mandate_id);
  let output = null;
  try {
    output = await buildModelScreeningOutput(candidate, mandate, options);
  } catch {
    output = null;
  }
  output ||= buildScreeningOutput(candidate, mandate);
  const status = mapDecisionToCandidateStatus(output.decision);
  const { data, error } = await supabase
    .from("acquisition_candidate_opportunities")
    .update({
      screening_decision: output.decision,
      screening_output_json: output,
      status,
    })
    .eq("id", candidate.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to update candidate screening: ${error?.message || "unknown"}`);
  await createCandidateClaimRows(supabase, data, output);
  await createCandidateDiligenceRows(supabase, data, output);
  return { candidate: data, screening: output };
}

async function promoteCandidate(supabase, candidateId) {
  const candidate = await fetchCandidate(supabase, candidateId);
  const screening = candidate.screening_output_json && Object.keys(candidate.screening_output_json).length
    ? candidate.screening_output_json
    : buildScreeningOutput(candidate, await fetchMandate(supabase, candidate.mandate_id));
  const title = candidate.title || "Acquisition opportunity";
  const { data: opportunity, error: opportunityError } = await supabase
    .from("acquisition_opportunities")
    .insert({
      workspace_id: candidate.workspace_id,
      phone_number: "api",
      source_channel: candidate.source || "api",
      stage: "workspace_created",
      title,
      summary: screening.reasons?.join(" ") || null,
      opportunity_kind: "property_submission",
      acquisition_focus: "screening",
      screening_readiness: screening.decision === "insufficient_info" ? "needs_info" : "screened",
      missing_info_json: (screening.missingInformation || []).map((item) => item.title || item.type || "missing_information"),
      metadata_json: {
        candidate_id: candidate.id,
        screening,
        source_url: candidate.source_url,
      },
    })
    .select("*")
    .single();
  if (opportunityError || !opportunity) throw new Error(`Failed to promote candidate: ${opportunityError?.message || "unknown"}`);

  const { data: candidateClaims } = await supabase
    .from("acquisition_claims")
    .select("*")
    .eq("candidate_id", candidate.id);
  if (candidateClaims?.length) {
    await supabase.from("acquisition_claims").insert(candidateClaims.map((claim) => ({
      opportunity_id: opportunity.id,
      workspace_id: opportunity.workspace_id,
      fact_key: claim.fact_key,
      value_json: claim.value_json,
      basis_label: claim.basis_label,
      confidence: claim.confidence,
      source_channel: claim.source_channel,
      evidence_refs_json: claim.evidence_refs_json,
      created_by: claim.created_by,
    })));
  }

  const { data: candidateDiligence } = await supabase
    .from("acquisition_diligence_items")
    .select("*")
    .eq("candidate_id", candidate.id);
  if (candidateDiligence?.length) {
    await supabase.from("acquisition_diligence_items").insert(candidateDiligence.map((item) => ({
      opportunity_id: opportunity.id,
      workspace_id: opportunity.workspace_id,
      title: item.title,
      item_type: item.item_type,
      priority: item.priority,
      status: item.status,
      owner_kind: item.owner_kind,
      due_at: item.due_at,
      evidence_refs_json: item.evidence_refs_json,
    })));
  }

  await supabase.from("acquisition_scenarios").insert({
    opportunity_id: opportunity.id,
    workspace_id: opportunity.workspace_id,
    scenario_kind: "base",
    title: "Base scenario",
    assumptions_json: {
      asking_price: candidate.asking_price,
      area_sqm: candidate.area_sqm,
      candidate_id: candidate.id,
    },
    outputs_json: {
      screening_decision: screening.decision,
      confidence: screening.confidence,
    },
    editable: true,
  });

  await insertEvent(supabase, {
    opportunity_id: opportunity.id,
    workspace_id: opportunity.workspace_id,
    event_type: "candidate_promoted",
    event_direction: "system",
    body_text: `Candidate promoted: ${title}`,
    event_payload: { candidate_id: candidate.id, screening },
  });
  await insertEvent(supabase, {
    opportunity_id: opportunity.id,
    workspace_id: opportunity.workspace_id,
    event_type: "workspace_created",
    event_direction: "system",
    body_text: "Acquisition workspace created from candidate.",
    event_payload: { candidate_id: candidate.id },
  });

  const { data: promoted, error: promotedError } = await supabase
    .from("acquisition_candidate_opportunities")
    .update({
      status: "promoted",
      promoted_opportunity_id: opportunity.id,
    })
    .eq("id", candidate.id)
    .select("*")
    .single();
  if (promotedError) throw new Error(`Failed to link promoted candidate: ${promotedError.message}`);
  return { candidate: promoted, opportunity };
}

async function callBrowserWorker({ requestId, searchRun, mandate }) {
  if (!BROWSER_WORKER_URL) {
    return { candidates: [], adapter_runs: [], skipped: true, reason: "ACQUISITION_BROWSER_WORKER_URL not configured" };
  }
  const response = await fetch(`${BROWSER_WORKER_URL}/internal/search-run`, {
    method: "POST",
    headers: getInternalTaskHeaders(requestId),
    body: JSON.stringify({
      search_run,
      mandate,
      request_id: requestId,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || `Browser worker failed (${response.status})`);
  }
  return json;
}

async function processSearchRun({ supabase, requestId, searchRunId }) {
  const { data: searchRun, error } = await supabase
    .from("acquisition_search_runs")
    .select("*")
    .eq("id", searchRunId)
    .maybeSingle();
  if (error || !searchRun) {
    const wrapped = new Error(error?.message || "Search run not found");
    wrapped.statusCode = 404;
    throw wrapped;
  }
  await supabase.from("acquisition_search_runs").update({
    status: "running",
    started_at: new Date().toISOString(),
  }).eq("id", searchRun.id);

  try {
    const mandate = await fetchMandate(supabase, searchRun.mandate_id);
    const browserResult = await callBrowserWorker({ requestId, searchRun, mandate });
    const candidates = [];
    for (const draft of browserResult.candidates || []) {
      const candidate = await upsertCandidateDraft(supabase, draft, {
        workspaceId: searchRun.workspace_id,
        searchRunId: searchRun.id,
        mandateId: searchRun.mandate_id,
        investorId: searchRun.user_id,
      });
      const screened = await screenCandidate(supabase, candidate.id, { requestId });
      candidates.push(screened.candidate);
    }
    for (const adapterRun of browserResult.adapter_runs || []) {
      await supabase.from("acquisition_adapter_runs").insert({
        search_run_id: searchRun.id,
        workspace_id: searchRun.workspace_id,
        source: adapterRun.source,
        status: adapterRun.status || "completed",
        cards_seen: adapterRun.cards_seen || 0,
        detail_pages_fetched: adapterRun.detail_pages_fetched || 0,
        candidates_created: adapterRun.candidates_created || 0,
        failure_count: adapterRun.failure_count || 0,
        screenshot_refs_json: adapterRun.screenshot_refs_json || [],
        limited_snapshot_refs_json: adapterRun.limited_snapshot_refs_json || [],
        error_json: adapterRun.error_json || {},
        completed_at: new Date().toISOString(),
      });
    }
    const completedAt = new Date().toISOString();
    const { data: updated } = await supabase.from("acquisition_search_runs").update({
      status: "completed",
      completed_at: completedAt,
      candidate_count: candidates.length,
      error_summary: browserResult.skipped ? browserResult.reason : null,
    }).eq("id", searchRun.id).select("*").single();
    return { search_run: updated, candidates };
  } catch (runError) {
    await supabase.from("acquisition_search_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_summary: runError instanceof Error ? runError.message : String(runError),
    }).eq("id", searchRun.id);
    throw runError;
  }
}

async function createMandate(supabase, body) {
  const payload = {
    workspace_id: normalizeUuid(body.workspace_id),
    organization_id: normalizeUuid(body.organization_id),
    user_id: normalizeUuid(body.user_id),
    status: normalizeText(body.status) || "active",
    title: normalizeText(body.title) || "Acquisition mandate",
    buy_box_json: body.buy_box || body.buy_box_json || {},
    target_locations_json: body.target_locations || body.target_locations_json || [],
    budget_range_json: body.budget_range || body.budget_range_json || {},
    risk_appetite: body.risk_appetite || null,
    excluded_criteria_json: body.excluded_criteria || body.excluded_criteria_json || [],
    confidence_json: body.confidence || body.confidence_json || {},
  };
  const { data, error } = await supabase
    .from("acquisition_mandates")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create mandate: ${error.message}`);
  return data;
}

async function createSearchRun(supabase, mandateId, body) {
  const mandate = await fetchMandate(supabase, mandateId);
  if (!mandate) {
    const error = new Error("Mandate not found");
    error.statusCode = 404;
    throw error;
  }
  const sources = normalizeSources(body.sources);
  const limits = normalizeSearchLimits(body.limits);
  const { data, error } = await supabase
    .from("acquisition_search_runs")
    .insert({
      workspace_id: mandate.workspace_id || normalizeUuid(body.workspace_id),
      mandate_id: mandate.id,
      user_id: mandate.user_id || normalizeUuid(body.user_id),
      status: "queued",
      trigger_kind: "manual",
      sources_json: sources,
      query_description: normalizeText(body.query_description) || normalizeText(mandate.title),
      limits_json: limits,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create search run: ${error.message}`);
  return data;
}

async function createListingCandidate(supabase, body) {
  const candidate = await upsertCandidateDraft(supabase, {
    ...body,
    source: body.source || "user_provided_listing",
    source_url: body.source_url || body.url || null,
    limited_evidence_snapshot_json: body.limited_evidence_snapshot || {
      text: normalizeText(body.text || body.description).slice(0, 1200),
      submitted_at: new Date().toISOString(),
    },
    captured_at: new Date().toISOString(),
  }, {
    workspaceId: normalizeUuid(body.workspace_id),
    mandateId: normalizeUuid(body.mandate_id),
    investorId: normalizeUuid(body.user_id || body.investor_id),
  });
  return await screenCandidate(supabase, candidate.id);
}

async function enrichOpportunity(supabase, opportunityId, body = {}) {
  const { data: opportunity, error } = await supabase
    .from("acquisition_opportunities")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();
  if (error || !opportunity) {
    const wrapped = new Error(error?.message || "Opportunity not found");
    wrapped.statusCode = 404;
    throw wrapped;
  }
  const kind = normalizeText(body.kind) || "market";
  if (!["market", "condition"].includes(kind)) {
    return { opportunity, skipped: true, reason: "unsupported_enrichment_kind" };
  }
  if (kind === "condition") {
    const photoRefs = opportunity.metadata_json?.photo_refs || opportunity.metadata_json?.photoRefs || [];
    const capexMatters = Boolean(opportunity.metadata_json?.renovation_matters || body.capex_matters);
    if (!Array.isArray(photoRefs) || !photoRefs.length || !capexMatters) {
      return { opportunity, skipped: true, reason: "condition_enrichment_requires_photos_and_capex_relevance" };
    }
  }
  const basis = kind === "market" ? "market_signal" : "modeled_output";
  const { data: claim, error: claimError } = await supabase.from("acquisition_claims").insert({
    opportunity_id: opportunity.id,
    workspace_id: opportunity.workspace_id,
    fact_key: kind === "market" ? "valuation_context" : "condition_context",
    value_json: {
      status: "placeholder",
      note: kind === "market"
        ? "Aqarsas enrichment hook is ready; external call is intentionally not executed in this MVP pass."
        : "Restb.ai enrichment hook is ready; external call is intentionally not executed in this MVP pass.",
    },
    basis_label: basis,
    confidence: 0.5,
    source_channel: kind === "market" ? "aqarsas" : "restb_ai",
    evidence_refs_json: [],
  }).select("*").single();
  if (claimError) throw new Error(`Failed to write enrichment claim: ${claimError.message}`);
  return { opportunity, claim, skipped: false };
}

async function addOpportunityNote(supabase, opportunityId, body = {}) {
  const { data: opportunity, error } = await supabase
    .from("acquisition_opportunities")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();
  if (error || !opportunity) {
    const wrapped = new Error(error?.message || "Opportunity not found");
    wrapped.statusCode = 404;
    throw wrapped;
  }
  const event = await insertEvent(supabase, {
    opportunity_id: opportunity.id,
    workspace_id: opportunity.workspace_id,
    created_by: normalizeUuid(body.user_id),
    event_type: "operator_note",
    event_direction: "operator",
    body_text: normalizeText(body.note || body.body_text),
    event_payload: body.payload || {},
  });
  return { opportunity, event };
}

async function updateOpportunityStage(supabase, opportunityId, body = {}) {
  const stage = normalizeText(body.stage);
  if (!OPPORTUNITY_STAGES.has(stage)) {
    const error = new Error("Invalid opportunity stage");
    error.statusCode = 400;
    throw error;
  }
  const { data, error } = await supabase
    .from("acquisition_opportunities")
    .update({ stage })
    .eq("id", opportunityId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to update opportunity stage: ${error?.message || "unknown"}`);
  await insertEvent(supabase, {
    opportunity_id: data.id,
    workspace_id: data.workspace_id,
    created_by: normalizeUuid(body.user_id),
    event_type: "stage_updated",
    event_direction: "operator",
    body_text: `Stage updated to ${stage}`,
    event_payload: { stage },
  });
  return data;
}

function matchRoute(method, pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "acquisition" || parts[2] !== "v1") return null;
  if (method === "POST" && parts[3] === "mandates" && parts.length === 4) return { name: "createMandate" };
  if (method === "POST" && parts[3] === "mandates" && parts[5] === "search-runs") return { name: "createSearchRun", mandateId: parts[4] };
  if (method === "GET" && parts[3] === "search-runs" && parts.length === 5) return { name: "getSearchRun", searchRunId: parts[4] };
  if (method === "GET" && parts[3] === "search-runs" && parts[5] === "candidates") return { name: "listSearchCandidates", searchRunId: parts[4] };
  if (method === "POST" && parts[3] === "intake" && parts[4] === "listing") return { name: "intakeListing" };
  if (method === "POST" && parts[3] === "candidates" && parts[5] === "screen") return { name: "screenCandidate", candidateId: parts[4] };
  if (method === "POST" && parts[3] === "candidates" && parts[5] === "promote") return { name: "promoteCandidate", candidateId: parts[4] };
  if (method === "GET" && parts[3] === "opportunities" && parts.length === 5) return { name: "getOpportunity", opportunityId: parts[4] };
  if (method === "POST" && parts[3] === "opportunities" && parts[5] === "enrich") return { name: "enrichOpportunity", opportunityId: parts[4] };
  if (method === "POST" && parts[3] === "opportunities" && parts[5] === "notes") return { name: "addOpportunityNote", opportunityId: parts[4] };
  if (method === "POST" && parts[3] === "opportunities" && parts[5] === "stage") return { name: "updateOpportunityStage", opportunityId: parts[4] };
  return null;
}

export function isAcquisitionApiRoute(method, pathname) {
  return Boolean(matchRoute(method, pathname));
}

export async function handleAcquisitionApi(req, res, { requestId, log, readJsonBody, supabase = createServiceClient() }) {
  const route = matchRoute(req.method, new URL(req.url || "/", "http://localhost").pathname);
  if (!route) return false;
  try {
    requireInternalCaller(req.headers);
    const body = req.method === "GET" ? {} : await readJsonBody(req);
    if (route.name === "createMandate") {
      const mandate = await createMandate(supabase, body);
      return sendJson(res, 201, buildEnvelope(requestId, { mandate }));
    }
    if (route.name === "createSearchRun") {
      const searchRun = await createSearchRun(supabase, route.mandateId, body);
      const queue = await scheduleSearchRunTask({ req, requestId, searchRunId: searchRun.id });
      return sendJson(res, 202, buildEnvelope(requestId, { search_run: searchRun, queue }));
    }
    if (route.name === "getSearchRun") {
      const { data, error } = await supabase.from("acquisition_search_runs").select("*").eq("id", route.searchRunId).single();
      if (error) throw error;
      return sendJson(res, 200, buildEnvelope(requestId, { search_run: data }));
    }
    if (route.name === "listSearchCandidates") {
      const { data, error } = await supabase.from("acquisition_candidate_opportunities").select("*").eq("search_run_id", route.searchRunId).order("updated_at", { ascending: false });
      if (error) throw error;
      return sendJson(res, 200, buildEnvelope(requestId, { candidates: data || [] }));
    }
    if (route.name === "intakeListing") {
      const result = await createListingCandidate(supabase, body);
      return sendJson(res, 201, buildEnvelope(requestId, result));
    }
    if (route.name === "screenCandidate") {
      const result = await screenCandidate(supabase, route.candidateId, { requestId });
      return sendJson(res, 200, buildEnvelope(requestId, result));
    }
    if (route.name === "promoteCandidate") {
      const result = await promoteCandidate(supabase, route.candidateId);
      return sendJson(res, 201, buildEnvelope(requestId, result));
    }
    if (route.name === "getOpportunity") {
      const { data, error } = await supabase.from("acquisition_opportunities").select("*, acquisition_claims(*), acquisition_diligence_items(*), acquisition_events(*), acquisition_threads(*)").eq("id", route.opportunityId).single();
      if (error) throw error;
      return sendJson(res, 200, buildEnvelope(requestId, { opportunity: data }));
    }
    if (route.name === "enrichOpportunity") {
      return sendJson(res, 200, buildEnvelope(requestId, await enrichOpportunity(supabase, route.opportunityId, body)));
    }
    if (route.name === "addOpportunityNote") {
      return sendJson(res, 201, buildEnvelope(requestId, await addOpportunityNote(supabase, route.opportunityId, body)));
    }
    if (route.name === "updateOpportunityStage") {
      return sendJson(res, 200, buildEnvelope(requestId, { opportunity: await updateOpportunityStage(supabase, route.opportunityId, body) }));
    }
  } catch (error) {
    log?.error?.("Acquisition API error", { error: error instanceof Error ? error.message : String(error) });
    return sendJson(res, error.statusCode || 500, buildEnvelope(requestId, { error: error.message || "Acquisition API error" }));
  }
  return false;
}

export async function handleAcquisitionInternal(req, res, { requestId, log, readJsonBody, supabase = createServiceClient() }) {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (!pathname.startsWith("/internal/acquisition/")) return false;
  try {
    requireInternalCaller(req.headers);
    const body = await readJsonBody(req);
    if (pathname === "/internal/acquisition/search-run") {
      const result = await processSearchRun({ supabase, requestId, searchRunId: normalizeUuid(body.search_run_id) });
      return sendJson(res, 200, buildEnvelope(requestId, result));
    }
    if (pathname === "/internal/acquisition/screen-candidate") {
      return sendJson(res, 200, buildEnvelope(requestId, await screenCandidate(supabase, normalizeUuid(body.candidate_id), { requestId })));
    }
    if (pathname === "/internal/acquisition/enrich-opportunity") {
      return sendJson(res, 200, buildEnvelope(requestId, await enrichOpportunity(supabase, normalizeUuid(body.opportunity_id), body)));
    }
    return sendJson(res, 404, buildEnvelope(requestId, { error: "Not found" }));
  } catch (error) {
    log?.error?.("Internal acquisition error", { error: error instanceof Error ? error.message : String(error) });
    return sendJson(res, error.statusCode || 500, buildEnvelope(requestId, { error: error.message || "Internal acquisition error" }));
  }
}

export const __test = {
  buildScreeningOutput,
  buildSourceFingerprint,
  createListingCandidate,
  createMandate,
  createSearchRun,
  normalizeSearchLimits,
  normalizeSources,
  promoteCandidate,
  screenCandidate,
  upsertCandidateDraft,
};
