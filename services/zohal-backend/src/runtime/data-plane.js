function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseGsBucketUri(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("data_plane_config_missing_bucket");

  if (raw.startsWith("gs://")) {
    const rest = raw.slice("gs://".length);
    const [bucket, ...prefixParts] = rest.split("/").filter(Boolean);
    if (!bucket) throw new Error("data_plane_config_invalid_bucket_uri");
    const prefix = prefixParts.length ? prefixParts.join("/") : null;
    return {
      bucket,
      prefix,
      uri: `gs://${bucket}${prefix ? `/${prefix}` : ""}`,
    };
  }

  return { bucket: raw, prefix: null, uri: `gs://${raw}` };
}

export async function resolveDataPlane({ workspaceId, supabase, failClosed = true }) {
  const normalized = String(workspaceId || "").toLowerCase().trim();
  if (!normalized) return { mode: "shared_supabase" };

  const { data, error } = await supabase
    .from("workspace_data_planes")
    .select("config_json")
    .eq("workspace_id", normalized)
    .maybeSingle();

  if (error) {
    const msg = String(error.message || "");
    if (msg.toLowerCase().includes("does not exist")) {
      return { mode: "shared_supabase" };
    }
    throw new Error(`data_plane_config_query_failed: ${msg}`);
  }

  if (!data?.config_json) return { mode: "shared_supabase" };

  const cfg = data.config_json;
  if (!isObject(cfg)) {
    if (!failClosed) return { mode: "shared_supabase" };
    throw new Error("data_plane_config_invalid_json");
  }

  const version = String(cfg.version || "").trim();
  const mode = String(cfg.mode || "").trim();

  if (version !== "v1") {
    if (!failClosed) return { mode: "shared_supabase" };
    throw new Error("data_plane_config_invalid_version");
  }

  if (mode === "shared_supabase") {
    return { mode: "shared_supabase", version: "v1" };
  }
  if (mode !== "enterprise_firebase") {
    if (!failClosed) return { mode: "shared_supabase" };
    throw new Error("data_plane_config_invalid_mode");
  }

  const enterprise = isObject(cfg.enterprise) ? cfg.enterprise : null;
  const storage = enterprise && isObject(enterprise.storage)
    ? enterprise.storage
    : null;
  const documentsBucket = storage
    ? String(storage.documents_bucket || "").trim()
    : "";
  const exportsBucket = storage
    ? String(storage.exports_bucket || "").trim()
    : "";

  if (!documentsBucket) {
    if (!failClosed) return { mode: "shared_supabase", version: "v1" };
    throw new Error("data_plane_config_missing_documents_bucket");
  }

  const runtime = enterprise && isObject(enterprise.runtime)
    ? enterprise.runtime
    : null;
  const residency = enterprise && isObject(enterprise.residency)
    ? enterprise.residency
    : null;

  return {
    mode: "enterprise_firebase",
    version: "v1",
    enterprise: {
      tenant_id: enterprise?.tenant_id ? String(enterprise.tenant_id) : null,
      region: enterprise?.region ? String(enterprise.region) : null,
      documents: parseGsBucketUri(documentsBucket),
      exports: exportsBucket ? parseGsBucketUri(exportsBucket) : null,
      runtime: runtime
        ? {
            ingestion_endpoint: runtime.ingestion_endpoint
              ? String(runtime.ingestion_endpoint)
              : null,
            analysis_endpoint: runtime.analysis_endpoint
              ? String(runtime.analysis_endpoint)
              : null,
            exports_endpoint: runtime.exports_endpoint
              ? String(runtime.exports_endpoint)
              : null,
          }
        : undefined,
      residency: residency
        ? {
            storage_locality_required:
              typeof residency.storage_locality_required === "boolean"
                ? residency.storage_locality_required
                : undefined,
            processing_locality_required:
              typeof residency.processing_locality_required === "boolean"
                ? residency.processing_locality_required
                : undefined,
          }
        : undefined,
    },
  };
}
