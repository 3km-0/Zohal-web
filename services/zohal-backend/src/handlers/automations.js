import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sendJson } from "../runtime/http.js";
import {
  createServiceClient,
  getSupabaseUrl,
} from "../runtime/supabase.js";
import { getExpectedInternalToken } from "../runtime/internal-auth.js";

const WORKSPACE_AUTOMATION_PRESET_KEY = "analyze_workspace_uploads_v1";

function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function authHeader(req) {
  return String(req.headers.authorization || req.headers.Authorization || "");
}

function stripBearer(value) {
  const raw = String(value || "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice("bearer ".length).trim() : raw;
}

function getAnonKey() {
  const key = String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!key) throw new Error("SUPABASE_ANON_KEY not configured");
  return key;
}

function makeError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeError(res, requestId, error) {
  return sendJson(res, error.statusCode || 500, {
    ok: false,
    error: error.message || "Internal server error",
    request_id: requestId,
    execution_plane: "gcp",
  });
}

function createUserClient(req) {
  return createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: authHeader(req) } },
    auth: { persistSession: false },
  });
}

function backendBaseUrl(req) {
  const configured = String(process.env.ANALYSIS_SERVICE_BASE_URL || process.env.ZOHAL_BACKEND_URL || process.env.INGESTION_SERVICE_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = String(req.headers.host || "").trim();
  if (!host) throw makeError("ANALYSIS_SERVICE_BASE_URL not configured", 500);
  const proto = String(req.headers["x-forwarded-proto"] || "").trim() || "https";
  return `${proto}://${host}`;
}

function internalBackendHeaders(requestId) {
  const token = getExpectedInternalToken();
  if (!token) throw makeError("Missing internal token for backend pipeline dispatch", 500);
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    apikey: token,
    "x-internal-function-jwt": token,
    "x-request-id": requestId,
  };
}

async function authenticateUser(req) {
  const token = stripBearer(authHeader(req));
  if (!token) throw makeError("Missing authorization token", 401);
  const client = createUserClient(req);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) throw makeError("Invalid authorization token", 401);
  return { userId: normalizeUuid(data.user.id), client };
}

async function requireWorkspaceAccess(supabase, workspaceId, userId) {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  const normalizedUserId = normalizeUuid(userId);
  const [{ data: owned }, { data: member }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id")
      .eq("id", normalizedWorkspaceId)
      .eq("owner_id", normalizedUserId)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", normalizedWorkspaceId)
      .eq("user_id", normalizedUserId)
      .maybeSingle(),
  ]);
  if (!owned?.id && !member?.id) throw makeError("forbidden", 403);
}

function coerceBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortJsonValue(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function stableJsonStringify(value) {
  return JSON.stringify(sortJsonValue(value));
}

function sha256Hex(input) {
  return createHash("sha256").update(String(input)).digest("hex");
}

function resolveLocalDayBucket(timezone, at = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(at);
}

function computeNextScheduledRunAt(timezone, localTime, from = new Date()) {
  const [hourRaw, minuteRaw] = String(localTime || "09:00:00").split(":");
  const hour = Math.max(0, Math.min(23, Number(hourRaw || "9")));
  const minute = Math.max(0, Math.min(59, Number(minuteRaw || "0")));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(from);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(lookup.year || "1970");
  const month = Number(lookup.month || "1");
  const day = Number(lookup.day || "1");
  const localHour = Number(lookup.hour || "0");
  const localMinute = Number(lookup.minute || "0");
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  if (localHour > hour || (localHour === hour && localMinute >= minute)) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return candidate.toISOString();
}

function buildAutomationDedupeKey(args) {
  return stableJsonStringify({
    workspace_id: normalizeUuid(args.workspaceId),
    automation_id: normalizeUuid(args.automationId),
    trigger_kind: args.triggerKind,
    local_day_bucket: args.localDayBucket || null,
    source_fingerprint: args.sourceFingerprint || null,
    source_document_id: normalizeUuid(args.sourceDocumentId),
    nonce: args.nonce || null,
  });
}

function buildCorpusResolutionResult({ workspaceId, primaryDocumentId, scopeDocumentIds, defaultCorpusId }) {
  const documentIds = Array.from(new Set((scopeDocumentIds || []).map(normalizeUuid).filter(Boolean)));
  const primary = normalizeUuid(primaryDocumentId) || documentIds[0] || "";
  const corpusId = String(defaultCorpusId || "").trim() ||
    (documentIds.length > 1
      ? `corpus_related_${normalizeUuid(workspaceId).replace(/[^a-z0-9]+/g, "_")}_${primary.replace(/[^a-z0-9]+/g, "_")}`
      : `corpus_document_${primary.replace(/[^a-z0-9]+/g, "_")}`);
  return {
    corpus_id: corpusId,
    corpus_kind: documentIds.length > 1 ? "related_documents" : "single_document",
    workspace_id: normalizeUuid(workspaceId),
    source_manifest: {
      primary_document_id: primary,
      primary_source_kind: "document",
      document_ids: documentIds,
      member_roles: documentIds.map((documentId, index) => ({
        document_id: documentId,
        role: documentId === primary ? "primary" : "other",
        sort_order: index,
      })),
      precedence_policy: "manual",
      library_sources: [],
      api_sources: [],
      source_members: [],
      legacy_pack_id: null,
      legacy_bundle_id: null,
      saved_label: null,
    },
  };
}

function resolveTemplateRuntimeIdFromSpec(spec) {
  const record = asRecord(spec) || {};
  return normalizeText(record.template_id) ||
    normalizeText(record.id) ||
    normalizeText(asRecord(record.metadata)?.template_id) ||
    normalizeText(asRecord(record.runtime)?.template_id) ||
    "document_analysis";
}

async function loadWorkspaceDefaultPlaybookChoice(supabase, workspaceId) {
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("default_playbook_id")
    .eq("id", normalizeUuid(workspaceId))
    .maybeSingle();
  if (workspaceError) throw new Error(workspaceError.message);
  const playbookId = normalizeUuid(workspace?.default_playbook_id);
  if (!playbookId) return null;
  const { data: playbook, error: playbookError } = await supabase
    .from("playbooks")
    .select("id, current_version_id, current_version:playbook_versions!fk_playbooks_current_version(id, spec_json)")
    .eq("id", playbookId)
    .maybeSingle();
  if (playbookError) throw new Error(playbookError.message);
  const versionId = normalizeUuid(playbook?.current_version_id);
  const specJson = asRecord(playbook?.current_version)?.spec_json;
  if (!versionId || !asRecord(specJson)) return null;
  return {
    templateId: resolveTemplateRuntimeIdFromSpec(specJson),
    playbookId,
    playbookVersionId: versionId,
  };
}

function extractTemplateIdFromMetadata(metadata) {
  const record = asRecord(metadata);
  if (!record) return null;
  const direct = normalizeText(record.best_template_id);
  if (direct && direct !== "other") return direct.toLowerCase();
  const classification = asRecord(record.classification);
  const classifiedBest = normalizeText(classification?.best_template_id);
  if (classifiedBest && classifiedBest !== "other") return classifiedBest.toLowerCase();
  const recommended = Array.isArray(record.recommended_template_ids)
    ? record.recommended_template_ids
    : Array.isArray(classification?.recommended_template_ids)
      ? classification.recommended_template_ids
      : [];
  for (const candidate of recommended) {
    const normalized = normalizeText(candidate).toLowerCase();
    if (normalized && normalized !== "other") return normalized;
  }
  return null;
}

function resolveTemplateChoice(automation, document, workspaceDefaultPlaybook = null) {
  if (workspaceDefaultPlaybook?.templateId) return workspaceDefaultPlaybook;
  if (!document) return { templateId: null, playbookId: null, playbookVersionId: null };
  const metadataTemplate = extractTemplateIdFromMetadata(document.source_metadata);
  if (metadataTemplate) return { templateId: metadataTemplate, playbookId: null, playbookVersionId: null };
  if (automation.template_strategy === "fixed_template" && normalizeText(automation.template_id)) {
    return { templateId: normalizeText(automation.template_id).toLowerCase(), playbookId: null, playbookVersionId: null };
  }
  switch (normalizeText(document.document_type).toLowerCase()) {
    case "contract":
    case "legal_filing":
    case "policy":
      return { templateId: "pe_diligence_data_room_workspace", playbookId: null, playbookVersionId: null };
    case "invoice":
    case "onboarding_doc":
      return { templateId: "smb_cash_flow_workspace", playbookId: null, playbookVersionId: null };
    case "financial_report":
      return { templateId: "investor_reporting_dashboard", playbookId: null, playbookVersionId: null };
    case "paper":
    case "research":
      return { templateId: "quant_research_workspace", playbookId: null, playbookVersionId: null };
    default:
      return { templateId: null, playbookId: null, playbookVersionId: null };
  }
}

async function loadLegacyPolicy(supabase, workspaceId) {
  const { data } = await supabase
    .from("workspace_experience_automation_policies")
    .select("auto_generate_private_experience, auto_refresh_private_experience")
    .eq("workspace_id", normalizeUuid(workspaceId))
    .maybeSingle();
  if (!data) return null;
  return {
    auto_generate_private_experience: data.auto_generate_private_experience !== false,
    auto_refresh_private_experience: data.auto_refresh_private_experience !== false,
  };
}

async function ensureWorkspaceAutomation(supabase, workspaceId) {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  const { data: existing, error } = await supabase
    .from("workspace_automations")
    .select("*")
    .eq("workspace_id", normalizedWorkspaceId)
    .eq("preset_key", WORKSPACE_AUTOMATION_PRESET_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (existing?.id) return existing;
  const legacyPolicy = await loadLegacyPolicy(supabase, normalizedWorkspaceId);
  const { data: created, error: insertError } = await supabase
    .from("workspace_automations")
    .insert({
      workspace_id: normalizedWorkspaceId,
      preset_key: WORKSPACE_AUTOMATION_PRESET_KEY,
      name: "Analyze workspace uploads",
      description:
        "Run approved analysis on ingested workspace documents and refresh the workspace private-live experience.",
      enabled: true,
      trigger_document_ingestion_completed: true,
      raw_upload_scaffold_enabled: false,
      daily_schedule_enabled: false,
      daily_schedule_local_time: "09:00:00",
      timezone: "UTC",
      template_strategy: "auto_by_document_type",
      template_id: null,
      manual_run_enabled: true,
      private_live_enabled: legacyPolicy?.auto_generate_private_experience !== false,
      auto_refresh_private_live: legacyPolicy?.auto_refresh_private_experience !== false,
      require_review: false,
      next_scheduled_run_at: null,
      last_started_at: null,
      last_succeeded_at: null,
      last_source_fingerprint: null,
      last_seeded_from_legacy_policy_at: legacyPolicy ? new Date().toISOString() : null,
    })
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);
  return created;
}

async function updateWorkspaceAutomation(supabase, workspaceId, patch) {
  const automation = await ensureWorkspaceAutomation(supabase, workspaceId);
  const nextScheduledRunAt = patch.daily_schedule_enabled === true
    ? computeNextScheduledRunAt(
      String(patch.timezone || automation.timezone || "UTC"),
      String(patch.daily_schedule_local_time || automation.daily_schedule_local_time || "09:00:00"),
    )
    : patch.daily_schedule_enabled === false
      ? null
      : automation.next_scheduled_run_at || null;
  const { data, error } = await supabase
    .from("workspace_automations")
    .update({ ...patch, next_scheduled_run_at: nextScheduledRunAt, updated_at: new Date().toISOString() })
    .eq("id", automation.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function listWorkspaceAutomationRuns(supabase, workspaceId, limit = 20) {
  const { data, error } = await supabase
    .from("workspace_automation_runs")
    .select("*")
    .eq("workspace_id", normalizeUuid(workspaceId))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

async function buildAutomationSnapshot(supabase, workspaceId, automation, limit) {
  const runs = await listWorkspaceAutomationRuns(supabase, workspaceId, limit);
  const actionIds = Array.from(new Set(runs.map((run) => normalizeUuid(run.action_id)).filter(Boolean)));
  const parentRunIds = Array.from(new Set(runs.map((run) => normalizeUuid(run.parent_run_id)).filter(Boolean)));
  const [{ data: actions }, { data: extractionRuns }] = await Promise.all([
    actionIds.length
      ? supabase.from("actions").select("id, status, output_json, output_text, updated_at").in("id", actionIds)
      : Promise.resolve({ data: [] }),
    parentRunIds.length
      ? supabase.from("extraction_runs").select("id, status, updated_at, completed_at").in("id", parentRunIds)
      : Promise.resolve({ data: [] }),
  ]);
  const actionById = new Map((actions || []).map((row) => [normalizeUuid(row.id), row]));
  const extractionRunById = new Map((extractionRuns || []).map((row) => [normalizeUuid(row.id), row]));
  const enrichedRuns = runs.map((run) => ({
    ...run,
    action: run.action_id ? actionById.get(normalizeUuid(run.action_id)) || null : null,
    extraction_run: run.parent_run_id ? extractionRunById.get(normalizeUuid(run.parent_run_id)) || null : null,
  }));
  const activeRun = enrichedRuns.find((run) => run.status === "queued" || run.status === "running") || null;
  return { ok: true, automation, runs: enrichedRuns, active_run: activeRun, execution_plane: "gcp" };
}

function nowIso() {
  return new Date().toISOString();
}

function buildActivityMessage(message, extra = {}) {
  return { at: nowIso(), kind: "status", message, ...extra };
}

async function createWorkspaceAutomationEvent(supabase, args) {
  const { data, error } = await supabase
    .from("workspace_automation_events")
    .insert({
      workspace_id: normalizeUuid(args.workspaceId),
      automation_id: normalizeUuid(args.automationId) || null,
      event_kind: args.eventKind,
      trigger_kind: args.triggerKind,
      source_document_id: normalizeUuid(args.sourceDocumentId) || null,
      requested_by_user_id: normalizeUuid(args.requestedByUserId) || null,
      local_day_bucket: args.localDayBucket || null,
      source_fingerprint: args.sourceFingerprint || null,
      dedupe_key: args.dedupeKey,
      payload: args.payload || {},
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function insertAutomationRun(supabase, payload) {
  const { data, error } = await supabase
    .from("workspace_automation_runs")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateAutomationRun(supabase, runId, patch) {
  const { error } = await supabase
    .from("workspace_automation_runs")
    .update({ ...patch, updated_at: nowIso() })
    .eq("id", normalizeUuid(runId));
  if (error) throw new Error(error.message);
}

async function updateAutomationActionFailure(supabase, actionId, message) {
  if (!actionId) return;
  await supabase
    .from("actions")
    .update({
      status: "failed",
      output_text: message,
      output_json: { stage: "automation_failed", message },
      updated_at: nowIso(),
    })
    .eq("id", normalizeUuid(actionId));
}

async function loadLatestCompletedFingerprint(supabase, automationId) {
  const { data, error } = await supabase
    .from("workspace_automation_runs")
    .select("source_fingerprint")
    .eq("automation_id", normalizeUuid(automationId))
    .in("status", ["succeeded", "skipped"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return typeof data?.source_fingerprint === "string" ? data.source_fingerprint : null;
}

async function loadActiveAutomationRun(supabase, automationId) {
  const { data, error } = await supabase
    .from("workspace_automation_runs")
    .select("*")
    .eq("automation_id", normalizeUuid(automationId))
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function createSkippedRun(args) {
  const dedupeKey = buildAutomationDedupeKey({
    workspaceId: args.automation.workspace_id,
    automationId: args.automation.id,
    triggerKind: args.triggerKind,
    localDayBucket: args.localDayBucket || null,
    sourceFingerprint: args.sourceFingerprint || null,
    sourceDocumentId: args.sourceDocumentId || null,
    nonce: args.dedupeNonce || args.skipReason,
  });
  return await insertAutomationRun(args.supabase, {
    workspace_id: args.automation.workspace_id,
    automation_id: args.automation.id,
    event_id: normalizeUuid(args.eventId) || null,
    trigger_kind: args.triggerKind,
    status: "skipped",
    source_document_id: normalizeUuid(args.sourceDocumentId) || null,
    triggered_by_user_id: normalizeUuid(args.requestedByUserId) || null,
    local_day_bucket: args.localDayBucket || null,
    source_fingerprint: args.sourceFingerprint || null,
    previous_source_fingerprint: args.previousSourceFingerprint || null,
    dedupe_key: dedupeKey,
    skip_reason: args.skipReason,
    status_reason: args.statusReason,
    activity_json: [buildActivityMessage(args.statusReason)],
    metadata: args.metadata || {},
    completed_at: nowIso(),
  });
}

async function advanceScheduleIfNeeded(supabase, automation) {
  if (!automation.daily_schedule_enabled) return;
  await supabase.from("workspace_automations").update({
    next_scheduled_run_at: computeNextScheduledRunAt(
      automation.timezone || "UTC",
      automation.daily_schedule_local_time || "09:00:00",
    ),
    updated_at: nowIso(),
  }).eq("id", automation.id);
}

async function resolveAutomationExecutionContext(supabase, workspaceId, automation, sourceDocumentId) {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, owner_id")
    .eq("id", normalizedWorkspaceId)
    .single();
  if (workspaceError || !workspace?.owner_id) throw new Error(workspaceError?.message || "Workspace not found");

  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id, user_id, workspace_id, title, document_type, processing_status, updated_at, created_at, content_fingerprint, source_metadata")
    .eq("workspace_id", normalizedWorkspaceId)
    .order("updated_at", { ascending: false });
  if (docsError) throw new Error(docsError.message);
  const documents = (docs || []).map((doc) => ({
    ...doc,
    id: normalizeUuid(doc.id),
    user_id: normalizeUuid(doc.user_id),
    workspace_id: normalizeUuid(doc.workspace_id),
  }));
  if (!documents.length) {
    return {
      workspaceOwnerId: normalizeUuid(workspace.owner_id),
      automation,
      documents,
      targetDocument: null,
      corpusResolution: null,
      sourceFingerprint: null,
      templateId: null,
      playbookId: null,
      playbookVersionId: null,
    };
  }
  const explicitTarget = normalizeUuid(sourceDocumentId)
    ? documents.find((doc) => doc.id === normalizeUuid(sourceDocumentId)) || null
    : null;
  const workspaceDefaultPlaybook = await loadWorkspaceDefaultPlaybookChoice(supabase, normalizedWorkspaceId);
  const firstTemplateable = documents.find((doc) => !!resolveTemplateChoice(automation, doc, workspaceDefaultPlaybook).templateId) || null;
  const targetDocument = explicitTarget || firstTemplateable || documents[0] || null;
  const { data: defaultCorpusId, error: corpusError } = await supabase.rpc(
    "ensure_workspace_default_corpus",
    { p_workspace_id: normalizedWorkspaceId },
  );
  if (corpusError) throw new Error(corpusError.message);
  const corpusResolution = targetDocument
    ? buildCorpusResolutionResult({
      workspaceId: normalizedWorkspaceId,
      primaryDocumentId: targetDocument.id,
      scopeDocumentIds: documents.map((doc) => doc.id),
      defaultCorpusId: String(defaultCorpusId || "").trim() || null,
    })
    : null;
  const templateChoice = resolveTemplateChoice(automation, targetDocument, workspaceDefaultPlaybook);
  const sourceFingerprint = sha256Hex(stableJsonStringify({
    workspace_id: normalizedWorkspaceId,
    corpus_id: corpusResolution?.corpus_id || null,
    template_id: templateChoice.templateId || null,
    playbook_id: templateChoice.playbookId || null,
    playbook_version_id: templateChoice.playbookVersionId || null,
    documents: documents.map((doc) => ({
      id: doc.id,
      type: normalizeText(doc.document_type).toLowerCase() || null,
      updated_at: doc.updated_at || null,
      content_fingerprint: doc.content_fingerprint || null,
    })),
  }));
  return {
    workspaceOwnerId: normalizeUuid(workspace.owner_id),
    automation,
    documents,
    targetDocument,
    corpusResolution,
    sourceFingerprint,
    templateId: templateChoice.templateId,
    playbookId: templateChoice.playbookId,
    playbookVersionId: templateChoice.playbookVersionId,
  };
}

async function createAutomationAction(supabase, args) {
  const { data, error } = await supabase
    .from("actions")
    .insert({
      org_id: null,
      workspace_id: normalizeUuid(args.workspaceId),
      triggered_by_user_id: normalizeUuid(args.userId),
      plugin_family: "legal",
      action_type: "workspace_automation_run",
      status: "running",
      target_document_ids: args.targetDocumentIds.map(normalizeUuid),
      output_json: {
        stage: "automation_dispatch",
        message: "Automation is preparing analysis",
        trigger_kind: args.triggerKind,
        corpus_id: args.corpusId || null,
        template_id: args.templateId || null,
        playbook_id: args.playbookId || null,
        playbook_version_id: args.playbookVersionId || null,
      },
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(error?.message || "Failed to create automation action");
  return normalizeUuid(data.id);
}

function isWhatsappSourceDocument(document) {
  const sourceMetadata = asRecord(document?.source_metadata) || {};
  return String(sourceMetadata.source_type || "").trim().toLowerCase() === "whatsapp";
}

async function invokeAnalyzeDocument(args) {
  const response = await fetch(`${backendBaseUrl(args.req)}/analysis/start`, {
    method: "POST",
    headers: internalBackendHeaders(args.requestId),
    body: JSON.stringify({
      workspace_id: normalizeUuid(args.workspaceId),
      user_id: normalizeUuid(args.userId),
      document_id: normalizeUuid(args.documentId),
      action_id: normalizeUuid(args.actionId),
      template_id: args.templateId,
      playbook_id: normalizeUuid(args.playbookId) || null,
      playbook_version_id: normalizeUuid(args.playbookVersionId) || null,
      document_ids: args.corpusResolution?.source_manifest.document_ids || [normalizeUuid(args.documentId)],
      primary_document_id: args.corpusResolution?.source_manifest.primary_document_id || normalizeUuid(args.documentId),
      member_roles: args.corpusResolution?.source_manifest.member_roles || [],
      precedence_policy: args.corpusResolution?.source_manifest.precedence_policy || "manual",
      trigger_kind: args.triggerKind || null,
      automation_id: normalizeUuid(args.automationId) || null,
      workspace_automation_run_id: normalizeUuid(args.automationRunId) || null,
      requested_by_user_id: normalizeUuid(args.requestedByUserId) || null,
      force_gcp_execution: args.forceGcpExecution === true,
      execution_origin: args.executionOrigin || null,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    throw new Error(String(json?.message || json?.error || "Automation analysis dispatch failed"));
  }
  return json;
}

async function dispatchWorkspaceAutomation(args) {
  const automation = await ensureWorkspaceAutomation(args.supabase, args.workspaceId);
  const localDayBucket = resolveLocalDayBucket(automation.timezone || "UTC");
  const eventDedupeKey = buildAutomationDedupeKey({
    workspaceId: automation.workspace_id,
    automationId: automation.id,
    triggerKind: args.triggerKind,
    localDayBucket: args.triggerKind === "schedule" ? localDayBucket : null,
    sourceDocumentId: args.sourceDocumentId || null,
    nonce: args.requestNonce || null,
  });
  const event = await createWorkspaceAutomationEvent(args.supabase, {
    workspaceId: automation.workspace_id,
    automationId: automation.id,
    eventKind: args.triggerKind === "manual" ? "manual_run_requested" : "document_ingestion_completed",
    triggerKind: args.triggerKind,
    sourceDocumentId: args.sourceDocumentId || null,
    requestedByUserId: args.requestedByUserId || null,
    localDayBucket: args.triggerKind === "schedule" ? localDayBucket : null,
    dedupeKey: eventDedupeKey,
    payload: { request_nonce: args.requestNonce || null },
  });
  const resolution = await resolveAutomationExecutionContext(
    args.supabase,
    automation.workspace_id,
    automation,
    args.sourceDocumentId,
  );
  const previousFingerprint = await loadLatestCompletedFingerprint(args.supabase, automation.id);

  async function skip(outcome, skipReason, statusReason, extra = {}) {
    const run = await createSkippedRun({
      supabase: args.supabase,
      automation,
      eventId: event?.id,
      triggerKind: args.triggerKind,
      sourceDocumentId: extra.sourceDocumentId || args.sourceDocumentId || null,
      requestedByUserId: args.requestedByUserId || null,
      localDayBucket: args.triggerKind === "schedule" ? localDayBucket : null,
      sourceFingerprint: resolution.sourceFingerprint,
      previousSourceFingerprint: previousFingerprint,
      skipReason,
      statusReason,
      metadata: extra.metadata || { event_id: event?.id || null },
      dedupeNonce: args.requestNonce || null,
    });
    if (event?.id) {
      await args.supabase.from("workspace_automation_events").update({
        status: "skipped",
        processed_at: nowIso(),
        updated_at: nowIso(),
        source_fingerprint: resolution.sourceFingerprint,
      }).eq("id", event.id);
    }
    await advanceScheduleIfNeeded(args.supabase, automation);
    return { automation, eventId: event?.id || null, run, outcome, reason: run.status_reason || null };
  }

  if (!automation.enabled) {
    return await skip("skipped_disabled", "disabled", "Automation is disabled for this workspace.");
  }
  if (args.triggerKind === "manual" && !automation.manual_run_enabled) {
    return await skip("skipped_disabled", "manual_run_disabled", "Manual run is disabled for this automation preset.");
  }
  if (!resolution.documents.length || !resolution.targetDocument || !resolution.corpusResolution) {
    return await skip("skipped_no_documents", "no_documents_available", "No eligible workspace documents are available for automation.");
  }
  if (!resolution.templateId) {
    return await skip(
      "skipped_unsupported_document_type",
      "unsupported_document_type",
      "Automation found no supported approved analysis template for the current document set.",
      {
        sourceDocumentId: resolution.targetDocument.id,
        metadata: {
          target_document_id: resolution.targetDocument.id,
          document_type: resolution.targetDocument.document_type || null,
        },
      },
    );
  }
  const activeRun = await loadActiveAutomationRun(args.supabase, automation.id);
  if (activeRun?.id) {
    return await skip(
      "skipped_analysis_in_progress",
      "analysis_already_in_progress",
      "Automation skipped because an equivalent analysis run is already in progress.",
      {
        sourceDocumentId: resolution.targetDocument.id,
        metadata: { active_run_id: activeRun.id },
      },
    );
  }

  const actionId = await createAutomationAction(args.supabase, {
    workspaceId: automation.workspace_id,
    userId: args.requestedByUserId || resolution.targetDocument.user_id || resolution.workspaceOwnerId,
    targetDocumentIds: resolution.corpusResolution.source_manifest.document_ids,
    corpusId: resolution.corpusResolution.corpus_id,
    templateId: resolution.templateId,
    playbookId: resolution.playbookId,
    playbookVersionId: resolution.playbookVersionId,
    triggerKind: args.triggerKind,
  });
  const sourceDocumentForRouting = normalizeUuid(args.sourceDocumentId)
    ? resolution.documents.find((doc) => doc.id === normalizeUuid(args.sourceDocumentId)) || null
    : null;
  const forceGcpExecution = args.triggerKind === "document_ingestion_completed" && isWhatsappSourceDocument(sourceDocumentForRouting);
  const run = await insertAutomationRun(args.supabase, {
    workspace_id: automation.workspace_id,
    automation_id: automation.id,
    event_id: event?.id || null,
    trigger_kind: args.triggerKind,
    status: "running",
    source_document_id: normalizeUuid(args.sourceDocumentId) || resolution.targetDocument.id,
    target_document_id: resolution.targetDocument.id,
    triggered_by_user_id: normalizeUuid(args.requestedByUserId) || resolution.workspaceOwnerId,
    local_day_bucket: args.triggerKind === "schedule" ? localDayBucket : null,
    source_fingerprint: resolution.sourceFingerprint,
    previous_source_fingerprint: previousFingerprint,
    dedupe_key: buildAutomationDedupeKey({
      workspaceId: automation.workspace_id,
      automationId: automation.id,
      triggerKind: args.triggerKind,
      localDayBucket: args.triggerKind === "schedule" ? localDayBucket : null,
      sourceFingerprint: resolution.sourceFingerprint,
      sourceDocumentId: resolution.targetDocument.id,
      nonce: args.requestNonce || event?.id || null,
    }),
    corpus_id: resolution.corpusResolution.corpus_id,
    template_id: resolution.templateId,
    action_id: actionId,
    execution_plane: forceGcpExecution ? "gcp" : "supabase",
    status_reason: forceGcpExecution
      ? "Dispatching WhatsApp-triggered rebuild through the static GCP analysis starter."
      : "Dispatching approved analysis through the canonical path.",
    activity_json: [
      buildActivityMessage("Resolved workspace corpus and automation context.", {
        corpus_id: resolution.corpusResolution.corpus_id,
      }),
      buildActivityMessage(forceGcpExecution
        ? "Routing WhatsApp-triggered rebuild to the static GCP analysis starter."
        : "Starting approved analysis.", {
        template_id: resolution.templateId,
        playbook_id: resolution.playbookId,
        playbook_version_id: resolution.playbookVersionId,
        target_document_id: resolution.targetDocument.id,
        execution_target: forceGcpExecution ? "gcp_static" : "canonical",
      }),
    ],
    metadata: {
      playbook_id: resolution.playbookId,
      playbook_version_id: resolution.playbookVersionId,
      corpus_resolution: resolution.corpusResolution,
      source_document_count: resolution.documents.length,
      routing_mode: forceGcpExecution ? "whatsapp_gcp_required" : "default",
    },
    started_at: nowIso(),
  });

  try {
    const response = await invokeAnalyzeDocument({
      req: args.req,
      requestId: args.requestId,
      workspaceId: automation.workspace_id,
      userId: args.requestedByUserId || resolution.targetDocument.user_id || resolution.workspaceOwnerId,
      documentId: resolution.targetDocument.id,
      actionId,
      templateId: resolution.templateId,
      playbookId: resolution.playbookId,
      playbookVersionId: resolution.playbookVersionId,
      corpusResolution: resolution.corpusResolution,
      triggerKind: args.triggerKind,
      automationId: automation.id,
      automationRunId: run.id,
      requestedByUserId: args.requestedByUserId || resolution.workspaceOwnerId,
      forceGcpExecution,
      executionOrigin: forceGcpExecution ? "whatsapp_automation" : null,
    });
    const acceptedExecutionPlane = String(response.execution_plane || "").trim().toLowerCase();
    if (forceGcpExecution && acceptedExecutionPlane !== "gcp") {
      throw new Error("WhatsApp-triggered rebuild must be accepted by the GCP analysis starter.");
    }
    const acceptedRunId = normalizeUuid(response.run_id || response.parent_run_id) || null;
    const acceptedActionId = normalizeUuid(response.action_id) || actionId;
    await updateAutomationRun(args.supabase, run.id, {
      action_id: acceptedActionId,
      parent_run_id: acceptedRunId,
      execution_plane: acceptedExecutionPlane || (forceGcpExecution ? "gcp" : "supabase"),
      metadata: { ...run.metadata, analyze_contract_response: response },
    });
    await args.supabase.from("workspace_automations").update({
      last_started_at: nowIso(),
      last_source_fingerprint: resolution.sourceFingerprint,
      next_scheduled_run_at: automation.daily_schedule_enabled
        ? computeNextScheduledRunAt(automation.timezone || "UTC", automation.daily_schedule_local_time || "09:00:00")
        : null,
      updated_at: nowIso(),
    }).eq("id", automation.id);
    await args.supabase.from("workspace_automation_events").update({
      status: "processed",
      processed_at: nowIso(),
      updated_at: nowIso(),
      source_fingerprint: resolution.sourceFingerprint,
    }).eq("id", event.id);
    return {
      automation,
      eventId: event?.id || null,
      run: { ...run, action_id: acceptedActionId, parent_run_id: acceptedRunId },
      outcome: "accepted",
      reason: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateAutomationRun(args.supabase, run.id, {
      status: "failed",
      status_reason: message,
      error_message: message,
      completed_at: nowIso(),
      activity_json: [
        ...(Array.isArray(run.activity_json) ? run.activity_json : []),
        buildActivityMessage("Automation run failed before analysis was accepted.", { error: message }),
      ],
    });
    await updateAutomationActionFailure(args.supabase, actionId, message);
    await args.supabase.from("workspace_automation_events").update({
      status: "failed",
      error_message: message,
      processed_at: nowIso(),
      updated_at: nowIso(),
      source_fingerprint: resolution.sourceFingerprint,
    }).eq("id", event.id);
    await advanceScheduleIfNeeded(args.supabase, automation);
    return { automation, eventId: event?.id || null, run, outcome: "failed", reason: message };
  }
}

export async function handleWorkspaceAutomations(req, res, { requestId, readJsonBody }) {
  try {
    const { userId } = await authenticateUser(req);
    const supabase = createServiceClient();
    const body = await readJsonBody(req).catch(() => ({}));
    const workspaceId = normalizeUuid(body.workspace_id);
    const action = String(body.action || "get").trim().toLowerCase();
    const limit = Math.max(1, Math.min(50, Number(body.limit || 20)));
    if (!workspaceId) throw makeError("workspace_id is required", 400);
    await requireWorkspaceAccess(supabase, workspaceId, userId);
    let automation = await ensureWorkspaceAutomation(supabase, workspaceId);
    if (action === "update") {
      automation = await updateWorkspaceAutomation(supabase, workspaceId, {
        enabled: coerceBoolean(body.enabled, automation.enabled),
        trigger_document_ingestion_completed: coerceBoolean(
          body.trigger_document_ingestion_completed,
          automation.trigger_document_ingestion_completed,
        ),
        raw_upload_scaffold_enabled: coerceBoolean(
          body.raw_upload_scaffold_enabled,
          automation.raw_upload_scaffold_enabled,
        ),
        daily_schedule_enabled: coerceBoolean(body.daily_schedule_enabled, automation.daily_schedule_enabled),
        daily_schedule_local_time: typeof body.daily_schedule_local_time === "string"
          ? body.daily_schedule_local_time
          : automation.daily_schedule_local_time,
        timezone: typeof body.timezone === "string" ? body.timezone : automation.timezone,
        template_strategy: body.template_strategy === "fixed_template" ? "fixed_template" : "auto_by_document_type",
        template_id: typeof body.template_id === "string" ? body.template_id : null,
        manual_run_enabled: coerceBoolean(body.manual_run_enabled, automation.manual_run_enabled),
        private_live_enabled: coerceBoolean(body.private_live_enabled, automation.private_live_enabled),
        auto_refresh_private_live: coerceBoolean(body.auto_refresh_private_live, automation.auto_refresh_private_live),
        require_review: coerceBoolean(body.require_review, automation.require_review),
      });
    }
    return sendJson(res, 200, {
      ...(await buildAutomationSnapshot(supabase, workspaceId, automation, limit)),
      request_id: requestId,
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleWorkspaceAutomationRunNow(req, res, { requestId, readJsonBody }) {
  try {
    const { userId } = await authenticateUser(req);
    const supabase = createServiceClient();
    const body = await readJsonBody(req).catch(() => ({}));
    const workspaceId = normalizeUuid(body.workspace_id);
    const sourceDocumentId = normalizeUuid(body.source_document_id);
    if (!workspaceId) throw makeError("workspace_id is required", 400);
    await requireWorkspaceAccess(supabase, workspaceId, userId);
    const result = await dispatchWorkspaceAutomation({
      req,
      supabase,
      requestId,
      workspaceId,
      triggerKind: "manual",
      sourceDocumentId: sourceDocumentId || null,
      requestedByUserId: userId,
      requestNonce: requestId,
    });
    return sendJson(res, 200, {
      ok: true,
      outcome: result.outcome,
      reason: result.reason || null,
      automation: result.automation,
      event_id: result.eventId,
      run: result.run,
      request_id: requestId,
      execution_plane: "gcp",
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export {
  buildAutomationDedupeKey,
  buildCorpusResolutionResult,
  computeNextScheduledRunAt,
  normalizeUuid,
  resolveTemplateRuntimeIdFromSpec,
};
