#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVICE_DIR="${ROOT_DIR}/services/zohal-backend"
INGESTION_WORKFLOW_FILE="${SERVICE_DIR}/workflows/document-ingestion-v1.yaml"
ANALYSIS_WORKFLOW_FILE="${SERVICE_DIR}/workflows/contract-analysis-v1.yaml"

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
SERVICE_REGION="${SERVICE_REGION:-me-central2}"
ORCHESTRATION_REGION="${ORCHESTRATION_REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-zohal-backend}"
INGESTION_WORKFLOW_NAME="${INGESTION_WORKFLOW_NAME:-${WORKFLOW_NAME:-document-ingestion-v1}}"
INGESTION_TASK_QUEUE_NAME="${INGESTION_TASK_QUEUE_NAME:-${TASK_QUEUE_NAME:-document-ingestion-jobs}}"
ANALYSIS_WORKFLOW_NAME="${ANALYSIS_WORKFLOW_NAME:-contract-analysis-v1}"
ANALYSIS_TASK_QUEUE_NAME="${ANALYSIS_TASK_QUEUE_NAME:-contract-analysis-jobs}"
IMAGE_REPO="${IMAGE_REPO:-gcr.io/${PROJECT_ID}/${SERVICE_NAME}}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d%H%M%S)}"
IMAGE_URI="${IMAGE_URI:-${IMAGE_REPO}:${IMAGE_TAG}}"
MEMORY="${MEMORY:-1Gi}"
CPU="${CPU:-1}"
MAX_INSTANCES="${MAX_INSTANCES:-10}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-true}"
WORKFLOW_SERVICE_ACCOUNT="${WORKFLOW_SERVICE_ACCOUNT:-}"
SET_SECRETS="${SET_SECRETS:-}"
UPDATE_ENV_VARS="${UPDATE_ENV_VARS:-}"
TASKS_MAX_DISPATCHES_PER_SECOND="${TASKS_MAX_DISPATCHES_PER_SECOND:-5}"
TASKS_MAX_CONCURRENT_DISPATCHES="${TASKS_MAX_CONCURRENT_DISPATCHES:-10}"
TASKS_MAX_ATTEMPTS="${TASKS_MAX_ATTEMPTS:-20}"
TASKS_MAX_RETRY_SECONDS="${TASKS_MAX_RETRY_SECONDS:-3600}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required" >&2
  exit 1
fi

if [[ ! -f "${SERVICE_DIR}/package.json" ]]; then
  echo "Missing service dir: ${SERVICE_DIR}" >&2
  exit 1
fi

if [[ ! -f "${INGESTION_WORKFLOW_FILE}" ]]; then
  echo "Missing workflow file: ${INGESTION_WORKFLOW_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ANALYSIS_WORKFLOW_FILE}" ]]; then
  echo "Missing workflow file: ${ANALYSIS_WORKFLOW_FILE}" >&2
  exit 1
fi

echo "Deploying ${SERVICE_NAME} to ${PROJECT_ID}/${SERVICE_REGION} (orchestration: ${ORCHESTRATION_REGION})"

gcloud services enable \
  run.googleapis.com \
  workflows.googleapis.com \
  cloudtasks.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project="${PROJECT_ID}"

DEFAULT_ENV_VARS="GCP_PROJECT_ID=${PROJECT_ID},GCP_WORKFLOWS_LOCATION=${ORCHESTRATION_REGION},GCP_DOCUMENT_INGESTION_WORKFLOW=${INGESTION_WORKFLOW_NAME},GCP_TASKS_LOCATION=${ORCHESTRATION_REGION},GCP_DOCUMENT_INGESTION_TASK_QUEUE=${INGESTION_TASK_QUEUE_NAME},GCP_CONTRACT_ANALYSIS_WORKFLOW=${ANALYSIS_WORKFLOW_NAME},GCP_CONTRACT_ANALYSIS_TASK_QUEUE=${ANALYSIS_TASK_QUEUE_NAME}"
DEPLOY_ENV_VARS="${UPDATE_ENV_VARS:-}"
if [[ -n "${DEPLOY_ENV_VARS}" ]]; then
  case "${DEPLOY_ENV_VARS}" in
    ^?^*)
      CUSTOM_DELIMITER="${DEPLOY_ENV_VARS:1:1}"
      DEFAULT_ENV_VARS="${DEFAULT_ENV_VARS//,/${CUSTOM_DELIMITER}}"
      DEPLOY_ENV_VARS="${DEPLOY_ENV_VARS}${CUSTOM_DELIMITER}${DEFAULT_ENV_VARS}"
      ;;
    *)
      DEPLOY_ENV_VARS="${DEPLOY_ENV_VARS},${DEFAULT_ENV_VARS}"
      ;;
  esac
else
  DEPLOY_ENV_VARS="${DEFAULT_ENV_VARS}"
fi

DEPLOY_ARGS=(
  run deploy "${SERVICE_NAME}"
  --project="${PROJECT_ID}"
  --region="${SERVICE_REGION}"
  --source="${SERVICE_DIR}"
  --memory="${MEMORY}"
  --cpu="${CPU}"
  --max-instances="${MAX_INSTANCES}"
  --min-instances="${MIN_INSTANCES}"
  --set-env-vars="${DEPLOY_ENV_VARS}"
)

if [[ "${ALLOW_UNAUTHENTICATED}" == "true" ]]; then
  DEPLOY_ARGS+=(--allow-unauthenticated)
else
  DEPLOY_ARGS+=(--no-allow-unauthenticated)
fi

if [[ -n "${SET_SECRETS}" ]]; then
  DEPLOY_ARGS+=(--set-secrets="${SET_SECRETS}")
fi

gcloud "${DEPLOY_ARGS[@]}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${SERVICE_REGION}" \
  --format='value(status.url)')"

gcloud run services update "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${SERVICE_REGION}" \
  --update-env-vars="INGESTION_SERVICE_BASE_URL=${SERVICE_URL},ANALYSIS_SERVICE_BASE_URL=${SERVICE_URL}"

for queue_name in "${INGESTION_TASK_QUEUE_NAME}" "${ANALYSIS_TASK_QUEUE_NAME}"; do
  if gcloud tasks queues describe "${queue_name}" \
    --project="${PROJECT_ID}" \
    --location="${ORCHESTRATION_REGION}" >/dev/null 2>&1; then
    gcloud tasks queues update "${queue_name}" \
      --project="${PROJECT_ID}" \
      --location="${ORCHESTRATION_REGION}" \
      --max-dispatches-per-second="${TASKS_MAX_DISPATCHES_PER_SECOND}" \
      --max-concurrent-dispatches="${TASKS_MAX_CONCURRENT_DISPATCHES}" \
      --max-attempts="${TASKS_MAX_ATTEMPTS}" \
      --max-retry-duration="${TASKS_MAX_RETRY_SECONDS}s"
  else
    gcloud tasks queues create "${queue_name}" \
      --project="${PROJECT_ID}" \
      --location="${ORCHESTRATION_REGION}" \
      --max-dispatches-per-second="${TASKS_MAX_DISPATCHES_PER_SECOND}" \
      --max-concurrent-dispatches="${TASKS_MAX_CONCURRENT_DISPATCHES}" \
      --max-attempts="${TASKS_MAX_ATTEMPTS}" \
      --max-retry-duration="${TASKS_MAX_RETRY_SECONDS}s"
  fi
done

deploy_workflow() {
  local workflow_name="$1"
  local workflow_file="$2"
  local -a workflow_args=(
    workflows deploy "${workflow_name}"
    --project="${PROJECT_ID}"
    --location="${ORCHESTRATION_REGION}"
    --source="${workflow_file}"
  )

  if [[ -n "${WORKFLOW_SERVICE_ACCOUNT}" ]]; then
    workflow_args+=(--service-account="${WORKFLOW_SERVICE_ACCOUNT}")
  fi

  gcloud "${workflow_args[@]}"
}

deploy_workflow "${INGESTION_WORKFLOW_NAME}" "${INGESTION_WORKFLOW_FILE}"
deploy_workflow "${ANALYSIS_WORKFLOW_NAME}" "${ANALYSIS_WORKFLOW_FILE}"

echo
echo "Cloud Run URL: ${SERVICE_URL}"
echo "Ingestion workflow: ${INGESTION_WORKFLOW_NAME}"
echo "Ingestion queue: ${INGESTION_TASK_QUEUE_NAME}"
echo "Analysis workflow: ${ANALYSIS_WORKFLOW_NAME}"
echo "Analysis queue: ${ANALYSIS_TASK_QUEUE_NAME}"
