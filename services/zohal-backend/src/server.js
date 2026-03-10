import { createServer } from "node:http";
import { handleConvertToPdf } from "./handlers/convert-to-pdf.js";
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
