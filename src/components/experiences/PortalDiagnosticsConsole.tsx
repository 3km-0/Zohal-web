'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Activity, AlertTriangle, ExternalLink, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Spinner } from '@/components/ui';
import {
  humanizeFailureClass,
  humanizeStageStatus,
  isStageFailed,
  type PortalDiagnostics,
} from '@/lib/portal-diagnostics';

type PortalDiagnosticsConsoleProps = {
  diagnostics: PortalDiagnostics | null;
  isLoading: boolean;
  onRefresh: () => void;
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function badgeClass(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === 'fail' || normalized.includes('failed')) {
    return 'border-error/30 bg-error/10 text-error';
  }
  if (normalized === 'pass' || normalized === 'passed' || normalized === 'published') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
  }
  if (normalized === 'skipped') {
    return 'border-border bg-surface text-text-soft';
  }
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
}

export function PortalDiagnosticsConsole({
  diagnostics,
  isLoading,
  onRefresh,
}: PortalDiagnosticsConsoleProps) {
  const t = useTranslations('experiencesPage');

  return (
    <div className="space-y-6">
      <Card variant="elevated">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t('portalConsole.title')}</CardTitle>
            <CardDescription>{t('portalConsole.description')}</CardDescription>
          </div>
          <Button variant="secondary" onClick={onRefresh} isLoading={isLoading}>
            <RefreshCcw className="h-4 w-4" />
            {t('actions.refreshPortal')}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {!diagnostics ? (
            <div className="col-span-full flex items-center gap-2 text-sm text-text-soft">
              <Spinner size="sm" />
              {t('portalConsole.loading')}
            </div>
          ) : (
            <>
              <div className="rounded-scholar border border-border bg-surface-alt p-4">
                <div className="text-text-soft">{t('portalConsole.summaryTitle')}</div>
                <div className="mt-1 text-base font-semibold text-text">{diagnostics.summary.title || t('status.none')}</div>
                <div className="mt-2 text-sm text-text-soft">
                  {diagnostics.summary.source_kind || t('status.none')}
                </div>
              </div>
              <div className="rounded-scholar border border-border bg-surface-alt p-4">
                <div className="text-text-soft">{t('portalConsole.failureClass')}</div>
                <div
                  data-testid="portal-failure-class"
                  className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badgeClass(diagnostics.failure_class)}`}
                >
                  {humanizeFailureClass(diagnostics.failure_class)}
                </div>
                {diagnostics.stale_serving_reason ? (
                  <p className="mt-3 text-sm text-text-soft">{diagnostics.stale_serving_reason}</p>
                ) : null}
              </div>
              <div className="rounded-scholar border border-border bg-surface-alt p-4">
                <div className="text-text-soft">{t('portalConsole.activeRevision')}</div>
                <div className="mt-1 text-base font-semibold text-text">
                  {diagnostics.summary.active_revision_id || t('status.none')}
                </div>
                <div className="mt-2 text-sm text-text-soft">{diagnostics.summary.active_runtime || '—'}</div>
                {diagnostics.recovery_mode ? (
                  <div className="mt-2 text-sm text-text-soft">
                    {t('portalConsole.recoveryMode')}: {humanizeFailureClass(diagnostics.recovery_mode)}
                  </div>
                ) : null}
              </div>
              <div className="rounded-scholar border border-border bg-surface-alt p-4">
                <div className="text-text-soft">{t('portalConsole.qualityScore')}</div>
                <div className="mt-1 text-base font-semibold text-text">{diagnostics.portal_quality.score}</div>
                <div className="mt-2 text-sm text-text-soft">
                  {t('portalConsole.qualitySummary', {
                    rendered: diagnostics.portal_quality.rendered_required_route_count,
                    required: diagnostics.portal_quality.required_route_count,
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {diagnostics ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t('portalConsole.traceTitle')}</CardTitle>
              <CardDescription>{t('portalConsole.traceDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {diagnostics.trace.map((stage) => (
                <div
                  key={stage.id}
                  data-testid={`portal-stage-${stage.id}`}
                  className="rounded-scholar border border-border bg-surface-alt p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-text">{t(`portalConsole.stageNames.${stage.id}`)}</div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badgeClass(stage.status)}`}>
                      {humanizeStageStatus(stage.status)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-text-soft">{stage.message || '—'}</div>
                  <div className="mt-2 text-xs text-text-soft">{formatTimestamp(stage.timestamp)}</div>
                  {isStageFailed(stage) && stage.error_code ? (
                    <div className="mt-2 inline-flex items-center gap-2 text-xs text-error">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {stage.error_code}
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('portalConsole.liveProbeTitle')}</CardTitle>
                <CardDescription>{t('portalConsole.liveProbeDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-text">
                  <Activity className="h-4 w-4" />
                  <span>
                    {t('portalConsole.httpStatus')}: {diagnostics.live_probe?.http_status ?? '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-text">
                  <ShieldCheck className="h-4 w-4" />
                  <span>
                    {t('portalConsole.evidenceMarkers')}: {diagnostics.live_probe?.evidence_marker_count ?? 0}
                  </span>
                </div>
                <div className="text-text-soft">
                  {t('portalConsole.liveProbeFlags', {
                    fallback: diagnostics.live_probe?.fallback_shell_present ? t('common.yes') : t('common.no'),
                    unresolved: diagnostics.live_probe?.unresolved_dynamic_link_count ?? 0,
                  })}
                </div>
                {diagnostics.live_probe?.preview?.excerpt ? (
                  <div className="rounded-scholar border border-border bg-surface-alt p-3 text-text-soft">
                    {diagnostics.live_probe.preview.excerpt}
                  </div>
                ) : null}
                {diagnostics.summary.live_url ? (
                  <a
                    href={diagnostics.summary.live_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-semibold text-accent"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t('actions.openPortal')}
                  </a>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('portalConsole.candidateTitle')}</CardTitle>
                <CardDescription>{t('portalConsole.candidateDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-scholar border border-border bg-surface-alt p-4">
                  <div className="font-semibold text-text">{diagnostics.candidate?.candidate_id || t('status.none')}</div>
                  <div className="mt-1 text-text-soft">
                    {diagnostics.candidate?.authoring_strategy || t('status.none')}
                  </div>
                  <div className="mt-2 text-text-soft">
                    {t('portalConsole.validationSummary', {
                      fails: diagnostics.candidate?.validation_summary?.fail_count ?? 0,
                      warnings: diagnostics.candidate?.validation_summary?.warning_count ?? 0,
                      quality: diagnostics.candidate?.validation_summary?.generation_quality_score ?? 0,
                    })}
                  </div>
                  {diagnostics.customization_strategy ? (
                    <div className="mt-3 text-text-soft">
                      {t('portalConsole.customizationSummary', {
                        strategy: humanizeFailureClass(diagnostics.customization_strategy),
                        result: humanizeFailureClass(diagnostics.customization_result || 'pending'),
                      })}
                    </div>
                  ) : null}
                  {diagnostics.previous_revision_id ? (
                    <div className="mt-2 text-text-soft">
                      {t('portalConsole.previousRevision')}: {diagnostics.previous_revision_id}
                    </div>
                  ) : null}
                  {diagnostics.attempted_revision_id ? (
                    <div className="mt-2 text-text-soft">
                      {t('portalConsole.attemptedRevision')}: {diagnostics.attempted_revision_id}
                    </div>
                  ) : null}
                  {diagnostics.fallback_reason ? (
                    <div className="mt-2 text-text-soft">
                      {t('portalConsole.fallbackReason')}: {humanizeFailureClass(diagnostics.fallback_reason)}
                    </div>
                  ) : null}
                  {diagnostics.preserved_live_on_failure ? (
                    <div className="mt-2 text-text-soft">{t('portalConsole.preservedLive')}</div>
                  ) : null}
                  {diagnostics.recomposition_scorecard ? (
                    <div className="mt-3 rounded-scholar border border-border bg-background p-3 text-text-soft">
                      <div className="font-semibold text-text">{t('portalConsole.recompositionScorecard')}</div>
                      <div className="mt-1">
                        {t('portalConsole.recompositionSignals', {
                          count: diagnostics.recomposition_scorecard.novelty_signal_count ?? 0,
                          signals: diagnostics.recomposition_scorecard.novelty_signals?.join(', ') || '—',
                        })}
                      </div>
                      <div className="mt-1">
                        {t('portalConsole.recompositionRatios', {
                          lines: (diagnostics.recomposition_scorecard.shared_line_ratio ?? 0).toFixed(2),
                          tokens: (diagnostics.recomposition_scorecard.shared_token_ratio ?? 0).toFixed(2),
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                {diagnostics.candidate?.generation_failures?.length ? (
                  <div className="rounded-scholar border border-error/30 bg-error/10 p-4 text-error">
                    <div className="font-semibold">{t('portalConsole.generationFailures')}</div>
                    <ul className="mt-2 list-disc pl-5">
                      {diagnostics.candidate.generation_failures.map((failure) => (
                        <li key={failure}>{failure}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
