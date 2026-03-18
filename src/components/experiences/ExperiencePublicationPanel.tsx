'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Spinner } from '@/components/ui';
import { ExternalLink, Link as LinkIcon, Rocket, RotateCcw, ShieldCheck } from 'lucide-react';

interface ExperiencePublicationPanelProps {
  workspaceId: string;
}

type PublicationStatus = {
  active_revision: {
    host: string;
    active_revision_id: string;
    previous_revision_id?: string | null;
    publication_status: string;
    visibility: string;
  } | null;
  latest_candidate: {
    candidate_id: string;
    revision_id: string;
    status: string;
    validation_report?: {
      status: string;
      summary?: {
        fail_count: number;
        warning_count: number;
      };
    } | null;
    failure?: { message?: string } | null;
  } | null;
  latest_run: {
    run_id: string;
    status: string;
  } | null;
  recent_events: Array<{
    event_kind: string;
    created_at: string;
  }>;
};

export function ExperiencePublicationPanel({ workspaceId }: ExperiencePublicationPanelProps) {
  const t = useTranslations('experiencesPage');
  const [experienceId, setExperienceId] = useState(`exp_${workspaceId.replace(/-/g, '_')}_investor_dashboard`);
  const [corpusId, setCorpusId] = useState(`corpus_${workspaceId.replace(/-/g, '_')}_investor_dashboard`);
  const [title, setTitle] = useState('Investor Dashboard');
  const [host, setHost] = useState('live.zohal.ai');
  const [visibility, setVisibility] = useState('public_unlisted');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<PublicationStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!experienceId.trim()) return;
    const response = await fetch(`/api/experiences/v1/experiences/publications/${encodeURIComponent(experienceId)}/status`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || t('errors.statusFailed'));
    }
    setStatus({
      active_revision: data.active_revision,
      latest_candidate: data.latest_candidate,
      latest_run: data.latest_run,
      recent_events: data.recent_events || [],
    });
  }, [experienceId, t]);

  useEffect(() => {
    fetchStatus().catch((err) => setError(err instanceof Error ? err.message : t('errors.statusFailed')));
    const timer = window.setInterval(() => {
      fetchStatus().catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchStatus, t]);

  const compilePayload = useMemo(
    () => ({
      workspace_id: workspaceId,
      corpus_id: corpusId,
      experience_id: experienceId,
      template_id: 'investor_dashboard',
      host,
      visibility,
      password: password || undefined,
      org_restricted: visibility === 'org_private',
      title,
      subtitle: t('defaults.subtitle'),
      summary: t('defaults.summary'),
    }),
    [workspaceId, corpusId, experienceId, host, visibility, password, title, t]
  );

  const invoke = useCallback(
    async (label: string, input: RequestInfo, init?: RequestInit) => {
      setBusy(label);
      setError(null);
      try {
        const response = await fetch(input, init);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || t('errors.actionFailed'));
        }
        await fetchStatus();
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.actionFailed'));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [fetchStatus, t]
  );

  const latestCandidateId = status?.latest_candidate?.candidate_id;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />
      <WorkspaceTabs workspaceId={workspaceId} active="experiences" />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>{t('configure.title')}</CardTitle>
              <CardDescription>{t('configure.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input label={t('fields.experienceId')} value={experienceId} onChange={(e) => setExperienceId(e.target.value)} />
                <Input label={t('fields.corpusId')} value={corpusId} onChange={(e) => setCorpusId(e.target.value)} />
                <Input label={t('fields.title')} value={title} onChange={(e) => setTitle(e.target.value)} />
                <Input label={t('fields.host')} value={host} onChange={(e) => setHost(e.target.value)} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text">{t('fields.visibility')}</label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                    className="w-full min-h-[44px] rounded-scholar border border-border bg-surface px-4 py-3 text-text"
                  >
                    <option value="public_indexed">{t('visibility.publicIndexed')}</option>
                    <option value="public_unlisted">{t('visibility.publicUnlisted')}</option>
                    <option value="password_share">{t('visibility.password')}</option>
                    <option value="org_private">{t('visibility.org')}</option>
                    <option value="expiry_share">{t('visibility.expiring')}</option>
                  </select>
                </div>
                <Input
                  label={t('fields.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder={t('fields.passwordPlaceholder')}
                  disabled={visibility !== 'password_share'}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  isLoading={busy === 'compile'}
                  onClick={() =>
                    invoke('compile', '/api/experiences/v1/experiences/compile', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify(compilePayload),
                    })
                  }
                >
                  <Rocket className="h-4 w-4" />
                  {t('actions.compile')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!latestCandidateId}
                  isLoading={busy === 'validate'}
                  onClick={() =>
                    latestCandidateId &&
                    invoke('validate', `/api/experiences/v1/experiences/candidates/${encodeURIComponent(latestCandidateId)}/validate`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({}),
                    })
                  }
                >
                  <ShieldCheck className="h-4 w-4" />
                  {t('actions.validate')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!latestCandidateId}
                  isLoading={busy === 'promote'}
                  onClick={() =>
                    latestCandidateId &&
                    invoke('promote', `/api/experiences/v1/experiences/candidates/${encodeURIComponent(latestCandidateId)}/promote`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({}),
                    })
                  }
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('actions.promote')}
                </Button>
                <Button
                  variant="ghost"
                  isLoading={busy === 'rollback'}
                  onClick={() =>
                    invoke('rollback', `/api/experiences/v1/experiences/publications/${encodeURIComponent(experienceId)}/rollback`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({}),
                    })
                  }
                >
                  <RotateCcw className="h-4 w-4" />
                  {t('actions.rollback')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('status.title')}</CardTitle>
              <CardDescription>{t('status.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {!status ? (
                <div className="flex items-center gap-2 text-text-soft">
                  <Spinner size="sm" />
                  {t('status.loading')}
                </div>
              ) : (
                <>
                  <div className="rounded-scholar border border-border bg-surface-alt p-4">
                    <div className="text-text-soft">{t('status.activeRevision')}</div>
                    <div className="mt-1 font-semibold text-text">{status.active_revision?.active_revision_id || t('status.none')}</div>
                    <div className="mt-2 text-text-soft">{status.active_revision?.host || host}</div>
                  </div>
                  <div className="rounded-scholar border border-border bg-surface-alt p-4">
                    <div className="text-text-soft">{t('status.latestCandidate')}</div>
                    <div className="mt-1 font-semibold text-text">{status.latest_candidate?.status || t('status.none')}</div>
                    <div className="mt-2 text-text-soft">{status.latest_candidate?.candidate_id || '—'}</div>
                  </div>
                  <div className="rounded-scholar border border-border bg-surface-alt p-4">
                    <div className="text-text-soft">{t('status.validation')}</div>
                    <div className="mt-1 font-semibold text-text">{status.latest_candidate?.validation_report?.status || 'pending'}</div>
                    <div className="mt-2 text-text-soft">
                      {status.latest_candidate?.validation_report?.summary
                        ? t('status.validationSummary', {
                            fails: status.latest_candidate.validation_report.summary.fail_count,
                            warnings: status.latest_candidate.validation_report.summary.warning_count,
                          })
                        : t('status.noValidation')}
                    </div>
                  </div>
                  {status.active_revision?.host ? (
                    <a
                      href={`https://${status.active_revision.host}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-accent"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t('actions.openLive')}
                    </a>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t('sharing.title')}</CardTitle>
              <CardDescription>{t('sharing.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  isLoading={busy === 'link'}
                  onClick={async () => {
                    const data = await invoke('link', '/api/experiences/v1/experiences/access/links', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        experience_id: experienceId,
                        host,
                        kind: 'expiring_link',
                        ttl_seconds: 3600,
                      }),
                    });
                    if (data?.redeem_url) setLinkUrl(data.redeem_url);
                  }}
                >
                  <LinkIcon className="h-4 w-4" />
                  {t('actions.issueLink')}
                </Button>
                <Button
                  variant="ghost"
                  isLoading={busy === 'session'}
                  onClick={async () => {
                    const data = await invoke('session', '/api/experiences/v1/experiences/access/session', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        experience_id: experienceId,
                        host,
                        ttl_seconds: 1800,
                      }),
                    });
                    if (data?.redeem_url) window.open(data.redeem_url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {t('actions.openRestrictedPreview')}
                </Button>
              </div>
              {linkUrl ? (
                <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm text-text-soft">
                  <div className="font-semibold text-text">{t('sharing.latestLink')}</div>
                  <a className="mt-2 block break-all text-accent" href={linkUrl} target="_blank" rel="noreferrer">
                    {linkUrl}
                  </a>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('events.title')}</CardTitle>
              <CardDescription>{t('events.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {status?.recent_events?.length ? (
                status.recent_events.map((event) => (
                  <div key={`${event.event_kind}-${event.created_at}`} className="rounded-scholar border border-border bg-surface-alt p-4">
                    <div className="font-semibold text-text">{event.event_kind}</div>
                    <div className="mt-1 text-sm text-text-soft">{new Date(event.created_at).toLocaleString()}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm text-text-soft">
                  {t('events.empty')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {error ? (
          <div className="mt-6 rounded-scholar border border-error/30 bg-error/10 p-4 text-sm text-error">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
