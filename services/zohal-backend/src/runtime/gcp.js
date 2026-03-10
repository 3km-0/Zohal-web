import { createHash } from "node:crypto";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { CloudTasksClient } from "@google-cloud/tasks";
import { ExecutionsClient } from "@google-cloud/workflows";

function getEnv(name) {
  return String(process.env[name] || "").trim();
}

function parseServiceAccountCredentials() {
  const keyBase64 = getEnv("GCP_SERVICE_ACCOUNT_KEY_BASE64");
  const keyRaw = getEnv("GCP_SERVICE_ACCOUNT_KEY");
  if (keyBase64) {
    return JSON.parse(Buffer.from(keyBase64, "base64").toString("utf8"));
  }
  if (keyRaw) {
    return JSON.parse(keyRaw);
  }
  return null;
}

function getGoogleClientOptions() {
  const projectId = getEnv("GCP_PROJECT_ID") || getEnv("GCS_PROJECT_ID");
  const credentials = parseServiceAccountCredentials();
  return {
    ...(projectId ? { projectId } : {}),
    ...(credentials ? { credentials } : {}),
  };
}

export function getGcpProjectId() {
  const projectId = getEnv("GCP_PROJECT_ID") || getEnv("GCS_PROJECT_ID");
  if (!projectId) {
    throw new Error("GCP_PROJECT_ID / GCS_PROJECT_ID not configured");
  }
  return projectId;
}

let workflowsClient;
let tasksClient;
let secretManagerClient;

export function getWorkflowsClient() {
  if (!workflowsClient) {
    workflowsClient = new ExecutionsClient(getGoogleClientOptions());
  }
  return workflowsClient;
}

export function getCloudTasksClient() {
  if (!tasksClient) {
    tasksClient = new CloudTasksClient(getGoogleClientOptions());
  }
  return tasksClient;
}

export function getSecretManagerClient() {
  if (!secretManagerClient) {
    secretManagerClient = new SecretManagerServiceClient(
      getGoogleClientOptions(),
    );
  }
  return secretManagerClient;
}

export function buildDeterministicKey(parts) {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

export async function startWorkflowExecution({
  workflowName,
  location,
  argument,
}) {
  const projectId = getGcpProjectId();
  const client = getWorkflowsClient();
  const parent = client.workflowPath(projectId, location, workflowName);
  const [execution] = await client.createExecution({
    parent,
    execution: {
      argument: JSON.stringify(argument),
      callLogLevel: "LOG_ERRORS_ONLY",
    },
  });
  return execution;
}

export async function createHttpTask({
  queueName,
  location,
  url,
  payload,
  delaySeconds = 0,
  headers = {},
}) {
  const client = getCloudTasksClient();
  const projectId = getGcpProjectId();
  const parent = client.queuePath(projectId, location, queueName);
  const task = {
    httpRequest: {
      httpMethod: "POST",
      url,
      headers,
      body: Buffer.from(JSON.stringify(payload)),
    },
  };

  if (delaySeconds > 0) {
    task.scheduleTime = {
      seconds: Math.floor(Date.now() / 1000) + Math.max(0, delaySeconds),
    };
  }

  const [created] = await client.createTask({ parent, task });
  return created;
}

export async function getRuntimeSecret({
  envName,
  secretNameEnv,
  version = "latest",
}) {
  const direct = getEnv(envName);
  if (direct) return direct;

  const secretName = getEnv(secretNameEnv);
  if (!secretName) return "";

  const client = getSecretManagerClient();
  const name = client.secretVersionPath(getGcpProjectId(), secretName, version);
  const [response] = await client.accessSecretVersion({ name });
  return response.payload?.data?.toString("utf8") || "";
}
