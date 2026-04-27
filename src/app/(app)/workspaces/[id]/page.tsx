'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Gauge,
  Home,
  Map,
  MessageSquare,
  Search,
  ShieldCheck,
  TrendingUp,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AskAgentView } from '@/components/ask/AskAgentView';
import { Button, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { cn, formatRelativeTime } from '@/lib/utils';

type AgentScope = {
  kind: 'workspace';
  workspaceId: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  description?: string | null;
  analysis_brief?: string | null;
};

type OpportunityRow = {
  id: string;
  stage?: string | null;
  title?: string | null;
  acquisition_focus?: string | null;
  area_summary?: string | null;
  budget_band?: string | null;
  metadata_json?: Record<string, unknown> | null;
  summary?: string | null;
  missing_info_json?: unknown;
  screening_readiness?: string | null;
  updated_at?: string | null;
};

type AcquisitionEventRow = {
  id: string;
  event_type?: string | null;
  body_text?: string | null;
  created_at?: string | null;
};

type CockpitModule = 'evidence' | 'model' | 'renovation' | 'openItems' | 'comps';

type ScenarioState = {
  price: number;
  renovation: number;
  rent: number;
  vacancy: number;
  hold: number;
  appreciation: number;
};

const moduleIcons: Record<CockpitModule, LucideIcon> = {
  evidence: ShieldCheck,
  model: Gauge,
  renovation: Wrench,
  openItems: ClipboardList,
  comps: BarChart3,
};

const formatSAR = new Intl.NumberFormat('en-SA', {
  style: 'currency',
  currency: 'SAR',
  maximumFractionDigits: 0,
});

function humanize(value: string | null | undefined): string {
  const text = `${value ?? ''}`.trim();
  if (!text) return '';
  return text.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function metadataValue(item: OpportunityRow | null | undefined, keys: string[]): unknown {
  const metadata = item?.metadata_json ?? {};
  for (const key of keys) {
    if (metadata[key] !== undefined && metadata[key] !== null) return metadata[key];
  }
  return undefined;
}

function metadataString(item: OpportunityRow | null | undefined, keys: string[]): string | null {
  const value = metadataValue(item, keys);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function metadataNumber(item: OpportunityRow | null | undefined, keys: string[]): number | null {
  const value = metadataValue(item, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function recommendationFor(item: OpportunityRow | null | undefined): string | null {
  return metadataString(item, ['recommendation', 'decision', 'posture']) ?? item?.stage ?? null;
}

function confidenceFor(item: OpportunityRow | null | undefined): string | null {
  return metadataString(item, ['confidence', 'confidence_label', 'screening_readiness']);
}

function scoreFor(item: OpportunityRow | null | undefined): string | null {
  const score = metadataNumber(item, ['score', 'fit_score', 'mandate_score']);
  return score === null ? null : Math.round(score).toString();
}

function sourceUrlFor(item: OpportunityRow | null | undefined): string | null {
  const raw = metadataString(item, ['source_url', 'listing_url', 'url']);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function photoRefsFor(item: OpportunityRow | null | undefined): string[] {
  const value = metadataValue(item, ['photo_refs', 'photoRefs', 'photos', 'image_urls']);
  const refs = Array.isArray(value) ? value : [];
  return [...new Set(refs
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => /^https?:\/\//i.test(item))
    .filter((item) => !/\.(svg|gif)(?:$|[?#])/i.test(item))
  )].slice(0, 8);
}

function displayUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return value;
  }
}

function titleFor(item: OpportunityRow | null | undefined): string | null {
  return item?.title?.trim() || metadataString(item, ['title', 'name']) || null;
}

function arabicTitleFor(item: OpportunityRow | null | undefined): string | null {
  return metadataString(item, ['ar_label', 'arabic_label', 'arabic_title']);
}

function compactSAR(value: number | null): string | null {
  if (value === null) return null;
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 2)}M SAR`;
  if (value >= 1000) return `${Math.round(value / 1000)}k SAR`;
  return formatSAR.format(value);
}

function dealFacts(item: OpportunityRow | null | undefined): { price: string | null; area: string | null } {
  const price = compactSAR(metadataNumber(item, ['price', 'asking_price', 'acquisition_price', 'purchase_price']));
  const area = metadataNumber(item, ['area_sqm', 'sqm', 'area']);
  return {
    price,
    area: area === null ? item?.area_summary ?? null : `${Math.round(area)} m2`,
  };
}

function missingInfoList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => humanize(String(item))).filter(Boolean);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (typeof item === 'string' && item.trim()) return humanize(item);
      return humanize(key);
    }).filter(Boolean);
  }
  return [];
}

function scenarioFromOpportunity(item: OpportunityRow | null | undefined): ScenarioState | null {
  const price = metadataNumber(item, ['price', 'asking_price', 'acquisition_price', 'purchase_price']);
  const rent = metadataNumber(item, ['monthly_rent', 'rent', 'expected_monthly_rent']);
  if (price === null || rent === null) return null;
  return {
    price,
    renovation: metadataNumber(item, ['renovation_budget', 'capex', 'estimated_capex']) ?? 0,
    rent,
    vacancy: metadataNumber(item, ['vacancy', 'vacancy_rate']) ?? 7,
    hold: metadataNumber(item, ['hold_period', 'hold_years']) ?? 5,
    appreciation: metadataNumber(item, ['appreciation', 'annual_appreciation']) ?? 4,
  };
}

function modelReturns(m: ScenarioState) {
  const equity = m.price * 0.32 + m.renovation;
  const debt = m.price * 0.68;
  const rent = m.rent * 12 * (1 - m.vacancy / 100);
  const cashFlow = rent * 0.82 - debt * 0.071;
  const sale = (m.price + m.renovation * 0.65) * Math.pow(1 + m.appreciation / 100, m.hold);
  const remainingDebt = debt * Math.max(0.72, 1 - m.hold * 0.035);
  const terminal = sale * 0.975 - remainingDebt;
  const profit = cashFlow * m.hold + terminal - equity;
  const irr = Math.pow(Math.max(0.01, (equity + profit) / Math.max(1, equity)), 1 / m.hold) - 1;
  return { equity, cashFlow, irr, coc: cashFlow / Math.max(1, equity) };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function countMissingInfo(opportunities: OpportunityRow[]): number {
  return opportunities.reduce((total, opportunity) => total + missingInfoList(opportunity.missing_info_json).length, 0);
}

export default function WorkspaceCockpitPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const t = useTranslations('workspaceCockpitPage');
  const supabase = useMemo(() => createClient(), []);

  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [events, setEvents] = useState<AcquisitionEventRow[]>([]);
  const [documentCount, setDocumentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<CockpitModule>('model');
  const [scenario, setScenario] = useState<ScenarioState | null>(null);

  const agentScope: AgentScope = { kind: 'workspace', workspaceId };

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [workspaceResult, opportunitiesResult, documentsResult] = await Promise.all([
        supabase.from('workspaces').select('id, name, description, analysis_brief').eq('id', workspaceId).maybeSingle(),
        supabase
          .from('acquisition_opportunities')
          .select('id, stage, title, acquisition_focus, area_summary, budget_band, metadata_json, summary, missing_info_json, screening_readiness, updated_at')
          .eq('workspace_id', workspaceId)
          .neq('stage', 'archived')
          .order('updated_at', { ascending: false })
          .limit(12),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      ]);

      const opportunityRows = (opportunitiesResult.data ?? []) as OpportunityRow[];
      setWorkspace((workspaceResult.data as WorkspaceRow | null) ?? null);
      setOpportunities(opportunityRows);
      setDocumentCount(documentsResult.count ?? 0);
      setSelectedOpportunityId((current) => current ?? opportunityRows[0]?.id ?? null);

      const selectedOpportunityIds = opportunityRows.map((item) => item.id).slice(0, 6);
      if (selectedOpportunityIds.length > 0) {
        const eventsResult = await supabase
          .from('acquisition_events')
          .select('id, event_type, body_text, created_at')
          .in('opportunity_id', selectedOpportunityIds)
          .order('created_at', { ascending: false })
          .limit(8);
        setEvents((eventsResult.data ?? []) as AcquisitionEventRow[]);
      } else {
        setEvents([]);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, workspaceId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const selectedOpportunity = opportunities.find((item) => item.id === selectedOpportunityId) ?? opportunities[0] ?? null;
  const selectedMissing = missingInfoList(selectedOpportunity?.missing_info_json);
  const missingCount = countMissingInfo(opportunities);
  const pursueCount = opportunities.filter((item) => recommendationFor(item) === 'pursue' || item.stage === 'pursue').length;
  const latestUpdate = events[0]?.created_at ?? selectedOpportunity?.updated_at ?? null;

  useEffect(() => {
    setScenario(scenarioFromOpportunity(selectedOpportunity));
  }, [selectedOpportunity?.id]);

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-background text-text dark:bg-[image:var(--console-bg)]">
      <div className={cn('relative flex min-h-0 min-w-0 flex-1 overflow-hidden', agentOpen && 'hidden lg:flex')}>
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_-10%,rgba(var(--highlight-rgb,35,215,255),.12),transparent_36rem),radial-gradient(circle_at_88%_16%,rgba(var(--accent-rgb,185,255,38),.10),transparent_28rem),radial-gradient(circle_at_10%_84%,rgba(255,91,112,.06),transparent_24rem)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[var(--grid-opacity)] [background-image:linear-gradient(var(--grid-color)_1px,transparent_1px),linear-gradient(90deg,var(--grid-color)_1px,transparent_1px)] [background-size:var(--grid-size)_var(--grid-size)]" />

        <aside className="relative hidden h-full w-[360px] shrink-0 overflow-y-auto border-r border-border bg-surface-alt/85 p-6 shadow-[var(--shadowSm)] backdrop-blur xl:block">
          <BrandBlock />
          <BuyBoxCard workspace={workspace} />
          <OpportunityRail
            opportunities={opportunities}
            selectedId={selectedOpportunity?.id ?? null}
            onSelect={setSelectedOpportunityId}
            emptyText={t('emptyCandidates')}
          />
        </aside>

        <main className="relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full w-full max-w-[1760px] flex-col gap-5 p-4 pb-10 lg:p-6 lg:pb-12">
            {loading ? (
              <div className="grid min-h-[520px] place-items-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <div className="grid flex-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
                <section className="min-w-0 space-y-5">
                  <div className="xl:hidden">
                    <OpportunityRail
                      opportunities={opportunities}
                      selectedId={selectedOpportunity?.id ?? null}
                      onSelect={setSelectedOpportunityId}
                      emptyText={t('emptyCandidates')}
                      compact
                    />
                  </div>

                  <CockpitHero
                    opportunity={selectedOpportunity}
                    missingCount={selectedMissing.length}
                    documentCount={documentCount}
                    latestUpdate={latestUpdate}
                  />

                  <div className="grid gap-3 md:grid-cols-4">
                    <MetricCard icon={Search} label={t('candidates')} value={opportunities.length.toString()} />
                    <MetricCard icon={TrendingUp} label={t('pursue')} value={pursueCount.toString()} hot />
                    <MetricCard icon={ClipboardList} label={t('openItems')} value={missingCount.toString()} />
                    <MetricCard icon={BarChart3} label={t('confidence')} value={humanize(confidenceFor(selectedOpportunity)) || t('notSet')} />
                  </div>

                  <ModuleTabs active={activeModule} onChange={setActiveModule} />

                  <div className="min-h-[380px] space-y-5">
                    {activeModule === 'evidence' ? (
                      <EvidenceModule documentCount={documentCount} opportunity={selectedOpportunity} />
                    ) : null}
                    {activeModule === 'model' ? (
                      <ModelModule scenario={scenario} onScenarioChange={setScenario} />
                    ) : null}
                    {activeModule === 'renovation' ? (
                      <RenovationModule opportunity={selectedOpportunity} />
                    ) : null}
                    {activeModule === 'openItems' ? (
                      <OpenItemsModule items={selectedMissing} />
                    ) : null}
                    {activeModule === 'comps' ? (
                      <CompsModule opportunity={selectedOpportunity} />
                    ) : null}
                    <VisualCompanion
                      opportunity={selectedOpportunity}
                      documentCount={documentCount}
                      missingItems={selectedMissing}
                    />
                  </div>
                </section>

                <RightPane
                  activeModule={activeModule}
                  events={events}
                  latestUpdate={latestUpdate}
                  documentCount={documentCount}
                  opportunity={selectedOpportunity}
                  missingItems={selectedMissing}
                  scenario={scenario}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {agentOpen ? (
        <aside className="fixed inset-0 z-50 flex bg-background/60 backdrop-blur-sm lg:static lg:z-auto lg:w-[430px] lg:border-l lg:border-border lg:bg-surface">
          <div className="ml-auto flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl shadow-[color:var(--border)] lg:max-w-none lg:shadow-none">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-text">{t('askZohal')}</p>
                <p className="text-xs text-text-muted">{t('workspaceScope', { id: agentScope.workspaceId })}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAgentOpen(false)} aria-label={t('close')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <AskAgentView workspaceId={workspaceId} workspaceName={workspace?.name ?? undefined} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function BrandBlock() {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="grid h-12 w-12 place-items-center rounded-[14px] border border-accent/30 bg-accent/10 text-xl font-semibold text-accent shadow-[0_0_28px_var(--accent-soft)]">ز</div>
      <div>
        <h1 className="text-lg font-semibold text-text">Zohal</h1>
        <p className="text-xs text-text-muted">{t('brandSubtitle')}</p>
      </div>
    </div>
  );
}

function BuyBoxCard({ workspace }: { workspace: WorkspaceRow | null }) {
  const t = useTranslations('workspaceCockpitPage');
  const brief = workspace?.analysis_brief || workspace?.description || '';
  const briefParts = brief.split(';').map((part) => part.trim()).filter(Boolean);
  return (
    <Panel className="mb-5 p-4" data-testid="acquisition-buy-box">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent/80">{t('buyBoxPinned')}</p>
        <Home className="h-5 w-5 rounded-xl bg-accent/15 p-1 text-accent" />
      </div>
      <div className="space-y-2">
        <MandateRow label={t('buyBox')} value={briefParts[0] || t('notSet')} />
        <MandateRow label={t('targetLocations')} value={briefParts[1] || t('notSet')} />
        <MandateRow label={t('budgetRange')} value={briefParts[2] || t('notSet')} />
        <MandateRow label={t('riskAppetite')} value={briefParts[3] || t('notSet')} />
        <MandateRow label={t('customInstruction')} value={workspace?.description || t('notSet')} />
      </div>
    </Panel>
  );
}

function OpportunityRail({
  opportunities,
  selectedId,
  onSelect,
  emptyText,
  compact = false,
}: {
  opportunities: OpportunityRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyText: string;
  compact?: boolean;
}) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className={cn('p-4', compact && 'overflow-hidden')} data-testid={compact ? 'acquisition-opportunity-rail-compact' : 'acquisition-opportunity-rail'}>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-text-soft">{t('rankedOpportunities')}</p>
        <Building2 className="h-4 w-4 text-accent" />
      </div>
      <div className={cn(compact ? 'flex gap-3 overflow-x-auto pb-1' : 'space-y-3')}>
        {opportunities.length === 0 ? (
          <p className="text-sm leading-6 text-text-muted">{emptyText}</p>
        ) : (
          opportunities.map((item, index) => (
            <button
              key={item.id}
              type="button"
              data-testid="acquisition-opportunity-card"
              onClick={() => onSelect(item.id)}
              className={cn(
                'rounded-[16px] border p-4 text-left transition dark:bg-[#07101A]/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,.055)]',
                compact ? 'min-w-[260px]' : 'w-full',
                selectedId === item.id
                  ? 'border-accent/50 bg-accent/10 shadow-[0_18px_45px_rgba(var(--accent-rgb,185,255,38),.12)]'
                  : 'border-border bg-surface-alt hover:bg-surface dark:hover:border-white/15'
              )}
            >
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-text-muted">#{index + 1} · {humanize(item.stage) || t('notSet')}</p>
                  <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-text">{titleFor(item) || t('untitledOpportunity')}</h3>
                  {arabicTitleFor(item) ? <p className="mt-1 truncate text-xs text-text-soft" dir="rtl">{arabicTitleFor(item)}</p> : null}
                </div>
                <span className="h-fit rounded-2xl border border-accent/25 bg-accent/10 px-2 py-1 font-mono text-xs text-accent">{scoreFor(item) ?? t('notSet')}</span>
              </div>
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-text-muted">{item.summary}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <span className="rounded-2xl bg-black/5 px-3 py-2 text-text dark:bg-black/25">{dealFacts(item).price || t('notSet')}</span>
                <span className="rounded-2xl bg-black/5 px-3 py-2 text-text dark:bg-black/25">{dealFacts(item).area || t('notSet')}</span>
              </div>
              <div className="mt-3 flex justify-between text-xs text-text-soft">
                <span>{humanize(recommendationFor(item)) || t('notSet')}</span>
                <span>{missingInfoList(item.missing_info_json).length} {t('openItemsShort')}</span>
              </div>
              <div className="mt-3 flex gap-1.5">
                <SignalDot hot={Boolean(recommendationFor(item))} />
                <SignalDot hot={Boolean(confidenceFor(item))} />
                <SignalDot hot={missingInfoList(item.missing_info_json).length === 0} warn={missingInfoList(item.missing_info_json).length > 0} />
                <SignalDot hot={Boolean(scoreFor(item))} />
              </div>
            </button>
          ))
        )}
      </div>
    </Panel>
  );
}

function CockpitHero({
  opportunity,
  missingCount,
  documentCount,
  latestUpdate,
}: {
  opportunity: OpportunityRow | null;
  missingCount: number;
  documentCount: number;
  latestUpdate: string | null;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const title = titleFor(opportunity);
  const arTitle = arabicTitleFor(opportunity);
  const facts = dealFacts(opportunity);
  const sourceUrl = sourceUrlFor(opportunity);
  return (
    <Panel className="relative overflow-hidden p-6 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(9,31,32,.92),rgba(8,13,17,.95)_52%,rgba(18,28,17,.92))] dark:shadow-[0_24px_90px_rgba(0,0,0,.42)]" data-testid="acquisition-cockpit-hero">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(var(--highlight-rgb,35,215,255),.14),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(var(--accent-rgb,185,255,38),.14),transparent_30%)]" />
      <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.35fr)_430px] xl:items-center">
        <div className="relative min-w-0">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-accent">{t('selectedWorkspace')}</p>
          <h2 className="max-w-3xl text-4xl font-black leading-[.95] tracking-normal text-text md:text-6xl">
            {title || t('emptyCockpitTitle')}
          </h2>
          {arTitle ? <p className="mt-4 text-xl font-semibold text-text-soft" dir="rtl">{arTitle}</p> : null}
          <div className="mt-7 max-w-3xl border-l-2 border-accent/60 bg-surface/40 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">{t('investmentThesis')}</p>
            <p className="mt-3 text-base leading-7 text-text-soft">
            {opportunity?.summary || (opportunity ? t('heroBody') : t('emptyPosture'))}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <TrustPill label={humanize(recommendationFor(opportunity)) || t('notSet')} tone="amber" />
            <TrustPill label={humanize(confidenceFor(opportunity)) || t('notSet')} tone="cyan" />
            {facts.price ? <TrustPill label={facts.price} tone="slate" /> : null}
            {facts.area ? <TrustPill label={facts.area} tone="slate" /> : null}
            {latestUpdate ? <TrustPill label={formatRelativeTime(latestUpdate)} tone="slate" /> : null}
          </div>
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="acquisition-source-link"
              className="mt-5 inline-flex max-w-full items-center gap-3 rounded-[12px] border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/15"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{t('fetchedListing')}: {displayUrl(sourceUrl)}</span>
            </a>
          ) : null}
        </div>
        <div className="relative grid min-w-0 grid-cols-2 gap-3">
          <HeroChip label={t('mandateFit')} value={humanize(recommendationFor(opportunity)) || t('notSet')} />
          <HeroChip label={t('confidence')} value={humanize(confidenceFor(opportunity)) || t('notSet')} />
          <HeroChip label={t('openItems')} value={missingCount.toString()} />
          <HeroChip label={t('sources')} value={documentCount.toString()} />
          <div className="col-span-2 rounded-[20px] border border-highlight/25 bg-highlight/10 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">{t('acquisitionVector')}</p>
            <div className="mt-5 h-8 rounded-full bg-[linear-gradient(90deg,var(--accent),rgba(var(--highlight-rgb,35,215,255),.55),rgba(255,255,255,.12))] shadow-[0_0_24px_rgba(var(--highlight-rgb,35,215,255),.14)]" />
            <p className="mt-4 text-sm text-text-soft">{t('acquisitionVectorPath')}</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function HeroChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-alt px-3 py-2">
      <p className="text-xs font-medium text-text">{label}</p>
      <p className="mt-1 truncate text-[11px] text-text-muted">{value}</p>
    </div>
  );
}

function ModuleTabs({ active, onChange }: { active: CockpitModule; onChange: (module: CockpitModule) => void }) {
  const t = useTranslations('workspaceCockpitPage.modules');
  const modules: CockpitModule[] = ['evidence', 'model', 'renovation', 'openItems', 'comps'];
  const arLabels: Record<CockpitModule, string> = {
    evidence: 'الأدلة',
    model: 'السيناريوهات',
    renovation: 'التجديد',
    openItems: 'العناصر',
    comps: 'السوق',
  };
  return (
    <div className="flex gap-2 overflow-x-auto rounded-[16px] border border-border bg-surface-alt p-2 dark:bg-[#07101A]/95">
      {modules.map((module) => {
        const Icon = moduleIcons[module];
        const selected = active === module;
        return (
          <button
            key={module}
            type="button"
            onClick={() => onChange(module)}
            className={cn(
              'inline-flex min-h-[54px] min-w-fit items-center gap-2 rounded-[10px] px-4 text-left text-sm font-semibold transition',
              selected ? 'bg-accent text-[color:var(--accent-text)]' : 'text-text-soft hover:bg-surface hover:text-text'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="grid leading-tight">
              <span>{t(module)}</span>
              <span className={cn('text-[11px] font-medium', selected ? 'text-[color:var(--accent-text)] opacity-70' : 'text-text-muted')} dir="rtl">{arLabels[module]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EvidenceModule({ documentCount, opportunity }: { documentCount: number; opportunity: OpportunityRow | null }) {
  const t = useTranslations('workspaceCockpitPage');
  const sourceLabel = metadataString(opportunity, ['source', 'source_label', 'listing_source']);
  const sourceUrl = sourceUrlFor(opportunity);
  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('evidenceLayer')}</p>
        <h3 className="mt-1 text-xl font-semibold text-text">{t('evidenceTruthTitle')}</h3>
        <div className="mt-5 space-y-3">
          <TrustRow label={t('trust.verified')} body={t('sourceDocuments', { count: documentCount })} tone="emerald" />
          <TrustRow label={t('trust.marketSignal')} body={sourceLabel || t('marketSignalEmpty')} tone="cyan" />
          <TrustRow label={t('trust.counterparty')} body={metadataString(opportunity, ['broker_note', 'counterparty_note']) || t('counterpartyEmpty')} tone="amber" />
          <TrustRow label={t('trust.uncertain')} body={missingInfoList(opportunity?.missing_info_json)[0] || t('uncertainEmpty')} tone="rose" />
        </div>
      </Panel>
      <Panel className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('sourceDrawer')}</p>
        <h3 className="mt-2 text-2xl font-semibold text-text">{t('trust.verified')}</h3>
        <p className="mt-3 text-sm leading-6 text-text">{t('evidenceBody')}</p>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="acquisition-evidence-source-link"
            className="mt-5 flex min-w-0 items-center gap-3 rounded-[14px] border border-accent/30 bg-accent/10 p-4 text-left transition hover:border-accent/50 hover:bg-accent/15"
          >
            <ExternalLink className="h-4 w-4 shrink-0 text-accent" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-accent">{t('fetchedListing')}</span>
              <span className="mt-1 block truncate text-sm text-text">{displayUrl(sourceUrl)}</span>
            </span>
          </a>
        ) : null}
        <div className="mt-5 rounded-3xl border border-border bg-surface-alt p-4">
          <p className="text-xs text-text-muted">{t('sources')}</p>
          <p className="mt-1 text-sm text-text">{documentCount}</p>
        </div>
      </Panel>
    </div>
  );
}

function ModelModule({ scenario, onScenarioChange }: { scenario: ScenarioState | null; onScenarioChange: (next: ScenarioState) => void }) {
  const t = useTranslations('workspaceCockpitPage');
  if (!scenario) {
    return (
      <Panel className="grid min-h-[380px] place-items-center p-8 text-center">
        <div>
          <Gauge className="mx-auto h-12 w-12 text-accent" />
          <h3 className="mt-4 text-2xl font-semibold text-text">{t('modelEmptyTitle')}</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-soft">{t('modelEmptyBody')}</p>
        </div>
      </Panel>
    );
  }

  const returns = modelReturns(scenario);
  const set = (key: keyof ScenarioState) => (value: number) => onScenarioChange({ ...scenario, [key]: value });
  return (
    <div className="grid gap-5 [@media(min-width:1780px)]:grid-cols-[0.95fr_1.05fr]">
      <Panel className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('scenarioModeler')}</p>
        <h3 className="mt-1 text-xl font-semibold text-text">{t('modelKnobsTitle')}</h3>
        <div className="mt-5 grid gap-3">
          <ScenarioSlider label={t('acquisitionPrice')} value={scenario.price} min={scenario.price * 0.85} max={scenario.price * 1.12} step={10000} format={(v) => formatSAR.format(v)} onChange={set('price')} />
          <ScenarioSlider label={t('renovationBudget')} value={scenario.renovation} min={0} max={Math.max(100000, scenario.renovation * 2.2)} step={10000} format={(v) => formatSAR.format(v)} onChange={set('renovation')} />
          <ScenarioSlider label={t('monthlyRent')} value={scenario.rent} min={scenario.rent * 0.7} max={scenario.rent * 1.35} step={500} format={(v) => formatSAR.format(v)} onChange={set('rent')} />
          <ScenarioSlider label={t('vacancy')} value={scenario.vacancy} min={0} max={20} step={1} format={(v) => `${v}%`} onChange={set('vacancy')} />
          <ScenarioSlider label={t('holdPeriod')} value={scenario.hold} min={1} max={10} step={1} format={(v) => `${v} ${t('years')}`} onChange={set('hold')} />
          <ScenarioSlider label={t('appreciation')} value={scenario.appreciation} min={0} max={10} step={0.1} format={(v) => `${v.toFixed(1)}%`} onChange={set('appreciation')} />
        </div>
      </Panel>
      <div className="space-y-5">
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <OutputMetric label={t('equityRequired')} value={formatSAR.format(returns.equity)} hot />
          <OutputMetric label={t('annualCashFlow')} value={formatSAR.format(returns.cashFlow)} />
          <OutputMetric label={t('cashOnCash')} value={pct(returns.coc)} />
          <OutputMetric label={t('baseIrr')} value={pct(returns.irr)} hot />
        </div>
        <Panel className="border-accent/20 bg-accent/10 p-5">
          <p className="text-sm leading-6 text-text">
            {t('modelSensitivityNote')}
          </p>
        </Panel>
      </div>
    </div>
  );
}

function RenovationModule({ opportunity }: { opportunity: OpportunityRow | null }) {
  const t = useTranslations('workspaceCockpitPage');
  const capex = metadataNumber(opportunity, ['renovation_budget', 'capex', 'estimated_capex']);
  const condition = metadataString(opportunity, ['condition', 'renovation_scope', 'capex_note']);
  return (
    <Panel className="p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('renovationExposure')}</p>
          <h3 className="mt-1 text-xl font-semibold text-text">{t('renovationScopeTitle')}</h3>
        </div>
        <span className="rounded-2xl border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{t('decisionBlockers')}</span>
      </div>
      <div className="grid gap-3">
        <DecisionBlock icon={Wrench} title={t('capexTitle')} body={capex === null ? t('capexBody') : formatSAR.format(capex)} />
        <DecisionBlock icon={AlertTriangle} title={t('decisionBlockers')} body={condition || t('renovationEmpty')} />
      </div>
      <button className="mt-5 w-full rounded-3xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent hover:bg-accent/15">
        {t('requestQuotePack')}
      </button>
    </Panel>
  );
}

function OpenItemsModule({ items }: { items: string[] }) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className="p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('openItems')}</p>
      <h3 className="mt-1 text-xl font-semibold text-text">{t('openItemsModuleTitle')}</h3>
      <div className="mt-5 overflow-hidden rounded-3xl border border-border">
        {items.length === 0 ? (
          <p className="bg-surface-alt p-4 text-sm text-text-soft">{t('openItemsEmpty')}</p>
        ) : (
          items.map((item, index) => (
            <div key={`${item}-${index}`} className="grid gap-3 border-b border-border bg-surface-alt px-4 py-4 text-sm last:border-b-0 md:grid-cols-[40px_1fr_120px]">
              <p className="font-mono text-xs text-text-muted">#{index + 1}</p>
              <p className="font-medium text-text">{item}</p>
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-center text-xs text-accent">{t('openStatus')}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function CompsModule({ opportunity }: { opportunity: OpportunityRow | null }) {
  const t = useTranslations('workspaceCockpitPage');
  const compsNote = metadataString(opportunity, ['comps_note', 'market_context', 'valuation_note']);
  return (
    <Panel className="p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('marketComps')}</p>
      <h3 className="mt-1 text-xl font-semibold text-text">{t('compsPressureTitle')}</h3>
      <div className="mt-5 rounded-3xl border border-border bg-surface-alt p-4">
        <p className="text-sm leading-6 text-text">{compsNote || t('compsEmpty')}</p>
      </div>
    </Panel>
  );
}

function VisualCompanion({
  opportunity,
  documentCount,
  missingItems,
}: {
  opportunity: OpportunityRow | null;
  documentCount: number;
  missingItems: string[];
}) {
  const t = useTranslations('workspaceCockpitPage');
  const [mode, setMode] = useState<'map' | 'photos' | 'docs' | 'parcel'>('map');
  const title = titleFor(opportunity) || t('emptyCockpitTitle');
  const sourceLabel = metadataString(opportunity, ['source', 'source_label', 'listing_source']);
  const condition = metadataString(opportunity, ['condition', 'renovation_scope', 'capex_note']);
  const facts = dealFacts(opportunity);
  const photoRefs = photoRefsFor(opportunity);
  const modes: { key: typeof mode; label: string }[] = [
    { key: 'map', label: t('visualModes.map') },
    { key: 'photos', label: t('visualModes.photos') },
    { key: 'docs', label: t('visualModes.docs') },
    { key: 'parcel', label: t('visualModes.parcel') },
  ];

  return (
    <Panel className="min-h-[380px] overflow-hidden p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-highlight">{t('visualCompanion')}</p>
          <h3 className="mt-1 text-lg font-semibold text-text">{t('visualCompanionTitle')}</h3>
        </div>
        <Map className="h-5 w-5 text-highlight" />
      </div>

      <div className="mb-4 grid grid-cols-4 gap-1 rounded-[12px] border border-border bg-background/60 p-1">
        {modes.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMode(item.key)}
            className={cn(
              'min-h-9 rounded-[8px] px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition',
              mode === item.key ? 'bg-highlight text-background shadow-[0_0_20px_rgba(var(--highlight-rgb,35,215,255),.18)]' : 'text-text-muted hover:bg-surface-alt hover:text-text'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === 'map' ? (
        <div className="relative min-h-[250px] overflow-hidden rounded-[18px] border border-highlight/20 bg-[#030509]">
          <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(var(--highlight-rgb,35,215,255),.18)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--highlight-rgb,35,215,255),.14)_1px,transparent_1px)] [background-size:34px_34px]" />
          <div className="absolute left-[18%] top-[58%] h-px w-[68%] rotate-[-18deg] bg-accent/70 shadow-[0_0_20px_var(--accent)]" />
          <div className="absolute left-[58%] top-[16%] h-28 w-px rotate-[34deg] bg-highlight/60 shadow-[0_0_20px_var(--highlight)]" />
          <div className="absolute left-[48%] top-[42%] grid h-12 w-12 place-items-center rounded-full border border-accent bg-accent/15 font-mono text-xs font-bold text-accent shadow-[0_0_28px_var(--accent-soft)]">
            {scoreFor(opportunity) ?? '--'}
          </div>
          <div className="absolute bottom-4 left-4 right-4 rounded-[14px] border border-border bg-background/80 p-3 backdrop-blur">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-highlight">{t('activeTarget')}</p>
            <p className="mt-1 text-sm font-semibold text-text">{title}</p>
            <p className="mt-1 text-xs leading-5 text-text-soft">{sourceLabel || t('marketSignalEmpty')}</p>
          </div>
        </div>
      ) : null}

      {mode === 'photos' ? (
        <div className="grid min-h-[250px] gap-3">
          {photoRefs.length > 0 ? (
            <>
              <div className="overflow-hidden rounded-[18px] border border-border bg-background">
                <img
                  src={photoRefs[0]}
                  alt={title}
                  data-testid="acquisition-photo"
                  className="h-64 w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {photoRefs.slice(1, 5).map((photo, index) => (
                  <img
                    key={photo}
                    src={photo}
                    alt={`${title} ${index + 2}`}
                    className="h-20 w-full rounded-[14px] border border-border object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-[18px] border border-border bg-[radial-gradient(circle_at_25%_20%,rgba(var(--highlight-rgb,35,215,255),.18),transparent_32%),linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.02))] p-4">
                <TrustPill label={t('photoEvidence')} tone="cyan" />
                <p className="mt-4 text-sm leading-6 text-text-soft">{condition || t('photosEmpty')}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[t('facade'), t('interior'), t('roof')].map((label) => (
                  <div key={label} className="grid min-h-20 place-items-center rounded-[14px] border border-border bg-surface-alt px-2 text-center text-xs font-medium text-text-muted">
                    {label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}

      {mode === 'docs' ? (
        <div className="space-y-3">
          {[t('sourceDocuments', { count: documentCount }), missingItems[0] || t('uncertainEmpty'), sourceLabel || t('marketSignalEmpty')].map((body, index) => (
            <div key={`${body}-${index}`} className="rounded-[16px] border border-border bg-surface-alt p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">DOC {String(index + 1).padStart(2, '0')}</p>
              <p className="mt-2 text-sm leading-6 text-text">{body}</p>
            </div>
          ))}
        </div>
      ) : null}

      {mode === 'parcel' ? (
        <div className="relative min-h-[250px] overflow-hidden rounded-[18px] border border-border bg-background p-5">
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(var(--grid-color)_1px,transparent_1px),linear-gradient(90deg,var(--grid-color)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative mx-auto mt-6 h-36 w-48 rotate-[-8deg] border-2 border-highlight bg-highlight/10 shadow-[0_0_26px_rgba(var(--highlight-rgb,35,215,255),.20)]" />
          <div className="relative mt-7 rounded-[14px] border border-border bg-surface-alt p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-highlight">{t('parcelSignal')}</p>
            <p className="mt-1 text-sm text-text">{[facts.area, facts.price].filter(Boolean).join(' · ') || t('notSet')}</p>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function RightPane({
  activeModule,
  events,
  latestUpdate,
  documentCount,
  opportunity,
  missingItems,
  scenario,
}: {
  activeModule: CockpitModule;
  events: AcquisitionEventRow[];
  latestUpdate: string | null;
  documentCount: number;
  opportunity: OpportunityRow | null;
  missingItems: string[];
  scenario: ScenarioState | null;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const titleKey = {
    evidence: 'rightPaneTitles.evidence',
    model: 'rightPaneTitles.model',
    renovation: 'rightPaneTitles.renovation',
    openItems: 'rightPaneTitles.openItems',
    comps: 'rightPaneTitles.comps',
  }[activeModule];

  return (
    <aside className="space-y-5">
      <Panel className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">{t('signalStream')}</p>
            <h3 className="mt-1 text-xl font-semibold text-text">{t('liveFeed')}</h3>
          </div>
          <span className="rounded-[8px] border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.16em] text-accent">
            {documentCount} {t('sources')}
          </span>
        </div>

        <div className="mb-5 flex h-20 items-end gap-1 rounded-[14px] border border-border bg-background/50 p-3">
          {Array.from({ length: 28 }).map((_, index) => (
            <span
              key={index}
              className="w-full rounded-t-sm bg-accent/70 shadow-[0_0_10px_rgba(var(--accent-rgb,185,255,38),.18)]"
              style={{ height: `${22 + Math.abs(Math.sin(index * 0.72)) * 58}%` }}
            />
          ))}
        </div>

        <div className="space-y-3">
          <RightPaneRow label={t('trust.marketSignal')} value={metadataString(opportunity, ['comps_note', 'market_context', 'valuation_note']) || t('marketSignalEmpty')} tone="cyan" />
          <RightPaneRow label={t(titleKey)} value={activeModule === 'model' && scenario ? `${t('baseIrr')}: ${pct(modelReturns(scenario).irr)}` : missingItems[0] || t('uncertainEmpty')} tone={missingItems.length > 0 ? 'warn' : 'lime'} />
          <RightPaneRow label={t('trust.verified')} value={t('sourceDocuments', { count: documentCount })} tone="lime" />
          <RightPaneRow label={t('trust.uncertain')} value={missingItems[0] || t('uncertainEmpty')} tone={missingItems.length > 0 ? 'warn' : 'neutral'} />
        </div>
      </Panel>

      <Panel className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">{t('coordinationLog')}</p>
            <h3 className="mt-1 text-xl font-semibold text-text">{t('dealCommandChannel')}</h3>
          </div>
          <MessageSquare className="h-5 w-5 text-accent" />
        </div>
        <p className="mb-3 text-xs text-text-muted">{latestUpdate ? t('latestUpdate', { time: formatRelativeTime(latestUpdate) }) : t('noActivity')}</p>
        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="text-sm leading-6 text-text-soft">{t('emptyLog')}</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="rounded-3xl border border-border bg-surface-alt p-4">
                <div className="mb-2 flex justify-between gap-3">
                  <p className="text-sm font-medium text-text">{humanize(event.event_type)}</p>
                  {event.created_at ? <span className="text-xs text-text-muted">{formatRelativeTime(event.created_at)}</span> : null}
                </div>
                {event.body_text ? <p className="text-sm leading-6 text-text">{event.body_text}</p> : null}
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel className="sticky bottom-5 p-3">
        <button className="w-full rounded-[12px] bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)] shadow-[0_0_22px_var(--accent-soft)] hover:bg-accent-alt" disabled={!opportunity}>
          {t('proceedNegotiate')}
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="rounded-[12px] border border-border bg-surface px-4 py-3 text-sm font-semibold text-text" disabled={!opportunity}>{t('scheduleVisit')}</button>
          <button className="rounded-[12px] border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error" disabled={!opportunity}>{t('pass')}</button>
        </div>
      </Panel>
    </aside>
  );
}

function RightPaneRow({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'lime' | 'cyan' | 'warn' }) {
  const toneClass = {
    neutral: 'border-border bg-surface-alt',
    lime: 'border-accent/20 bg-accent/10',
    cyan: 'border-highlight/20 bg-highlight/10',
    warn: 'border-warning/25 bg-warning/10',
  }[tone];
  return (
    <div className={cn('rounded-[12px] border p-3', toneClass)}>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-sm leading-5 text-text">{value}</p>
    </div>
  );
}

function TrustRow({ label, body, tone }: { label: string; body: string; tone: 'emerald' | 'cyan' | 'amber' | 'rose' }) {
  const styles = {
    emerald: 'border-success/30 bg-success/10 text-success',
    cyan: 'border-highlight/30 bg-highlight/10 text-highlight',
    amber: 'border-accent/30 bg-accent/10 text-accent',
    rose: 'border-error/30 bg-error/10 text-error',
  }[tone];
  return (
    <div className="w-full rounded-[16px] border border-border bg-surface-alt p-4 text-left">
      <span className={cn('rounded-[6px] border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em]', styles)}>{label}</span>
      <p className="mt-3 text-sm leading-6 text-text">{body}</p>
    </div>
  );
}

function ScenarioSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-surface-alt p-4">
      <div className="mb-3 flex justify-between gap-4">
        <p className="text-sm font-medium text-text">{label}</p>
        <span className="rounded-[8px] border border-accent/20 bg-accent/10 px-3 py-1.5 font-mono text-sm text-accent">{format(value)}</span>
      </div>
      <input className="w-full accent-accent" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function OutputMetric({ label, value, hot = false }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={cn('min-w-0 overflow-hidden rounded-[16px] border p-4', hot ? 'border-accent/40 bg-accent/10' : 'border-border bg-surface-alt')}>
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-text-soft">{label}</p>
      <p className="mt-2 min-w-0 overflow-hidden break-words font-mono text-2xl font-semibold leading-tight text-text 2xl:text-3xl">{value}</p>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hot = false }: { icon: LucideIcon; label: string; value: string; hot?: boolean }) {
  return (
    <Panel className={cn('p-4', hot && 'border-accent/25 bg-accent/10')}>
      <Icon className="h-4 w-4 text-accent" />
      <p className="mt-3 truncate text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold text-text">{value}</p>
    </Panel>
  );
}

function DecisionBlock({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-[16px] border border-border bg-surface-alt p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-medium text-text"><Icon className="mr-2 inline h-4 w-4 text-accent" />{title}</p>
          <p className="mt-1 text-sm leading-6 text-text-soft">{body}</p>
        </div>
      </div>
    </div>
  );
}

function MandateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-[10px] bg-surface-alt px-3 py-2 text-xs">
      <span className="text-text-muted">{label}</span>
      <span className="text-right text-text">{value}</span>
    </div>
  );
}

function Panel({
  children,
  className = '',
  ...props
}: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[20px] border border-border bg-surface shadow-2xl shadow-[color:var(--border)] backdrop-blur dark:bg-[image:var(--panel-bg)] dark:shadow-[var(--shadowMd)]', className)}
      {...props}
    >
      {children}
    </div>
  );
}

function SignalDot({ hot, warn = false }: { hot?: boolean; warn?: boolean }) {
  return <span className={cn('h-2.5 w-2.5 rounded-full', hot ? 'bg-success shadow-[0_0_14px_currentColor]' : warn ? 'bg-warning shadow-[0_0_14px_currentColor]' : 'bg-text-muted')} />;
}

function TrustPill({ label, tone }: { label: string; tone: 'amber' | 'cyan' | 'slate' }) {
  const styles = {
    amber: 'border-warning/30 bg-warning/10 text-warning',
    cyan: 'border-highlight/30 bg-highlight/10 text-highlight',
    slate: 'border-border bg-surface-alt text-text',
  }[tone];
  return <span className={cn('rounded-[8px] border px-3 py-1 font-mono text-xs uppercase tracking-[0.08em]', styles)}>{label}</span>;
}
