'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Archive, ExternalLink, Link as LinkIcon, Pencil, RefreshCw, Rocket, RotateCcw, ShieldCheck, Wallet } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { PortalDiagnosticsConsole } from '@/components/experiences/PortalDiagnosticsConsole';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { selectRememberedRelatedDocuments, toAnalysisRunSummary } from '@/lib/analysis/runs';
import type { RememberedRelatedDocuments } from '@/types/analysis-runs';
import type { PortalDiagnosticsEnvelope } from '@/lib/portal-diagnostics';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/supabase';

interface ExperiencePublicationPanelProps {
  workspaceId: string;
}

const PRIVATE_MARKETS_TEMPLATE_ID = 'private_markets_obligations_liquidity_workspace';
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
  [PRIVATE_MARKETS_TEMPLATE_ID]: {
    title: 'Private Markets Obligations & Liquidity Workspace',
    subtitleKey: 'subtitle',
    summaryKey: 'summary',
  },
};

type ManualCashPositionRow = Tables<'manual_cash_positions'>;
type ManualCashPositionInsert = TablesInsert<'manual_cash_positions'>;
type ManualCashPositionUpdate = TablesUpdate<'manual_cash_positions'>;

interface ManualCashFormState {
  entityName: string;
  entityKey: string;
  currency: string;
  availableCash: string;
  reserveCash: string;
  effectiveAt: string;
  note: string;
  sourceNote: string;
}

function formatLocalDateTimeInput(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function createManualCashFormState(): ManualCashFormState {
  return {
    entityName: '',
    entityKey: '',
    currency: 'USD',
    availableCash: '',
    reserveCash: '',
    effectiveAt: formatLocalDateTimeInput(),
    note: '',
    sourceNote: '',
  };
}

function normalizeEntityKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCashAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCashAmount(amount: number | null, currency?: string | null) {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || 'USD'} ${amount.toFixed(2)}`;
  }
}

function badgeVariantForCashStatus(status: ManualCashPositionRow['status']): 'default' | 'success' | 'warning' {
  switch (status) {
    case 'active':
      return 'success';
    case 'superseded':
      return 'warning';
    case 'archived':
    default:
      return 'default';
  }
}

export function ExperiencePublicationPanel({ workspaceId }: ExperiencePublicationPanelProps) {
  const t = useTranslations('experiencesPage');
  const toast = useToast();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const documentId = searchParams.get('document_id');
  const analysisTemplateId =
    searchParams.get('analysis_template_id') ||
    searchParams.get('template_id') ||
    REAL_ESTATE_TEMPLATE_ID;
  const templateDefaults = EXPERIENCE_TEMPLATE_DEFAULTS[analysisTemplateId] || EXPERIENCE_TEMPLATE_DEFAULTS[REAL_ESTATE_TEMPLATE_ID];
  const supportsManualCashInputs = analysisTemplateId === PRIVATE_MARKETS_TEMPLATE_ID;
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
  const [manualCashPositions, setManualCashPositions] = useState<ManualCashPositionRow[]>([]);
  const [manualCashForm, setManualCashForm] = useState<ManualCashFormState>(() => createManualCashFormState());
  const [editingCashPositionId, setEditingCashPositionId] = useState<string | null>(null);
  const [cashBusy, setCashBusy] = useState<string | null>(null);
  const includedSourcesLabel = rememberedRelatedDocuments
    ? `${rememberedRelatedDocuments.documentIds.length} related documents from the latest successful analysis`
    : 'Workspace sources are resolved automatically for this publication flow.';

  const loadManualCashPositions = useCallback(async () => {
    setCashBusy((current) => current || 'loading');
    try {
      const { data, error: loadError } = await supabase
        .from('manual_cash_positions')
        .select(
          'id, entity_key, entity_name, currency, available_cash, reserve_cash, effective_at, status, note, source_note, trust_class, updated_at'
        )
        .eq('workspace_id', workspaceId)
        .order('effective_at', { ascending: false })
        .order('updated_at', { ascending: false });

      if (loadError) {
        throw loadError;
      }

      setManualCashPositions((data || []) as ManualCashPositionRow[]);
    } finally {
      setCashBusy((current) => (current === 'loading' ? null : current));
    }
  }, [supabase, workspaceId]);

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
    if (!supportsManualCashInputs) {
      setManualCashPositions([]);
      return;
    }
    loadManualCashPositions().catch((err) => {
      toast.showError(err, 'manual-cash-positions');
    });
  }, [loadManualCashPositions, supportsManualCashInputs, toast]);

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

  const resetManualCashForm = useCallback(() => {
    setEditingCashPositionId(null);
    setManualCashForm(createManualCashFormState());
  }, []);

  const saveManualCashPosition = useCallback(async () => {
    const normalizedEntityName = manualCashForm.entityName.trim();
    const normalizedEntityKey = normalizeEntityKey(manualCashForm.entityKey || normalizedEntityName);
    const availableCash = parseCashAmount(manualCashForm.availableCash);
    const reserveCash = parseCashAmount(manualCashForm.reserveCash);

    if (!normalizedEntityKey) {
      toast.showError(new Error(t('manualCash.validation.entityRequired')), 'manual-cash-positions');
      return;
    }
    if (!manualCashForm.effectiveAt) {
      toast.showError(new Error(t('manualCash.validation.effectiveAtRequired')), 'manual-cash-positions');
      return;
    }
    if (manualCashForm.availableCash.trim() && availableCash == null) {
      toast.showError(new Error(t('manualCash.validation.availableCashInvalid')), 'manual-cash-positions');
      return;
    }
    if (manualCashForm.reserveCash.trim() && reserveCash == null) {
      toast.showError(new Error(t('manualCash.validation.reserveCashInvalid')), 'manual-cash-positions');
      return;
    }

    setCashBusy('save');
    try {
      const payload: ManualCashPositionInsert = {
        workspace_id: workspaceId,
        entity_key: normalizedEntityKey,
        entity_name: normalizedEntityName || null,
        currency: manualCashForm.currency.trim().toUpperCase() || null,
        available_cash: availableCash,
        reserve_cash: reserveCash,
        effective_at: new Date(manualCashForm.effectiveAt).toISOString(),
        note: manualCashForm.note.trim() || null,
        source_note: manualCashForm.sourceNote.trim() || null,
      };

      const query = editingCashPositionId
        ? supabase
            .from('manual_cash_positions')
            .update(payload)
            .eq('id', editingCashPositionId)
            .eq('workspace_id', workspaceId)
        : supabase.from('manual_cash_positions').insert(payload);

      const { error: saveError } = await query;
      if (saveError) {
        throw saveError;
      }

      await loadManualCashPositions();
      resetManualCashForm();
      toast.showSuccess(
        editingCashPositionId ? t('manualCash.toast.updatedTitle') : t('manualCash.toast.createdTitle'),
        t('manualCash.toast.savedBody')
      );
    } catch (err) {
      toast.showError(err, 'manual-cash-positions');
    } finally {
      setCashBusy(null);
    }
  }, [editingCashPositionId, loadManualCashPositions, manualCashForm, resetManualCashForm, supabase, t, toast, workspaceId]);

  const archiveManualCashPosition = useCallback(
    async (row: ManualCashPositionRow) => {
      setCashBusy(row.id);
      try {
        const nextStatus: NonNullable<ManualCashPositionUpdate['status']> =
          row.status === 'archived' ? 'active' : 'archived';
        const { error: updateError } = await supabase
          .from('manual_cash_positions')
          .update({ status: nextStatus })
          .eq('id', row.id)
          .eq('workspace_id', workspaceId);

        if (updateError) {
          throw updateError;
        }

        await loadManualCashPositions();
        if (editingCashPositionId === row.id && nextStatus === 'archived') {
          resetManualCashForm();
        }
        toast.showSuccess(
          nextStatus === 'archived' ? t('manualCash.toast.archivedTitle') : t('manualCash.toast.restoredTitle'),
          t('manualCash.toast.savedBody')
        );
      } catch (err) {
        toast.showError(err, 'manual-cash-positions');
      } finally {
        setCashBusy(null);
      }
    },
    [editingCashPositionId, loadManualCashPositions, resetManualCashForm, supabase, t, toast, workspaceId]
  );

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

        {supportsManualCashInputs ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{t('manualCash.title')}</CardTitle>
                <CardDescription>{t('manualCash.description')}</CardDescription>
              </div>
              <Badge variant="accent" size="sm">
                {t('manualCash.trustClass')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm text-text-soft">
              {t('manualCash.boundary')}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Input
                label={t('manualCash.fields.entityName')}
                value={manualCashForm.entityName}
                onChange={(event) => setManualCashForm((current) => ({ ...current, entityName: event.target.value }))}
                placeholder={t('manualCash.placeholders.entityName')}
              />
              <Input
                label={t('manualCash.fields.entityKey')}
                value={manualCashForm.entityKey}
                onChange={(event) => setManualCashForm((current) => ({ ...current, entityKey: event.target.value }))}
                placeholder={t('manualCash.placeholders.entityKey')}
                hint={t('manualCash.hints.entityKey')}
              />
              <Input
                label={t('manualCash.fields.currency')}
                value={manualCashForm.currency}
                onChange={(event) => setManualCashForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                placeholder={t('manualCash.placeholders.currency')}
              />
              <Input
                label={t('manualCash.fields.effectiveAt')}
                value={manualCashForm.effectiveAt}
                onChange={(event) => setManualCashForm((current) => ({ ...current, effectiveAt: event.target.value }))}
                type="datetime-local"
              />
              <Input
                label={t('manualCash.fields.availableCash')}
                value={manualCashForm.availableCash}
                onChange={(event) => setManualCashForm((current) => ({ ...current, availableCash: event.target.value }))}
                inputMode="decimal"
                placeholder={t('manualCash.placeholders.amount')}
              />
              <Input
                label={t('manualCash.fields.reserveCash')}
                value={manualCashForm.reserveCash}
                onChange={(event) => setManualCashForm((current) => ({ ...current, reserveCash: event.target.value }))}
                inputMode="decimal"
                placeholder={t('manualCash.placeholders.amount')}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="w-full">
                <label className="mb-1.5 block text-sm font-medium text-text">{t('manualCash.fields.note')}</label>
                <textarea
                  value={manualCashForm.note}
                  onChange={(event) => setManualCashForm((current) => ({ ...current, note: event.target.value }))}
                  rows={4}
                  placeholder={t('manualCash.placeholders.note')}
                  className="w-full rounded-scholar border border-border bg-surface px-4 py-3 text-text placeholder:text-text-soft focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)] focus:ring-offset-2 focus:ring-offset-background"
                />
              </div>
              <div className="w-full">
                <label className="mb-1.5 block text-sm font-medium text-text">{t('manualCash.fields.sourceNote')}</label>
                <textarea
                  value={manualCashForm.sourceNote}
                  onChange={(event) => setManualCashForm((current) => ({ ...current, sourceNote: event.target.value }))}
                  rows={4}
                  placeholder={t('manualCash.placeholders.sourceNote')}
                  className="w-full rounded-scholar border border-border bg-surface px-4 py-3 text-text placeholder:text-text-soft focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)] focus:ring-offset-2 focus:ring-offset-background"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button isLoading={cashBusy === 'save'} onClick={() => void saveManualCashPosition()}>
                <Wallet className="h-4 w-4" />
                {editingCashPositionId ? t('manualCash.actions.update') : t('manualCash.actions.create')}
              </Button>
              <Button variant="secondary" disabled={!editingCashPositionId} onClick={resetManualCashForm}>
                <RotateCcw className="h-4 w-4" />
                {t('manualCash.actions.cancelEdit')}
              </Button>
              <Button variant="ghost" isLoading={cashBusy === 'loading'} onClick={() => void loadManualCashPositions()}>
                <RefreshCw className="h-4 w-4" />
                {t('manualCash.actions.refresh')}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-text">{t('manualCash.listTitle')}</div>
              {manualCashPositions.length ? (
                manualCashPositions.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-scholar border border-border bg-surface-alt p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-text">{row.entity_name || row.entity_key}</div>
                          <Badge size="sm" variant={badgeVariantForCashStatus(row.status)}>
                            {t(`manualCash.status.${row.status}`)}
                          </Badge>
                          <Badge size="sm">{row.currency || 'USD'}</Badge>
                        </div>
                        <div className="text-sm text-text-soft">
                          {t('manualCash.rowMeta', {
                            entityKey: row.entity_key,
                            effectiveAt: new Date(row.effective_at).toLocaleString(),
                          })}
                        </div>
                        <div className="grid gap-2 text-sm text-text md:grid-cols-2">
                          <div>{t('manualCash.summary.available', { amount: formatCashAmount(row.available_cash, row.currency) })}</div>
                          <div>{t('manualCash.summary.reserve', { amount: formatCashAmount(row.reserve_cash, row.currency) })}</div>
                        </div>
                        {row.note ? <div className="text-sm text-text-soft">{row.note}</div> : null}
                        {row.source_note ? (
                          <div className="text-xs text-text-soft">{t('manualCash.sourceNoteLabel', { sourceNote: row.source_note })}</div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingCashPositionId(row.id);
                            setManualCashForm({
                              entityName: row.entity_name || '',
                              entityKey: row.entity_key,
                              currency: row.currency || 'USD',
                              availableCash: row.available_cash == null ? '' : String(row.available_cash),
                              reserveCash: row.reserve_cash == null ? '' : String(row.reserve_cash),
                              effectiveAt: formatLocalDateTimeInput(row.effective_at),
                              note: row.note || '',
                              sourceNote: row.source_note || '',
                            });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          {t('manualCash.actions.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          isLoading={cashBusy === row.id}
                          onClick={() => void archiveManualCashPosition(row)}
                        >
                          <Archive className="h-4 w-4" />
                          {row.status === 'archived' ? t('manualCash.actions.restore') : t('manualCash.actions.archive')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-scholar border border-border bg-surface-alt p-4 text-sm text-text-soft">
                  {t('manualCash.empty')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        ) : null}

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
