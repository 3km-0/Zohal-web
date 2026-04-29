import { createClient } from "@supabase/supabase-js";
import { buildContractExportPayload } from "../analysis/export-report.js";
import { generateSignedUploadUrl, joinObjectPath } from "../runtime/gcs.js";
import { resolveDataPlane } from "../runtime/data-plane.js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient, getSupabaseUrl } from "../runtime/supabase.js";

function getAnonKey() {
  const value = String(process.env.SUPABASE_ANON_KEY || "").trim();
  if (!value) throw new Error("SUPABASE_ANON_KEY not configured");
  return value;
}

function authHeader(req) {
  return String(req.headers.authorization || req.headers.Authorization || "");
}

function createUserClient(req) {
  return createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: authHeader(req) } },
    auth: { persistSession: false },
  });
}

async function requireUser(req) {
  const supabase = createUserClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    const authError = new Error("Not authenticated");
    authError.statusCode = 401;
    throw authError;
  }
  return { supabase, user: data.user };
}

function makeError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function safeError(res, requestId, error) {
  return sendJson(res, error.statusCode || 500, {
    error: error.message || "Internal server error",
    request_id: requestId,
    execution_plane: "gcp",
  });
}

export function escapeICS(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatActionKind(type) {
  const value = String(type || "");
  if (!value) return "Action";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

export function generateICS(actions, docTitle) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zohal//Contract Obligations//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${docTitle} Obligations`,
  ];

  for (const action of actions || []) {
    const dueAt = action.due_at ? new Date(action.due_at) : new Date();
    const dateStr = dueAt.toISOString().replace(/[-:]/g, "").split("T")[0];
    const type = formatActionKind(action.action_kind || action.obligation_type);
    const party = action.responsible_party || "";
    const summary = party ? `${type}: ${party}` : type;
    const description = [];
    if (action.title && action.title !== type) description.push(action.title);
    if (action.summary) description.push(action.summary);
    if (action.action_text || action.action) description.push(`Action: ${action.action_text || action.action}`);
    if (action.condition_text || action.condition) description.push(`Condition: ${action.condition_text || action.condition}`);
    description.push(`Document: ${docTitle}`);
    description.push(`State: ${action.workflow_state || action.confidence_state || "extracted"}`);

    ics.push("BEGIN:VEVENT");
    ics.push(`UID:analysis-action-${action.id}@zohal.ai`);
    ics.push(`DTSTAMP:${timestamp}`);
    ics.push(`DTSTART;VALUE=DATE:${dateStr}`);
    ics.push(`DTEND;VALUE=DATE:${dateStr}`);
    ics.push(`SUMMARY:${escapeICS(summary)}`);
    ics.push(`DESCRIPTION:${escapeICS(description.join("\n"))}`);
    ics.push("BEGIN:VALARM");
    ics.push("TRIGGER:-P1D");
    ics.push("ACTION:DISPLAY");
    ics.push(`DESCRIPTION:Reminder: ${escapeICS(summary)}`);
    ics.push("END:VALARM");
    ics.push("END:VEVENT");
  }

  ics.push("END:VCALENDAR");
  return ics.join("\r\n");
}

function evidenceFromItem(item) {
  const evidence = item?.evidence;
  if (!evidence || typeof evidence !== "object") return null;
  return {
    document_id: normalizeId(evidence.document_id) || undefined,
    page_number: typeof evidence.page_number === "number" ? evidence.page_number : undefined,
    chunk_id: normalizeId(evidence.chunk_id) || undefined,
    snippet: typeof evidence.snippet === "string" ? evidence.snippet : undefined,
    bbox: evidence.bbox && typeof evidence.bbox === "object" ? evidence.bbox : null,
  };
}

export function extractCitationsFromSnapshot(snapshot) {
  const out = [];
  const push = (itemType, item, label) => {
    out.push({
      item_type: itemType,
      item_id: item?.id ? String(item.id) : null,
      label,
      evidence: evidenceFromItem(item),
    });
  };
  for (const item of Array.isArray(snapshot?.variables) ? snapshot.variables : []) {
    push("variable", item, item?.display_name ? String(item.display_name) : (item?.name ? String(item.name) : null));
  }
  for (const item of Array.isArray(snapshot?.clauses) ? snapshot.clauses : []) {
    push("clause", item, item?.clause_title ? String(item.clause_title) : (item?.clause_type ? String(item.clause_type) : null));
  }
  for (const item of Array.isArray(snapshot?.obligations) ? snapshot.obligations : []) {
    push("obligation", item, item?.summary ? String(item.summary) : (item?.obligation_type ? String(item.obligation_type) : null));
  }
  for (const item of Array.isArray(snapshot?.risks) ? snapshot.risks : []) {
    push("risk", item, item?.description ? String(item.description) : null);
  }
  return out;
}

export function pickRunIdFromActions(actions) {
  for (const action of actions || []) {
    const runId = normalizeId(action?.output_json?.run_id);
    if (isUuidLike(runId)) return runId;
  }
  return null;
}

async function requireReadableExportTarget(userClient, body) {
  if (body.version_id) {
    const { data, error } = await userClient
      .from("verification_object_versions")
      .select("id")
      .eq("id", normalizeId(body.version_id))
      .maybeSingle();
    if (error || !data) throw makeError("Version not found", 404);
    return;
  }
  if (body.verification_object_id) {
    const { data, error } = await userClient
      .from("verification_objects")
      .select("id")
      .eq("id", normalizeId(body.verification_object_id))
      .maybeSingle();
    if (error || !data) throw makeError("Verification object not found", 404);
    return;
  }
  if (body.document_id) {
    const { data, error } = await userClient
      .from("documents")
      .select("id")
      .eq("id", normalizeId(body.document_id))
      .maybeSingle();
    if (error || !data) throw makeError("Document not found", 404);
    return;
  }
  throw makeError("Missing required parameter: document_id, verification_object_id, or version_id", 400);
}

async function uploadJsonToEnterpriseExports({ supabase, workspaceId, documentId, versionId, auditPack }) {
  const plane = await resolveDataPlane({ workspaceId, supabase });
  const bucket = plane.mode === "enterprise_firebase"
    ? (plane.enterprise?.exports?.bucket || plane.enterprise?.documents?.bucket || null)
    : null;
  if (plane.mode !== "enterprise_firebase" || !bucket) return null;

  const prefix = plane.enterprise?.exports?.prefix || null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `exports/${workspaceId}/audit-pack/${documentId || "unknown"}/${versionId || "current"}_${ts}.json`;
  const fullPath = prefix ? joinObjectPath(prefix, path) : path;
  const { url } = generateSignedUploadUrl(path, {
    bucketNameOverride: bucket,
    pathPrefix: prefix,
    contentType: "application/json",
  });
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(auditPack),
  });
  if (!response.ok) throw new Error(`enterprise_export_upload_failed:${response.status}`);
  return {
    storage_path: fullPath,
    data_plane: {
      mode: plane.mode,
      region: plane.enterprise?.region || null,
      tenant_id: plane.enterprise?.tenant_id || null,
    },
  };
}

export async function handleExportContractReport(req, res, { requestId, readJsonBody, log }) {
  try {
    const body = await readJsonBody(req);
    const { supabase: userClient } = await requireUser(req);
    await requireReadableExportTarget(userClient, body);
    const payload = await buildContractExportPayload({
      supabase: createServiceClient(),
      requestId,
      body,
      log,
    });
    return sendJson(res, 200, payload);
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleExportCalendar(req, res, { requestId, readJsonBody }) {
  try {
    const body = await readJsonBody(req);
    const documentId = normalizeId(body.document_id);
    const contractId = normalizeId(body.contract_id);
    const obligationIds = Array.isArray(body.obligation_ids) ? body.obligation_ids.map(normalizeId).filter(Boolean) : [];
    const insightIds = Array.isArray(body.insight_ids) ? body.insight_ids.map(normalizeId).filter(Boolean) : [];
    if (!documentId && !contractId) throw makeError("Missing document_id or contract_id", 400);
    if (contractId && !documentId) throw makeError("Legacy contract_id calendar export is no longer supported. Use document_id.", 410);

    const { supabase } = await requireUser(req);
    const { data: doc } = await supabase
      .from("documents")
      .select("id, title, workspace_id")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc) throw makeError("Document not found", 404);

    let query = supabase
      .from("analysis_actions")
      .select("*")
      .eq("document_id", documentId)
      .not("due_at", "is", null)
      .order("due_at", { ascending: true });
    if (obligationIds.length > 0) query = query.in("id", obligationIds);
    const { data: actionRows, error: actionError } = await query;
    if (actionError) throw actionError;
    let actions = actionRows || [];

    if (actions.length === 0 && insightIds.length > 0) {
      let insightQuery = supabase
        .from("insights")
        .select("*")
        .eq("document_id", documentId)
        .eq("kind", "deadline");
      if (insightIds.length > 0) insightQuery = insightQuery.in("id", insightIds);
      const { data: insights } = await insightQuery;
      actions = (insights || []).map((item) => ({
        id: item.id,
        action_kind: "deadline",
        title: item.payload?.label || "Deadline",
        summary: item.payload?.label || "Deadline",
        due_at: item.due_at,
        responsible_party: null,
        workflow_state: "extracted",
      }));
    }
    if (actions.length === 0) throw makeError("No analysis actions with due dates found", 404);

    const docTitle = doc.title || "Document";
    const icsContent = generateICS(actions, docTitle);
    const safeTitle = docTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    res.writeHead(200, {
      "content-type": "text/calendar",
      "content-disposition": `attachment; filename="${safeTitle}_analysis_actions.ics"`,
      "x-request-id": requestId,
      "x-execution-plane": "gcp",
    });
    return res.end(icsContent);
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleExportAuditPack(req, res, { requestId, readJsonBody, log }) {
  try {
    const body = await readJsonBody(req);
    const { supabase: userClient } = await requireUser(req);
    const versionId = normalizeId(body.version_id);
    const voId = normalizeId(body.verification_object_id);
    const includeActions = body.include_actions !== false;
    const includeRuns = body.include_runs !== false;
    const mirror = body.mirror_to_enterprise_exports === true;
    if (!versionId && !voId) throw makeError("Missing version_id or verification_object_id", 400);

    let version = null;
    let vo = null;
    if (versionId) {
      const { data, error } = await userClient
        .from("verification_object_versions")
        .select("*")
        .eq("id", versionId)
        .single();
      if (error || !data) throw makeError("Version not found", 404);
      version = data;
      const { data: voData, error: voError } = await userClient
        .from("verification_objects")
        .select("*")
        .eq("id", normalizeId(version.verification_object_id))
        .single();
      if (voError || !voData) throw makeError("Verification object not found", 404);
      vo = voData;
    } else {
      const { data: voData, error: voError } = await userClient
        .from("verification_objects")
        .select("*")
        .eq("id", voId)
        .single();
      if (voError || !voData) throw makeError("Verification object not found", 404);
      vo = voData;
      if (vo.current_version_id) {
        const { data: verData, error: verError } = await userClient
          .from("verification_object_versions")
          .select("*")
          .eq("id", normalizeId(vo.current_version_id))
          .single();
        if (verError || !verData) throw makeError("Current version not found", 404);
        version = verData;
      }
    }

    const documentId = normalizeId(vo?.document_id);
    const workspaceId = normalizeId(vo?.workspace_id);
    let doc = null;
    if (documentId) {
      const { data } = await userClient
        .from("documents")
        .select("id, title, workspace_id, updated_at, created_at")
        .eq("id", documentId)
        .maybeSingle();
      doc = data || null;
    }

    const snapshot = version?.snapshot_json || null;
    const citations = snapshot ? extractCitationsFromSnapshot(snapshot) : [];
    let actions = [];
    let runId = null;
    let runParent = null;
    let runChildren = [];

    if (includeActions && workspaceId && documentId) {
      const { data } = await userClient
        .from("actions")
        .select("id, action_type, status, stage, created_at, triggered_by_user_id, output_json")
        .eq("workspace_id", workspaceId)
        .contains("target_document_ids", [documentId])
        .order("created_at", { ascending: false })
        .limit(50);
      actions = data || [];
      runId = pickRunIdFromActions(actions);
    }

    if (includeRuns && workspaceId && documentId) {
      if (runId) {
        const { data: parent } = await userClient
          .from("extraction_runs")
          .select("*")
          .eq("id", runId)
          .maybeSingle();
        runParent = parent || null;
        const { data: kids } = await userClient
          .from("extraction_runs")
          .select("*")
          .eq("document_id", documentId)
          .eq("workspace_id", workspaceId)
          .contains("input_config", { parent_run_id: runId })
          .order("created_at", { ascending: true });
        runChildren = kids || [];
      } else {
        const { data: recent } = await userClient
          .from("extraction_runs")
          .select("*")
          .eq("document_id", documentId)
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(20);
        runChildren = recent || [];
      }
    }

    const bundleHashes = snapshot?.pack?.bundle?.document_hashes &&
      typeof snapshot.pack.bundle.document_hashes === "object"
      ? snapshot.pack.bundle.document_hashes
      : null;
    const auditPack = {
      version: "audit_pack_v1",
      generated_at: new Date().toISOString(),
      workspace_id: workspaceId || null,
      document: doc ? { id: normalizeId(doc.id), title: doc.title || null } : { id: documentId || null, title: null },
      verification_object: {
        id: normalizeId(vo?.id) || null,
        object_type: vo?.object_type || null,
        state: vo?.state || null,
        finalized_at: vo?.finalized_at || null,
        finalized_by: vo?.finalized_by || null,
      },
      version_info: version ? {
        id: normalizeId(version.id),
        verification_object_id: normalizeId(version.verification_object_id),
        version_number: version.version_number || null,
        state: version.state || null,
        created_at: version.created_at || null,
        created_by: version.created_by || null,
        reviewed_at: version.reviewed_at || null,
        reviewed_by: version.reviewed_by || null,
        change_notes: version.change_notes || null,
      } : null,
      run_manifest: includeRuns ? {
        run_id: runId,
        parent: runParent ? {
          id: normalizeId(runParent.id),
          extraction_type: runParent.extraction_type || null,
          status: runParent.status || null,
          created_at: runParent.created_at || null,
          started_at: runParent.started_at || null,
          completed_at: runParent.completed_at || null,
          input_config: runParent.input_config || null,
          error: runParent.error || null,
        } : null,
        children: (runChildren || []).map((run) => ({
          id: normalizeId(run.id),
          extraction_type: run.extraction_type || null,
          status: run.status || null,
          created_at: run.created_at || null,
          started_at: run.started_at || null,
          completed_at: run.completed_at || null,
          output_summary_meta: run.output_summary && typeof run.output_summary === "object"
            ? { keys: Object.keys(run.output_summary) }
            : null,
          error: run.error || null,
        })),
      } : null,
      approvals_log: includeActions ? actions.filter((action) => action?.action_type === "finalize_verification") : [],
      citations: { count: citations.length, items: citations },
      hashes: {
        document: bundleHashes && documentId ? (bundleHashes[documentId] || null) : null,
        method: bundleHashes ? "snapshot.pack.bundle.document_hashes" : "not_available",
      },
    };

    const out = {
      ok: true,
      audit_pack: auditPack,
      request_id: requestId,
      execution_plane: "gcp",
    };
    if (mirror && workspaceId) {
      try {
        const artifact = await uploadJsonToEnterpriseExports({
          supabase: createServiceClient(),
          workspaceId,
          documentId,
          versionId: normalizeId(version?.id),
          auditPack,
        });
        if (artifact) out.export_artifact = artifact;
      } catch (error) {
        log.warn("Enterprise audit pack mirroring failed (non-fatal)", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return sendJson(res, 200, out);
  } catch (error) {
    return safeError(res, requestId, error);
  }
}
