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
const OPPORTUNITY_SOURCE_CHANNELS = new Set([
  "whatsapp",
  "aqar",
  "bayut",
  "haraj",
  "user_provided_listing",
  "developer_page",
  "broker_page",
  "broker_whatsapp",
  "manual_operator",
  "operator",
  "api",
]);
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
  "visit_requested",
  "quote_requested",
  "negotiation",
  "offer",
  "offer_drafted",
  "offer_submitted",
  "formal_diligence",
  "passed",
  "closed",
  "archived",
]);
const READINESS_LEVEL_MIN = 0;
const READINESS_LEVEL_MAX = 5;
const KYC_STATES = new Set(["not_started", "basic_verified", "buyer_verified", "brokerage_ready", "restricted", "escalated"]);
const BUYER_TYPES = new Set(["individual", "company", "family_office", "other"]);
const EVIDENCE_STATUSES = new Set(["pending", "self_declared", "verified", "rejected", "expired", "revoked"]);
const ACTION_TYPES_REQUIRING_BROKERAGE = new Set(["send_outreach", "send_offer", "send_negotiation_message"]);
const EXTERNAL_ACTION_TYPES = new Set([
  "send_outreach",
  "share_readiness_signal",
  "share_document",
  "schedule_visit",
  "send_offer",
  "send_negotiation_message",
]);
const HIGH_RISK_SEVERITIES = new Set(["high", "critical"]);
const RESOLVED_FLAG_STATUSES = new Set(["resolved", "waived"]);

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

function opportunitySourceChannelForCandidate(candidate = {}) {
  const source = normalizeText(candidate.source).toLowerCase();
  return OPPORTUNITY_SOURCE_CHANNELS.has(source) ? source : "whatsapp";
}

function candidateNeedsContactAccess(candidate = {}) {
  const snapshot = candidate.limited_evidence_snapshot_json && typeof candidate.limited_evidence_snapshot_json === "object"
    ? candidate.limited_evidence_snapshot_json
    : {};
  const contact = snapshot.contact_access && typeof snapshot.contact_access === "object" ? snapshot.contact_access : {};
  return contact.status === "requires_sign_in" || contact.reason === "broker_contact_gated";
}

function normalizePhotoRefs(value) {
  const refs = Array.isArray(value) ? value : [];
  return [...new Set(refs
    .map((item) => normalizeText(item))
    .filter((item) => /^https?:\/\//i.test(item))
    .filter((item) => !/\.(svg|gif)(?:$|[?#])/i.test(item))
  )].slice(0, 12);
}

function normalizeComparable(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function aliasesFor(value) {
  const normalized = normalizeComparable(value);
  const aliases = new Set([normalized]);
  if (normalized.includes("riyadh")) aliases.add("الرياض");
  if (normalized.includes("jeddah")) aliases.add("جده");
  if (normalized.includes("al arid") || normalized.includes("alarid") || normalized.includes("العرض") || normalized.includes("العارض")) aliases.add("العارض");
  if (normalized.includes("al narjis")) aliases.add("النرجس");
  if (normalized.includes("al malqa")) aliases.add("الملقا");
  if (normalized.includes("villa")) {
    aliases.add("فيلا");
    aliases.add("فلل");
  }
  if (normalized.includes("apartment")) {
    aliases.add("شقه");
    aliases.add("شقق");
  }
  return [...aliases].filter(Boolean);
}

function textMatchesAny(text, values) {
  const normalizedText = normalizeComparable(text);
  return values.some((value) => aliasesFor(value).some((alias) => alias && normalizedText.includes(alias)));
}

export function buildMandateFit(candidate = {}, mandate = null) {
  const buyBox = mandate?.buy_box_json && typeof mandate.buy_box_json === "object" ? mandate.buy_box_json : {};
  const targetLocations = Array.isArray(mandate?.target_locations_json) ? mandate.target_locations_json : [];
  const budget = mandate?.budget_range_json && typeof mandate.budget_range_json === "object" ? mandate.budget_range_json : {};
  const candidateText = [
    candidate.title,
    candidate.short_description,
    candidate.city,
    candidate.district,
    candidate.property_type,
  ].filter(Boolean).join(" ");
  const targetCity = buyBox.city || targetLocations.find((item) => /riyadh|jeddah|الرياض|جدة/i.test(String(item)));
  const targetDistricts = buyBox.district
    ? [buyBox.district]
    : targetLocations.filter((item) => !textMatchesAny(item, [targetCity].filter(Boolean)));
  const targetType = buyBox.property_type || buyBox.asset_type;
  const price = Number(candidate.asking_price || candidate.askingPrice || 0);
  const budgetMin = Number(budget.min || budget.minimum || 0);
  const budgetMax = Number(budget.max || budget.maximum || 0);

  const cityMatch = targetCity ? textMatchesAny([candidate.city, candidateText].filter(Boolean).join(" "), [targetCity]) : true;
  const districtText = [
    candidate.district,
    candidate.title,
    candidate.source_url,
  ].filter(Boolean).join(" ");
  const districtMatch = targetDistricts.length ? textMatchesAny(districtText, targetDistricts) : true;
  const typeMatch = targetType ? textMatchesAny([candidate.property_type, candidateText].filter(Boolean).join(" "), [targetType]) : true;
  const budgetMatch = price > 0 && (!budgetMax || price <= budgetMax) && (!budgetMin || price >= budgetMin);
  const overBudget = price > 0 && budgetMax > 0 && price > budgetMax;

  let score = 0;
  if (cityMatch) score += 30;
  if (districtMatch) score += 30;
  if (typeMatch) score += 25;
  if (budgetMatch) score += 15;
  if (overBudget) score -= 10;

  const hardMismatches = [
    targetCity && !cityMatch ? "city" : null,
    targetType && !typeMatch ? "property_type" : null,
  ].filter(Boolean);

  return {
    score: Math.max(0, Math.min(100, score)),
    city_match: Boolean(cityMatch),
    district_match: Boolean(districtMatch),
    property_type_match: Boolean(typeMatch),
    budget_match: Boolean(budgetMatch),
    over_budget: Boolean(overBudget),
    hard_mismatches: hardMismatches,
  };
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
  if (candidateNeedsContactAccess(candidate)) missing.push("broker_contact_access");

  const fit = buildMandateFit(candidate, mandate);
  const mandateBudget = mandate?.budget_range_json && typeof mandate.budget_range_json === "object"
    ? mandate.budget_range_json
    : {};
  const price = Number(candidate.asking_price || candidate.askingPrice || 0);
  const budgetMax = Number(mandateBudget.max || mandateBudget.maximum || 0);
  const overBudget = budgetMax > 0 && price > budgetMax;
  const decision = fit.hard_mismatches.length
    ? "pass"
    : missing.length >= 3
    ? "insufficient_info"
    : overBudget || fit.score < 70
      ? "watch"
      : "pursue";
  const confidence = fit.score >= 80 && missing.length === 0 ? "high" : fit.score >= 45 ? "medium" : "low";

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
      fit.hard_mismatches.length
        ? `Candidate conflicts with the saved mandate on: ${fit.hard_mismatches.join(", ")}.`
        : overBudget
          ? "Asking price appears above the saved mandate budget."
          : "Candidate can be compared against the saved mandate.",
      `Mandate fit score: ${fit.score}/100.`,
      missing.length ? "Some diligence inputs are still missing." : "Core visible facts are available for a first screen.",
    ],
    fit,
    evidenceBackedFacts,
    assumptions: missing.length ? [{
      field: "screening_assumption",
      value: "Recommendation is preliminary until missing information is resolved.",
      basis: "user_assumption",
    }] : [],
    missingInformation: missing.map((item) => ({
      type: item === "photos" ? "missing_document" : item === "broker_contact_access" ? "needs_contact_access" : "missing_fact",
      title: item === "broker_contact_access" ? "Broker contact requires marketplace access" : item.replace(/_/g, " "),
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

function enforceMandateFit(screeningOutput, candidate, mandate) {
  const fit = buildMandateFit(candidate, mandate);
  const output = {
    ...screeningOutput,
    fit: screeningOutput.fit || fit,
    reasons: Array.isArray(screeningOutput.reasons) ? [...screeningOutput.reasons] : [],
  };
  if (!output.reasons.some((reason) => /mandate fit score/i.test(String(reason)))) {
    output.reasons.push(`Mandate fit score: ${fit.score}/100.`);
  }
  if (fit.hard_mismatches.length) {
    output.decision = "pass";
    output.confidence = "high";
    output.reasons.unshift(`Candidate conflicts with the saved mandate on: ${fit.hard_mismatches.join(", ")}.`);
    output.nextAction = { type: "pass", label: "Pass", payload: {} };
  }
  return output;
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

async function fetchReadinessProfile(supabase, profileId) {
  const { data, error } = await supabase
    .from("buyer_readiness_profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load buyer readiness profile: ${error.message}`);
  if (!data) {
    const notFound = new Error("Buyer readiness profile not found");
    notFound.statusCode = 404;
    throw notFound;
  }
  return data;
}

function normalizeBuyerType(value) {
  const normalized = normalizeText(value).toLowerCase();
  return BUYER_TYPES.has(normalized) ? normalized : "individual";
}

function isActiveTimestampWindow(row = {}) {
  if (row.revoked_at) return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > Date.now();
}

function isVerifiedEvidence(evidence = {}) {
  return evidence.status === "verified" && isActiveTimestampWindow(evidence);
}

function hasEvidenceType(evidenceRows, types) {
  const wanted = new Set(types);
  return evidenceRows.some((evidence) => isVerifiedEvidence(evidence) && wanted.has(evidence.evidence_type));
}

function hasActiveBrokerageAgreement(agreements = []) {
  return agreements.some((agreement) =>
    agreement.status === "active" &&
    (!agreement.effective_at || new Date(agreement.effective_at).getTime() <= Date.now()) &&
    isActiveTimestampWindow(agreement)
  );
}

function hasHighUnresolvedRiskFlag(flags = []) {
  return flags.some((flag) => HIGH_RISK_SEVERITIES.has(flag.severity) && !RESOLVED_FLAG_STATUSES.has(flag.status));
}

function deriveReadinessState({ profile, evidence = [], brokerageAgreements = [], kycCases = [], riskFlags = [] }) {
  const buyerType = normalizeBuyerType(profile?.buyer_type);
  const hasMandate = Boolean(normalizeText(profile?.mandate_summary) || profile?.mandate_id ||
    hasEvidenceType(evidence, ["mandate_defined", "mandate"]));
  const hasIndividualIdentity = hasEvidenceType(evidence, ["identity", "national_id", "id", "passport"]);
  const hasCompanyIdentity = hasEvidenceType(evidence, ["commercial_registration", "company_registration"]);
  const hasAuthority = hasEvidenceType(evidence, ["authority_letter", "company_authorization", "authorized_signatory"]);
  const hasBeneficialOwner = hasEvidenceType(evidence, ["beneficial_owner", "beneficial_owner_capture"]);
  const hasFunding = hasEvidenceType(evidence, [
    "proof_of_funds",
    "mortgage_preapproval",
    "bank_relationship_letter",
    "funding_path_attestation",
    "buyer_self_attestation",
  ]);
  const hasOfferTerms = hasEvidenceType(evidence, ["decision_maker", "max_budget_terms", "preferred_terms", "offer_readiness"]);
  const identityReady = buyerType === "individual"
    ? hasIndividualIdentity
    : hasCompanyIdentity && hasAuthority && hasBeneficialOwner;
  const latestKyc = [...kycCases].sort((left, right) =>
    new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime()
  )[0] || null;
  const riskBlocked = hasHighUnresolvedRiskFlag(riskFlags);
  let level = READINESS_LEVEL_MIN;
  if (hasMandate) level = 1;
  if (level >= 1 && identityReady) level = 2;
  if (level >= 2 && hasFunding) level = 3;
  if (level >= 3 && normalizeText(profile?.visit_readiness) && hasOfferTerms) level = 4;
  if (level >= 4 && hasActiveBrokerageAgreement(brokerageAgreements) && latestKyc?.state === "brokerage_ready") level = 5;
  if (riskBlocked) level = Math.min(level, 2);

  const verifiedEvidence = evidence.filter(isVerifiedEvidence).length;
  const expiredEvidence = evidence.some((item) => item.status === "expired" || (item.expires_at && !isActiveTimestampWindow(item)));
  const rejectedEvidence = evidence.some((item) => item.status === "rejected");
  const evidenceStatus = rejectedEvidence
    ? "rejected"
    : expiredEvidence && verifiedEvidence === 0
      ? "expired"
      : verifiedEvidence >= 2
        ? "verified"
        : verifiedEvidence === 1
          ? "partially_verified"
          : "self_declared";
  const kycState = riskBlocked
    ? "escalated"
    : KYC_STATES.has(latestKyc?.state)
      ? latestKyc.state
      : profile?.kyc_state || "not_started";
  const brokerageStatus = hasActiveBrokerageAgreement(brokerageAgreements)
    ? "signed"
    : profile?.brokerage_status || "not_started";
  return {
    readiness_level: Math.max(READINESS_LEVEL_MIN, Math.min(READINESS_LEVEL_MAX, level)),
    evidence_status: evidenceStatus,
    kyc_state: kycState,
    brokerage_status: brokerageStatus,
  };
}

async function loadReadinessContext(supabase, profileId) {
  const profile = await fetchReadinessProfile(supabase, profileId);
  const [evidenceResult, brokerageResult, kycResult] = await Promise.all([
    supabase.from("buyer_readiness_evidence").select("*").eq("profile_id", profile.id),
    supabase.from("brokerage_agreements").select("*").eq("buyer_profile_id", profile.id),
    supabase.from("kyc_cases").select("*").eq("buyer_profile_id", profile.id),
  ]);
  if (evidenceResult.error) throw new Error(`Failed to load readiness evidence: ${evidenceResult.error.message}`);
  if (brokerageResult.error) throw new Error(`Failed to load brokerage agreements: ${brokerageResult.error.message}`);
  if (kycResult.error) throw new Error(`Failed to load KYC cases: ${kycResult.error.message}`);
  const kycCaseIds = (kycResult.data || []).map((item) => item.id);
  let riskFlags = [];
  if (kycCaseIds.length) {
    const flagRows = await Promise.all(kycCaseIds.map((caseId) =>
      supabase.from("kyc_risk_flags").select("*").eq("kyc_case_id", caseId)
    ));
    for (const result of flagRows) {
      if (result.error) throw new Error(`Failed to load KYC risk flags: ${result.error.message}`);
      riskFlags.push(...(result.data || []));
    }
  }
  return {
    profile,
    evidence: evidenceResult.data || [],
    brokerageAgreements: brokerageResult.data || [],
    kycCases: kycResult.data || [],
    riskFlags,
  };
}

async function recomputeReadinessProfile(supabase, profileId) {
  const context = await loadReadinessContext(supabase, profileId);
  const derived = deriveReadinessState(context);
  const { data, error } = await supabase
    .from("buyer_readiness_profiles")
    .update(derived)
    .eq("id", profileId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to update buyer readiness profile: ${error?.message || "unknown"}`);
  return { ...context, profile: data, derived };
}

function normalizeShareMode(value, documentKind = "") {
  const normalized = normalizeText(value).toLowerCase();
  if (["status_only", "redacted_copy", "full_document"].includes(normalized)) return normalized;
  return /financial|funding|bank|proof|mortgage/i.test(documentKind) ? "status_only" : "status_only";
}

async function assertActiveDocumentGrant(supabase, { documentId, buyerProfileId, opportunityId }) {
  if (!documentId) {
    const error = new Error("share_document approval requires draft_payload_json.document_id");
    error.statusCode = 400;
    throw error;
  }
  const { data, error } = await supabase
    .from("document_sharing_grants")
    .select("*")
    .eq("document_id", documentId);
  if (error) throw new Error(`Failed to load document sharing grants: ${error.message}`);
  const activeGrant = (data || []).find((grant) =>
    isActiveTimestampWindow(grant) &&
    (!buyerProfileId || grant.buyer_profile_id === buyerProfileId) &&
    (!opportunityId || !grant.opportunity_id || grant.opportunity_id === opportunityId)
  );
  if (!activeGrant) {
    const denied = new Error("Active document sharing grant required before sharing this document");
    denied.statusCode = 409;
    throw denied;
  }
  return activeGrant;
}

async function assertActiveBrokerageAuthority(supabase, buyerProfileId) {
  if (!buyerProfileId) {
    const error = new Error("Brokerage-gated action requires buyer_profile_id");
    error.statusCode = 400;
    throw error;
  }
  const { data, error } = await supabase
    .from("brokerage_agreements")
    .select("*")
    .eq("buyer_profile_id", buyerProfileId);
  if (error) throw new Error(`Failed to load brokerage agreements: ${error.message}`);
  if (!hasActiveBrokerageAgreement(data || [])) {
    const denied = new Error("Active brokerage agreement required before executing this action");
    denied.statusCode = 409;
    throw denied;
  }
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
  const { data: existingClaims } = await supabase
    .from("acquisition_claims")
    .select("*")
    .eq("candidate_id", candidate.id);
  const existingKeys = new Set((existingClaims || []).map((claim) =>
    [claim.fact_key, JSON.stringify(claim.value_json || {}), claim.basis_label, claim.source_channel].join("|")
  ));
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
      basis_label: "user_assumption",
      confidence,
      source_channel: "screening",
      evidence_refs_json: [],
    })),
  ].filter((row) => !existingKeys.has([
    row.fact_key,
    JSON.stringify(row.value_json || {}),
    row.basis_label,
    row.source_channel,
  ].join("|")));
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from("acquisition_claims")
    .insert(rows)
    .select("*");
  if (error) throw new Error(`Failed to insert candidate claims: ${error.message}`);
  return data || [];
}

async function createCandidateDiligenceRows(supabase, candidate, screeningOutput) {
  const { data: existingItems } = await supabase
    .from("acquisition_diligence_items")
    .select("*")
    .eq("candidate_id", candidate.id);
  const existingKeys = new Set((existingItems || []).map((item) =>
    [item.title, item.item_type, item.status].join("|")
  ));
  const rows = (screeningOutput.missingInformation || []).map((item) => ({
    candidate_id: candidate.id,
    workspace_id: candidate.workspace_id,
    title: item.title || "Missing information",
    item_type: item.type || "missing_info",
    priority: item.priority || "medium",
    status: item.status || "open",
    owner_kind: "broker",
    evidence_refs_json: [{ source_url: candidate.source_url, captured_at: candidate.captured_at }],
  })).filter((row) => !existingKeys.has([row.title, row.item_type, row.status].join("|")));
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
    metadata_json: {
      title: candidate.title,
      source: candidate.source,
      contact_access: (sourceDraft.limited_evidence_snapshot_json || sourceDraft.sourceSnapshot || {}).contact_access || null,
    },
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
  output = enforceMandateFit(output, candidate, mandate);
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
      source_channel: opportunitySourceChannelForCandidate(candidate),
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
        source: candidate.source,
        original_source_channel: candidate.source,
        photo_refs: normalizePhotoRefs(candidate.photo_refs_json),
        photoRefs: normalizePhotoRefs(candidate.photo_refs_json),
        asking_price: candidate.asking_price,
        price: candidate.asking_price,
        area_sqm: candidate.area_sqm,
        property_type: candidate.property_type,
        city: candidate.city,
        district: candidate.district,
        confidence: screening.confidence,
        decision: screening.decision,
        contact_access: candidate.limited_evidence_snapshot_json?.contact_access || null,
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
    const uniqueClaims = [];
    const seenClaims = new Set();
    for (const claim of candidateClaims) {
      const key = [claim.fact_key, JSON.stringify(claim.value_json || {}), claim.basis_label, claim.source_channel].join("|");
      if (seenClaims.has(key)) continue;
      seenClaims.add(key);
      uniqueClaims.push(claim);
    }
    await supabase.from("acquisition_claims").insert(uniqueClaims.map((claim) => ({
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
    const uniqueItems = [];
    const seenItems = new Set();
    for (const item of candidateDiligence) {
      const key = [item.title, item.item_type, item.status].join("|");
      if (seenItems.has(key)) continue;
      seenItems.add(key);
      uniqueItems.push(item);
    }
    await supabase.from("acquisition_diligence_items").insert(uniqueItems.map((item) => ({
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
      search_run: searchRun,
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
    const adapterRuns = [];
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
      const adapterStatus = ["running", "completed", "failed", "cancelled"].includes(adapterRun.status)
        ? adapterRun.status
        : "completed";
      const { data: savedAdapterRun, error: adapterRunError } = await supabase.from("acquisition_adapter_runs").insert({
        search_run_id: searchRun.id,
        workspace_id: searchRun.workspace_id,
        source: adapterRun.source,
        status: adapterStatus,
        cards_seen: adapterRun.cards_seen || 0,
        detail_pages_fetched: adapterRun.detail_pages_fetched || 0,
        candidates_created: adapterRun.candidates_created || 0,
        failure_count: adapterRun.failure_count || 0,
        screenshot_refs_json: adapterRun.screenshot_refs_json || [],
        limited_snapshot_refs_json: adapterRun.limited_snapshot_refs_json || [],
        error_json: {
          ...(adapterRun.error_json || {}),
          worker_status: adapterRun.status || null,
        },
        completed_at: new Date().toISOString(),
      }).select("*").single();
      if (adapterRunError) throw new Error(`Failed to insert acquisition adapter run: ${adapterRunError.message}`);
      adapterRuns.push(savedAdapterRun || adapterRun);
    }
    const completedAt = new Date().toISOString();
    candidates.sort((left, right) =>
      Number(right.screening_output_json?.fit?.score || 0) - Number(left.screening_output_json?.fit?.score || 0)
    );
    const { data: updated } = await supabase.from("acquisition_search_runs").update({
      status: "completed",
      completed_at: completedAt,
      candidate_count: candidates.length,
      error_summary: browserResult.skipped ? browserResult.reason : null,
    }).eq("id", searchRun.id).select("*").single();
    return { search_run: updated, candidates, adapter_runs: adapterRuns };
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
        ? "Market CSV enrichment hook is ready; upload/import is handled as a separate source snapshot."
        : "Restb.ai enrichment hook is ready; external call is intentionally not executed in this MVP pass.",
    },
    basis_label: basis,
    confidence: 0.5,
    source_channel: kind === "market" ? "market_csv" : "restb_ai",
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

async function createReadinessProfile(supabase, body = {}) {
  const payload = {
    workspace_id: normalizeUuid(body.workspace_id),
    mandate_id: normalizeUuid(body.mandate_id),
    buyer_user_id: normalizeUuid(body.buyer_user_id || body.user_id),
    organization_id: normalizeUuid(body.organization_id),
    buyer_type: normalizeBuyerType(body.buyer_type),
    mandate_summary: normalizeText(body.mandate_summary),
    funding_path: normalizeText(body.funding_path),
    readiness_level: 0,
    evidence_status: "self_declared",
    sharing_mode: ["private", "anonymous_mandate", "named_buyer", "selected_documents"].includes(body.sharing_mode)
      ? body.sharing_mode
      : "private",
    visit_readiness: normalizeText(body.visit_readiness),
    brokerage_status: "not_started",
    kyc_state: "not_started",
    metadata_json: body.metadata_json || body.metadata || {},
    created_by: normalizeUuid(body.created_by || body.user_id),
  };
  const { data, error } = await supabase
    .from("buyer_readiness_profiles")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to create buyer readiness profile: ${error?.message || "unknown"}`);
  const context = await recomputeReadinessProfile(supabase, data.id);
  return context.profile;
}

async function updateReadinessProfile(supabase, profileId, body = {}) {
  const patch = {};
  if (body.buyer_type !== undefined) patch.buyer_type = normalizeBuyerType(body.buyer_type);
  if (body.mandate_summary !== undefined) patch.mandate_summary = normalizeText(body.mandate_summary);
  if (body.funding_path !== undefined) patch.funding_path = normalizeText(body.funding_path);
  if (body.sharing_mode !== undefined) patch.sharing_mode = body.sharing_mode;
  if (body.visit_readiness !== undefined) patch.visit_readiness = normalizeText(body.visit_readiness);
  if (body.metadata_json !== undefined || body.metadata !== undefined) patch.metadata_json = body.metadata_json || body.metadata || {};
  const { data, error } = await supabase
    .from("buyer_readiness_profiles")
    .update(patch)
    .eq("id", profileId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to update buyer readiness profile: ${error?.message || "unknown"}`);
  const context = await recomputeReadinessProfile(supabase, data.id);
  return context.profile;
}

async function attachReadinessEvidence(supabase, profileId, body = {}) {
  const profile = await fetchReadinessProfile(supabase, profileId);
  const status = EVIDENCE_STATUSES.has(body.status) ? body.status : "pending";
  const payload = {
    profile_id: profile.id,
    workspace_id: profile.workspace_id,
    document_id: normalizeUuid(body.document_id),
    evidence_type: normalizeText(body.evidence_type || body.type),
    attestation_json: body.attestation_json || body.attestation || {},
    status,
    sensitivity_level: ["low", "medium", "high", "financial", "identity"].includes(body.sensitivity_level)
      ? body.sensitivity_level
      : "medium",
    verified_by: status === "verified" ? normalizeUuid(body.verified_by || body.user_id) : null,
    verified_at: status === "verified" ? (body.verified_at || new Date().toISOString()) : null,
    expires_at: body.expires_at || null,
    created_by: normalizeUuid(body.created_by || body.user_id),
  };
  if (!payload.evidence_type) {
    const error = new Error("Evidence type is required");
    error.statusCode = 400;
    throw error;
  }
  const { data, error } = await supabase
    .from("buyer_readiness_evidence")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to attach buyer readiness evidence: ${error?.message || "unknown"}`);
  await recomputeReadinessProfile(supabase, profile.id);
  return data;
}

async function verifyReadinessEvidence(supabase, evidenceId, body = {}) {
  const result = ["verified", "rejected", "needs_review", "expired"].includes(body.result) ? body.result : "verified";
  const status = result === "needs_review" ? "pending" : result;
  const { data: evidence, error: loadError } = await supabase
    .from("buyer_readiness_evidence")
    .select("*")
    .eq("id", evidenceId)
    .maybeSingle();
  if (loadError) throw new Error(`Failed to load buyer readiness evidence: ${loadError.message}`);
  if (!evidence) {
    const notFound = new Error("Buyer readiness evidence not found");
    notFound.statusCode = 404;
    throw notFound;
  }
  const reviewerId = normalizeUuid(body.reviewer_id || body.user_id);
  const { data, error } = await supabase
    .from("buyer_readiness_evidence")
    .update({
      status,
      verified_by: result === "verified" ? reviewerId : evidence.verified_by,
      verified_at: result === "verified" ? new Date().toISOString() : evidence.verified_at,
    })
    .eq("id", evidence.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to verify buyer readiness evidence: ${error?.message || "unknown"}`);
  await supabase.from("buyer_readiness_verifications").insert({
    profile_id: evidence.profile_id,
    evidence_id: evidence.id,
    workspace_id: evidence.workspace_id,
    verification_type: normalizeText(body.verification_type) || "manual_review",
    result,
    reviewer_id: reviewerId,
    notes: normalizeText(body.notes),
  });
  const context = await recomputeReadinessProfile(supabase, evidence.profile_id);
  return { evidence: data, profile: context.profile };
}

async function createDocumentSharingGrant(supabase, body = {}) {
  const documentId = normalizeUuid(body.document_id);
  if (!documentId) {
    const error = new Error("document_id is required");
    error.statusCode = 400;
    throw error;
  }
  const purpose = normalizeText(body.purpose);
  if (!purpose) {
    const error = new Error("purpose is required");
    error.statusCode = 400;
    throw error;
  }
  const payload = {
    document_id: documentId,
    workspace_id: normalizeUuid(body.workspace_id),
    opportunity_id: normalizeUuid(body.opportunity_id),
    buyer_profile_id: normalizeUuid(body.buyer_profile_id),
    granted_by: normalizeUuid(body.granted_by || body.user_id),
    granted_to_kind: normalizeText(body.granted_to_kind) || "counterparty",
    granted_to_identifier: normalizeText(body.granted_to_identifier),
    purpose,
    allowed_action: ["share_status", "share_document", "view", "download"].includes(body.allowed_action)
      ? body.allowed_action
      : "share_status",
    share_mode: normalizeShareMode(body.share_mode, `${body.document_kind || ""} ${purpose}`),
    token_hash: normalizeText(body.token_hash),
    expires_at: body.expires_at || null,
  };
  const { data, error } = await supabase
    .from("document_sharing_grants")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to create document sharing grant: ${error?.message || "unknown"}`);
  return data;
}

async function createBrokerageAgreement(supabase, body = {}) {
  const profile = await fetchReadinessProfile(supabase, normalizeUuid(body.buyer_profile_id));
  const payload = {
    buyer_profile_id: profile.id,
    workspace_id: profile.workspace_id || normalizeUuid(body.workspace_id),
    agreement_type: ["buyer_representation", "limited_authority", "offer_support", "closing_coordination"].includes(body.agreement_type)
      ? body.agreement_type
      : "buyer_representation",
    scope: normalizeText(body.scope),
    authority_json: body.authority_json || body.authority || {},
    commission_terms_json: body.commission_terms_json || body.commission_terms || {},
    signed_document_id: normalizeUuid(body.signed_document_id),
    status: ["draft", "active", "expired", "revoked", "terminated"].includes(body.status) ? body.status : "draft",
    effective_at: body.effective_at || null,
    expires_at: body.expires_at || null,
    created_by: normalizeUuid(body.created_by || body.user_id),
  };
  const { data, error } = await supabase
    .from("brokerage_agreements")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to create brokerage agreement: ${error?.message || "unknown"}`);
  const context = await recomputeReadinessProfile(supabase, profile.id);
  return { agreement: data, profile: context.profile };
}

async function createKycCase(supabase, body = {}) {
  const profile = await fetchReadinessProfile(supabase, normalizeUuid(body.buyer_profile_id));
  const state = KYC_STATES.has(body.state) ? body.state : "not_started";
  const payload = {
    buyer_profile_id: profile.id,
    workspace_id: profile.workspace_id || normalizeUuid(body.workspace_id),
    state,
    risk_level: ["low", "medium", "high", "critical"].includes(body.risk_level) ? body.risk_level : "low",
    customer_type: normalizeBuyerType(body.customer_type || profile.buyer_type),
    assigned_reviewer_id: normalizeUuid(body.assigned_reviewer_id),
    started_at: body.started_at || (state === "not_started" ? null : new Date().toISOString()),
    completed_at: body.completed_at || null,
    escalated_at: body.escalated_at || (state === "escalated" ? new Date().toISOString() : null),
    metadata_json: body.metadata_json || body.metadata || {},
  };
  const { data, error } = await supabase
    .from("kyc_cases")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to create KYC case: ${error?.message || "unknown"}`);
  const context = await recomputeReadinessProfile(supabase, profile.id);
  return { kyc_case: data, profile: context.profile };
}

async function createKycRiskFlag(supabase, kycCaseId, body = {}) {
  const { data: kycCase, error: loadError } = await supabase
    .from("kyc_cases")
    .select("*")
    .eq("id", kycCaseId)
    .maybeSingle();
  if (loadError) throw new Error(`Failed to load KYC case: ${loadError.message}`);
  if (!kycCase) {
    const notFound = new Error("KYC case not found");
    notFound.statusCode = 404;
    throw notFound;
  }
  const payload = {
    kyc_case_id: kycCase.id,
    buyer_profile_id: kycCase.buyer_profile_id,
    workspace_id: kycCase.workspace_id,
    flag_type: normalizeText(body.flag_type),
    severity: ["low", "medium", "high", "critical"].includes(body.severity) ? body.severity : "medium",
    source: normalizeText(body.source),
    status: ["open", "reviewing", "resolved", "waived"].includes(body.status) ? body.status : "open",
    resolution_note: normalizeText(body.resolution_note),
  };
  if (!payload.flag_type) {
    const error = new Error("flag_type is required");
    error.statusCode = 400;
    throw error;
  }
  const { data, error } = await supabase
    .from("kyc_risk_flags")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to create KYC risk flag: ${error?.message || "unknown"}`);
  if (HIGH_RISK_SEVERITIES.has(payload.severity) && !RESOLVED_FLAG_STATUSES.has(payload.status)) {
    await supabase
      .from("kyc_cases")
      .update({
        state: "escalated",
        risk_level: payload.severity === "critical" ? "critical" : "high",
        escalated_at: new Date().toISOString(),
      })
      .eq("id", kycCase.id);
  }
  const context = await recomputeReadinessProfile(supabase, kycCase.buyer_profile_id);
  return { risk_flag: data, profile: context.profile };
}

async function createExternalActionApproval(supabase, body = {}) {
  const actionType = normalizeText(body.action_type);
  if (!EXTERNAL_ACTION_TYPES.has(actionType)) {
    const error = new Error("Invalid external action type");
    error.statusCode = 400;
    throw error;
  }
  const payload = {
    workspace_id: normalizeUuid(body.workspace_id),
    opportunity_id: normalizeUuid(body.opportunity_id),
    buyer_profile_id: normalizeUuid(body.buyer_profile_id),
    action_type: actionType,
    draft_payload_json: body.draft_payload_json || body.draft_payload || {},
    approval_status: ["draft", "pending", "approved", "rejected", "executed", "cancelled"].includes(body.approval_status)
      ? body.approval_status
      : "pending",
    requested_by: normalizeUuid(body.requested_by || body.user_id),
  };
  const { data, error } = await supabase
    .from("external_action_approvals")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to create external action approval: ${error?.message || "unknown"}`);
  return data;
}

async function approveExternalAction(supabase, approvalId, body = {}) {
  const { data: approval, error: loadError } = await supabase
    .from("external_action_approvals")
    .select("*")
    .eq("id", approvalId)
    .maybeSingle();
  if (loadError) throw new Error(`Failed to load external action approval: ${loadError.message}`);
  if (!approval) {
    const notFound = new Error("External action approval not found");
    notFound.statusCode = 404;
    throw notFound;
  }
  if (ACTION_TYPES_REQUIRING_BROKERAGE.has(approval.action_type)) {
    await assertActiveBrokerageAuthority(supabase, approval.buyer_profile_id);
  }
  if (approval.action_type === "share_document") {
    await assertActiveDocumentGrant(supabase, {
      documentId: approval.draft_payload_json?.document_id,
      buyerProfileId: approval.buyer_profile_id,
      opportunityId: approval.opportunity_id,
    });
  }
  const status = body.approval_status === "rejected" ? "rejected" : "approved";
  const { data, error } = await supabase
    .from("external_action_approvals")
    .update({
      approval_status: status,
      approved_by: normalizeUuid(body.approved_by || body.user_id),
      approved_at: new Date().toISOString(),
    })
    .eq("id", approval.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to approve external action: ${error?.message || "unknown"}`);
  return data;
}

async function executeExternalAction(supabase, approvalId, body = {}) {
  const { data: approval, error: loadError } = await supabase
    .from("external_action_approvals")
    .select("*")
    .eq("id", approvalId)
    .maybeSingle();
  if (loadError) throw new Error(`Failed to load external action approval: ${loadError.message}`);
  if (!approval) {
    const notFound = new Error("External action approval not found");
    notFound.statusCode = 404;
    throw notFound;
  }
  if (approval.approval_status !== "approved") {
    const denied = new Error("External action must be approved before execution");
    denied.statusCode = 409;
    throw denied;
  }
  if (ACTION_TYPES_REQUIRING_BROKERAGE.has(approval.action_type)) {
    await assertActiveBrokerageAuthority(supabase, approval.buyer_profile_id);
  }
  if (approval.action_type === "share_document") {
    await assertActiveDocumentGrant(supabase, {
      documentId: approval.draft_payload_json?.document_id,
      buyerProfileId: approval.buyer_profile_id,
      opportunityId: approval.opportunity_id,
    });
  }
  const executionResult = body.execution_result_json || body.execution_result || {
    status: "recorded",
    note: "External execution is recorded for MVP; delivery happens through approved operator workflow.",
  };
  const { data, error } = await supabase
    .from("external_action_approvals")
    .update({
      approval_status: "executed",
      executed_by: normalizeUuid(body.executed_by || body.user_id),
      executed_at: new Date().toISOString(),
      execution_result_json: executionResult,
    })
    .eq("id", approval.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to execute external action: ${error?.message || "unknown"}`);
  if (approval.opportunity_id) {
    await insertEvent(supabase, {
      opportunity_id: approval.opportunity_id,
      workspace_id: approval.workspace_id,
      created_by: normalizeUuid(body.executed_by || body.user_id),
      event_type: "external_action_executed",
      event_direction: "operator",
      body_text: `Approved action executed: ${approval.action_type}`,
      event_payload: {
        approval_id: approval.id,
        action_type: approval.action_type,
        result: executionResult,
      },
    });
  }
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
  if (method === "POST" && parts[3] === "readiness-profiles" && parts.length === 4) return { name: "createReadinessProfile" };
  if (method === "GET" && parts[3] === "readiness-profiles" && parts.length === 5) return { name: "getReadinessProfile", profileId: parts[4] };
  if (method === "PATCH" && parts[3] === "readiness-profiles" && parts.length === 5) return { name: "updateReadinessProfile", profileId: parts[4] };
  if (method === "POST" && parts[3] === "readiness-profiles" && parts[5] === "evidence") return { name: "attachReadinessEvidence", profileId: parts[4] };
  if (method === "POST" && parts[3] === "readiness-evidence" && parts[5] === "verify") return { name: "verifyReadinessEvidence", evidenceId: parts[4] };
  if (method === "POST" && parts[3] === "document-sharing-grants" && parts.length === 4) return { name: "createDocumentSharingGrant" };
  if (method === "POST" && parts[3] === "brokerage-agreements" && parts.length === 4) return { name: "createBrokerageAgreement" };
  if (method === "POST" && parts[3] === "kyc-cases" && parts.length === 4) return { name: "createKycCase" };
  if (method === "POST" && parts[3] === "kyc-cases" && parts[5] === "risk-flags") return { name: "createKycRiskFlag", kycCaseId: parts[4] };
  if (method === "POST" && parts[3] === "approvals" && parts.length === 4) return { name: "createExternalActionApproval" };
  if (method === "POST" && parts[3] === "approvals" && parts[5] === "approve") return { name: "approveExternalAction", approvalId: parts[4] };
  if (method === "POST" && parts[3] === "approvals" && parts[5] === "execute") return { name: "executeExternalAction", approvalId: parts[4] };
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
      const candidates = [...(data || [])].sort((left, right) =>
        Number(right.screening_output_json?.fit?.score || 0) - Number(left.screening_output_json?.fit?.score || 0)
      );
      return sendJson(res, 200, buildEnvelope(requestId, { candidates }));
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
    if (route.name === "createReadinessProfile") {
      return sendJson(res, 201, buildEnvelope(requestId, { profile: await createReadinessProfile(supabase, body) }));
    }
    if (route.name === "getReadinessProfile") {
      const context = await loadReadinessContext(supabase, route.profileId);
      return sendJson(res, 200, buildEnvelope(requestId, context));
    }
    if (route.name === "updateReadinessProfile") {
      return sendJson(res, 200, buildEnvelope(requestId, { profile: await updateReadinessProfile(supabase, route.profileId, body) }));
    }
    if (route.name === "attachReadinessEvidence") {
      return sendJson(res, 201, buildEnvelope(requestId, { evidence: await attachReadinessEvidence(supabase, route.profileId, body) }));
    }
    if (route.name === "verifyReadinessEvidence") {
      return sendJson(res, 200, buildEnvelope(requestId, await verifyReadinessEvidence(supabase, route.evidenceId, body)));
    }
    if (route.name === "createDocumentSharingGrant") {
      return sendJson(res, 201, buildEnvelope(requestId, { grant: await createDocumentSharingGrant(supabase, body) }));
    }
    if (route.name === "createBrokerageAgreement") {
      return sendJson(res, 201, buildEnvelope(requestId, await createBrokerageAgreement(supabase, body)));
    }
    if (route.name === "createKycCase") {
      return sendJson(res, 201, buildEnvelope(requestId, await createKycCase(supabase, body)));
    }
    if (route.name === "createKycRiskFlag") {
      return sendJson(res, 201, buildEnvelope(requestId, await createKycRiskFlag(supabase, route.kycCaseId, body)));
    }
    if (route.name === "createExternalActionApproval") {
      return sendJson(res, 201, buildEnvelope(requestId, { approval: await createExternalActionApproval(supabase, body) }));
    }
    if (route.name === "approveExternalAction") {
      return sendJson(res, 200, buildEnvelope(requestId, { approval: await approveExternalAction(supabase, route.approvalId, body) }));
    }
    if (route.name === "executeExternalAction") {
      return sendJson(res, 200, buildEnvelope(requestId, { approval: await executeExternalAction(supabase, route.approvalId, body) }));
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
  approveExternalAction,
  attachReadinessEvidence,
  createBrokerageAgreement,
  createDocumentSharingGrant,
  createExternalActionApproval,
  buildMandateFit,
  createListingCandidate,
  createKycCase,
  createKycRiskFlag,
  createMandate,
  createReadinessProfile,
  createSearchRun,
  deriveReadinessState,
  executeExternalAction,
  normalizeSearchLimits,
  normalizeSources,
  promoteCandidate,
  recomputeReadinessProfile,
  screenCandidate,
  upsertCandidateDraft,
  updateReadinessProfile,
  verifyReadinessEvidence,
};
