import { getExpectedInternalToken } from "../runtime/internal-auth.js";

const DEFAULT_PUBLICATION_API_BASE_URL =
  "https://experiences-publication-api.zohal.ai";

function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase();
}

function publicationBaseUrl() {
  return String(
    process.env.EXPERIENCES_PUBLICATION_API_BASE_URL ||
      DEFAULT_PUBLICATION_API_BASE_URL,
  ).trim().replace(/\/+$/, "");
}

function getInternalHeaders(requestId, userId) {
  const token = getExpectedInternalToken();
  if (!token) {
    throw new Error("Missing internal token for private live publication call");
  }
  return {
    authorization: `Bearer ${token}`,
    apikey: token,
    "x-internal-function-jwt": token,
    "x-zohal-user-id": normalizeUuid(userId),
    "x-request-id": requestId,
    "content-type": "application/json",
  };
}

function normalizeExperienceTemplateId(templateId) {
  const normalized = String(templateId || "").trim().toLowerCase();
  if (
    !normalized || normalized === "contract" ||
    normalized === "contract_document"
  ) {
    return "contract_analysis";
  }
  if (normalized === "contract_analysis") return normalized;
  return "document_analysis";
}

function resolveExperienceSourceKind(templateId) {
  return normalizeExperienceTemplateId(templateId) === "contract_analysis"
    ? "contract_document"
    : "verification_document";
}

function defaultExperienceTitle(templateId) {
  return normalizeExperienceTemplateId(templateId) === "contract_analysis"
    ? "Contract analysis"
    : "Document analysis";
}

async function resolveWorkspaceDefaultCorpusId(supabase, workspaceId) {
  const { data, error } = await supabase.rpc("ensure_workspace_default_corpus", {
    p_workspace_id: normalizeUuid(workspaceId),
  });
  if (error) throw new Error(error.message);
  return String(data || `workspace:${normalizeUuid(workspaceId)}:default`);
}

async function resolvePrivateLiveExperienceRecord({
  supabase,
  workspaceId,
  documentId,
  templateId,
  title,
  summary,
}) {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  const normalizedDocumentId = normalizeUuid(documentId);
  const normalizedTemplateId = normalizeExperienceTemplateId(templateId);
  const defaultCorpusId = await resolveWorkspaceDefaultCorpusId(
    supabase,
    normalizedWorkspaceId,
  );

  const { data: existing, error } = await supabase
    .from("experience_registry")
    .select(
      "experience_id, workspace_id, corpus_id, source_scope, source_document_id, title, description, publication_status, scaffold_status, materialization_status, last_canonical_version_id",
    )
    .eq("workspace_id", normalizedWorkspaceId)
    .eq("template_id", normalizedTemplateId)
    .eq("experience_lane", "private_live")
    .or(
      [
        `corpus_id.eq.${defaultCorpusId}`,
        `and(corpus_id.eq.${normalizedDocumentId},source_document_id.is.null)`,
        `source_document_id.eq.${normalizedDocumentId}`,
      ].join(","),
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (existing?.experience_id) return existing;

  const experienceId = globalThis.crypto.randomUUID();
  const { data: created, error: insertError } = await supabase
    .from("experience_registry")
    .insert({
      experience_id: experienceId,
      workspace_id: normalizedWorkspaceId,
      corpus_id: defaultCorpusId,
      source_scope: "workspace_default",
      source_document_id: normalizedDocumentId,
      template_id: normalizedTemplateId,
      template_version: "1.0.0",
      publication_status: "private_live",
      experience_lane: "private_live",
      default_visibility: "org_private",
      publication_lane: "trusted_runtime",
      scaffold_status: "pending",
      materialization_status: "pending",
      title: title || defaultExperienceTitle(normalizedTemplateId),
      description: summary || null,
    })
    .select(
      "experience_id, workspace_id, corpus_id, source_scope, source_document_id, title, description, publication_status, scaffold_status, materialization_status, last_canonical_version_id",
    )
    .single();

  if (insertError) throw new Error(insertError.message);
  return created;
}

async function updatePrivateLiveRegistryState({
  supabase,
  experienceId,
  title,
  summary,
  canonicalVersionId,
}) {
  const patch = {
    updated_at: new Date().toISOString(),
    scaffold_status: "scaffolded",
    materialization_status: "materialized",
    ...(title ? { title } : {}),
    ...(summary ? { description: summary } : {}),
    ...(canonicalVersionId ? { last_canonical_version_id: canonicalVersionId } : {}),
  };

  await supabase
    .from("experience_registry")
    .update(patch)
    .eq("experience_id", experienceId);
}

function defaultRouteGraphForTemplate(templateId) {
  if (normalizeExperienceTemplateId(templateId) === "contract_analysis") {
    return ["overview", "obligations", "deadlines", "risks"];
  }
  return ["overview", "facts", "findings", "actions", "review"];
}

function buildPlannerPayload(templateId, title, summary, snapshot) {
  const resolvedTemplateId = normalizeExperienceTemplateId(templateId);
  const routeGraph = defaultRouteGraphForTemplate(resolvedTemplateId);
  return {
    program_version: "experience-program/v1",
    title: title || defaultExperienceTitle(resolvedTemplateId),
    summary: summary || "Private live planner scaffold.",
    route_graph: routeGraph,
    route_views: routeGraph.map((routeId) => ({
      route_id: routeId,
      view_kind: routeId === "deadlines" ? "timeline" : "overview",
      model_refs: routeId === "overview" ? ["route"] : [`route.${routeId}`],
      data_contract: { route_id: routeId },
    })),
    capability_profile: {
      search: false,
      filters: false,
      compare: false,
      graph: false,
      timeline: routeGraph.includes("deadlines"),
      diff: false,
      citations: true,
      evidence: true,
      bookmarks: false,
      saved_filters: false,
      alerts: false,
      tasks: routeGraph.includes("obligations"),
      charts: Array.isArray(snapshot?.variables),
      quizzes: false,
      flashcards: false,
    },
    sandbox_blocks: [],
  };
}

async function callPublicationApi({ requestId, userId, path, body }) {
  const response = await fetch(`${publicationBaseUrl()}${path}`, {
    method: "POST",
    headers: getInternalHeaders(requestId, userId),
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof json?.message === "string"
      ? json.message
      : typeof json?.error === "string"
      ? json.error
      : "Private live publication request failed";
    throw new Error(message);
  }
  return json;
}

export async function ensurePrivateLiveExperienceRefresh({
  supabase,
  requestId,
  workspaceId,
  userId,
  documentId,
  templateId,
  analysisTemplateId,
  title,
  subtitle,
  summary,
  verificationObjectId,
  verificationObjectVersionId,
  snapshot,
  updatedAfterVerification = false,
  defaultVerificationStatus = "generated",
}) {
  const record = await resolvePrivateLiveExperienceRecord({
    supabase,
    workspaceId,
    documentId,
    templateId,
    title,
    summary,
  });
  const resolvedTemplateId = normalizeExperienceTemplateId(templateId);
  const resolvedAnalysisTemplateId = String(
    analysisTemplateId || snapshot?.template || "",
  ).trim();
  const response = await callPublicationApi({
    requestId,
    userId,
    path: "/v1/experiences/private-live/materialize",
    body: {
      source_kind: resolveExperienceSourceKind(resolvedTemplateId),
      workspace_id: normalizeUuid(workspaceId),
      corpus_id: record.corpus_id,
      document_id: normalizeUuid(documentId),
      experience_id: record.experience_id,
      verification_object_id: verificationObjectId || null,
      verification_object_version_id: verificationObjectVersionId || null,
      template_id: resolvedTemplateId,
      experience_template_id: resolvedTemplateId,
      ...(resolvedAnalysisTemplateId
        ? { analysis_template_id: resolvedAnalysisTemplateId }
        : {}),
      planner_payload: buildPlannerPayload(
        resolvedTemplateId,
        title,
        summary,
        snapshot,
      ),
      title: title || defaultExperienceTitle(resolvedTemplateId),
      subtitle: subtitle || "Private live experience",
      summary:
        summary ||
        "Structured analysis completed. This private live experience now reflects the latest canonical snapshot.",
      host: "live.zohal.ai",
      visibility: "org_private",
      org_restricted: true,
      materialization_mode: "refresh",
      default_verification_status: defaultVerificationStatus,
      updated_after_verification: Boolean(updatedAfterVerification),
      value_updated_at: new Date().toISOString(),
      ...(snapshot ? { source_override: snapshot } : {}),
    },
  });

  await updatePrivateLiveRegistryState({
    supabase,
    experienceId: record.experience_id,
    title,
    summary,
    canonicalVersionId: verificationObjectVersionId,
  });

  return {
    experience_id: record.experience_id,
    candidate_id: response?.compile?.candidate_id || null,
    revision_id: response?.compile?.revision_id || null,
    public_url: response?.compile?.public_url || null,
    active_runtime: response?.active_runtime || null,
    fallback_reason: response?.fallback_reason || null,
    bundle_revision_id: response?.bundle_revision_id || null,
  };
}
