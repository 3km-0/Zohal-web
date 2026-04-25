'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Clock3, Play, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge, Button, EmptyState, Input, ZohalToggle, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { automationStatusVariant, normalizeAutomationActivity, summarizeAutomationRun } from '@/lib/automations';
import { createClient } from '@/lib/supabase/client';

type AutomationRow = {
  id: string;
  workspace_id: string;
  enabled: boolean;
  trigger_document_ingestion_completed: boolean;
  daily_schedule_enabled: boolean;
  daily_schedule_local_time: string;
  timezone: string;
  manual_run_enabled: boolean;
  private_live_enabled: boolean;
  auto_refresh_private_live: boolean;
};

type AutomationRun = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';
  trigger_kind: string;
  skip_reason?: string | null;
  status_reason?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  activity_json?: Array<Record<string, unknown>>;
  action?: {
    status?: string | null;
    output_json?: Record<string, unknown> | null;
    output_text?: string | null;
    updated_at?: string | null;
  } | null;
  extraction_run?: {
    status?: string | null;
    updated_at?: string | null;
  } | null;
};

function formatTimestamp(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function WorkspaceAutomationEditor({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('automations');
  const supabase = useMemo(() => createClient(), []);
  const { showError, showSuccess } = useToast();

  const [automation, setAutomation] = useState<AutomationRow | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loadingAutomation, setLoadingAutomation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [triggerOnIngestion, setTriggerOnIngestion] = useState(true);
  const [dailyRefresh, setDailyRefresh] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('09:00:00');
  const [timezone, setTimezone] = useState('UTC');
  const [privateLiveEnabled, setPrivateLiveEnabled] = useState(true);
  const [autoRefreshPrivateLive, setAutoRefreshPrivateLive] = useState(true);
  const [manualRunEnabled, setManualRunEnabled] = useState(true);

  const activeRun = useMemo(
    () => runs.find((run) => run.status === 'queued' || run.status === 'running') || null,
    [runs]
  );

  const loadAutomation = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingAutomation(true);
    const { data, error } = await supabase.functions.invoke('workspace-automations', {
      body: {
        workspace_id: workspaceId,
        action: 'get',
        limit: 20,
      },
    });
    if (error || !data?.ok) {
      showError(error || new Error('Failed to load automations'), 'workspace-automations');
      setLoadingAutomation(false);
      return;
    }
    const nextAutomation = data.automation as AutomationRow;
    const nextRuns = Array.isArray(data.runs) ? (data.runs as AutomationRun[]) : [];
    setAutomation(nextAutomation);
    setRuns(nextRuns);
    setEnabled(nextAutomation.enabled !== false);
    setTriggerOnIngestion(nextAutomation.trigger_document_ingestion_completed !== false);
    setDailyRefresh(nextAutomation.daily_schedule_enabled === true);
    setScheduleTime(nextAutomation.daily_schedule_local_time || '09:00:00');
    setTimezone(nextAutomation.timezone || 'UTC');
    setPrivateLiveEnabled(nextAutomation.private_live_enabled !== false);
    setAutoRefreshPrivateLive(nextAutomation.auto_refresh_private_live !== false);
    setManualRunEnabled(nextAutomation.manual_run_enabled !== false);
    setLoadingAutomation(false);
  }, [showError, supabase, workspaceId]);

  useEffect(() => {
    void loadAutomation();
  }, [loadAutomation]);

  useEffect(() => {
    if (!workspaceId || !activeRun) return;
    const interval = window.setInterval(() => {
      void loadAutomation();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeRun, loadAutomation, workspaceId]);

  const handleSave = useCallback(async () => {
    if (!workspaceId) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('workspace-automations', {
      body: {
        workspace_id: workspaceId,
        action: 'update',
        enabled,
        trigger_document_ingestion_completed: triggerOnIngestion,
        daily_schedule_enabled: dailyRefresh,
        daily_schedule_local_time: scheduleTime,
        timezone,
        private_live_enabled: privateLiveEnabled,
        auto_refresh_private_live: autoRefreshPrivateLive,
        manual_run_enabled: manualRunEnabled,
      },
    });
    setSaving(false);
    if (error || !data?.ok) {
      showError(error || new Error(t('saveFailed')), 'workspace-automations');
      return;
    }
    showSuccess(t('saved'));
    const nextAutomation = data.automation as AutomationRow;
    setAutomation(nextAutomation);
    setRuns(Array.isArray(data.runs) ? (data.runs as AutomationRun[]) : []);
  }, [
    autoRefreshPrivateLive,
    dailyRefresh,
    enabled,
    manualRunEnabled,
    privateLiveEnabled,
    scheduleTime,
    showError,
    showSuccess,
    supabase,
    t,
    timezone,
    triggerOnIngestion,
    workspaceId,
  ]);

  const handleRunNow = useCallback(async () => {
    if (!workspaceId) return;
    setRunningNow(true);
    const { data, error } = await supabase.functions.invoke('workspace-automation-run-now', {
      body: {
        workspace_id: workspaceId,
      },
    });
    setRunningNow(false);
    if (error || !data?.ok) {
      showError(error || new Error(t('runFailed')), 'workspace-automation-run-now');
      return;
    }
    showSuccess(t('running'));
    await loadAutomation();
  }, [loadAutomation, showError, showSuccess, supabase, t, workspaceId]);

  if (loadingAutomation || !automation) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-zohal border border-border bg-surface p-5 shadow-[var(--shadowSm)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text">{t('presetTitle')}</h2>
            <p className="mt-1 text-sm text-text-soft">{t('presetDescription')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleSave} isLoading={saving}>
              {t('save')}
            </Button>
            <Button onClick={handleRunNow} isLoading={runningNow} disabled={!manualRunEnabled}>
              <Play className="h-4 w-4" />
              {t('runNow')}
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          <ZohalToggle
            label={t('enabled')}
            caption={t('enabledCaption')}
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <ZohalToggle
            label={t('triggerOnIngestion')}
            caption={t('triggerOnIngestionCaption')}
            checked={triggerOnIngestion}
            onCheckedChange={setTriggerOnIngestion}
          />
          <ZohalToggle
            label={t('dailyRefresh')}
            caption={t('dailyRefreshCaption')}
            checked={dailyRefresh}
            onCheckedChange={setDailyRefresh}
            icon={<Clock3 className="h-4 w-4" />}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-text">{t('scheduleTime')}</label>
              <Input
                type="time"
                step={60}
                value={String(scheduleTime || '09:00').slice(0, 5)}
                onChange={(event) => setScheduleTime(`${event.target.value}:00`)}
                disabled={!dailyRefresh}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-text">{t('timezone')}</label>
              <Input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                disabled={!dailyRefresh}
              />
            </div>
          </div>
          <ZohalToggle
            label={t('privateLive')}
            caption={t('privateLiveCaption')}
            checked={privateLiveEnabled}
            onCheckedChange={setPrivateLiveEnabled}
          />
          <ZohalToggle
            label={t('autoRefreshPrivateLive')}
            caption={t('autoRefreshPrivateLiveCaption')}
            checked={autoRefreshPrivateLive}
            onCheckedChange={setAutoRefreshPrivateLive}
            disabled={!privateLiveEnabled}
          />
          <ZohalToggle
            label={t('manualRunEnabled')}
            caption={t('manualRunEnabledCaption')}
            checked={manualRunEnabled}
            onCheckedChange={setManualRunEnabled}
          />
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-zohal border border-border bg-surface p-5 shadow-[var(--shadowSm)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-text">{t('currentStatus')}</h3>
            <Badge variant={automationStatusVariant(activeRun?.status || 'skipped')} dot>
              {activeRun ? t(activeRun.status === 'running' ? 'inProgress' : activeRun.status) : t('skipped')}
            </Badge>
          </div>
          {activeRun ? (
            <div className="space-y-3">
              <p className="text-sm text-text-soft">
                {activeRun.status_reason || activeRun.error_message || '—'}
              </p>
              <div className="space-y-2 rounded-zohal bg-surface-alt p-3">
                {normalizeAutomationActivity(activeRun).length === 0 ? (
                  <p className="text-sm text-text-soft">—</p>
                ) : (
                  normalizeAutomationActivity(activeRun).map((item, index) => (
                    <div key={`${item.at || 'activity'}-${index}`} className="flex items-start gap-2 text-sm">
                      <RefreshCw className="mt-0.5 h-3.5 w-3.5 text-accent" />
                      <div>
                        <p className="text-text">{String(item.message || 'Updating status')}</p>
                        <p className="text-xs text-text-soft">
                          {formatTimestamp(typeof item.at === 'string' ? item.at : activeRun.updated_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-soft">{t('noRuns')}</p>
          )}
        </div>

        <div className="rounded-zohal border border-border bg-surface p-5 shadow-[var(--shadowSm)]">
          <h3 className="mb-3 text-base font-semibold text-text">{t('recentRuns')}</h3>
          {runs.length === 0 ? (
            <EmptyState icon={<Bot className="h-6 w-6" />} title={t('noRuns')} variant="inline" />
          ) : (
            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="rounded-zohal border border-border bg-surface-alt p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={automationStatusVariant(run.status)} dot>
                        {t(run.status === 'running' ? 'inProgress' : run.status)}
                      </Badge>
                      <span className="text-xs uppercase tracking-wide text-text-soft">
                        {run.trigger_kind.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <span className="text-xs text-text-soft">{formatTimestamp(run.created_at)}</span>
                  </div>
                  <p className="text-sm text-text-soft">
                    {summarizeAutomationRun(run, {
                      unchanged: t('skipUnchanged'),
                      inProgress: t('skipInProgress'),
                      disabled: t('skipDisabled'),
                    })}
                  </p>
                  {run.action?.output_json && typeof run.action.output_json === 'object' ? (
                    <p className="mt-2 text-xs text-text-soft">
                      {String(
                        (run.action.output_json.message as string | undefined) ||
                          (run.action.output_json.status_message as string | undefined) ||
                          (run.action.output_json.stage as string | undefined) ||
                          ''
                      )}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
