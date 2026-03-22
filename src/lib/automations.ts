export type AutomationRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

export type AutomationActivityLine = {
  at?: string | null;
  message: string;
};

export type AutomationRunLike = {
  status: AutomationRunStatus;
  skip_reason?: string | null;
  status_reason?: string | null;
  error_message?: string | null;
  updated_at?: string | null;
  activity_json?: Array<Record<string, unknown>>;
  action?: {
    updated_at?: string | null;
    output_json?: Record<string, unknown> | null;
  } | null;
};

export function automationStatusVariant(status: AutomationRunStatus): 'default' | 'warning' | 'success' | 'error' {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'running' || status === 'queued') return 'warning';
  return 'default';
}

export function summarizeAutomationRun(
  run: AutomationRunLike,
  labels?: Partial<Record<'unchanged' | 'inProgress' | 'disabled', string>>
): string {
  if (run.skip_reason === 'unchanged_sources') {
    return labels?.unchanged || 'Skipped because the workspace fingerprint did not change.';
  }
  if (run.skip_reason === 'analysis_already_in_progress') {
    return labels?.inProgress || 'Skipped because an equivalent analysis run is already in progress.';
  }
  if (run.skip_reason === 'disabled') {
    return labels?.disabled || 'Skipped because the automation is disabled.';
  }
  return run.status_reason || run.error_message || '—';
}

export function normalizeAutomationActivity(run: AutomationRunLike | null): AutomationActivityLine[] {
  if (!run) return [];
  const activity = Array.isArray(run.activity_json) ? run.activity_json : [];
  const actionOutput = run.action?.output_json && typeof run.action.output_json === 'object'
    ? run.action.output_json
    : null;
  const actionMessage =
    typeof actionOutput?.message === 'string'
      ? actionOutput.message
      : typeof actionOutput?.status_message === 'string'
      ? actionOutput.status_message
      : typeof actionOutput?.stage === 'string'
      ? actionOutput.stage
      : null;

  const lines: AutomationActivityLine[] = [];
  if (actionMessage) {
    lines.push({
      at: run.action?.updated_at || run.updated_at,
      message: actionMessage,
    });
  }

  for (const entry of activity) {
    const message = typeof entry?.message === 'string' ? entry.message : null;
    if (!message) continue;
    lines.push({
      at: typeof entry?.at === 'string' ? entry.at : run.updated_at,
      message,
    });
  }

  if (lines.length === 0) {
    const fallback = run.status_reason || run.error_message;
    if (fallback) {
      lines.push({
        at: run.updated_at,
        message: fallback,
      });
    }
  }

  return lines.slice(0, 8);
}
