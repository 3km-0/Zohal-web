import { corsHeaders } from "./cors.js";

export function getRequestId(req) {
  const clientId = req.headers["x-request-id"];
  return typeof clientId === "string" && clientId.trim().length > 0
    ? clientId.trim().slice(0, 128)
    : crypto.randomUUID();
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text);
}

export function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    ...corsHeaders,
    "content-type": "application/json",
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

export function sendOptions(res) {
  res.writeHead(200, corsHeaders);
  res.end("ok");
}
