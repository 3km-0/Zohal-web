'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ExternalLink, Link as LinkIcon, Rocket, RotateCcw, ShieldCheck } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { PortalDiagnosticsConsole } from '@/components/experiences/PortalDiagnosticsConsole';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { selectRememberedRelatedDocuments, toAnalysisRunSummary } from '@/lib/analysis/runs';
import type { RememberedRelatedDocuments } from '@/types/analysis-runs';
import type { PortalDiagnosticsEnvelope } from '@/lib/portal-diagnostics';

interface ExperiencePublicationPanelProps {
  workspaceId: string;
}

const REAL_ESTATE_TEMPLATE_ID = 'real_estate_portfolio_tracker';

const EXPERIENCE_TEMPLATE_DEFAULTS: Record<
  string,
  {
    title: string;
    subtitleKey: 'assetRadarSubtitle' | 'subtitle';
    summaryKey: 'assetRadarSummary' | 'summary';
  }
> = {
  [REAL_ESTATE_TEMPLATE_ID]: {
    title: 'Asset Radar',
    subtitleKey: 'assetRadarSubtitle',
    summaryKey: 'assetRadarSummary',
  },
};

export function ExperiencePublicationPanel({ workspaceId }: ExperiencePublicationPanelProps) {
  const t = useTranslations('experiencesPage');
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const documentId = searchParams.get('document_id');
  const analysisTemplateId = REAL_ESTATE_TEMPLATE_ID;
  const templateDefaults = EXPERIENCE_TEMPLATE_DEFAULTS[REAL_ESTATE_TEMPLATE_ID];
  const workspaceSlug = workspaceId.replace(/-/g, '_');
  const templateSlug = analysisTemplateId.replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
  const [experienceId, setExperienceId] = useState(`exp_${workspaceSlug}_${templateSlug}`);
  const [corpusId, setCorpusId] = useState(`corpus_${workspaceSlug}_${templateSlug}`);
  const [title, setTitle] = useState(templateDefaults.title);
  const [host, setHost] = useState('live.zohal.ai');
  const [visibility, setVisibility] = useState('public_unlisted');
  const [password, setPassword] = useState('');
  const [diagnosticsEnvelope, setDiagnosticsEnvelope] = useState<PortalDiagnosticsEnvelope | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [rememberedRelatedDocuments, setRememberedRelatedDocuments] = useState<RememberedRelatedDocuments | null>(null);
  const [documentTitlesById, setDocumentTitlesById] = useState<Record<string, string>>({});
  const includedSourcesLabel = rememberedRelatedDocuments
    ? `${rememberedRelatedDocuments.documentIds.length} related documents from the latest successful analysis`
    : 'Workspace sources are resolved automatically for this publication flow.';

  const fetchDiagnostics = useCallback(
    async (options?: { refreshProbe?: boolean; candidateId?: string | null }) => {
      if (!experienceId.trim()) return;
      const url = new URL(
        `/api/experiences/v1/experiences/publications/${encodeURIComponent(experienceId)}/diagnostics`,
        window.location.origin
      );
      if (options?.refreshProbe) url.searchParams.set('refresh_probe', '1');
      if (options?.candidateId) url.searchParams.set('candidate_id', options.candidateId);

      const response = await fetch(url.pathname + url.search);
      const data = (await response.json()) as PortalDiagnosticsEnvelope & { message?: string };
      if (!response.ok) {
        throw new Error(data?.message || t('errors.statusFailed'));
      }
      setDiagnosticsEnvelope(data);
      return data;
    },
    [experienceId, t]
  );

  useEffect(() => {
    fetchDiagnostics().catch((err) => setError(err instanceof Error ? err.message : t('errors.statusFailed')));
    const timer = window.setInterval(() => {
      fetchDiagnostics().catch(() => {});
    }, 10000);
    return () => window.clearInterval(timer);
  }, [fetchDiagnostics, t]);

  useEffect(() => {
    if (!documentId) {
      setRememberedRelatedDocuments(null);
      setDocumentTitlesById({});
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data: runs, error: runsError } = await supabase
          .from('extraction_runs')
          .select('id,status,created_at,updated_at,input_config,output_summary,extraction_type,document_id,workspace_id,user_id,completed_at,error,model,prompt_version,started_at')
          .eq('workspace_id', workspaceId)
          .eq('document_id', documentId)
          .in('extraction_type', ['contract_analysis', 'document_analysis'])
          .order('created_at', { ascending: false })
          .limit(20);
        if (runsError || !runs || cancelled) return;

        const remembered = selectRememberedRelatedDocuments(
          (runs as any[]).map((run) => toAnalysisRunSummary(run)),
          documentId
        );

        if (!remembered) {
          if (!cancelled) {
            setRememberedRelatedDocuments(null);
            setDocumentTitlesById({});
          }
          return;
        }

        const { data: documents } = await supabase
          .from('documents')
          .select('id,title')
          .in('id', remembered.documentIds)
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null);

        if (cancelled) return;

        setRememberedRelatedDocuments(remembered);
        setDocumentTitlesById(
          Object.fromEntries(
            ((documents || []) as Array<{ id: string; title: string | null }>).map((doc) => [
              String(doc.id),
              String(doc.title || doc.id),
            ])
          )
        );
      } catch {
        if (!cancelled) {
          setRememberedRelatedDocuments(null);
          setDocumentTitlesById({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, supabase, workspaceId]);

  useEffect(() => {
    setTitle(templateDefaults.title);
  }, [templateDefaults.title]);

  const compilePayload = useMemo(
    () => ({
      workspace_id: workspaceId,
      corpus_id: corpusId,
      experience_id: experienceId,
      template_id: 'document_analysis',
      experience_template_id: 'document_analysis',
      analysis_template_id: analysisTemplateId,
      host,
      visibility,
      password: password || undefined,
      org_restricted: visibility === 'org_private',
      title,
      subtitle: t(`defaults.${templateDefaults.subtitleKey}`),
      summary: t(`defaults.${templateDefaults.summaryKey}`),
    }),
    [workspaceId, corpusId, experienceId, analysisTemplateId, host, visibility, password, title, t, templateDefaults.subtitleKey, templateDefaults.summaryKey]
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
        if (label === 'promote') {
          if (data?.diagnostics) {
            setDiagnosticsEnvelope((current) =>
              current
                ? { ...current, diagnostics: data.diagnostics }
                : {
                    ok: true,
                    experience_id: experienceId,
                    candidate_id: data?.candidate_id || null,
                    diagnostics: data.diagnostics,
                  }
            );
          } else {
            await fetchDiagnostics({ refreshProbe: true, candidateId: data?.candidate_id || null });
          }
        } else {
          await fetchDiagnostics({ candidateId: data?.candidate_id || null });
        }
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.actionFailed'));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [experienceId, fetchDiagnostics, t]
  );

  const latestCandidateId = diagnosticsEnvelope?.candidate_id || diagnosticsEnvelope?.diagnostics?.candidate?.candidate_id || null;
  const diagnostics = diagnosticsEnvelope?.diagnostics || null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />
      <WorkspaceTabs workspaceId={workspaceId} active="experiences" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>{t('configure.title')}</CardTitle>
              <CardDescription>{t('configure.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rememberedRelatedDocuments ? (
                <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm">
                  <div className="font-semibold text-text">{t('configure.relatedDocumentsTitle')}</div>
                  <p className="mt-1 text-text-soft">{t('configure.relatedDocumentsDescription')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rememberedRelatedDocuments.memberRoles.map((member) => (
                      <span
                        key={member.documentId}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text"
                      >
                        <span>{documentTitlesById[member.documentId] || member.documentId}</span>
                        <span className="text-text-soft">{member.role}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <Input label={t('fields.experienceId')} value={experienceId} onChange={(e) => setExperienceId(e.target.value)} />
                <Input label={t('fields.title')} value={title} onChange={(e) => setTitle(e.target.value)} />
                <Input label={t('fields.host')} value={host} onChange={(e) => setHost(e.target.value)} />
                <Input label={t('fields.corpusId')} value={corpusId} onChange={(e) => setCorpusId(e.target.value)} />
              </div>
              <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm">
                <div className="font-semibold text-text">{t('fields.includedSources')}</div>
                <p className="mt-1 text-text-soft">{includedSourcesLabel}</p>
              </div>
              {analysisTemplateId === REAL_ESTATE_TEMPLATE_ID ? (
                <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm">
                  <div className="font-semibold text-text">{t('assetRadar.title')}</div>
                  <p className="mt-1 text-text-soft">{t('assetRadar.description')}</p>
                  <p className="mt-2 text-text-soft">{t('assetRadar.boundary')}</p>
                </div>
              ) : null}
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
              {diagnostics?.summary.live_url ? (
                <a
                  href={diagnostics.summary.live_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-accent"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('actions.openPortal')}
                </a>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <PortalDiagnosticsConsole
          diagnostics={diagnostics}
          isLoading={busy === 'refresh'}
          onRefresh={() => {
            setBusy('refresh');
            fetchDiagnostics({ refreshProbe: true })
              .catch((err) => setError(err instanceof Error ? err.message : t('errors.statusFailed')))
              .finally(() => setBusy(null));
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle>{t('events.title')}</CardTitle>
            <CardDescription>{t('events.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {diagnostics?.recent_events?.length ? (
              diagnostics.recent_events.map((event) => (
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

        {error ? (
          <div className="rounded-scholar border border-error/30 bg-error/10 p-4 text-sm text-error">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
