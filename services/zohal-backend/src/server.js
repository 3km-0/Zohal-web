import { createServer } from "node:http";
import { handleConvertToPdf } from "./handlers/convert-to-pdf.js";
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

    if (req.method === "GET" && url.pathname === "/healthz") {
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
