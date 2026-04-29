import { createClient } from "@supabase/supabase-js";
import { resolveDataPlane } from "../runtime/data-plane.js";
import {
  generateSignedDownloadUrl,
  generateSignedUploadUrl,
  getDocumentStoragePath,
  joinObjectPath,
} from "../runtime/gcs.js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient, getSupabaseUrl } from "../runtime/supabase.js";

const VALID_TICKET_CATEGORIES = new Set([
  "general",
  "billing",
  "bug",
  "feature_request",
  "security",
  "compliance",
]);
const VALID_TICKET_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

function getAnonKey() {
  const value = String(process.env.SUPABASE_ANON_KEY || "").trim();
  if (!value) throw new Error("SUPABASE_ANON_KEY not configured");
  return value;
}

function authHeader(req) {
  return String(req.headers.authorization || req.headers.Authorization || "");
}

function stripBearer(value) {
  const raw = String(value || "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice("bearer ".length).trim() : raw;
}

function createUserClient(req) {
  return createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: authHeader(req) } },
    auth: { persistSession: false },
  });
}

async function getUser(req) {
  const token = stripBearer(authHeader(req));
  if (!token) {
    const error = new Error("Missing authorization header");
    error.statusCode = 401;
    throw error;
  }
  const client = createUserClient(req);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    const authError = new Error("Invalid or expired token");
    authError.statusCode = 401;
    throw authError;
  }
  return { user: data.user, client };
}

function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase();
}

function getSourceMetadata(document) {
  return document?.source_metadata && typeof document.source_metadata === "object"
    ? document.source_metadata
    : {};
}

async function resolveDocumentBucketRouting({ admin, workspaceId, storagePath }) {
  if (!workspaceId) return { bucketOverride: null, pathPrefix: null };
  try {
    const plane = await resolveDataPlane({
      workspaceId: normalizeUuid(workspaceId),
      supabase: admin,
      failClosed: false,
    });
    if (plane.mode !== "enterprise_firebase" || !plane.enterprise?.documents?.bucket) {
      return { bucketOverride: null, pathPrefix: null };
    }
    const prefix =
      plane.enterprise.documents.prefix ||
      (plane.enterprise.tenant_id ? `tenants/${plane.enterprise.tenant_id}` : `workspaces/${normalizeUuid(workspaceId)}`);
    const path = String(storagePath || "");
    if (path && (path === prefix || path.startsWith(`${prefix}/`))) {
      return { bucketOverride: plane.enterprise.documents.bucket, pathPrefix: null };
    }
    return { bucketOverride: plane.enterprise.documents.bucket, pathPrefix: prefix };
  } catch {
    return { bucketOverride: null, pathPrefix: null };
  }
}

async function checkDocumentLimit(admin, userId) {
  const { count } = await admin
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null);
  return { allowed: true, current: count || 0, limit: null, tier: null };
}

async function checkStorageLimit() {
  return { allowed: true };
}

function normalizeExtension(ext, contentType) {
  const cleaned = String(ext || "").trim().replace(/^\./, "").toLowerCase();
  if (cleaned) return cleaned;
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("wordprocessingml")) return "docx";
  if (ct.includes("spreadsheetml")) return "xlsx";
  if (ct === "text/csv" || ct.includes("csv")) return "csv";
  if (ct === "application/pdf") return "pdf";
  if (ct.startsWith("image/")) return ct.split("/")[1] || "img";
  return "bin";
}

function detectSourceFormat(ext) {
  if (ext === "xlsx") return "xlsx";
  if (ext === "csv") return "csv";
  return "pdf";
}

function getDocumentSourceStoragePath(userId, documentId, extension) {
  return `${normalizeUuid(userId)}/sources/${normalizeUuid(documentId)}.${String(extension || "bin").toLowerCase()}`;
}

function getDocumentCanonicalStoragePath(userId, documentId, sourceFormat) {
  const ext = sourceFormat === "xlsx" || sourceFormat === "csv" ? sourceFormat : "pdf";
  return `${normalizeUuid(userId)}/canonical/${normalizeUuid(documentId)}.${ext}`;
}

function safeError(res, requestId, error) {
  return sendJson(res, error.statusCode || 500, {
    error: error.message || "Internal server error",
    request_id: requestId,
    execution_plane: "gcp",
  });
}

export function buildDocumentDownloadUrlResponse({ downloadUrl, expiresAt, storagePath, requestId }) {
  return {
    download_url: downloadUrl,
    expires_at: expiresAt instanceof Date ? expiresAt.toISOString() : String(expiresAt),
    storage_path: storagePath,
    request_id: requestId,
    execution_plane: "gcp",
  };
}

export function buildDocumentUploadUrlResponse({ uploadUrl, expiresAt, storagePath, requestId }) {
  return {
    upload_url: uploadUrl,
    storage_path: storagePath,
    expires_at: expiresAt instanceof Date ? expiresAt.toISOString() : String(expiresAt),
    request_id: requestId,
    execution_plane: "gcp",
  };
}

export function buildDocumentSourceUploadUrlResponse({
  uploadUrl,
  expiresAt,
  sourceStoragePath,
  pdfStoragePath,
  canonicalStoragePath,
  sourceFormat,
  requestId,
}) {
  return {
    upload_url: uploadUrl,
    source_storage_path: sourceStoragePath,
    pdf_storage_path: pdfStoragePath,
    canonical_storage_path: canonicalStoragePath,
    source_format: sourceFormat,
    expires_at: expiresAt instanceof Date ? expiresAt.toISOString() : String(expiresAt),
    request_id: requestId,
    execution_plane: "gcp",
  };
}

export function buildSupportTicketCreateResponse({ ticketId, category, priority, subject, emailSent, requestId }) {
  return {
    ok: true,
    ticket: {
      id: ticketId,
      category,
      priority,
      subject,
      email_sent: !!emailSent,
    },
    request_id: requestId,
    execution_plane: "gcp",
  };
}

export function buildMathpixTokenResponse({ appToken, expiresAt, strokesSessionId, requestId }) {
  return {
    app_token: appToken,
    expires_at: expiresAt,
    ...(strokesSessionId ? { strokes_session_id: strokesSessionId } : {}),
    request_id: requestId,
    execution_plane: "gcp",
  };
}

export async function handleMathpixToken(req, res, { requestId, readJsonBody }) {
  try {
    await getUser(req);
    const body = await readJsonBody(req).catch(() => ({}));
    const mathpixAppId = String(process.env.MATHPIX_APP_ID || "").trim();
    const mathpixAppKey = String(process.env.MATHPIX_APP_KEY || "").trim();
    if (!mathpixAppId || !mathpixAppKey) {
      return sendJson(res, 500, {
        error: "OCR service not configured",
        request_id: requestId,
        execution_plane: "gcp",
      });
    }

    const mathpixResponse = await fetch("https://api.mathpix.com/v3/app-tokens", {
      method: "POST",
      headers: {
        app_id: mathpixAppId,
        app_key: mathpixAppKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        include_strokes_session_id: body.include_strokes_session === true,
      }),
    });
    if (!mathpixResponse.ok) {
      return sendJson(res, 502, {
        error: "Failed to obtain OCR token",
        request_id: requestId,
        execution_plane: "gcp",
      });
    }

    const mathpixData = await mathpixResponse.json();
    return sendJson(res, 200, buildMathpixTokenResponse({
      appToken: mathpixData.app_token,
      expiresAt: mathpixData.app_token_expires_at,
      strokesSessionId: mathpixData.strokes_session_id,
      requestId,
    }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleDocumentDownloadUrl(req, res, { requestId, readJsonBody, log }) {
  try {
    const { client } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const documentId = normalizeUuid(body.document_id);
    const expiresInSeconds = Math.min(Number(body.expires_in_seconds || 3600), 3600 * 4);
    const overridePath = String(body.storage_path_override || "").trim();
    if (!documentId) return sendJson(res, 400, { error: "Missing document_id", request_id: requestId, execution_plane: "gcp" });

    const { data: document, error } = await client
      .from("documents")
      .select("id, storage_path, user_id, workspace_id, privacy_mode, source_metadata")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();
    if (error || !document) return sendJson(res, 404, { error: "Document not found or access denied", request_id: requestId, execution_plane: "gcp" });
    if (document.privacy_mode === true) return sendJson(res, 403, { error: "Document is in Privacy Mode and is not available for cloud download", request_id: requestId, execution_plane: "gcp" });

    const metadata = getSourceMetadata(document);
    const allowedPaths = new Set([
      String(document.storage_path || "").trim(),
      String(metadata.source_storage_path || "").trim(),
      String(metadata.tabular_manifest_storage_path || "").trim(),
    ].filter(Boolean));
    const storagePath = overridePath && allowedPaths.has(overridePath)
      ? overridePath
      : String(document.storage_path || "").trim();
    if (!storagePath || storagePath === "local") return sendJson(res, 400, { error: "Document not yet uploaded to cloud storage", request_id: requestId, execution_plane: "gcp" });

    const routing = await resolveDocumentBucketRouting({
      admin,
      workspaceId: document.workspace_id,
      storagePath,
    });
    const { url, expiresAt } = generateSignedDownloadUrl(storagePath, {
      expiresInSeconds,
      ...(routing.bucketOverride ? { bucketNameOverride: routing.bucketOverride } : {}),
    });
    log.info("document download URL generated", { document: documentId.slice(0, 8) });
    return sendJson(res, 200, buildDocumentDownloadUrlResponse({
      downloadUrl: url,
      expiresAt,
      storagePath,
      requestId,
    }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleDocumentUploadUrl(req, res, { requestId, readJsonBody, log }) {
  try {
    const { user, client } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const documentId = normalizeUuid(body.document_id);
    const fileSize = Number(body.file_size || 0);
    const contentType = String(body.content_type || "application/pdf");
    if (!documentId) return sendJson(res, 400, { error: "Missing document_id", request_id: requestId, execution_plane: "gcp" });
    if (!fileSize || fileSize <= 0) return sendJson(res, 400, { error: "Missing or invalid file_size", request_id: requestId, execution_plane: "gcp" });

    const docLimit = await checkDocumentLimit(admin, user.id);
    if (!docLimit.allowed) return sendJson(res, 403, { error: "document_limit_exceeded", request_id: requestId, execution_plane: "gcp" });
    const storageCheck = await checkStorageLimit(admin, user.id, fileSize);
    if (!storageCheck.allowed) return sendJson(res, 403, { error: "storage_limit_exceeded", request_id: requestId, execution_plane: "gcp" });

    let workspaceId = normalizeUuid(body.workspace_id);
    if (workspaceId) {
      const { data: workspace } = await client.from("workspaces").select("id").eq("id", workspaceId).maybeSingle();
      if (!workspace?.id) workspaceId = "";
    }
    if (!workspaceId) {
      const { data: document } = await client.from("documents").select("workspace_id").eq("id", documentId).maybeSingle();
      workspaceId = normalizeUuid(document?.workspace_id);
    }

    const basePath = getDocumentStoragePath(user.id, documentId);
    const routing = await resolveDocumentBucketRouting({ admin, workspaceId, storagePath: "" });
    const storagePath = routing.pathPrefix ? joinObjectPath(routing.pathPrefix, basePath) : basePath;
    const { url, expiresAt } = generateSignedUploadUrl(storagePath, {
      contentType,
      expiresInSeconds: 15 * 60,
      ...(routing.bucketOverride ? { bucketNameOverride: routing.bucketOverride } : {}),
    });
    log.info("document upload URL generated", { document: documentId.slice(0, 8) });
    return sendJson(res, 200, buildDocumentUploadUrlResponse({
      uploadUrl: url,
      storagePath,
      expiresAt,
      requestId,
    }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleDocumentSourceUploadUrl(req, res, { requestId, readJsonBody, log }) {
  try {
    const { user, client } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const documentId = normalizeUuid(body.document_id);
    const fileSize = Number(body.file_size || 0);
    const contentType = String(body.content_type || "application/octet-stream");
    if (!documentId) return sendJson(res, 400, { error: "Missing document_id", request_id: requestId, execution_plane: "gcp" });
    if (!fileSize || fileSize <= 0) return sendJson(res, 400, { error: "Missing or invalid file_size", request_id: requestId, execution_plane: "gcp" });

    let workspaceId = normalizeUuid(body.workspace_id);
    if (workspaceId) {
      const { data: workspace } = await client.from("workspaces").select("id").eq("id", workspaceId).maybeSingle();
      if (!workspace?.id) workspaceId = "";
    }

    const ext = normalizeExtension(body.source_extension, contentType);
    const sourceFormat = detectSourceFormat(ext);
    const basePdfPath = getDocumentStoragePath(user.id, documentId);
    const baseSourcePath = getDocumentSourceStoragePath(user.id, documentId, ext);
    const baseCanonicalPath = getDocumentCanonicalStoragePath(user.id, documentId, sourceFormat);
    const routing = await resolveDocumentBucketRouting({ admin, workspaceId, storagePath: "" });
    const pdfStoragePath = routing.pathPrefix ? joinObjectPath(routing.pathPrefix, basePdfPath) : basePdfPath;
    const sourceStoragePath = routing.pathPrefix ? joinObjectPath(routing.pathPrefix, baseSourcePath) : baseSourcePath;
    const canonicalStoragePath = routing.pathPrefix ? joinObjectPath(routing.pathPrefix, baseCanonicalPath) : baseCanonicalPath;
    const { url, expiresAt } = generateSignedUploadUrl(sourceStoragePath, {
      contentType,
      expiresInSeconds: 15 * 60,
      ...(routing.bucketOverride ? { bucketNameOverride: routing.bucketOverride } : {}),
    });
    log.info("document source upload URL generated", { document: documentId.slice(0, 8), sourceFormat });
    return sendJson(res, 200, buildDocumentSourceUploadUrlResponse({
      uploadUrl: url,
      sourceStoragePath,
      pdfStoragePath,
      canonicalStoragePath,
      sourceFormat,
      expiresAt,
      requestId,
    }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return email.includes("@") && email.includes(".") && email.length <= 320;
}

async function sendSupportEmail(params) {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!resendKey) return false;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 10px">New Zohal Support Ticket</h2>
      <p style="margin:0 0 8px"><strong>Ticket:</strong> ${params.ticketId}</p>
      <p style="margin:0 0 8px"><strong>Category:</strong> ${params.category}</p>
      <p style="margin:0 0 8px"><strong>Priority:</strong> ${params.priority}</p>
      <p style="margin:0 0 8px"><strong>Subject:</strong> ${params.subject}</p>
      <p style="margin:0 0 8px"><strong>User:</strong> ${params.userId || "anonymous"}</p>
      <p style="margin:0 0 8px"><strong>Email:</strong> ${params.email || "not_provided"}</p>
      <p style="margin:0 0 8px"><strong>Workspace:</strong> ${params.workspaceId || "not_provided"}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:12px 0" />
      <p style="white-space:pre-wrap">${params.message}</p>
    </div>
  `.trim();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: `[Support] ${params.subject} (#${String(params.ticketId).slice(0, 8)})`,
      html,
    }),
  });
  return response.ok;
}

export async function handleSupportTicketCreate(req, res, { requestId, readJsonBody, log }) {
  try {
    let callerId = null;
    try {
      const auth = await getUser(req);
      callerId = normalizeUuid(auth.user.id);
    } catch {
      callerId = null;
    }
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const category = VALID_TICKET_CATEGORIES.has(body.category) ? body.category : "general";
    const priority = VALID_TICKET_PRIORITIES.has(body.priority) ? body.priority : "normal";
    const workspaceId = normalizeUuid(body.workspace_id) || null;
    const subject = String(body.subject || "Support request").trim().slice(0, 120);
    const message = String(body.message || "").trim();
    const source = String(body.source || "web").trim().slice(0, 50);
    const email = body.email ? normalizeEmail(body.email) : null;

    if (!message || message.length < 10) return sendJson(res, 400, { error: "invalid_input", message: "Message must be at least 10 characters", request_id: requestId, execution_plane: "gcp" });
    if (!subject) return sendJson(res, 400, { error: "invalid_input", message: "Subject is required", request_id: requestId, execution_plane: "gcp" });
    if (email && !isValidEmail(email)) return sendJson(res, 400, { error: "invalid_input", message: "Invalid email", request_id: requestId, execution_plane: "gcp" });

    const { data: inserted, error } = await admin
      .from("support_tickets")
      .insert({
        user_id: callerId,
        workspace_id: workspaceId,
        email,
        category,
        priority,
        subject,
        message,
        source,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : null,
        status: "open",
      })
      .select("id")
      .single();
    if (error || !inserted?.id) throw new Error("Failed to create support ticket");
    const supportEmailTo = String(process.env.SUPPORT_EMAIL_TO || "").trim();
    const supportEmailFrom = String(process.env.SUPPORT_EMAIL_FROM || process.env.INVITES_FROM_EMAIL || "").trim();
    let emailSent = false;
    if (supportEmailTo && supportEmailFrom) {
      try {
        emailSent = await sendSupportEmail({
          to: supportEmailTo,
          from: supportEmailFrom,
          ticketId: inserted.id,
          category,
          priority,
          subject,
          message,
          workspaceId,
          userId: callerId,
          email,
        });
      } catch (emailError) {
        log.warn("support email failed", {
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }
    }
    log.info("support ticket created", { ticket: String(inserted.id).slice(0, 8), source });
    return sendJson(res, 200, buildSupportTicketCreateResponse({
      ticketId: inserted.id,
      category,
      priority,
      subject,
      emailSent,
      requestId,
    }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleEnterpriseDataLocalityRegions(req, res, { requestId, readJsonBody }) {
  try {
    const { user, client } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    let orgId = normalizeUuid(body.org_id);
    const workspaceId = normalizeUuid(body.workspace_id);
    if (!orgId && workspaceId) {
      const { data: canAccess } = await client.rpc("can_access_workspace", { p_workspace_id: workspaceId });
      if (!canAccess) return sendJson(res, 403, { error: "forbidden", message: "Access denied", request_id: requestId, execution_plane: "gcp" });
      const { data: workspace } = await admin.from("workspaces").select("org_id").eq("id", workspaceId).is("deleted_at", null).maybeSingle();
      orgId = normalizeUuid(workspace?.org_id);
    }
    if (!orgId) return sendJson(res, 400, { error: "invalid_input", message: "Missing org_id", request_id: requestId, execution_plane: "gcp" });

    const [{ data: org }, { data: member }] = await Promise.all([
      admin.from("organizations").select("id, owner_id, plan_tier, data_locality_enabled, data_locality_region, data_locality_documents_bucket_uri, data_locality_exports_bucket_uri").eq("id", orgId).maybeSingle(),
      admin.from("organization_members").select("role").eq("org_id", orgId).eq("user_id", normalizeUuid(user.id)).maybeSingle(),
    ]);
    if (!org?.id) return sendJson(res, 404, { error: "not_found", message: "Organization not found", request_id: requestId, execution_plane: "gcp" });
    const isAdmin = normalizeUuid(org.owner_id) === normalizeUuid(user.id) || ["owner", "admin"].includes(String(member?.role || "").toLowerCase());
    if (!isAdmin) return sendJson(res, 403, { error: "forbidden", message: "Organization admin access required", request_id: requestId, execution_plane: "gcp" });

    const currentPlane = org.data_locality_region && org.data_locality_documents_bucket_uri
      ? {
          mode: "enterprise_firebase",
          region: String(org.data_locality_region),
          tenant_id: `org-${orgId}`,
          documents_bucket_uri: String(org.data_locality_documents_bucket_uri),
          exports_bucket_uri: org.data_locality_exports_bucket_uri ? String(org.data_locality_exports_bucket_uri) : null,
        }
      : {
          mode: "shared_supabase",
          region: null,
          tenant_id: null,
          documents_bucket_uri: null,
          exports_bucket_uri: null,
        };
    const [{ count: workspaceCount }, { data: regions }] = await Promise.all([
      admin.from("workspaces").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
      admin
        .from("data_locality_regions")
        .select("region_code, city, country_code, lat, lng, compliance, is_active")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("region_code", { ascending: true }),
    ]);

    return sendJson(res, 200, {
      eligible: !!org.data_locality_enabled,
      ...(org.data_locality_enabled ? {} : { eligibility_reason: "not_eligible" }),
      org_id: orgId,
      workspace_count: workspaceCount || 0,
      current_plane: currentPlane,
      regions: regions || [],
      entitlement: {
        org_data_locality_enabled: !!org.data_locality_enabled,
        org_multi_user_enabled: true,
        org_plan_tier: org.plan_tier ? String(org.plan_tier).trim().toLowerCase() : null,
        plan_data_locality_enabled: !!org.data_locality_enabled,
        user_is_org_admin: true,
      },
      request_id: requestId,
      execution_plane: "gcp",
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}
