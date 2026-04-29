import { createClient } from "@supabase/supabase-js";
import {
  getDocumentStoragePath,
  uploadBufferToGCS,
} from "../runtime/gcs.js";
import { isInternalCaller } from "../runtime/internal-auth.js";
import { sendJson } from "../runtime/http.js";
import {
  createServiceClient,
  getSupabaseUrl,
} from "../runtime/supabase.js";
import { getExpectedInternalToken } from "../runtime/internal-auth.js";

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

async function getUser(req) {
  const token = stripBearer(authHeader(req));
  if (!token) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
  const client = createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    const authError = new Error("Unauthorized");
    authError.statusCode = 401;
    throw authError;
  }
  return data.user;
}

function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase();
}

function safeError(res, requestId, error) {
  if (error.publicBody) {
    return sendJson(res, error.statusCode || 500, {
      ...error.publicBody,
      request_id: requestId,
      execution_plane: "gcp",
    });
  }
  return sendJson(res, error.statusCode || 500, {
    success: false,
    error: error.message || "Internal server error",
    request_id: requestId,
    execution_plane: "gcp",
  });
}

function httpError(statusCode, error, extra = {}) {
  const err = new Error(error);
  err.statusCode = statusCode;
  err.publicBody = { success: false, error, ...extra };
  return err;
}

function getDocumentSourceStoragePath(userId, documentId, extension) {
  return `${normalizeUuid(userId)}/sources/${normalizeUuid(documentId)}.${String(extension || "bin").toLowerCase()}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const index = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${Number.parseFloat((bytes / Math.pow(k, index)).toFixed(2))} ${sizes[index]}`;
}

function getFileExtension(fileName, mimeType = "") {
  const ext = String(fileName || "").split(".").pop()?.toLowerCase();
  if (ext && ext !== fileName && ext.length <= 8) return ext;
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("wordprocessingml")) return "docx";
  if (mimeType.includes("spreadsheetml")) return "xlsx";
  if (mimeType === "text/csv") return "csv";
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1] || "jpg";
  return "";
}

function guessContentType(ext) {
  switch (String(ext || "").toLowerCase()) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "heic":
      return "image/heic";
    default:
      return "application/octet-stream";
  }
}

function inferNameFromUrl(urlString, mimeType) {
  try {
    const url = new URL(urlString);
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last) return last.includes(".") ? last : `${last}.${getFileExtension("", mimeType) || "bin"}`;
  } catch {
    // Fall through.
  }
  return `whatsapp-file.${getFileExtension("", mimeType) || "bin"}`;
}

async function checkFeatureAccess(supabase, userId, feature) {
  const { data, error } = await supabase.rpc("check_feature_access", {
    p_user_id: normalizeUuid(userId),
    p_feature: feature,
  });
  if (error) {
    const message = String(error.message || error).toLowerCase();
    if (message.includes("invalid input value for enum") || message.includes("check_feature_access")) {
      return { allowed: true, feature, current_tier: "free", minimum_tier: "free" };
    }
    throw httpError(403, "feature_not_available", {
      ok: false,
      error_code: "limit_exceeded",
      message: error.message || "Feature is not available",
      feature,
    });
  }
  return data || { allowed: true, feature, current_tier: "free", minimum_tier: "free" };
}

async function checkDocumentLimit(supabase, userId) {
  const { data, error } = await supabase.rpc("check_document_limit", {
    p_user_id: normalizeUuid(userId),
  });
  if (error || !data) {
    return { allowed: false, current: 0, limit: 0, tier: "free" };
  }
  return data;
}

async function checkAndIncrementHourlyUsage(supabase, userId) {
  const { data, error } = await supabase.rpc("check_and_increment_hourly_usage", {
    p_user_id: normalizeUuid(userId),
    p_usage_type: "document_ingestions",
    p_amount: 1,
  });
  if (error) {
    const message = String(error.message || error);
    if (
      message.toLowerCase().includes("check_and_increment_hourly_usage") &&
      message.toLowerCase().includes("does not exist")
    ) {
      return { allowed: true, current: 0, limit: Number.MAX_SAFE_INTEGER, tier: "free" };
    }
    return { allowed: false, current: 0, limit: 0, tier: "free", error: message };
  }
  return data || { allowed: true, current: 0, limit: Number.MAX_SAFE_INTEGER, tier: "free" };
}

async function checkStorageLimit(supabase, userId, fileSize) {
  const bytes = Number(fileSize || 0);
  const { data, error } = await supabase.rpc("check_storage_limit", {
    p_user_id: normalizeUuid(userId),
    p_file_size: bytes,
  });
  if (error || !data) {
    return {
      allowed: false,
      reason: error?.message || "storage_limit_exceeded",
      current_bytes: 0,
      limit_bytes: 0,
      max_file_bytes: 0,
      requested_bytes: bytes,
      tier: "free",
    };
  }
  return data;
}

async function enforceImportLimits(supabase, { userId, feature, fileSize, checkStorage }) {
  const featureCheck = await checkFeatureAccess(supabase, userId, feature);
  if (!featureCheck.allowed) {
    throw httpError(403, "feature_not_available", {
      ok: false,
      error_code: "limit_exceeded",
      message: `${feature} requires ${featureCheck.minimum_tier || "a paid"} plan`,
      current_tier: featureCheck.current_tier,
      required_tier: featureCheck.minimum_tier,
      feature,
    });
  }

  const docLimit = await checkDocumentLimit(supabase, userId);
  if (!docLimit.allowed) {
    throw httpError(403, "document_limit_exceeded", {
      details: `You've reached your document limit of ${docLimit.limit}. Upgrade to add more documents.`,
    });
  }

  const hourly = await checkAndIncrementHourlyUsage(supabase, userId);
  if (!hourly.allowed) {
    throw httpError(429, "rate_limited", {
      details: `Hourly limit reached: ${hourly.current}/${hourly.limit} documents queued this hour.`,
      tier: hourly.tier,
      limit: hourly.limit,
      current: hourly.current,
    });
  }

  if (checkStorage && Number(fileSize || 0) > 0) {
    await enforceStorageLimit(supabase, userId, Number(fileSize));
  }
}

async function enforceStorageLimit(supabase, userId, fileSize) {
  if (!Number(fileSize || 0)) return;
  const storageCheck = await checkStorageLimit(supabase, userId, Number(fileSize));
  if (!storageCheck.allowed) {
    const reason = storageCheck.reason === "file_too_large"
      ? `File size (${formatBytes(Number(fileSize))}) exceeds maximum allowed (${formatBytes(storageCheck.max_file_bytes)})`
      : `Storage limit exceeded. You have ${formatBytes(storageCheck.remaining_bytes || 0)} remaining.`;
    throw httpError(403, storageCheck.reason || "storage_limit_exceeded", { details: reason });
  }
}

function requireFields(body, fields, message = "Missing required fields") {
  const missing = fields.filter((field) => !String(body[field] || "").trim());
  if (missing.length > 0) {
    throw httpError(400, message, { missing_fields: missing });
  }
}

function validateGoogleDriveImport(body) {
  requireFields(body, ["file_id", "file_name", "workspace_id", "user_id", "access_token"]);
}

function validateOneDriveImport(body) {
  requireFields(body, ["item_id", "file_name", "workspace_id", "user_id", "access_token"]);
}

function validateWhatsappImport(body) {
  requireFields(body, ["user_id", "workspace_id", "file_url"], "Missing required fields: user_id, workspace_id, file_url");
}

async function proxySupabaseFunction(req, res, { requestId, functionName, body, internal = false }) {
  const response = await fetch(`${getSupabaseUrl()}/functions/v1/${functionName}`, {
    method: "POST",
    headers: internal
      ? buildSupabaseInternalHeaders(requestId)
      : {
        authorization: authHeader(req),
        apikey: getAnonKey(),
        "content-type": "application/json",
        "x-request-id": requestId,
      },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  res.writeHead(response.status, {
    "access-control-allow-origin": "*",
    "content-type": response.headers.get("content-type") || "application/json",
  });
  res.end(text);
}

export function buildWhatsappChannelStatusResponse({ workspaceId, enabled, pending, phoneNumber, now = new Date() }) {
  const status = enabled ? "connected" : (pending ? "pending" : "disconnected");
  return {
    ok: true,
    workspace_id: workspaceId || null,
    channel: "whatsapp",
    status,
    capabilities: {
      import: true,
      bot_ingestion: !!enabled,
    },
    connection: {
      phone_number: phoneNumber || null,
      provider: "meta_whatsapp_business",
    },
    updated_at: now.toISOString(),
    execution_plane: "gcp",
  };
}

export async function handleWhatsappChannelStatus(req, res, { requestId, readJsonBody }) {
  try {
    await getUser(req);
    const body = await readJsonBody(req).catch(() => ({}));
    return sendJson(res, 200, {
      ...buildWhatsappChannelStatusResponse({
        workspaceId: normalizeUuid(body.workspace_id),
        enabled: String(process.env.WHATSAPP_BOT_ENABLED || "false").toLowerCase() === "true",
        pending: String(process.env.WHATSAPP_BOT_PENDING || "false").toLowerCase() === "true",
        phoneNumber: process.env.WHATSAPP_PHONE_NUMBER,
      }),
      request_id: requestId,
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleWorkspaceApiConnections(req, res, { requestId, readJsonBody }) {
  try {
    const body = await readJsonBody(req);
    const internal = isInternalCaller(req.headers);
    if (!internal) await getUser(req);
    return await proxySupabaseFunction(req, res, {
      requestId,
      functionName: "workspace-api-connections",
      body,
      internal,
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleFetchApiSource(req, res, { requestId, readJsonBody }) {
  try {
    const body = await readJsonBody(req);
    if (!isInternalCaller(req.headers)) {
      await getUser(req);
    }
    return await proxySupabaseFunction(req, res, {
      requestId,
      functionName: "fetch-api-source",
      body,
      internal: isInternalCaller(req.headers),
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

async function downloadGoogleDrive(body) {
  const fileId = String(body.file_id || "").trim().replace(/\.+$/, "");
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${String(body.access_token || "").trim()}`,
      ...(body.resource_key ? { "X-Goog-Drive-Resource-Keys": `${fileId}/${body.resource_key}` } : {}),
    },
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw Object.assign(new Error(`download_failed: Google Drive ${response.status} ${details.slice(0, 240)}`), { statusCode: 502 });
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type")?.split(";")[0] || guessContentType(getFileExtension(body.file_name)),
  };
}

async function downloadOneDrive(body) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(String(body.item_id || ""))}/content`, {
    headers: { authorization: `Bearer ${String(body.access_token || "").trim()}` },
    redirect: "follow",
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw Object.assign(new Error(`download_failed: OneDrive ${response.status} ${details.slice(0, 240)}`), { statusCode: 502 });
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type")?.split(";")[0] || guessContentType(getFileExtension(body.file_name)),
  };
}

async function downloadWhatsapp(body) {
  const headers = {};
  if (body.media_auth_header) headers.authorization = String(body.media_auth_header).trim();
  const response = await fetch(String(body.file_url || ""), { headers });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw Object.assign(new Error(`download_failed: WhatsApp media ${response.status} ${details.slice(0, 240)}`), { statusCode: 502 });
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: String(body.mime_type || response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim(),
  };
}

function backendBaseUrl(req) {
  const configured = String(process.env.INGESTION_SERVICE_BASE_URL || process.env.ZOHAL_BACKEND_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = String(req.headers.host || "").trim();
  if (!host) throw new Error("INGESTION_SERVICE_BASE_URL not configured");
  const proto = String(req.headers["x-forwarded-proto"] || "").trim() || "https";
  return `${proto}://${host}`;
}

function internalBackendHeaders(requestId) {
  const token = getExpectedInternalToken();
  if (!token) throw new Error("Missing internal token for backend pipeline dispatch");
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    apikey: token,
    "x-internal-function-jwt": token,
    "x-request-id": requestId,
  };
}

async function queueImportFollowup({ req, supabase, source, documentId, workspaceId, userId, isPdf, isTabular, sourceStoragePath, requestId }) {
  if (!isPdf && !isTabular) {
    const response = await fetch(`${backendBaseUrl(req)}/convert-to-pdf`, {
      method: "POST",
      headers: internalBackendHeaders(requestId),
      body: JSON.stringify({
        document_id: documentId,
        source_storage_path: sourceStoragePath,
      }),
    });
    return response.ok;
  }
  const response = await fetch(`${backendBaseUrl(req)}/ingestion/start`, {
    method: "POST",
    headers: internalBackendHeaders(requestId),
    body: JSON.stringify({
      document_id: documentId,
      workspace_id: workspaceId,
      user_id: userId,
      source,
    }),
  });
  return response.ok || response.status === 202;
}

async function createImportedDocument({
  supabase,
  source,
  body,
  buffer,
  contentType,
  requestId,
}) {
  const userId = normalizeUuid(body.user_id);
  const workspaceId = normalizeUuid(body.workspace_id);
  const rawName = String(body.file_name || inferNameFromUrl(body.file_url, contentType)).trim();
  if (!userId || !workspaceId || !rawName) {
    const error = new Error("Missing required fields");
    error.statusCode = 400;
    throw error;
  }

  if (source === "whatsapp" && body.source_message_id) {
    const { data: existing } = await supabase
      .from("documents")
      .select("id, processing_status")
      .eq("user_id", userId)
      .contains("source_metadata", { source_message_id: body.source_message_id })
      .maybeSingle();
    if (existing?.id) {
      return {
        success: true,
        document_id: existing.id,
        queued_for_ingestion: existing.processing_status !== "failed",
        duplicate: true,
        execution_plane: "gcp",
      };
    }
  }

  const documentId = crypto.randomUUID();
  const ext = getFileExtension(rawName, contentType);
  const isPdf = ext === "pdf";
  const isTabular = ext === "xlsx" || ext === "csv";
  const pdfStoragePath = getDocumentStoragePath(userId, documentId);
  const sourceStoragePath = isPdf ? pdfStoragePath : getDocumentSourceStoragePath(userId, documentId, ext || "bin");
  const canonicalStoragePath = isTabular ? sourceStoragePath : pdfStoragePath;
  const uploadPath = isPdf ? pdfStoragePath : sourceStoragePath;
  await uploadBufferToGCS(uploadPath, buffer, contentType);

  const sourceMetadata = {
    original_mime: contentType,
    original_extension: ext || null,
    source_format: isTabular ? ext : "pdf",
    source_storage_path: sourceStoragePath,
    source_storage_bucket: "documents",
    conversion_method: isPdf || isTabular ? "none" : (ext === "docx" ? "cloudconvert_docx_to_pdf_v1" : "cloudconvert_to_pdf_v1"),
    conversion_status: isPdf || isTabular ? "completed" : "processing",
    ...(source === "whatsapp"
      ? {
        source_type: "whatsapp",
        agent_channel: "whatsapp",
        whatsapp_phone_number: body.phone_number || null,
        source_message_id: body.source_message_id || null,
        opportunity_id: body.opportunity_id || null,
        contact_id: body.contact_id || null,
        agent_event_id: body.agent_event_id || null,
        upload_kind: body.upload_kind || null,
        ...(body.source_metadata_extra && typeof body.source_metadata_extra === "object" && !Array.isArray(body.source_metadata_extra)
          ? body.source_metadata_extra
          : {}),
      }
      : {}),
  };
  const documentRow = {
    id: documentId,
    user_id: userId,
    workspace_id: workspaceId,
    title: rawName.replace(/\.[^.]+$/i, ""),
    original_filename: rawName,
    document_type: "other",
    storage_path: canonicalStoragePath,
    storage_bucket: "documents",
    file_size_bytes: buffer.byteLength,
    processing_status: isPdf ? "pending" : "processing",
    source_metadata: sourceMetadata,
    ...(body.folder_id ? { folder_id: normalizeUuid(body.folder_id) } : {}),
  };
  const { data: document, error } = await supabase.from("documents").insert(documentRow).select().single();
  if (error) {
    const insertError = new Error(`database_error: ${error.message}`);
    insertError.statusCode = 500;
    throw insertError;
  }
  await supabase.rpc("update_storage_usage", {
    p_user_id: userId,
    p_delta: buffer.byteLength,
  }).catch(() => {});
  await supabase.from("ingestion_events").insert({
    user_id: userId,
    workspace_id: workspaceId,
    document_id: documentId,
    source,
    filename: rawName,
    file_size_bytes: buffer.byteLength,
    status: "completed",
  }).catch(() => {});
  const queuedForIngestion = await queueImportFollowup({
    req,
    supabase,
    source,
    documentId,
    workspaceId,
    userId,
    isPdf,
    isTabular,
    sourceStoragePath,
    requestId,
  });
  return {
    success: true,
    document_id: documentId,
    queued_for_ingestion: queuedForIngestion,
    storage_path: canonicalStoragePath,
    file_size: buffer.byteLength,
    document,
    execution_plane: "gcp",
  };
}

async function handleImport(req, res, {
  requestId,
  readJsonBody,
  source,
  feature,
  downloader,
  validateBody,
  internalOnly = false,
  preflightStorageCheck = true,
}) {
  try {
    const body = await readJsonBody(req);
    validateBody?.(body);
    const supabase = createServiceClient();
    const userId = normalizeUuid(body.user_id);

    if (internalOnly) {
      if (!isInternalCaller(req.headers)) {
        return sendJson(res, 401, { success: false, error: "unauthorized_internal_caller", request_id: requestId, execution_plane: "gcp" });
      }
    } else {
      const user = await getUser(req);
      if (userId && userId !== normalizeUuid(user.id)) {
        return sendJson(res, 403, { success: false, error: "user_id does not match session", request_id: requestId, execution_plane: "gcp" });
      }
    }

    await enforceImportLimits(supabase, {
      userId,
      feature,
      fileSize: Number(body.file_size || 0),
      checkStorage: preflightStorageCheck,
    });

    const downloaded = await downloader(body);
    if (!preflightStorageCheck || !Number(body.file_size || 0) || downloaded.buffer.byteLength > Number(body.file_size || 0)) {
      await enforceStorageLimit(supabase, userId, downloaded.buffer.byteLength);
    }
    const result = await createImportedDocument({
      supabase,
      source,
      body,
      buffer: downloaded.buffer,
      contentType: downloaded.contentType,
      requestId,
    });
    return sendJson(res, 200, { ...result, request_id: requestId });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleGoogleDriveImport(req, res, deps) {
  return await handleImport(req, res, {
    ...deps,
    source: "google_drive",
    feature: "google_drive_import",
    downloader: downloadGoogleDrive,
    validateBody: validateGoogleDriveImport,
  });
}

export async function handleOneDriveImport(req, res, deps) {
  return await handleImport(req, res, {
    ...deps,
    source: "onedrive",
    feature: "onedrive_import",
    downloader: downloadOneDrive,
    validateBody: validateOneDriveImport,
  });
}

export async function handleWhatsappImport(req, res, deps) {
  return await handleImport(req, res, {
    ...deps,
    source: "whatsapp",
    feature: "whatsapp_import",
    downloader: downloadWhatsapp,
    validateBody: validateWhatsappImport,
    internalOnly: true,
    preflightStorageCheck: false,
  });
}

export {
  getDocumentSourceStoragePath,
  getFileExtension,
  guessContentType,
  normalizeUuid,
};
