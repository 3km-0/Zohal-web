import type { Database } from '@/types/supabase';
import type { AnalysisRunScope, AnalysisRunStatus, AnalysisRunSummary } from '@/types/analysis-runs';

type ExtractionRunRow = Database['public']['Tables']['extraction_runs']['Row'];
type ActionRow = Database['public']['Tables']['actions']['Row'];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function statusFromValue(value: string | null | undefined): AnalysisRunStatus | null {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return null;
  if (['succeeded', 'success', 'completed', 'complete'].includes(normalized)) return 'succeeded';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
  if (['running', 'processing', 'started', 'in_progress', 'in-progress'].includes(normalized)) return 'running';
  if (['queued', 'pending', 'created'].includes(normalized)) return 'queued';
  return null;
}

export function normalizeAnalysisRunStatus(
  runStatus: string | null | undefined,
  actionStatus?: string | null
): AnalysisRunStatus {
  return statusFromValue(actionStatus) ?? statusFromValue(runStatus) ?? 'queued';
}

function parseScope(inputConfig: unknown): AnalysisRunScope {
  const config = asRecord(inputConfig);
  const bundle = asRecord(config.bundle);
  if (asString(config.pack_id) || asString(config.packId) || asString(bundle.pack_id) || asString(bundle.bundle_id)) {
    return 'bundle';
  }

  const documentIds = config.document_ids;
  if (Array.isArray(documentIds) && documentIds.length > 1) {
    return 'bundle';
  }

  return 'single';
}

export function toAnalysisRunSummary(run: ExtractionRunRow, action?: ActionRow | null): AnalysisRunSummary {
  const config = asRecord(run.input_config);
  const outputSummary = asRecord(run.output_summary);
  const playbook = asRecord(config.playbook);
  const bundle = asRecord(config.bundle);

  const actionId =
    asString(config.action_id) ||
    asString(config.actionId) ||
    asString(outputSummary.action_id) ||
    asString((action?.id as unknown) ?? null);

  const playbookLabel =
    asString(playbook.label) ||
    asString(playbook.name) ||
    asString(config.playbook_label) ||
    asString(config.playbook_name) ||
    null;

  const templateId =
    asString(config.template_id) ||
    asString(config.templateId) ||
    asString(config.playbook_id) ||
    asString(config.playbookId) ||
    null;

  const packId =
    asString(config.pack_id) ||
    asString(config.packId) ||
    asString(bundle.pack_id) ||
    asString(bundle.bundle_id) ||
    null;

  const versionId =
    asString(outputSummary.version_id) ||
    asString(outputSummary.current_version_id) ||
    asString(outputSummary.verification_version_id) ||
    null;

  const verificationObjectId =
    asString(outputSummary.verification_object_id) ||
    asString(outputSummary.verificationObjectId) ||
    null;

  return {
    runId: run.id,
    actionId,
    status: normalizeAnalysisRunStatus(run.status, action?.status ?? null),
    createdAt: run.created_at,
    updatedAt: action?.updated_at ?? run.updated_at,
    templateId,
    playbookLabel,
    scope: parseScope(run.input_config),
    packId,
    versionId,
    verificationObjectId,
  };
}

export function selectDefaultAnalysisRun(runs: AnalysisRunSummary[]): AnalysisRunSummary | null {
  if (runs.length === 0) return null;

  const withVersion = runs.find((run) => !!run.versionId);
  return withVersion ?? runs[0];
}
