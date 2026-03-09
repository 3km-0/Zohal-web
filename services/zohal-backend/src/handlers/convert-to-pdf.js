import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { resolveDataPlane } from "../runtime/data-plane.js";
import {
  generateSignedDownloadUrl,
  generateSignedUploadUrl,
  getDocumentStoragePath,
} from "../runtime/gcs.js";
import { requireInternalCaller } from "../runtime/internal-auth.js";
import { sendJson } from "../runtime/http.js";

function createServiceClient() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const supabaseKey = String(
    process.env.INTERNAL_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "",
  ).trim();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  return createClient(supabaseUrl, supabaseKey);
}

function getHeaderValue(headers, name) {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export function getProxyConversionInputs(headers) {
  return {
    cloudConvertKey: getHeaderValue(headers, "x-zohal-cloudconvert-key"),
    sourceDownloadUrl: getHeaderValue(headers, "x-zohal-source-download-url"),
    uploadUrl: getHeaderValue(headers, "x-zohal-pdf-upload-url"),
  };
}

export function buildConvertSuccess({
  documentId,
  pageCount,
  queuedForIngestion,
  requestId,
}) {
  return {
    success: true,
    document_id: documentId,
    page_count: pageCount,
    queued_for_ingestion: queuedForIngestion,
    request_id: requestId,
    execution_plane: "gcp",
  };
}

export function buildConvertError({
  message,
  requestId,
}) {
  return {
    error: message,
    request_id: requestId,
    execution_plane: "gcp",
  };
}

async function markProcessingConversion(supabase, documentId, currentMeta, log) {
  try {
    const merged = {
      ...currentMeta,
      conversion_method: currentMeta.conversion_method ||
        "cloudconvert_docx_to_pdf_v1",
      conversion_status: "processing",
    };
    const { error } = await supabase.from("documents").update({
      processing_status: "processing",
      source_metadata: merged,
    }).eq("id", documentId);
    if (error) {
      log.warn("Failed to mark conversion processing", {
        error: error.message,
      });
    }
  } catch {
    // non-fatal
  }
}

async function markFailedConversion(supabase, documentId, message) {
  try {
    const { data: docRow } = await supabase
      .from("documents")
      .select("source_metadata")
      .eq("id", documentId)
      .maybeSingle();
    const meta = docRow?.source_metadata || {};
    await supabase.from("documents").update({
      processing_status: "failed",
      source_metadata: {
        ...meta,
        conversion_status: "failed",
        conversion_error: message,
      },
    }).eq("id", documentId);
  } catch {
    // ignore
  }
}

async function resolveStorageRouting({ supabase, workspaceId, storagePath }) {
  let bucketOverride = null;
  let effectivePrefix = null;

  try {
    if (workspaceId) {
      const plane = await resolveDataPlane({ workspaceId, supabase });
      if (
        plane.mode === "enterprise_firebase" &&
        plane.enterprise?.documents?.bucket
      ) {
        const prefix = plane.enterprise.documents.prefix ||
          (plane.enterprise.tenant_id
            ? `tenants/${String(plane.enterprise.tenant_id)}`
            : `workspaces/${workspaceId}`);
        const sp = String(storagePath || "");
        const looksEnterprise = sp === prefix || sp.startsWith(`${prefix}/`);
        if (looksEnterprise) {
          bucketOverride = plane.enterprise.documents.bucket;
          effectivePrefix = null;
        }
      }
    }
  } catch {
    bucketOverride = null;
    effectivePrefix = null;
  }

  return { bucketOverride, effectivePrefix };
}

export async function handleConvertToPdf(req, res, { requestId, log, readJsonBody }) {
  requireInternalCaller(req.headers);

  let documentId = null;
  const supabase = createServiceClient();

  try {
    const body = await readJsonBody(req);
    documentId = String(body.document_id || "").trim();
    const sourceStoragePath = String(body.source_storage_path || "").trim();

    if (!documentId) {
      return sendJson(res, 400, buildConvertError({
        message: "Missing document_id",
        requestId,
      }));
    }

    const proxyInputs = getProxyConversionInputs(req.headers);
    const cloudConvertKey = proxyInputs.cloudConvertKey ||
      String(process.env.CLOUDCONVERT_API_KEY || "").trim();
    if (!cloudConvertKey) {
      throw new Error("CLOUDCONVERT_API_KEY not configured");
    }

    const { data: document, error: docError } = await supabase
      .from("documents")
      .select(
        "id, user_id, workspace_id, storage_path, storage_bucket, source_metadata",
      )
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      return sendJson(res, 404, buildConvertError({
        message: "Document not found",
        requestId,
      }));
    }

    const currentMeta = document.source_metadata || {};
    const sourcePath = sourceStoragePath ||
      String(currentMeta.source_storage_path || "").trim();
    if (!sourcePath) {
      return sendJson(res, 400, buildConvertError({
        message: "Missing source_storage_path",
        requestId,
      }));
    }

    const workspaceId = document.workspace_id ? String(document.workspace_id) : null;
    const userId = String(document.user_id);
    const docId = String(document.id);

    await markProcessingConversion(supabase, docId, currentMeta, log);

    let sourceDownloadUrl = proxyInputs.sourceDownloadUrl;
    if (!sourceDownloadUrl) {
      const routing = await resolveStorageRouting({
        supabase,
        workspaceId,
        storagePath: sourcePath,
      });

      sourceDownloadUrl = generateSignedDownloadUrl(sourcePath, {
        expiresInSeconds: 60 * 10,
        ...(routing.bucketOverride
          ? { bucketNameOverride: routing.bucketOverride }
          : {}),
        ...(routing.effectivePrefix ? { pathPrefix: routing.effectivePrefix } : {}),
      }).url;
    }

    log.info("Starting CloudConvert job", { document_id: docId });

    const createResponse = await fetch("https://api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cloudConvertKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tasks: {
          "import-1": { operation: "import/url", url: sourceDownloadUrl },
          "convert-1": {
            operation: "convert",
            input: ["import-1"],
            output_format: "pdf",
          },
          "export-1": { operation: "export/url", input: ["convert-1"] },
        },
      }),
    });

    if (!createResponse.ok) {
      throw new Error(
        `CloudConvert job creation failed: ${createResponse.status} ${
          await createResponse.text()
        }`,
      );
    }

    const createJson = await createResponse.json();
    const jobId = createJson?.data?.id;
    if (!jobId) {
      throw new Error("CloudConvert did not return a job ID");
    }

    const deadline = Date.now() + (5 * 60 * 1_000);
    let tasks = [];

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      const pollResponse = await fetch(
        `https://api.cloudconvert.com/v2/jobs/${jobId}`,
        { headers: { Authorization: `Bearer ${cloudConvertKey}` } },
      );
      if (!pollResponse.ok) {
        throw new Error(
          `CloudConvert poll failed: ${pollResponse.status} ${
            await pollResponse.text()
          }`,
        );
      }
      const pollJson = await pollResponse.json();
      const jobData = pollJson?.data;
      tasks = jobData?.tasks || [];
      if (jobData?.status === "finished") break;
      if (jobData?.status === "error") {
        const failedTask = tasks.find((task) => task.status === "error");
        const reason = failedTask
          ? `${failedTask.name}: ${
            failedTask.message || failedTask.code || "unknown error"
          }`
          : "job error";
        throw new Error(`CloudConvert conversion failed - ${reason}`);
      }
    }

    const exportTask = tasks.find((task) =>
      task.operation === "export/url" && task.status === "finished"
    );
    const exportFile = exportTask?.result?.files?.[0];
    if (!exportFile?.url) {
      throw new Error("CloudConvert conversion timed out or incomplete");
    }

    const pdfResponse = await fetch(exportFile.url);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download converted PDF: ${pdfResponse.status}`);
    }

    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();

    const storagePath = document.storage_path && document.storage_path !== "local"
      ? String(document.storage_path)
      : getDocumentStoragePath(userId, docId);

    let uploadUrl = proxyInputs.uploadUrl;
    if (!uploadUrl) {
      const pdfRouting = await resolveStorageRouting({
        supabase,
        workspaceId,
        storagePath,
      });

      uploadUrl = generateSignedUploadUrl(storagePath, {
        contentType: "application/pdf",
        expiresInSeconds: 15 * 60,
        ...(pdfRouting.bucketOverride
          ? { bucketNameOverride: pdfRouting.bucketOverride }
          : {}),
        ...(pdfRouting.effectivePrefix
          ? { pathPrefix: pdfRouting.effectivePrefix }
          : {}),
      }).url;
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: pdfBytes,
    });
    if (!uploadResponse.ok) {
      throw new Error(
        `Failed to upload converted PDF: ${uploadResponse.status} ${
          await uploadResponse.text()
        }`,
      );
    }

    const mergedMeta = {
      ...currentMeta,
      conversion_method: currentMeta.conversion_method ||
        "cloudconvert_docx_to_pdf_v1",
      conversion_status: "completed",
      source_storage_path: sourcePath,
      source_storage_bucket: "documents",
    };

    const { error: finalizeError } = await supabase.from("documents").update({
      storage_path: storagePath,
      storage_bucket: "documents",
      file_size_bytes: pdfBytes.byteLength,
      page_count: pageCount,
      processing_status: "pending",
      source_metadata: mergedMeta,
    }).eq("id", docId);
    if (finalizeError) {
      throw new Error(
        `Failed to persist converted document state: ${finalizeError.message}`,
      );
    }

    let queuedForIngestion = false;
    try {
      const queueName = String(
        process.env.DOCUMENT_INGESTION_QUEUE_NAME || "document_ingestion_jobs",
      ).trim();
      await supabase.rpc("pgmq_send", {
        queue_name: queueName,
        message: {
          kind: "ingest_document",
          document_id: docId,
          workspace_id: workspaceId,
          user_id: userId,
          source: "convert_to_pdf",
        },
        sleep_seconds: 0,
      });
      queuedForIngestion = true;
    } catch (queueError) {
      log.warn("Failed to enqueue ingestion job", {
        error: queueError instanceof Error ? queueError.message : String(queueError),
      });
    }

    return sendJson(res, 200, buildConvertSuccess({
      documentId: docId,
      pageCount,
      queuedForIngestion,
      requestId,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("convert-to-pdf failed", { error: message });
    if (documentId) {
      await markFailedConversion(supabase, documentId, message);
    }
    const statusCode = Number(error?.statusCode || 500);
    return sendJson(res, statusCode, buildConvertError({ message, requestId }));
  }
}
