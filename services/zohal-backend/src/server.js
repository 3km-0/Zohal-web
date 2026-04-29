import { createServer } from "node:http";
import {
  handleAnalysisExportReport,
  handleAnalysisReduce,
  handleAnalysisPromotePrivateLivePublic,
  handleAnalysisStart,
  handleAnalysisTask,
} from "./handlers/analysis.js";
import {
  handleAcquisitionApi,
  handleAcquisitionInternal,
  isAcquisitionApiRoute,
} from "./handlers/acquisition.js";
import {
  handleAgentOrchestrate,
  handleAgentOutboxRun,
} from "./handlers/agent.js";
import { handleConvertToPdf } from "./handlers/convert-to-pdf.js";
import {
  handleLibraryDownload,
  handleLibraryList,
} from "./handlers/library.js";
import {
  handleIngestionChunk,
  handleIngestionClassify,
  handleIngestionCleanupVectors,
  handleIngestionDeleteEmbeddings,
  handleIngestionEmbed,
  handleIngestionExtractInsights,
  handleIngestionExtractText,
  handleIngestionFetchOcr,
  handleIngestionReconcileStatus,
  handleIngestionRunTextPipeline,
  handleIngestionStart,
  handleIngestionStartOcr,
  handleIngestionTask,
} from "./handlers/ingestion.js";
import {
  handleDocumentDownloadUrl,
  handleDocumentSourceUploadUrl,
  handleDocumentUploadUrl,
  handleEnterpriseDataLocalityRegions,
  handleSupportTicketCreate,
} from "./handlers/utility.js";
import { handleWhatsappOrchestrate } from "./handlers/whatsapp.js";
import { sendJson, sendOptions, getRequestId, readJsonBody } from "./runtime/http.js";
import { createLogger } from "./runtime/logging.js";

const port = Number(process.env.PORT || 8080);

const server = createServer(async (req, res) => {
  const requestId = getRequestId(req);
  const log = createLogger("zohal-backend", requestId);

  try {
    if (req.method === "OPTIONS") {
      return sendOptions(res);
    }

    const url = new URL(req.url || "/", "http://localhost");

    if (
      req.method === "GET" &&
      (url.pathname === "/healthz" ||
        url.pathname === "/status" ||
        url.pathname === "/readyz")
    ) {
      return sendJson(res, 200, {
        ok: true,
        request_id: requestId,
        execution_plane: "gcp",
      });
    }

    if (req.method === "POST" && url.pathname === "/convert-to-pdf") {
      return await handleConvertToPdf(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/documents/download-url") {
      return await handleDocumentDownloadUrl(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/documents/upload-url") {
      return await handleDocumentUploadUrl(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/documents/source-upload-url") {
      return await handleDocumentSourceUploadUrl(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/support/tickets") {
      return await handleSupportTicketCreate(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/enterprise/data-locality/regions") {
      return await handleEnterpriseDataLocalityRegions(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/library/list") {
      return await handleLibraryList(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/library/download") {
      return await handleLibraryDownload(req, res, { requestId, log, readJsonBody });
    }

    if (isAcquisitionApiRoute(req.method, url.pathname)) {
      return await handleAcquisitionApi(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (url.pathname.startsWith("/internal/acquisition/")) {
      return await handleAcquisitionInternal(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/analysis/start") {
      return await handleAnalysisStart(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/analysis/tasks") {
      return await handleAnalysisTask(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/analysis/reduce") {
      return await handleAnalysisReduce(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/analysis/export-report") {
      return await handleAnalysisExportReport(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/analysis/private-live/promote-public-unlisted") {
      return await handleAnalysisPromotePrivateLivePublic(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/start") {
      return await handleIngestionStart(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/extract-text") {
      return await handleIngestionExtractText(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/run-text-pipeline") {
      return await handleIngestionRunTextPipeline(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/start-ocr") {
      return await handleIngestionStartOcr(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/fetch-ocr") {
      return await handleIngestionFetchOcr(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/chunk") {
      return await handleIngestionChunk(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/embed") {
      return await handleIngestionEmbed(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/classify") {
      return await handleIngestionClassify(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/extract-insights") {
      return await handleIngestionExtractInsights(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/reconcile-status") {
      return await handleIngestionReconcileStatus(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/delete-embeddings") {
      return await handleIngestionDeleteEmbeddings(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/cleanup-vectors") {
      return await handleIngestionCleanupVectors(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/tasks") {
      return await handleIngestionTask(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/internal/whatsapp/orchestrate") {
      return await handleWhatsappOrchestrate(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/internal/agent/orchestrate") {
      return await handleAgentOrchestrate(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/internal/agent/outbox/run") {
      return await handleAgentOutboxRun(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    return sendJson(res, 404, {
      error: "Not found",
      request_id: requestId,
      execution_plane: "gcp",
    });
  } catch (error) {
    log.error("Unhandled request error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, 500, {
      error: "Internal server error",
      request_id: requestId,
      execution_plane: "gcp",
    });
  }
});

server.listen(port, () => {
  console.log(JSON.stringify({
    level: "info",
    service: "zohal-backend",
    message: "Server listening",
    port,
  }));
});
