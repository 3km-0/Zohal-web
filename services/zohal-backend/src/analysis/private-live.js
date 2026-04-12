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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export function normalizeExperienceTemplateId(templateId) {
  const normalized = String(templateId || "").trim().toLowerCase();
  if (
    !normalized || normalized === "contract" ||
    normalized === "contract_document" ||
    normalized === "contract_analysis"
  ) {
    return "document_analysis";
  }
  return "document_analysis";
}

export function pickCanonicalPrivateLiveExperienceRecord(records, templateId) {
  if (!Array.isArray(records) || records.length === 0) return null;
  const normalizedTemplateId = normalizeExperienceTemplateId(templateId);
  const exactMatch = records.find((record) =>
    String(record?.template_id || "").trim().toLowerCase() === normalizedTemplateId
  );
  if (exactMatch) return exactMatch;
  return records.find((record) =>
    normalizeExperienceTemplateId(record?.template_id) === normalizedTemplateId
  ) || records[0] || null;
}

/** Maps registry default_visibility to publication API access fields (see experiences-runtime accessModeFromPolicy). */
export function privateLiveMaterializeAccessFromDefaultVisibility(defaultVisibility) {
  const v = String(defaultVisibility || "org_private").trim().toLowerCase();
  if (v === "public_unlisted" || v === "public_indexed") {
    return { visibility: v, org_restricted: false };
  }
  return { visibility: "org_private", org_restricted: true };
}

function resolveExperienceSourceKind(templateId) {
  return normalizeExperienceTemplateId(templateId) === "document_analysis"
    ? "verification_document"
    : "contract_document";
}

function defaultExperienceTitle(templateId) {
  return "Document analysis";
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
  const templateLookupIds = normalizedTemplateId === "document_analysis"
    ? ["document_analysis", "contract_analysis"]
    : [normalizedTemplateId];
  const defaultCorpusId = await resolveWorkspaceDefaultCorpusId(
    supabase,
    normalizedWorkspaceId,
  );

  const { data: existingRows, error } = await supabase
    .from("experience_registry")
    .select(
      "experience_id, workspace_id, corpus_id, source_scope, source_document_id, title, description, publication_status, scaffold_status, materialization_status, last_canonical_version_id, template_id, default_visibility",
    )
    .eq("workspace_id", normalizedWorkspaceId)
    .in("template_id", templateLookupIds)
    .eq("experience_lane", "private_live")
    .or(
      [
        `corpus_id.eq.${defaultCorpusId}`,
        `and(corpus_id.eq.${normalizedDocumentId},source_document_id.is.null)`,
        `source_document_id.eq.${normalizedDocumentId}`,
      ].join(","),
    )
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);
  const existing = pickCanonicalPrivateLiveExperienceRecord(
    existingRows,
    normalizedTemplateId,
  );
  if (existing?.experience_id) {
    const existingTemplateId = String(existing.template_id || "").trim().toLowerCase();
    if (existingTemplateId && existingTemplateId !== normalizedTemplateId) {
      const { data: normalizedExisting, error: normalizeError } = await supabase
        .from("experience_registry")
        .update({
          template_id: normalizedTemplateId,
          template_version: "1.0.0",
          updated_at: new Date().toISOString(),
        })
        .eq("experience_id", String(existing.experience_id))
        .select(
          "experience_id, workspace_id, corpus_id, source_scope, source_document_id, title, description, publication_status, scaffold_status, materialization_status, last_canonical_version_id, template_id, default_visibility",
        )
        .single();
      if (normalizeError) throw new Error(normalizeError.message);
      return normalizedExisting;
    }
    return existing;
  }

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
      "experience_id, workspace_id, corpus_id, source_scope, source_document_id, title, description, publication_status, scaffold_status, materialization_status, last_canonical_version_id, template_id, default_visibility",
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
  materializationStatus = "pending",
}) {
  const patch = {
    updated_at: new Date().toISOString(),
    scaffold_status: "scaffolded",
    materialization_status: materializationStatus,
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

async function getPublicationApi({ requestId, userId, path }) {
  const response = await fetch(`${publicationBaseUrl()}${path}`, {
    method: "GET",
    headers: getInternalHeaders(requestId, userId),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof json?.message === "string"
      ? json.message
      : typeof json?.error === "string"
      ? json.error
      : "Private live publication status request failed";
    throw new Error(message);
  }
  return json;
}

export function extractPrivateLivePublicationState(statusJson = {}) {
  const activeRevision = statusJson?.active_revision &&
      typeof statusJson.active_revision === "object"
    ? statusJson.active_revision
    : {};
  const sourceBinding = statusJson?.source_binding &&
      typeof statusJson.source_binding === "object"
    ? statusJson.source_binding
    : {};
  return {
    experienceId: String(statusJson?.experience_id || "").trim() || null,
    activeRevisionId: String(activeRevision.active_revision_id || "").trim() || null,
    scaffoldStatus: String(activeRevision.scaffold_status || "").trim() || null,
    materializationStatus:
      String(activeRevision.materialization_status || "").trim() || null,
    canonicalVersionId:
      String(
        activeRevision.last_canonical_version_id ||
          sourceBinding.published_version_id ||
          "",
      ).trim() || null,
    publicUrl: String(sourceBinding.public_url || "").trim() || null,
    activeRuntime: String(activeRevision.active_runtime || "").trim() || null,
    publicationStatus:
      String(activeRevision.publication_status || "").trim() || null,
  };
}

export function isPrivateLivePublicationSettled(
  publicationState,
  expectedCanonicalVersionId = null,
  requireMaterialized = true,
) {
  if (!publicationState) return false;
  const materialized = publicationState.materializationStatus === "materialized";
  const canonicalMatches = !expectedCanonicalVersionId ||
    normalizeUuid(publicationState.canonicalVersionId) ===
      normalizeUuid(expectedCanonicalVersionId);
  return canonicalMatches && (!requireMaterialized || materialized);
}

export async function syncPrivateLiveRegistryFromPublicationStatus({
  supabase,
  requestId,
  userId,
  experienceId,
  expectedCanonicalVersionId = null,
  timeoutMs = 30000,
  intervalMs = 2000,
  requireMaterialized = true,
}) {
  const normalizedExperienceId = normalizeUuid(experienceId);
  if (!normalizedExperienceId) {
    return {
      ok: false,
      settled: false,
      reason: "missing_experience_id",
      state: null,
    };
  }

  const deadline = Date.now() + Math.max(0, Number(timeoutMs || 0));
  let lastState = null;

  while (true) {
    const statusJson = await getPublicationApi({
      requestId,
      userId,
      path: `/v1/experiences/publications/${normalizedExperienceId}/status`,
    });
    lastState = extractPrivateLivePublicationState(statusJson);
    if (
      isPrivateLivePublicationSettled(
        lastState,
        expectedCanonicalVersionId,
        requireMaterialized,
      )
    ) {
      break;
    }
    if (Date.now() >= deadline) {
      break;
    }
    await sleep(intervalMs);
  }

  if (!lastState) {
    return {
      ok: false,
      settled: false,
      reason: "missing_publication_state",
      state: null,
    };
  }

  await updatePrivateLiveRegistryState({
    supabase,
    experienceId: normalizedExperienceId,
    scaffoldStatus: lastState.scaffoldStatus || undefined,
    materializationStatus: lastState.materializationStatus || undefined,
    canonicalVersionId:
      lastState.canonicalVersionId || expectedCanonicalVersionId || undefined,
  });

  return {
    ok: true,
    settled: isPrivateLivePublicationSettled(
      lastState,
      expectedCanonicalVersionId,
      requireMaterialized,
    ),
    state: lastState,
  };
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
  const access = privateLiveMaterializeAccessFromDefaultVisibility(record.default_visibility);
  const hasCanonicalVersion = Boolean(String(verificationObjectVersionId || "").trim());
  const shouldSendSourceOverride = Boolean(snapshot) && !hasCanonicalVersion;
  const shouldSendPlannerPayload = !hasCanonicalVersion;
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
      ...(shouldSendPlannerPayload
        ? {
          planner_payload: buildPlannerPayload(
            resolvedTemplateId,
            title,
            summary,
            snapshot,
          ),
        }
        : {}),
      title: title || defaultExperienceTitle(resolvedTemplateId),
      subtitle: subtitle || "Private live experience",
      summary:
        summary ||
        "Structured analysis completed. This private live experience now reflects the latest canonical snapshot.",
      host: "live.zohal.ai",
      visibility: access.visibility,
      org_restricted: access.org_restricted,
      materialization_mode: "refresh",
      default_verification_status: defaultVerificationStatus,
      updated_after_verification: Boolean(updatedAfterVerification),
      value_updated_at: new Date().toISOString(),
      ...(shouldSendSourceOverride ? { source_override: snapshot } : {}),
    },
  });

  await updatePrivateLiveRegistryState({
    supabase,
    experienceId: record.experience_id,
    title,
    summary,
    canonicalVersionId: verificationObjectVersionId,
    materializationStatus: "pending",
  });

  let syncResult = null;
  try {
    syncResult = await syncPrivateLiveRegistryFromPublicationStatus({
      supabase,
      requestId,
      userId,
      experienceId: record.experience_id,
      expectedCanonicalVersionId: verificationObjectVersionId || null,
      timeoutMs: 180000,
      intervalMs: 3000,
      requireMaterialized: true,
    });
  } catch {
    syncResult = null;
  }

  return {
    experience_id: record.experience_id,
    run_id: response?.run?.run_id || response?.compile?.run_id || null,
    candidate_id: response?.compile?.candidate_id || null,
    revision_id: response?.compile?.revision_id || null,
    public_url: response?.compile?.public_url || null,
    active_runtime: response?.active_runtime || null,
    fallback_reason: response?.fallback_reason || null,
    bundle_revision_id: response?.bundle_revision_id || null,
    materialization_status: syncResult?.state?.materializationStatus || "pending",
    settled: Boolean(syncResult?.settled),
  };
}

/**
 * Sets default_visibility to public_unlisted and rematerializes from the latest canonical snapshot
 * so the existing /live/... URL is readable without login (accessModeFromPolicy to public).
 */
export async function promotePrivateLiveToPublicUnlisted({
  supabase,
  requestId,
  userId,
  workspaceId,
  documentId,
  templateId = "document_analysis",
}) {
  const record = await resolvePrivateLiveExperienceRecord({
    supabase,
    workspaceId,
    documentId,
    templateId,
    title: null,
    summary: null,
  });
  const versionId = String(record.last_canonical_version_id || "").trim();
  if (!versionId) {
    throw new Error(
      "Private live experience has no last_canonical_version_id; run analysis first.",
    );
  }
  const { data: version, error: versionError } = await supabase
    .from("verification_object_versions")
    .select("id, snapshot_json, verification_object_id")
    .eq("id", normalizeUuid(versionId))
    .maybeSingle();
  if (versionError) {
    throw new Error(versionError.message);
  }
  if (version.snapshot_json == null) {
    throw new Error("Canonical snapshot_json missing for last_canonical_version_id");
  }
  let snapshot = version.snapshot_json;
  if (typeof snapshot === "string") {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      throw new Error("Canonical snapshot_json is not valid JSON");
    }
  }
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Canonical snapshot_json must be an object");
  }
  const verificationObjectId = String(version.verification_object_id || "").trim();
  if (!verificationObjectId) {
    throw new Error("verification_object_id missing on canonical version");
  }
  const resolvedTemplateId = normalizeExperienceTemplateId(
    record.template_id || templateId,
  );
  const resolvedAnalysisTemplateId = String(
    snapshot?.template || templateId || "",
  ).trim();

  await supabase
    .from("experience_registry")
    .update({
      default_visibility: "public_unlisted",
      updated_at: new Date().toISOString(),
    })
    .eq("experience_id", record.experience_id);

  const title = record.title || defaultExperienceTitle(resolvedTemplateId);
  const summary = record.description ||
    "Structured analysis completed. This private live experience now reflects the latest canonical snapshot.";

  return await ensurePrivateLiveExperienceRefresh({
    supabase,
    requestId,
    workspaceId,
    userId,
    documentId,
    templateId: resolvedTemplateId,
    analysisTemplateId: resolvedAnalysisTemplateId,
    title,
    subtitle: "Private live experience",
    summary,
    verificationObjectId,
    verificationObjectVersionId: String(version.id || "").trim(),
    snapshot,
    updatedAfterVerification: false,
    defaultVerificationStatus: "generated",
  });
}

export async function openPrivateLiveExperienceLink({
  requestId,
  userId,
  experienceId,
}) {
  const response = await callPublicationApi({
    requestId,
    userId,
    path: "/v1/experiences/private-live/open",
    body: { experience_id: normalizeUuid(experienceId) },
  });
  return {
    experience_url: response?.experience_url
      ? String(response.experience_url)
      : null,
    live_url: response?.live_url ? String(response.live_url) : null,
    redeem_url: response?.redeem_url ? String(response.redeem_url) : null,
  };
}

export async function createPrivateLiveAccessLink({
  requestId,
  userId,
  experienceId,
  ttlSeconds = 60 * 60,
}) {
  const openResult = await openPrivateLiveExperienceLink({
    requestId,
    userId,
    experienceId,
  });
  const experienceUrl = String(openResult?.experience_url || openResult?.live_url || "").trim();
  if (!experienceUrl) {
    return {
      short_url: null,
      redeem_url: String(openResult?.redeem_url || "").trim() || null,
      experience_url: null,
    };
  }

  let host = "";
  let nextPath = "/";
  try {
    const parsed = new URL(experienceUrl);
    host = String(parsed.host || "").trim().toLowerCase();
    nextPath = String(parsed.pathname || "/").trim() || "/";
  } catch {
    return {
      short_url: null,
      redeem_url: String(openResult?.redeem_url || "").trim() || null,
      experience_url: experienceUrl,
    };
  }

  const response = await callPublicationApi({
    requestId,
    userId,
    path: "/v1/experiences/access/links",
    body: {
      experience_id: normalizeUuid(experienceId),
      host,
      ttl_seconds: ttlSeconds,
      next_path: nextPath,
      metadata: {
        next_path: nextPath,
        source: "whatsapp_automation_completion",
      },
    },
  });

  return {
    short_url: response?.short_url ? String(response.short_url) : null,
    redeem_url: response?.redeem_url ? String(response.redeem_url) : null,
    experience_url: experienceUrl,
  };
}

export function preferredPrivateLiveExperienceUrl(openResult) {
  const experienceUrl = String(openResult?.experience_url || "").trim();
  if (experienceUrl) return experienceUrl;
  const liveUrl = String(openResult?.live_url || "").trim();
  if (liveUrl) return liveUrl;
  const redeemUrl = String(openResult?.redeem_url || "").trim();
  return redeemUrl || null;
}
