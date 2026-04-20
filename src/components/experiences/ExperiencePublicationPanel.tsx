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

interface ListingOverlayReadiness {
  ready_to_publish: boolean;
  last_completion_evaluation: {
    missing_required?: string[];
    missing_recommended?: string[];
  } | null;
}

const OPERATIONS_WORKSPACE_TEMPLATE_ID = 'property_operations_workspace';
type SurfaceFamily = 'market' | 'diligence';

const EXPERIENCE_TEMPLATE_DEFAULTS: Record<
  SurfaceFamily,
  {
    slug: string;
    title: string;
    subtitleKey:
      | 'operationsWorkspaceMarketSubtitle'
      | 'operationsWorkspaceDiligenceSubtitle'
      | 'subtitle';
    summaryKey:
      | 'operationsWorkspaceMarketSummary'
      | 'operationsWorkspaceDiligenceSummary'
      | 'summary';
  }
> = {
  market: {
    slug: 'market',
    title: 'Property Market Surface',
    subtitleKey: 'operationsWorkspaceMarketSubtitle',
    summaryKey: 'operationsWorkspaceMarketSummary',
  },
  diligence: {
    slug: 'diligence',
    title: 'Property Diligence Surface',
    subtitleKey: 'operationsWorkspaceDiligenceSubtitle',
    summaryKey: 'operationsWorkspaceDiligenceSummary',
  },
};

export function ExperiencePublicationPanel({ workspaceId }: ExperiencePublicationPanelProps) {
  const t = useTranslations('experiencesPage');
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const documentId = searchParams.get('document_id');
  const analysisTemplateId = OPERATIONS_WORKSPACE_TEMPLATE_ID;
  const workspaceSlug = workspaceId.replace(/-/g, '_');
  const [surfaceFamily, setSurfaceFamily] = useState<SurfaceFamily>('market');
  const templateDefaults = EXPERIENCE_TEMPLATE_DEFAULTS[surfaceFamily];
  const templateSlug = `${analysisTemplateId.replace(/[^a-z0-9_]+/gi, '_').toLowerCase()}_${templateDefaults.slug}`;
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
  const [marketReadiness, setMarketReadiness] = useState<ListingOverlayReadiness | null>(null);
  const includedSourcesLabel = rememberedRelatedDocuments
    ? t('configure.relatedDocumentsCount', { count: rememberedRelatedDocuments.documentIds.length })
    : t('configure.includedSourcesAuto');

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
    let cancelled = false;
    (async () => {
      try {
        const { data, error: overlayError } = await supabase
          .from('property_listing_overlays')
          .select('ready_to_publish,last_completion_evaluation')
          .eq('workspace_id', workspaceId)
          .limit(1)
          .maybeSingle();
        if (cancelled || overlayError) return;
        setMarketReadiness(
          data
            ? {
                ready_to_publish: data.ready_to_publish === true,
                last_completion_evaluation:
                  data.last_completion_evaluation &&
                  typeof data.last_completion_evaluation === 'object'
                    ? (data.last_completion_evaluation as ListingOverlayReadiness['last_completion_evaluation'])
                    : null,
              }
            : null
        );
      } catch {
        if (!cancelled) setMarketReadiness(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, workspaceId]);

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
    setExperienceId(`exp_${workspaceSlug}_${templateSlug}`);
    setCorpusId(`corpus_${workspaceSlug}_${templateSlug}`);
  }, [templateDefaults.title, templateSlug, workspaceSlug]);

  const compilePayload = useMemo(
    () => ({
      workspace_id: workspaceId,
      corpus_id: corpusId,
      experience_id: experienceId,
      template_id: 'document_analysis',
      experience_template_id: 'document_analysis',
      analysis_template_id: analysisTemplateId,
      surface_family: surfaceFamily,
      host,
      visibility,
      password: password || undefined,
      org_restricted: visibility === 'org_private',
      title,
      subtitle: t(`defaults.${templateDefaults.subtitleKey}`),
      summary: t(`defaults.${templateDefaults.summaryKey}`),
    }),
    [
      workspaceId,
      corpusId,
      experienceId,
      analysisTemplateId,
      surfaceFamily,
      host,
      visibility,
      password,
      title,
      t,
      templateDefaults.subtitleKey,
      templateDefaults.summaryKey,
    ]
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
  const missingRequired = marketReadiness?.last_completion_evaluation?.missing_required || [];
  const missingRecommended = marketReadiness?.last_completion_evaluation?.missing_recommended || [];
  const publishBlocked = surfaceFamily === 'market' && marketReadiness !== null && marketReadiness.ready_to_publish === false;
  const workflowSteps = [
    { key: 'prepare', label: t('workflow.prepare'), complete: Boolean(latestCandidateId) },
    {
      key: 'review',
      label: t('workflow.review'),
      complete: Boolean(diagnostics?.candidate?.validation_report || diagnostics?.candidate?.validation_summary),
    },
    { key: 'publish', label: t('workflow.publish'), complete: Boolean(diagnostics?.summary?.live_url) },
    { key: 'customize', label: t('workflow.customize'), complete: Boolean(diagnostics?.customization_strategy || diagnostics?.customization_result) },
    { key: 'monitor', label: t('workflow.monitor'), complete: Boolean(diagnostics?.live_probe) },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />
      <WorkspaceTabs workspaceId={workspaceId} active="marketing" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>{t('configure.title')}</CardTitle>
              <CardDescription>{t('configure.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-scholar border border-border bg-surface-alt p-4">
                <div className="font-semibold text-text">{t('workflow.title')}</div>
                <p className="mt-1 text-sm text-text-soft">{t('workflow.description')}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  {workflowSteps.map((step, index) => (
                    <div key={step.key} className="rounded-xl border border-border bg-surface px-3 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                        {index + 1}
                      </div>
                      <div className="mt-1 font-medium text-text">{step.label}</div>
                      <div className="mt-2 text-xs text-text-soft">
                        {step.complete ? t('workflow.complete') : t('workflow.pending')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {surfaceFamily === 'market' ? (
                <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm">
                  <div className="font-semibold text-text">{t('readiness.title')}</div>
                  <p className="mt-1 text-text-soft">
                    {marketReadiness ? t('readiness.ready') : t('readiness.notLoaded')}
                  </p>
                  {publishBlocked ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border bg-surface p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                          {t('readiness.missingRequired')}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {missingRequired.map((item) => (
                            <span key={item} className="rounded-full border border-border px-2.5 py-1 text-xs text-text">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                      {missingRecommended.length ? (
                        <div className="rounded-xl border border-border bg-surface p-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                            {t('readiness.missingRecommended')}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {missingRecommended.map((item) => (
                              <span key={item} className="rounded-full border border-border px-2.5 py-1 text-xs text-text">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
              {surfaceFamily === 'market' ? (
                <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm">
                  <div className="font-semibold text-text">{t('surfaceFamilies.market')}</div>
                  <p className="mt-1 text-text-soft">{t('configure.description')}</p>
                </div>
              ) : (
                <div className="rounded-scholar border border-dashed border-border bg-surface-alt p-4 text-sm">
                  <div className="font-semibold text-text">{t('surfaceFamilies.diligence')}</div>
                  <p className="mt-1 text-text-soft">{t('advancedSurfacesDescription')}</p>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <Input label={t('fields.experienceId')} value={experienceId} onChange={(e) => setExperienceId(e.target.value)} />
                <Input label={t('fields.title')} value={title} onChange={(e) => setTitle(e.target.value)} />
                <Input label={t('fields.host')} value={host} onChange={(e) => setHost(e.target.value)} />
                <Input label={t('fields.corpusId')} value={corpusId} onChange={(e) => setCorpusId(e.target.value)} />
              </div>
              <details
                className="group rounded-scholar border border-dashed border-border bg-surface-alt p-4"
                onToggle={(e) => {
                  const el = e.currentTarget;
                  if (el.open) {
                    setSurfaceFamily('diligence');
                  } else {
                    setSurfaceFamily('market');
                  }
                }}
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-text marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="underline-offset-4 group-open:underline">{t('advancedSurfacesTitle')}</span>
                  <span className="mt-1 block text-xs font-normal text-text-soft">
                    {t('diligenceAdvancedSummary')}
                  </span>
                </summary>
                <p className="mt-3 text-sm text-text-soft">{t('advancedSurfacesDescription')}</p>
                <p className="mt-3 text-sm font-medium text-text">{t('diligenceAdvancedOpenHint')}</p>
              </details>
              <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm">
                <div className="font-semibold text-text">{t('fields.includedSources')}</div>
                <p className="mt-1 text-text-soft">{includedSourcesLabel}</p>
              </div>
              {analysisTemplateId === OPERATIONS_WORKSPACE_TEMPLATE_ID ? (
                <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm">
                  <div className="font-semibold text-text">{t(`surfaceBoundary.${surfaceFamily}.title`)}</div>
                  <p className="mt-1 text-text-soft">{t(`surfaceBoundary.${surfaceFamily}.description`)}</p>
                  <p className="mt-2 text-text-soft">{t('operationsWorkspace.boundary')}</p>
                </div>
              ) : null}

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
                  disabled={!latestCandidateId || publishBlocked}
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
              </div>
              <details className="rounded-scholar border border-dashed border-border bg-surface-alt p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-text marker:content-none [&::-webkit-details-marker]:hidden">
                  {t('actions.advanced')}
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label={t('fields.experienceId')} value={experienceId} onChange={(e) => setExperienceId(e.target.value)} />
                    <Input label={t('fields.title')} value={title} onChange={(e) => setTitle(e.target.value)} />
                    <Input label={t('fields.host')} value={host} onChange={(e) => setHost(e.target.value)} />
                    <Input label={t('fields.corpusId')} value={corpusId} onChange={(e) => setCorpusId(e.target.value)} />
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
              </details>
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
