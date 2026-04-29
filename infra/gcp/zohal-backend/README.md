# zohal-backend GCP deploy

Status: Active
Last reviewed: 2026-04-29

This folder is the deployment home for the Cloud Run execution service and its
paired GCP resources.

Resources managed here:
- Cloud Run service: `zohal-backend`
- Cloud Workflow: `document-ingestion-v1`
- Cloud Tasks queue: `document-ingestion-jobs`
- Cloud Workflow: `document-analysis-v1`
- Cloud Tasks queue: `document-analysis-jobs`

## Current Production Shape

As of 2026-04-29, live Cloud Run is intentionally small but now product-critical
after the Supabase Deno cutover:

- region: `me-central2`
- runtime image: `node:22-slim`
- CPU / memory: `1 CPU` / `1Gi`
- timeout: `300s`
- concurrency: `80`
- max instances: `10`
- min instances: `0`

Recommended next hardening pass before heavier traffic:

- use a dedicated runtime service account instead of the default Compute Engine
  service account
- set `min-instances=1` for production to avoid cold starts on chat/upload
  flows
- consider `2 CPU` / `2Gi` for the combined API + ingestion/analysis surface,
  then tune from Cloud Run metrics
- reduce request concurrency for provider-heavy routes if latency spikes under
  mixed upload/chat traffic
- keep Cloud Run in `me-central2` while Supabase is the DB/control plane; move
  only with a measured latency and data-residency plan
- keep Cloud Tasks/Workflows region explicit and revisit `ORCHESTRATION_REGION`
  once all required services are available in the same target region
- add Cloud Monitoring alerts for 5xx rate, p95 latency, task retry/dead-letter
  growth, and memory/CPU saturation
- keep secrets in Secret Manager and avoid adding new Supabase Edge Function
  secrets for migrated workflows

Deploy:

```bash
cd /Users/Abdulah/Developer/Zohal/Zohal-web
bash infra/gcp/zohal-backend/deploy.sh
```

Optional overrides:

```bash
PROJECT_ID=asens-ai \
SERVICE_REGION=me-central2 \
ORCHESTRATION_REGION=us-central1 \
SERVICE_NAME=zohal-backend \
INGESTION_WORKFLOW_NAME=document-ingestion-v1 \
INGESTION_TASK_QUEUE_NAME=document-ingestion-jobs \
ANALYSIS_WORKFLOW_NAME=document-analysis-v1 \
ANALYSIS_TASK_QUEUE_NAME=document-analysis-jobs \
bash infra/gcp/zohal-backend/deploy.sh
```

Compatibility note:
- the deploy script still sets legacy `GCP_CONTRACT_ANALYSIS_*` env vars to the
  same values as the new `GCP_DOCUMENT_ANALYSIS_*` names
- this keeps older compatibility paths readable while new runs emit
  `document-analysis` resource names

Notes:
- The script deploys Cloud Run from `services/zohal-backend/`.
- It updates `INGESTION_SERVICE_BASE_URL` and `ANALYSIS_SERVICE_BASE_URL` after
  the Cloud Run URL is known.
- `SERVICE_REGION` controls where Cloud Run runs; `ORCHESTRATION_REGION` controls
  where Cloud Tasks and Cloud Workflows live.
- Use `SET_SECRETS` to attach Secret Manager secrets during deploy and
  `UPDATE_ENV_VARS` for non-secret runtime envs.
- Required runtime config for ingestion:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` or `INTERNAL_SERVICE_ROLE_KEY`
  - `INTERNAL_FUNCTION_JWT`
  - `GCS_BUCKET_NAME`
  - `GCS_PROJECT_ID`
  - `GCS_SERVICE_ACCOUNT_KEY_BASE64` or `GCS_SERVICE_ACCOUNT_KEY`
  - `CLOUDCONVERT_API_KEY`
  - `MATHPIX_APP_ID` and `MATHPIX_APP_KEY`

Example:

```bash
SUPABASE_URL=https://vqsyxrgvyxcbejhhgomf.supabase.co \
SET_SECRETS='SUPABASE_SERVICE_ROLE_KEY=supabase-service-role:latest,INTERNAL_FUNCTION_JWT=internal-function-jwt:latest,MATHPIX_APP_ID=mathpix-app-id:latest,MATHPIX_APP_KEY=mathpix-app-key:latest' \
UPDATE_ENV_VARS='SUPABASE_URL=https://your-project.supabase.co,GCS_BUCKET_NAME=zohal-documents,GCS_PROJECT_ID=asens-ai' \
bash infra/gcp/zohal-backend/deploy.sh
```
