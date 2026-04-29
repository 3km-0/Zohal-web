import { createClient } from "@supabase/supabase-js";
import { sendJson } from "../runtime/http.js";
import { getSupabaseUrl } from "../runtime/supabase.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function makeError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeError(res, requestId, error) {
  return sendJson(res, error.statusCode || 500, {
    error: error.message || "Internal server error",
    request_id: requestId,
    execution_plane: "gcp",
  });
}

export function normalizeTemplateSpec(spec) {
  const base = spec && typeof spec === "object" && !Array.isArray(spec) ? spec : {};
  const meta = base.meta && typeof base.meta === "object" && !Array.isArray(base.meta)
    ? base.meta
    : {};
  const canonical = base.canonical_profile &&
    typeof base.canonical_profile === "object" &&
    !Array.isArray(base.canonical_profile)
    ? base.canonical_profile
    : {};
  const displayName = String(
    meta.name ||
      canonical?.identity?.display_name ||
      base?.identity?.name ||
      "Template",
  ).trim() || "Template";
  const kind = String(meta.kind || "document").trim() || "document";

  return {
    ...base,
    spec_version: String(base.spec_version || "template/v1").trim() || "template/v1",
    template_profile: String(base.template_profile || "canonical_intent_v1").trim() ||
      "canonical_intent_v1",
    meta: {
      ...meta,
      name: displayName,
      kind,
    },
    canonical_profile: {
      ...canonical,
      schema_version: String(canonical.schema_version || "canonical-template-profile/v1").trim() ||
        "canonical-template-profile/v1",
      identity: {
        ...(canonical.identity || {}),
        display_name: canonical?.identity?.display_name || displayName,
      },
    },
    compatibility: base.compatibility || {
      runtime_template_id: "document_analysis",
      legacy_field_strategy: "temporary_adapter",
      delete_after: "remove after canonical runtime parity",
    },
    variables: Array.isArray(base.variables) ? base.variables : [],
    checks: Array.isArray(base.checks) ? base.checks : [],
    options: {
      ...(base.options && typeof base.options === "object" ? base.options : {}),
      strictness: base?.options?.strictness === "strict" ? "strict" : "default",
      enable_verifier: base?.options?.enable_verifier === true,
      language: base?.options?.language === "ar" ? "ar" : "en",
    },
  };
}

export function validateTemplateSpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { ok: false, error: "spec_json must be an object" };
  }
  if (!spec.meta || typeof spec.meta !== "object") {
    return { ok: false, error: "spec_json.meta is required" };
  }
  if (!String(spec.meta.name || "").trim()) {
    return { ok: false, error: "spec_json.meta.name is required" };
  }
  if (!String(spec.meta.kind || "").trim()) {
    return { ok: false, error: "spec_json.meta.kind is required" };
  }
  return { ok: true };
}

function selectTemplateFields() {
  return [
    "id",
    "workspace_id",
    "name",
    "kind",
    "status",
    "is_system_preset",
    "current_version_id",
    "created_by",
    "created_at",
    "updated_at",
    "current_version:playbook_versions!fk_playbooks_current_version(id, version_number, spec_json, published_at)",
  ].join(", ");
}

function sortTemplates(rows, kind) {
  const filtered = (rows || []).filter((row) => {
    if (kind !== "document") return true;
    return row?.kind === "document" || (row?.kind === "contract" && row?.is_system_preset === true);
  });
  return filtered.sort((a, b) => {
    if (a.is_system_preset && !b.is_system_preset) return -1;
    if (!a.is_system_preset && b.is_system_preset) return 1;
    if (a.is_system_preset && b.is_system_preset) {
      const aRank = typeof a?.current_version?.spec_json?.meta?.library_rank === "number"
        ? a.current_version.spec_json.meta.library_rank
        : Number.MAX_SAFE_INTEGER;
      const bRank = typeof b?.current_version?.spec_json?.meta?.library_rank === "number"
        ? b.current_version.spec_json.meta.library_rank
        : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return String(a.name || "").localeCompare(String(b.name || ""));
    }
    return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
  });
}

export function buildTemplatesListResponse({ templates, requestId }) {
  return {
    ok: true,
    templates,
    request_id: requestId,
    execution_plane: "gcp",
  };
}

export async function handleTemplatesList(req, res, { requestId, readJsonBody, log }) {
  try {
    const body = await readJsonBody(req);
    const workspaceId = normalizeId(body.workspace_id);
    const kind = typeof body.kind === "string" ? body.kind : "document";
    const status = typeof body.status === "string" ? body.status : null;

    if (!workspaceId) return sendJson(res, 400, { error: "Missing workspace_id", request_id: requestId, execution_plane: "gcp" });
    if (!UUID_PATTERN.test(workspaceId)) return sendJson(res, 400, { error: "workspace_id must be a valid UUID", request_id: requestId, execution_plane: "gcp" });

    const { supabase } = await requireUser(req);
    let query = supabase
      .from("playbooks")
      .select(selectTemplateFields())
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order("is_system_preset", { ascending: false })
      .order("updated_at", { ascending: false });

    query = kind === "document" ? query.in("kind", ["document", "contract"]) : query.eq("kind", kind);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      log.error("Templates query failed", { error: error.message || String(error) });
      throw makeError("Failed to load templates", 500);
    }

    return sendJson(res, 200, buildTemplatesListResponse({
      templates: sortTemplates(data || [], kind),
      requestId,
    }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleTemplatesGet(req, res, { requestId, readJsonBody }) {
  try {
    const body = await readJsonBody(req);
    const templateId = normalizeId(body.template_id || body.playbook_id);
    if (!templateId) return sendJson(res, 400, { error: "Missing template_id", request_id: requestId, execution_plane: "gcp" });

    const { supabase } = await requireUser(req);
    const { data, error } = await supabase
      .from("playbooks")
      .select(selectTemplateFields())
      .eq("id", templateId)
      .maybeSingle();
    if (error || !data) return sendJson(res, 404, { error: "Template not found", request_id: requestId, execution_plane: "gcp" });

    return sendJson(res, 200, { ok: true, template: data, request_id: requestId, execution_plane: "gcp" });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleTemplatesCreate(req, res, { requestId, readJsonBody, log }) {
  try {
    const body = await readJsonBody(req);
    const workspaceId = normalizeId(body.workspace_id);
    const name = String(body.name || "").trim();
    const kind = typeof body.kind === "string" ? body.kind : "document";
    const initialSpec = body.initial_spec_json;
    const changelog = typeof body.changelog === "string" ? body.changelog : null;
    if (!workspaceId || !name) return sendJson(res, 400, { error: "Missing workspace_id or name", request_id: requestId, execution_plane: "gcp" });

    const { supabase, user } = await requireUser(req);
    const { data: template, error: templateErr } = await supabase
      .from("playbooks")
      .insert({
        workspace_id: workspaceId,
        name,
        kind,
        status: "draft",
        created_by: user.id,
      })
      .select("id, workspace_id, name, kind, status, is_system_preset, current_version_id, created_by, created_at, updated_at")
      .single();
    if (templateErr || !template) {
      log.error("Failed to create template", { error: templateErr?.message || String(templateErr) });
      throw makeError("Failed to create template", 500);
    }

    let currentVersionId = null;
    if (initialSpec !== undefined) {
      const spec = normalizeTemplateSpec(initialSpec);
      const validation = validateTemplateSpec(spec);
      if (!validation.ok) {
        await supabase.from("playbooks").delete().eq("id", template.id);
        return sendJson(res, 400, { error: validation.error, request_id: requestId, execution_plane: "gcp" });
      }

      const { data: version, error: versionErr } = await supabase
        .from("playbook_versions")
        .insert({
          playbook_id: template.id,
          version_number: 1,
          spec_json: spec,
          changelog,
          created_by: user.id,
        })
        .select("id, version_number")
        .single();
      if (versionErr || !version) throw makeError("Failed to create template version", 500);
      currentVersionId = version.id;
      await supabase.from("playbooks").update({ current_version_id: version.id }).eq("id", template.id);
    }

    return sendJson(res, 200, {
      ok: true,
      template: {
        ...template,
        current_version_id: currentVersionId || template.current_version_id,
      },
      request_id: requestId,
      execution_plane: "gcp",
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleTemplatesCreateVersion(req, res, { requestId, readJsonBody, log }) {
  try {
    const body = await readJsonBody(req);
    const templateId = normalizeId(body.template_id || body.playbook_id);
    const spec = normalizeTemplateSpec(body.spec_json);
    const changelog = typeof body.changelog === "string" ? body.changelog : null;
    const makeCurrent = body.make_current === true;
    if (!templateId) return sendJson(res, 400, { error: "Missing template_id", request_id: requestId, execution_plane: "gcp" });
    const validation = validateTemplateSpec(spec);
    if (!validation.ok) return sendJson(res, 400, { error: validation.error, request_id: requestId, execution_plane: "gcp" });

    const { supabase, user } = await requireUser(req);
    const { data: template, error: templateErr } = await supabase
      .from("playbooks")
      .select("id")
      .eq("id", templateId)
      .maybeSingle();
    if (templateErr || !template) return sendJson(res, 404, { error: "Template not found", request_id: requestId, execution_plane: "gcp" });

    const { data: latest } = await supabase
      .from("playbook_versions")
      .select("version_number")
      .eq("playbook_id", templateId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version_number || 0) + 1;

    const { data: version, error: versionErr } = await supabase
      .from("playbook_versions")
      .insert({
        playbook_id: templateId,
        version_number: nextVersion,
        spec_json: spec,
        changelog,
        created_by: user.id,
      })
      .select("id, playbook_id, version_number, created_at, published_at")
      .single();
    if (versionErr || !version) {
      log.error("Failed to create template version", { error: versionErr?.message || String(versionErr) });
      throw makeError("Failed to create template version", 500);
    }

    if (makeCurrent) {
      await supabase.from("playbooks").update({ current_version_id: version.id }).eq("id", templateId);
    }

    return sendJson(res, 200, { ok: true, version, request_id: requestId, execution_plane: "gcp" });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleTemplatesPublish(req, res, { requestId, readJsonBody, log }) {
  try {
    const body = await readJsonBody(req);
    const templateId = normalizeId(body.template_id || body.playbook_id);
    const versionId = normalizeId(body.version_id);
    const changelog = typeof body.changelog === "string" ? body.changelog : null;
    if (!templateId) return sendJson(res, 400, { error: "Missing template_id", request_id: requestId, execution_plane: "gcp" });

    const { supabase, user } = await requireUser(req);
    const { data: template, error: templateErr } = await supabase
      .from("playbooks")
      .select("id,current_version_id,status")
      .eq("id", templateId)
      .maybeSingle();
    if (templateErr || !template) return sendJson(res, 404, { error: "Template not found", request_id: requestId, execution_plane: "gcp" });

    const targetVersionId = versionId || template.current_version_id;
    if (!targetVersionId) return sendJson(res, 400, { error: "No version_id provided and template has no current version", request_id: requestId, execution_plane: "gcp" });

    const { data: version, error: versionErr } = await supabase
      .from("playbook_versions")
      .select("id, playbook_id, version_number, published_at")
      .eq("id", targetVersionId)
      .eq("playbook_id", templateId)
      .maybeSingle();
    if (versionErr || !version) return sendJson(res, 404, { error: "Template version not found", request_id: requestId, execution_plane: "gcp" });

    const now = new Date().toISOString();
    const patch = {
      published_at: version.published_at || now,
      published_by: user.id,
      ...(changelog !== null ? { changelog } : {}),
    };
    const { error: publishVersionErr } = await supabase
      .from("playbook_versions")
      .update(patch)
      .eq("id", version.id);
    if (publishVersionErr) {
      log.error("Failed to publish template version", { error: publishVersionErr.message || String(publishVersionErr) });
      throw makeError("Failed to publish template version", 500);
    }

    const { error: updateTemplateErr } = await supabase
      .from("playbooks")
      .update({ status: "published", current_version_id: version.id })
      .eq("id", templateId);
    if (updateTemplateErr) throw makeError("Failed to publish template", 500);

    return sendJson(res, 200, {
      ok: true,
      template_id: templateId,
      version_id: version.id,
      published_at: now,
      request_id: requestId,
      execution_plane: "gcp",
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}
