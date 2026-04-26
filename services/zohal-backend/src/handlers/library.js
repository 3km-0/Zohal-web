import { createClient } from "@supabase/supabase-js";
import { sendJson } from "../runtime/http.js";
import { getSupabaseUrl } from "../runtime/supabase.js";

function getAnonKey() {
  const value = String(process.env.SUPABASE_ANON_KEY || "").trim();
  if (!value) throw new Error("SUPABASE_ANON_KEY not configured");
  return value;
}

function authHeader(req) {
  return String(req.headers.authorization || req.headers.Authorization || "");
}

async function requireUser(req) {
  const supabase = createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: authHeader(req) } },
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    const authError = new Error("Not authenticated");
    authError.statusCode = 401;
    throw authError;
  }
  return data.user;
}

function normalizeLibraryObjectPath(value) {
  const path = decodeURIComponent(String(value || "").trim()).replace(/^\/+/, "");
  if (!path || path.includes("..")) return null;
  return path;
}

function deriveLibraryObjectPathFromUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("gs://")) {
    const noScheme = trimmed.replace(/^gs:\/\//, "");
    const slash = noScheme.indexOf("/");
    return slash < 0 ? null : normalizeLibraryObjectPath(noScheme.slice(slash + 1));
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.endsWith(".storage.googleapis.com")) {
      return normalizeLibraryObjectPath(parsed.pathname);
    }
    if (parsed.hostname === "storage.googleapis.com") {
      const parts = decodeURIComponent(parsed.pathname).split("/").filter(Boolean);
      if (parts.length >= 2) return normalizeLibraryObjectPath(parts.slice(1).join("/"));
    }
    return normalizeLibraryObjectPath(parsed.pathname);
  } catch {
    return null;
  }
}

function pickFirstString(row, keys) {
  for (const key of keys) {
    const value = String(row?.[key] || "").trim();
    if (value) return value;
  }
  return null;
}

export function normalizeLibraryItems(raw, limit = 200) {
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  const out = [];
  for (const entry of rows.slice(0, limit)) {
    const row = entry && typeof entry === "object" ? entry : null;
    if (!row) continue;
    const id = pickFirstString(row, ["id", "slug", "key", "title"]);
    const title = pickFirstString(row, ["title", "name", "id"]);
    const url = pickFirstString(row, ["url", "download_url", "href"]);
    const objectPath = normalizeLibraryObjectPath(row.object_path) ||
      deriveLibraryObjectPathFromUrl(url || "");
    if (!id || !title || (!url && !objectPath)) continue;
    out.push({
      id,
      title,
      url: url || "",
      object_path: objectPath,
      category: pickFirstString(row, ["category"]),
      kind: pickFirstString(row, ["kind", "type"]),
      size_bytes: typeof row.size_bytes === "number"
        ? row.size_bytes
        : typeof row.sizeBytes === "number"
        ? row.sizeBytes
        : null,
      updated_at: pickFirstString(row, ["updated_at", "updatedAt"]),
      description: pickFirstString(row, ["description", "summary"]),
      source: pickFirstString(row, ["source", "authority"]),
      region: pickFirstString(row, ["region", "jurisdiction"]),
      tags: Array.isArray(row.tags) ? row.tags.map((value) => String(value || "").trim()).filter(Boolean) : null,
    });
  }
  return out;
}

function manifestSource() {
  const direct = String(process.env.ZOHAL_LIBRARY_MANIFEST_URL || "").trim();
  if (direct) return { kind: "url", url: direct };
  const bucket = String(process.env.ZOHAL_LIBRARY_BUCKET || process.env.GCS_BUCKET_NAME || "").trim();
  const path = String(process.env.ZOHAL_LIBRARY_MANIFEST_PATH || "zohal-library/index.json").trim();
  if (bucket) return { kind: "gcs", bucket, path };
  return { kind: "none" };
}

async function fetchManifestItems() {
  const source = manifestSource();
  if (source.kind === "none") return { configured: false, items: [] };
  const url = source.kind === "url"
    ? source.url
    : `https://storage.googleapis.com/${source.bucket}/${source.path.replace(/^\/+/, "")}`;
  const response = await fetch(url);
  if (!response.ok) return { configured: true, items: [] };
  const raw = await response.json().catch(() => null);
  return { configured: true, items: normalizeLibraryItems(raw) };
}

function sanitizeFilename(raw) {
  const cleaned = String(raw || "zohal-library.pdf")
    .trim()
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ");
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

export async function handleLibraryList(req, res, { requestId, log }) {
  try {
    await requireUser(req);
    const { configured, items } = await fetchManifestItems();
    if (!configured) log.warn("Zohal Library not configured");
    return sendJson(
      res,
      200,
      { ok: true, items, request_id: requestId, execution_plane: "gcp" },
      configured ? {} : { "X-Zohal-Library-Configured": "0" },
    );
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.message || "Internal server error",
      request_id: requestId,
      execution_plane: "gcp",
    });
  }
}

export async function handleLibraryDownload(req, res, { requestId, readJsonBody }) {
  try {
    await requireUser(req);
    const body = await readJsonBody(req);
    const objectPath = normalizeLibraryObjectPath(body.object_path);
    const directUrl = String(body.url || "").trim();
    const bucket = String(process.env.ZOHAL_LIBRARY_BUCKET || process.env.GCS_BUCKET_NAME || "").trim();
    const url = bucket && objectPath
      ? `https://storage.googleapis.com/${bucket}/${objectPath}`
      : directUrl;
    if (!url) {
      return sendJson(res, 400, {
        error: "invalid_input",
        message: "Missing object_path or url",
        request_id: requestId,
        execution_plane: "gcp",
      });
    }
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return sendJson(res, 502, {
        error: "upstream_failed",
        message: `Failed to download library file: ${upstream.status}`,
        request_id: requestId,
        execution_plane: "gcp",
      });
    }
    res.writeHead(200, {
      "access-control-allow-origin": "*",
      "content-type": upstream.headers.get("content-type") || "application/pdf",
      "content-disposition": `inline; filename="${sanitizeFilename(body.filename)}"`,
      "x-request-id": requestId,
      "x-zohal-execution-plane": "gcp",
    });
    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(chunk);
    }
    res.end();
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.message || "Internal server error",
      request_id: requestId,
      execution_plane: "gcp",
    });
  }
}

