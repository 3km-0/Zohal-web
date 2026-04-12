import {
  createHttpTask,
  getGcpProjectId,
  startWorkflowExecution,
} from "../runtime/gcp.js";
import { executeContractAnalysisBatch } from "../analysis/batch.js";
import { executeContractAnalysisReduce } from "../analysis/reduce.js";
import { buildContractExportPayload } from "../analysis/export-report.js";
import {
  getExpectedInternalToken,
  requireInternalCaller,
} from "../runtime/internal-auth.js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient } from "../runtime/supabase.js";
import { promotePrivateLiveToPublicUnlisted } from "../analysis/private-live.js";

const DOCUMENT_ANALYSIS_TASK_QUEUE = String(
  process.env.GCP_DOCUMENT_ANALYSIS_TASK_QUEUE ||
    process.env.GCP_CONTRACT_ANALYSIS_TASK_QUEUE ||
    "document-analysis-jobs",
).trim();
const DOCUMENT_ANALYSIS_TASKS_LOCATION = String(
  process.env.GCP_TASKS_LOCATION || process.env.GCP_WORKFLOWS_LOCATION || "",
).trim();
const DOCUMENT_ANALYSIS_WORKFLOW = String(
  process.env.GCP_DOCUMENT_ANALYSIS_WORKFLOW ||
    process.env.GCP_CONTRACT_ANALYSIS_WORKFLOW ||
    "document-analysis-v1",
).trim();
const DOCUMENT_ANALYSIS_WORKFLOWS_LOCATION = String(
  process.env.GCP_WORKFLOWS_LOCATION || "",
).trim();

export function normalizeUuid(id) {
  return String(id || "").trim().toLowerCase();
}

function resolveAnalysisRuntime(extractionType) {
  const normalized = String(extractionType || "contract_analysis").trim();
  if (normalized === "document_analysis") {
    return {
      batchTaskKind: "document_analysis_batch",
      reduceTaskKind: "document_analysis_reduce",
      acceptedMessage:
        "Document analysis queued. Progress will update as batches complete.",
    };
  }
  return {
    batchTaskKind: "contract_analysis_batch",
    reduceTaskKind: "contract_analysis_reduce",
    acceptedMessage:
      "Document analysis queued. Progress will update as batches complete.",
  };
}

export function buildAnalyzeAcceptedPayload({
  requestId,
  actionId,
  runId,
  message = "Document analysis queued. Progress will update as batches complete.",
  workflowExecutionId = null,
  deferred = false,
  alreadyEnqueued = false,
}) {
  return {
    accepted: true,
    action_id: actionId || null,
    run_id: runId,
    message,
    workflow_execution_id: workflowExecutionId,
    deferred,
    already_enqueued: alreadyEnqueued,
    request_id: requestId,
    execution_plane: "gcp",
  };
}

function buildEnvelope(requestId, body = {}) {
  return {
    ...body,
    request_id: requestId,
    execution_plane: "gcp",
  };
}

function buildAnalysisServiceBaseUrl(req) {
  const configured = String(process.env.ANALYSIS_SERVICE_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const fallback = String(process.env.INGESTION_SERVICE_BASE_URL || "").trim();
  if (fallback) return fallback.replace(/\/+$/, "");
  const host = String(req.headers.host || "").trim();
  if (!host) {
    throw new Error("ANALYSIS_SERVICE_BASE_URL not configured");
  }
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").trim();
  const proto = forwardedProto || "https";
  return `${proto}://${host}`;
}

function getInternalTaskHeaders(requestId) {
  const token = getExpectedInternalToken();
  if (!token) {
    throw new Error("Missing internal token for Cloud Tasks / workflow calls");
  }
  return {
    authorization: `Bearer ${token}`,
    apikey: token,
    "x-internal-function-jwt": token,
    "x-request-id": requestId,
    "content-type": "application/json",
  };
}

async function scheduleAnalysisTask({
  req,
  requestId,
  payload,
  delaySeconds = 0,
}) {
  if (!DOCUMENT_ANALYSIS_TASKS_LOCATION) {
    throw new Error("GCP_TASKS_LOCATION not configured");
  }

  return await createHttpTask({
    queueName: DOCUMENT_ANALYSIS_TASK_QUEUE,
    location: DOCUMENT_ANALYSIS_TASKS_LOCATION,
    url: `${buildAnalysisServiceBaseUrl(req)}/analysis/tasks`,
    payload,
    delaySeconds,
    headers: getInternalTaskHeaders(requestId),
  });
}

function parseTaskPayload(body) {
  return {
    kind: String(body.kind || "").trim(),
    request_id: String(body.request_id || "").trim(),
    parent_run_id: normalizeUuid(body.parent_run_id),
    batch_run_id: normalizeUuid(body.batch_run_id),
    mode: String(body.mode || "").trim(),
    analysis_space_id: normalizeUuid(body.analysis_space_id),
    parity_reference: body.parity_reference && typeof body.parity_reference === "object"
      ? body.parity_reference
      : null,
  };
}

function parseStartPayload(body) {
  return {
    request_id: String(body.request_id || "").trim(),
    parent_run_id: normalizeUuid(body.parent_run_id),
    batch_run_ids: Array.isArray(body.batch_run_ids)
      ? body.batch_run_ids.map((id) => normalizeUuid(id)).filter(Boolean)
      : [],
    workspace_id: normalizeUuid(body.workspace_id),
    user_id: normalizeUuid(body.user_id),
    document_id: normalizeUuid(body.document_id),
    action_id: normalizeUuid(body.action_id),
    template_id: String(body.template_id || "").trim(),
    data_plane: body.data_plane && typeof body.data_plane === "object"
      ? body.data_plane
      : null,
  };
}

function ensureFields(payload, fields) {
  for (const field of fields) {
    const value = payload[field];
    if (
      value === null || value === undefined ||
      (typeof value === "string" && value.length === 0) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      const error = new Error(`Missing ${field}`);
      error.statusCode = 400;
      throw error;
    }
  }
}

async function fetchRunOrThrow(supabase, runId) {
  const { data, error } = await supabase
    .from("extraction_runs")
    .select("id, workspace_id, user_id, document_id, extraction_type, status, input_config, updated_at")
    .eq("id", normalizeUuid(runId))
    .single();

  if (error || !data) {
    const wrapped = new Error(error?.message || "Extraction run not found");
    wrapped.statusCode = 404;
    throw wrapped;
  }

  return data;
}

async function fetchBatchRuns(supabase, batchRunIds) {
  const normalized = batchRunIds.map((id) => normalizeUuid(id)).filter(Boolean);
  if (normalized.length === 0) return [];
  const { data, error } = await supabase
    .from("extraction_runs")
    .select("id, document_id, workspace_id, user_id, status, input_config")
    .in("id", normalized);

  if (error) {
    const wrapped = new Error(`Failed to load batch runs: ${error.message}`);
    wrapped.statusCode = 500;
    throw wrapped;
  }

  return data || [];
}

async function patchRunExecutionMetadata(supabase, run, executionPatch) {
  const inputConfig = run?.input_config && typeof run.input_config === "object"
    ? run.input_config
    : {};
  const execution = inputConfig.execution && typeof inputConfig.execution === "object"
    ? inputConfig.execution
    : {};

  const { error } = await supabase
    .from("extraction_runs")
    .update({
      input_config: {
        ...inputConfig,
        execution: {
          ...execution,
          ...executionPatch,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  if (error) {
    throw new Error(`Failed to update extraction run execution metadata: ${error.message}`);
  }
}

async function patchActionExecutionMetadata(supabase, actionId, executionPatch) {
  if (!actionId) return;

  const { data: existing, error: readError } = await supabase
    .from("actions")
    .select("id, output_json")
    .eq("id", normalizeUuid(actionId))
    .maybeSingle();

  if (readError || !existing) return;

  const outputJson = existing.output_json && typeof existing.output_json === "object"
    ? existing.output_json
    : {};
  const execution = outputJson.execution && typeof outputJson.execution === "object"
    ? outputJson.execution
    : {};

  await supabase
    .from("actions")
    .update({
      output_json: {
        ...outputJson,
        execution: {
          ...execution,
          ...executionPatch,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
}

async function markAutomationRunFailedNode({
  supabase,
  parentRunId,
  message,
}) {
  const normalizedParentRunId = normalizeUuid(parentRunId);
  if (!normalizedParentRunId) return;
  const failedAt = new Date().toISOString();
  const { data: automationRun } = await supabase
    .from("workspace_automation_runs")
    .select("id, action_id, activity_json")
    .eq("parent_run_id", normalizedParentRunId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!automationRun?.id) return;
  const activity = Array.isArray(automationRun.activity_json)
    ? automationRun.activity_json
    : [];
  await supabase
    .from("workspace_automation_runs")
    .update({
      status: "failed",
      status_reason: message,
      error_message: message,
      completed_at: failedAt,
      activity_json: [
        ...activity,
        {
          at: failedAt,
          kind: "status",
          message: "Automation run failed.",
          error: message,
          execution_plane: "gcp",
        },
      ],
      updated_at: failedAt,
    })
    .eq("id", automationRun.id);
}

async function markAnalysisFailed({
  supabase,
  parentRunId,
  batchRunId = null,
  message,
  executionMetadata = {},
}) {
  const normalizedParentRunId = normalizeUuid(parentRunId);
  const parentRun = await fetchRunOrThrow(supabase, normalizedParentRunId);
  const actionId = normalizeUuid(parentRun.input_config?.action_id);

  const failedAt = new Date().toISOString();
  const execution = parentRun.input_config?.execution &&
      typeof parentRun.input_config.execution === "object"
    ? parentRun.input_config.execution
    : {};

  await supabase
    .from("extraction_runs")
    .update({
      status: "failed",
      completed_at: failedAt,
      output_summary: {
        error: message,
        execution: {
          ...execution,
          ...executionMetadata,
        },
      },
      updated_at: failedAt,
    })
    .eq("id", normalizedParentRunId);

  if (batchRunId) {
    await supabase
      .from("extraction_runs")
      .update({
        status: "failed",
        completed_at: failedAt,
        output_summary: {
          error: message,
        },
        updated_at: failedAt,
      })
      .eq("id", normalizeUuid(batchRunId));
  }

  if (actionId) {
    const existingOutput = parentRun.input_config?.action_output &&
      typeof parentRun.input_config.action_output === "object"
      ? parentRun.input_config.action_output
      : {};
    await supabase
      .from("actions")
      .update({
        status: "failed",
        updated_at: failedAt,
        output_text: message,
        output_json: {
          ...existingOutput,
          stage: "failed",
          message,
          execution: {
            ...execution,
            ...executionMetadata,
          },
        },
      })
      .eq("id", actionId);
  }

  await markAutomationRunFailedNode({
    supabase,
    parentRunId: normalizedParentRunId,
    message,
  }).catch(() => null);
}

export function isRetryableAnalysisError(error) {
  const status = Number(error?.statusCode || error?.status || 500);
  const message = String(error?.message || "").toLowerCase();

  if (status === 429 || status === 408 || status === 409 || status === 202) {
    return true;
  }
  if (status >= 500) return true;
  if (
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("reduce_not_ready") ||
    message.includes("batches_incomplete") ||
    message.includes("rate limit")
  ) {
    return true;
  }

  return false;
}

async function startAnalysisWorkflow({
  req,
  supabase,
  requestId,
  parentRun,
  batchRuns,
  payload,
  log,
}) {
  const existingExecution = parentRun.input_config?.execution &&
      typeof parentRun.input_config.execution === "object"
    ? parentRun.input_config.execution
    : {};
  if (
    existingExecution.execution_plane === "gcp" &&
    String(existingExecution.workflow_execution_id || "").trim()
  ) {
    return {
      workflow_execution_id: String(existingExecution.workflow_execution_id),
      already_enqueued: true,
      deferred: false,
    };
  }

  if (!DOCUMENT_ANALYSIS_WORKFLOWS_LOCATION) {
    throw new Error("GCP_WORKFLOWS_LOCATION not configured");
  }

  const token = getExpectedInternalToken();
  if (!token) {
    throw new Error("Missing internal token for workflow launch");
  }

  const execution = await startWorkflowExecution({
    workflowName: DOCUMENT_ANALYSIS_WORKFLOW,
    location: DOCUMENT_ANALYSIS_WORKFLOWS_LOCATION,
    argument: {
      service_base_url: buildAnalysisServiceBaseUrl(req),
      parent_run_id: parentRun.id,
      batch_run_ids: batchRuns.map((run) => run.id),
      workspace_id: payload.workspace_id,
      user_id: payload.user_id,
      document_id: payload.document_id,
      request_id: requestId,
      internal_token: token,
      project_id: getGcpProjectId(),
    },
  });

  const workflowExecutionId = String(execution?.name || "").trim();
  const executionPatch = {
    execution_plane: "gcp",
    request_id: requestId,
    workflow_execution_id: workflowExecutionId,
    queue_provider: "cloud_tasks",
    queue_name: DOCUMENT_ANALYSIS_TASK_QUEUE,
  };
  const runtime = resolveAnalysisRuntime(parentRun.extraction_type);

  await patchRunExecutionMetadata(supabase, parentRun, executionPatch);
  for (const batchRun of batchRuns) {
    await patchRunExecutionMetadata(supabase, batchRun, executionPatch);
  }
  await patchActionExecutionMetadata(
    supabase,
    payload.action_id,
    executionPatch,
  );

  const reduceDelaySeconds = Math.min(
    Math.max(batchRuns.length * 15, 60),
    300,
  );

  for (const batchRun of batchRuns) {
    await scheduleAnalysisTask({
      req,
      requestId,
      payload: {
        kind: runtime.batchTaskKind,
        batch_run_id: batchRun.id,
        parent_run_id: parentRun.id,
        request_id: requestId,
      },
    });
  }

  await scheduleAnalysisTask({
    req,
    requestId,
    payload: {
      kind: runtime.reduceTaskKind,
      parent_run_id: parentRun.id,
      request_id: requestId,
    },
    delaySeconds: reduceDelaySeconds,
  });

  log.info("Started analysis workflow", {
    parent_run_id: parentRun.id,
    workflow_execution_id: workflowExecutionId,
    batch_count: batchRuns.length,
    reduce_delay_seconds: reduceDelaySeconds,
  });

  return {
    workflow_execution_id: workflowExecutionId,
    deferred: false,
    already_enqueued: false,
  };
}

async function handleStart(req, res, { requestId, log, readJsonBody }) {
  requireInternalCaller(req.headers);
  const supabase = createServiceClient();
  const body = await readJsonBody(req);
  const payload = parseStartPayload(body);

  ensureFields(payload, [
    "parent_run_id",
    "batch_run_ids",
    "workspace_id",
    "user_id",
    "document_id",
    "template_id",
  ]);

  const parentRun = await fetchRunOrThrow(supabase, payload.parent_run_id);
  const batchRuns = await fetchBatchRuns(supabase, payload.batch_run_ids);
  const runtime = resolveAnalysisRuntime(parentRun.extraction_type);

  if (normalizeUuid(parentRun.workspace_id) !== payload.workspace_id) {
    const error = new Error("workspace_id does not match parent run");
    error.statusCode = 400;
    throw error;
  }
  if (normalizeUuid(parentRun.user_id) !== payload.user_id) {
    const error = new Error("user_id does not match parent run");
    error.statusCode = 400;
    throw error;
  }
  if (normalizeUuid(parentRun.document_id) !== payload.document_id) {
    const error = new Error("document_id does not match parent run");
    error.statusCode = 400;
    throw error;
  }
  if (batchRuns.length !== payload.batch_run_ids.length) {
    const error = new Error("One or more batch runs were not found");
    error.statusCode = 404;
    throw error;
  }

  for (const batchRun of batchRuns) {
    const batchParent = normalizeUuid(batchRun.input_config?.parent_run_id);
    if (batchParent !== payload.parent_run_id) {
      const error = new Error(`Batch run ${batchRun.id} does not belong to parent run`);
      error.statusCode = 400;
      throw error;
    }
  }

  const launch = await startAnalysisWorkflow({
    req,
    supabase,
    requestId,
    parentRun,
    batchRuns,
    payload,
    log,
  });

  return sendJson(
    res,
    202,
    buildAnalyzeAcceptedPayload({
      requestId,
      actionId: payload.action_id,
      runId: payload.parent_run_id,
      message: runtime.acceptedMessage,
      workflowExecutionId: launch.workflow_execution_id || null,
      deferred: launch.deferred === true,
      alreadyEnqueued: launch.already_enqueued === true,
    }),
  );
}

async function handleTask(req, res, { requestId, log, readJsonBody }) {
  requireInternalCaller(req.headers);
  const supabase = createServiceClient();
  const body = await readJsonBody(req);
  const payload = parseTaskPayload(body);

  ensureFields(payload, ["kind", "parent_run_id"]);
  if (
    payload.kind === "contract_analysis_batch" &&
    !payload.batch_run_id
  ) {
    const error = new Error("Missing batch_run_id");
    error.statusCode = 400;
    throw error;
  }

  try {
    if (
      payload.kind === "contract_analysis_batch" ||
      payload.kind === "document_analysis_batch"
    ) {
      const result = await executeContractAnalysisBatch({
        supabase,
        batchRunId: payload.batch_run_id,
        requestId,
        log,
      });
      return sendJson(res, 200, buildEnvelope(requestId, {
        success: true,
        kind: payload.kind,
        parent_run_id: payload.parent_run_id,
        batch_run_id: payload.batch_run_id,
        output_summary: result.output_summary,
      }));
    }

    if (
      payload.kind === "contract_analysis_reduce" ||
      payload.kind === "document_analysis_reduce"
    ) {
      const result = await executeContractAnalysisReduce({
        supabase,
        parentRunId: payload.parent_run_id,
        requestId,
        log,
        mode: payload.mode === "shadow" ? "shadow" : "canonical",
        parityReference: payload.parity_reference || null,
        analysisSpaceId: payload.analysis_space_id || null,
      });

      return sendJson(res, 200, buildEnvelope(requestId, {
        success: true,
        kind: payload.kind,
        parent_run_id: payload.parent_run_id,
        delegated: result.delegated === true,
        contract_id: result.contract_id || null,
        verification_object_id: result.verification_object_id || null,
        version_id: result.version_id || null,
      }));
    }

    const error = new Error(`Unsupported task kind: ${payload.kind}`);
    error.statusCode = 400;
    throw error;
  } catch (error) {
    if (
      Number(error?.statusCode || error?.status || 0) === 404 &&
      String(error?.message || "").includes("Parent run not found")
    ) {
      log.warn("Dropping orphaned analysis task", {
        kind: payload.kind,
        parent_run_id: payload.parent_run_id,
        batch_run_id: payload.batch_run_id || null,
      });
      return sendJson(res, 200, buildEnvelope(requestId, {
        success: true,
        orphaned_parent_run: true,
        kind: payload.kind,
        parent_run_id: payload.parent_run_id,
      }));
    }
    if (isRetryableAnalysisError(error)) {
      log.warn("Retryable analysis task failure", {
        kind: payload.kind,
        parent_run_id: payload.parent_run_id,
        batch_run_id: payload.batch_run_id || null,
        error: error instanceof Error ? error.message : String(error),
      });
      return sendJson(res, 503, buildEnvelope(requestId, {
        error: error instanceof Error ? error.message : "retryable_analysis_failure",
        kind: payload.kind,
        parent_run_id: payload.parent_run_id,
      }));
    }

    await markAnalysisFailed({
      supabase,
      parentRunId: payload.parent_run_id,
      batchRunId: payload.batch_run_id || null,
      message: error instanceof Error ? error.message : String(error),
      executionMetadata: {
        request_id: requestId,
        queue_name: DOCUMENT_ANALYSIS_TASK_QUEUE,
      },
    });

    log.error("Terminal analysis task failure", {
      kind: payload.kind,
      parent_run_id: payload.parent_run_id,
      batch_run_id: payload.batch_run_id || null,
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, 200, buildEnvelope(requestId, {
      success: false,
      terminal: true,
      error: error instanceof Error ? error.message : "terminal_analysis_failure",
      kind: payload.kind,
      parent_run_id: payload.parent_run_id,
    }));
  }
}

async function handleReduce(req, res, { requestId, log, readJsonBody }) {
  requireInternalCaller(req.headers);
  const supabase = createServiceClient();
  const body = await readJsonBody(req);
  const payload = parseTaskPayload({
    ...body,
    kind: body?.kind || "document_analysis_reduce",
  });
  ensureFields(payload, ["parent_run_id"]);
  const result = await executeContractAnalysisReduce({
    supabase,
    parentRunId: payload.parent_run_id,
    requestId,
    log,
    mode: payload.mode === "shadow" ? "shadow" : "canonical",
    parityReference: payload.parity_reference || null,
    analysisSpaceId: payload.analysis_space_id || null,
  });
  return sendJson(res, 200, buildEnvelope(requestId, {
    success: true,
    kind: payload.kind,
    parent_run_id: payload.parent_run_id,
    delegated: result.delegated === true,
    verification_object_id: result.verification_object_id || null,
    version_id: result.version_id || null,
    mode: result.mode || "canonical",
    snapshot_summary: result.snapshot_summary || null,
    workspace_sync: result.workspace_sync || null,
    workspace_preview: result.workspace_preview || null,
    parity: result.parity || null,
    materialization_ready: result.materialization_ready !== false,
  }));
}

async function handleExportReport(req, res, { requestId, log, readJsonBody }) {
  requireInternalCaller(req.headers);
  const supabase = createServiceClient();
  const body = await readJsonBody(req);
  const payload = await buildContractExportPayload({
    supabase,
    requestId,
    body,
    log,
  });

  log.info("Exported contract report natively through GCP analysis service", {
    format: body?.format || "html",
    document_id: body?.document_id ? normalizeUuid(body.document_id) : null,
  });

  return sendJson(res, 200, payload);
}

export async function handleAnalysisStart(req, res, { requestId, log, readJsonBody }) {
  try {
    return await handleStart(req, res, { requestId, log, readJsonBody });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    log.error("Analysis start failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, status, buildEnvelope(requestId, {
      error: error instanceof Error ? error.message : "Internal server error",
    }));
  }
}

export async function handleAnalysisTask(req, res, { requestId, log, readJsonBody }) {
  try {
    return await handleTask(req, res, { requestId, log, readJsonBody });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    log.error("Analysis task failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, status, buildEnvelope(requestId, {
      error: error instanceof Error ? error.message : "Internal server error",
    }));
  }
}

export async function handleAnalysisReduce(req, res, { requestId, log, readJsonBody }) {
  try {
    return await handleReduce(req, res, { requestId, log, readJsonBody });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    log.error("Analysis reduce failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, status, buildEnvelope(requestId, {
      error: error instanceof Error ? error.message : "Internal server error",
    }));
  }
}

export async function handleAnalysisExportReport(req, res, { requestId, log, readJsonBody }) {
  try {
    return await handleExportReport(req, res, { requestId, log, readJsonBody });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    log.error("Analysis export failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, status, buildEnvelope(requestId, {
      error: error instanceof Error ? error.message : "Internal server error",
    }));
  }
}

async function handlePromotePrivateLivePublic(req, res, { requestId, log, readJsonBody }) {
  requireInternalCaller(req.headers);
  const supabase = createServiceClient();
  const body = await readJsonBody(req);
  const workspaceId = normalizeUuid(body.workspace_id);
  const documentId = normalizeUuid(body.document_id);
  const userId = normalizeUuid(body.user_id);
  const templateId = String(body.template_id || "document_analysis").trim();

  ensureFields({ workspace_id: workspaceId, document_id: documentId, user_id: userId }, [
    "workspace_id",
    "document_id",
    "user_id",
  ]);

  log.info("Promoting private live experience to public_unlisted", {
    workspace_id: workspaceId,
    document_id: documentId,
  });

  const result = await promotePrivateLiveToPublicUnlisted({
    supabase,
    requestId,
    userId,
    workspaceId,
    documentId,
    templateId,
  });

  return sendJson(res, 200, buildEnvelope(requestId, {
    ok: true,
    promoted: true,
    default_visibility: "public_unlisted",
    experience_id: result.experience_id || null,
    run_id: result.run_id || null,
    candidate_id: result.candidate_id || null,
    revision_id: result.revision_id || null,
    public_url: result.public_url || null,
  }));
}

export async function handleAnalysisPromotePrivateLivePublic(req, res, {
  requestId,
  log,
  readJsonBody,
}) {
  try {
    return await handlePromotePrivateLivePublic(req, res, {
      requestId,
      log,
      readJsonBody,
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    log.error("Private live public promotion failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, status, buildEnvelope(requestId, {
      error: error instanceof Error ? error.message : "Internal server error",
    }));
  }
}
