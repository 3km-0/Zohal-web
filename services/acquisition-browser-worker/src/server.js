import { createServer } from "node:http";
import { runSearch } from "./worker.js";

const port = Number(process.env.PORT || 8080);

function stripBearer(value) {
  const raw = String(value || "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice("bearer ".length).trim() : raw;
}

function acceptedTokens() {
  return [
    process.env.INTERNAL_FUNCTION_JWT,
    process.env.INTERNAL_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function isInternal(headers) {
  const accepted = acceptedTokens();
  if (!accepted.length) return false;
  const provided = [
    String(headers["x-internal-function-jwt"] || "").trim(),
    stripBearer(headers.authorization),
    String(headers.apikey || "").trim(),
  ];
  return provided.some((value) => value && accepted.includes(value));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const requestId = String(req.headers["x-request-id"] || crypto.randomUUID());
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && ["/healthz", "/readyz", "/status"].includes(url.pathname)) {
      return sendJson(res, 200, { ok: true, service: "acquisition-browser-worker", request_id: requestId });
    }
    if (req.method === "POST" && url.pathname === "/internal/search-run") {
      if (!isInternal(req.headers)) {
        return sendJson(res, 401, { error: "unauthorized_internal_caller", request_id: requestId });
      }
      const body = await readJsonBody(req);
      const result = await runSearch({
        searchRun: body.search_run,
        mandate: body.mandate,
        suppressedCandidates: body.suppressed_candidates,
      });
      return sendJson(res, 200, {
        ...result,
        request_id: requestId,
        execution_plane: "gcp",
      });
    }
    return sendJson(res, 404, { error: "Not found", request_id: requestId });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      service: "acquisition-browser-worker",
      request_id: requestId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return sendJson(res, 500, {
      error: "Internal server error",
      request_id: requestId,
    });
  }
});

server.listen(port, () => {
  console.log(JSON.stringify({
    level: "info",
    service: "acquisition-browser-worker",
    message: "Server listening",
    port,
  }));
});
