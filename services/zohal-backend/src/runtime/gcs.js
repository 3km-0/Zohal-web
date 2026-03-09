import { createHash, createSign } from "node:crypto";

const DEFAULT_UPLOAD_EXPIRY = 15 * 60;
const DEFAULT_DOWNLOAD_EXPIRY = 60 * 60;

function getEnv(name) {
  return String(process.env[name] || "").trim();
}

export function getGcsConfig() {
  const bucketName = getEnv("GCS_BUCKET_NAME");
  const projectId = getEnv("GCS_PROJECT_ID");
  const keyBase64 = getEnv("GCS_SERVICE_ACCOUNT_KEY_BASE64");
  const keyRaw = getEnv("GCS_SERVICE_ACCOUNT_KEY");

  if (!bucketName) throw new Error("GCS_BUCKET_NAME environment variable not set");
  if (!projectId) throw new Error("GCS_PROJECT_ID environment variable not set");

  let serviceAccountKey;
  if (keyBase64) {
    serviceAccountKey = JSON.parse(Buffer.from(keyBase64, "base64").toString("utf8"));
  } else if (keyRaw) {
    serviceAccountKey = JSON.parse(keyRaw);
  } else {
    throw new Error(
      "GCS_SERVICE_ACCOUNT_KEY_BASE64 or GCS_SERVICE_ACCOUNT_KEY environment variable not set",
    );
  }

  return { bucketName, projectId, serviceAccountKey };
}

export function getDocumentStoragePath(userId, documentId) {
  return `${String(userId).toLowerCase()}/${String(documentId).toLowerCase()}.pdf`;
}

export function joinObjectPath(prefix, storagePath) {
  const p = String(prefix || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  const s = String(storagePath || "").trim().replace(/^\/+/, "");
  if (!p) return s;
  if (!s) return p;
  return `${p}/${s}`;
}

function sha256Hex(message) {
  return createHash("sha256").update(message).digest("hex");
}

function signString(data, privateKeyPem, hexOutput = false) {
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return hexOutput ? signature.toString("hex") : signature.toString("base64url");
}

function buildSignedUrl(httpMethod, storagePath, options = {}) {
  const config = getGcsConfig();
  const expiresInSeconds = options.expiresInSeconds ||
    (httpMethod === "PUT" ? DEFAULT_UPLOAD_EXPIRY : DEFAULT_DOWNLOAD_EXPIRY);
  const bucketName = (options.bucketNameOverride || config.bucketName).trim();
  const host = `${bucketName}.storage.googleapis.com`;
  const normalizedPath = joinObjectPath(options.pathPrefix, storagePath);
  const resourcePath = `/${
    encodeURIComponent(normalizedPath).replace(/%2F/g, "/")
  }`;

  const signedHeaders = httpMethod === "PUT" ? "content-type;host" : "host";
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dateOnly = dateStamp.substring(0, 8);
  const credentialScope = `${dateOnly}/auto/storage/goog4_request`;
  const credential = `${config.serviceAccountKey.client_email}/${credentialScope}`;

  const queryParams = new URLSearchParams({
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
    "X-Goog-Credential": credential,
    "X-Goog-Date": dateStamp,
    "X-Goog-Expires": String(expiresInSeconds),
    "X-Goog-SignedHeaders": signedHeaders,
  });
  const canonicalQueryString = new URLSearchParams(
    [...queryParams.entries()].sort(),
  ).toString();

  const canonicalHeaders = httpMethod === "PUT"
    ? `content-type:${options.contentType || "application/pdf"}\nhost:${host}\n`
    : `host:${host}\n`;

  const canonicalRequest = [
    httpMethod,
    resourcePath,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "GOOG4-RSA-SHA256",
    dateStamp,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = signString(
    stringToSign,
    config.serviceAccountKey.private_key,
    true,
  );

  return {
    url:
      `https://${host}${resourcePath}?${canonicalQueryString}&X-Goog-Signature=${signature}`,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

export function generateSignedUploadUrl(storagePath, options = {}) {
  return buildSignedUrl("PUT", storagePath, options);
}

export function generateSignedDownloadUrl(storagePath, options = {}) {
  return buildSignedUrl("GET", storagePath, options);
}
