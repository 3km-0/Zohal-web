'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bolt,
  Building2,
  CheckCircle2,
  ClipboardList,
  FolderOpen,
  Gauge,
  Home,
  MessageSquare,
  PanelsTopLeft,
  Search,
  ShieldCheck,
  Sparkles,
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
};

type OpportunityRow = {
  id: string;
  stage?: string | null;
  metadata_json?: Record<string, unknown> | null;
  summary?: string | null;
  missing_info_json?: unknown;
  updated_at?: string | null;
};

type AcquisitionEventRow = {
  id: string;
  event_type?: string | null;
  body_text?: string | null;
  created_at?: string | null;
};

type CockpitModule = 'evidence' | 'model' | 'renovation' | 'openItems' | 'comps';
type WorkspaceSurface = 'cockpit' | 'sources' | 'automations' | 'livingInterface';

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
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const fromFolderId = searchParams.get('fromFolder');
  const backHref = fromFolderId ? `/workspaces/folders/${encodeURIComponent(fromFolderId)}` : '/workspaces';
  const tCommon = useTranslations('common');
  const t = useTranslations('workspaceCockpitPage');
  const tTabs = useTranslations('workspaceTabs');
  const supabase = useMemo(() => createClient(), []);

  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [events, setEvents] = useState<AcquisitionEventRow[]>([]);
  const [documentCount, setDocumentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [activeSurface, setActiveSurface] = useState<WorkspaceSurface>('cockpit');
  const [activeModule, setActiveModule] = useState<CockpitModule>('model');
  const [scenario, setScenario] = useState<ScenarioState | null>(null);

  const agentScope: AgentScope = { kind: 'workspace', workspaceId };

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [workspaceResult, opportunitiesResult, documentsResult] = await Promise.all([
        supabase.from('workspaces').select('id, name, description').eq('id', workspaceId).maybeSingle(),
        supabase
          .from('acquisition_opportunities')
          .select('id, stage, metadata_json, summary, missing_info_json, updated_at')
          .eq('workspace_id', workspaceId)
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
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[#05070B] text-[#F8FAFC]">
      <div className={cn('relative flex min-w-0 flex-1 overflow-hidden', agentOpen && 'hidden lg:flex')}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_-12%,rgba(20,184,166,0.12),transparent_35%),radial-gradient(circle_at_92%_4%,rgba(15,118,110,0.20),transparent_38%),radial-gradient(circle_at_36%_118%,rgba(94,234,212,0.09),transparent_36%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:52px_52px] opacity-20" />

        <aside className="relative hidden w-[328px] shrink-0 border-r border-[rgba(94,234,212,0.10)] bg-[#061014]/95 p-5 shadow-[inset_-42px_0_90px_rgba(15,118,110,0.16)] xl:block">
          <BrandBlock />
          <BuyBoxCard workspace={workspace} />
          <OpportunityRail
            opportunities={opportunities}
            selectedId={selectedOpportunity?.id ?? null}
            onSelect={setSelectedOpportunityId}
            emptyText={t('emptyCandidates')}
          />
        </aside>

        <main className="relative min-w-0 flex-1 overflow-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-5 p-4 lg:p-6">
            <TopCommandBar
              workspaceId={workspaceId}
              backHref={backHref}
              backLabel={tCommon('back')}
              mandateLabel={t('activeMandateStrip')}
              activeSurface={activeSurface}
              onSurfaceChange={(surface) => {
                setActiveSurface(surface);
                if (surface === 'sources') setActiveModule('evidence');
                if (surface === 'automations') setActiveModule('openItems');
                if (surface === 'livingInterface') setActiveModule('comps');
              }}
              labels={{
                cockpit: tTabs('workspace'),
                sources: tTabs('sources'),
                automations: tTabs('automations'),
                livingInterface: tTabs('publish'),
              }}
              onAsk={() => setAgentOpen(true)}
              askLabel={t('askZohal')}
            />

            {loading ? (
              <div className="grid min-h-[520px] place-items-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <div className="grid flex-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
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

                  <div className="min-h-[380px]">
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
        <aside className="fixed inset-0 z-50 flex bg-black/35 backdrop-blur-sm lg:static lg:z-auto lg:w-[430px] lg:border-l lg:border-white/10 lg:bg-[#070a0f]">
          <div className="ml-auto flex h-full w-full max-w-xl flex-col bg-[#070a0f] shadow-2xl shadow-black/40 lg:max-w-none lg:shadow-none">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">{t('askZohal')}</p>
                <p className="text-xs text-slate-500">{t('workspaceScope', { id: agentScope.workspaceId })}</p>
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
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-xl font-semibold text-amber-100 shadow-[0_0_30px_rgba(251,191,36,0.13)]">ز</div>
      <div>
        <h1 className="text-lg font-semibold text-white">Zohal</h1>
        <p className="text-xs text-slate-500">{t('brandSubtitle')}</p>
      </div>
    </div>
  );
}

function TopCommandBar({
  workspaceId,
  backHref,
  backLabel,
  mandateLabel,
  activeSurface,
  onSurfaceChange,
  labels,
  onAsk,
  askLabel,
}: {
  workspaceId: string;
  backHref: string;
  backLabel: string;
  mandateLabel: string;
  activeSurface: WorkspaceSurface;
  onSurfaceChange: (surface: WorkspaceSurface) => void;
  labels: { cockpit: string; sources: string; automations: string; livingInterface: string };
  onAsk: () => void;
  askLabel: string;
}) {
  const nav = [
    { key: 'cockpit' as const, label: labels.cockpit, icon: Home },
    { key: 'sources' as const, label: labels.sources, icon: FolderOpen },
    { key: 'automations' as const, label: labels.automations, icon: Bolt },
    { key: 'livingInterface' as const, label: labels.livingInterface, icon: PanelsTopLeft },
  ];

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Link href={backHref} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400 lg:block">
          {mandateLabel}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto rounded-full border border-white/10 bg-white/[0.035] p-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = activeSurface === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSurfaceChange(item.key)}
              className={cn(
                'inline-flex min-h-9 min-w-fit items-center gap-2 rounded-full px-3 text-sm font-semibold transition',
                active ? 'bg-[#F5C84C] text-[#05070B] shadow-[0_0_26px_rgba(245,200,76,0.16)]' : 'text-slate-400 hover:bg-white/[0.07] hover:text-white'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAsk}
          className="inline-flex min-h-9 min-w-fit items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/15"
        >
          <Sparkles className="h-4 w-4" />
          {askLabel}
        </button>
      </div>
    </div>
  );
}

function BuyBoxCard({ workspace }: { workspace: WorkspaceRow | null }) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className="mb-5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('buyBoxPinned')}</p>
        <Home className="h-4 w-4 text-amber-200" />
      </div>
      <div className="space-y-2">
        <MandateRow label={t('buyBox')} value={t('notSet')} />
        <MandateRow label={t('targetLocations')} value={t('notSet')} />
        <MandateRow label={t('budgetRange')} value={t('notSet')} />
        <MandateRow label={t('riskAppetite')} value={t('notSet')} />
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
    <Panel className={cn('p-4', compact && 'overflow-hidden')}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('rankedPipeline')}</p>
        <Building2 className="h-4 w-4 text-amber-200" />
      </div>
      <div className={cn(compact ? 'flex gap-3 overflow-x-auto pb-1' : 'space-y-3')}>
        {opportunities.length === 0 ? (
          <p className="text-sm leading-6 text-slate-500">{emptyText}</p>
        ) : (
          opportunities.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                'rounded-3xl border p-4 text-left transition',
                compact ? 'min-w-[260px]' : 'w-full',
                selectedId === item.id
                  ? 'border-amber-300/45 bg-amber-300/[0.09] shadow-[0_0_34px_rgba(251,191,36,0.08)]'
                  : 'border-white/10 bg-white/[0.035] hover:bg-white/[0.06]'
              )}
            >
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500">#{index + 1} · {humanize(item.stage) || t('notSet')}</p>
                  <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-white">{item.summary || humanize(item.stage) || t('untitledOpportunity')}</h3>
                </div>
                <span className="h-fit rounded-2xl border border-white/10 bg-black/25 px-2 py-1 font-mono text-xs text-amber-100">{scoreFor(item) ?? t('notSet')}</span>
              </div>
              <div className="mt-4 flex justify-between text-xs text-slate-400">
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
  return (
    <Panel className="relative overflow-hidden p-5">
      <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-amber-200/80 to-transparent" />
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.24em] text-amber-100/70">{t('selectedWorkspace')}</p>
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            {opportunity?.summary || t('emptyCockpitTitle')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {opportunity ? t('heroBody') : t('emptyPosture')}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <TrustPill label={humanize(recommendationFor(opportunity)) || t('notSet')} tone="amber" />
            <TrustPill label={humanize(confidenceFor(opportunity)) || t('notSet')} tone="cyan" />
            {latestUpdate ? <TrustPill label={formatRelativeTime(latestUpdate)} tone="slate" /> : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:min-w-[420px]">
          <HeroChip label={t('mandateFit')} value={humanize(recommendationFor(opportunity)) || t('notSet')} />
          <HeroChip label={t('confidence')} value={humanize(confidenceFor(opportunity)) || t('notSet')} />
          <HeroChip label={t('openItems')} value={missingCount.toString()} />
          <HeroChip label={t('sources')} value={documentCount.toString()} />
        </div>
      </div>
    </Panel>
  );
}

function HeroChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
      <p className="text-xs font-medium text-white">{label}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{value}</p>
    </div>
  );
}

function ModuleTabs({ active, onChange }: { active: CockpitModule; onChange: (module: CockpitModule) => void }) {
  const t = useTranslations('workspaceCockpitPage.modules');
  const modules: CockpitModule[] = ['evidence', 'model', 'renovation', 'openItems', 'comps'];
  return (
    <div className="flex gap-2 overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.035] p-2">
      {modules.map((module) => {
        const Icon = moduleIcons[module];
        const selected = active === module;
        return (
          <button
            key={module}
            type="button"
            onClick={() => onChange(module)}
            className={cn(
              'inline-flex min-h-[48px] min-w-fit items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition',
              selected ? 'bg-amber-300 text-slate-950' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
            )}
          >
            <Icon className="h-4 w-4" />
            {t(module)}
          </button>
        );
      })}
    </div>
  );
}

function EvidenceModule({ documentCount, opportunity }: { documentCount: number; opportunity: OpportunityRow | null }) {
  const t = useTranslations('workspaceCockpitPage');
  const sourceLabel = metadataString(opportunity, ['source', 'source_label', 'listing_source']);
  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('evidenceLayer')}</p>
        <h3 className="mt-1 text-xl font-semibold text-white">{t('evidenceTruthTitle')}</h3>
        <div className="mt-5 space-y-3">
          <TrustRow label={t('trust.verified')} body={t('sourceDocuments', { count: documentCount })} tone="emerald" />
          <TrustRow label={t('trust.marketSignal')} body={sourceLabel || t('marketSignalEmpty')} tone="cyan" />
          <TrustRow label={t('trust.counterparty')} body={metadataString(opportunity, ['broker_note', 'counterparty_note']) || t('counterpartyEmpty')} tone="amber" />
          <TrustRow label={t('trust.uncertain')} body={missingInfoList(opportunity?.missing_info_json)[0] || t('uncertainEmpty')} tone="rose" />
        </div>
      </Panel>
      <Panel className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('sourceDrawer')}</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">{t('trust.verified')}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-300">{t('evidenceBody')}</p>
        <div className="mt-5 rounded-3xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs text-slate-500">{t('sources')}</p>
          <p className="mt-1 text-sm text-white">{documentCount}</p>
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
          <Gauge className="mx-auto h-12 w-12 text-amber-200" />
          <h3 className="mt-4 text-2xl font-semibold text-white">{t('modelEmptyTitle')}</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">{t('modelEmptyBody')}</p>
        </div>
      </Panel>
    );
  }

  const returns = modelReturns(scenario);
  const set = (key: keyof ScenarioState) => (value: number) => onScenarioChange({ ...scenario, [key]: value });
  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('scenarioModeler')}</p>
        <h3 className="mt-1 text-xl font-semibold text-white">{t('modelKnobsTitle')}</h3>
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
        <div className="grid gap-3 md:grid-cols-2">
          <OutputMetric label={t('equityRequired')} value={formatSAR.format(returns.equity)} hot />
          <OutputMetric label={t('annualCashFlow')} value={formatSAR.format(returns.cashFlow)} />
          <OutputMetric label={t('cashOnCash')} value={pct(returns.coc)} />
          <OutputMetric label={t('baseIrr')} value={pct(returns.irr)} hot />
        </div>
        <Panel className="border-amber-300/20 bg-amber-300/[0.07] p-5">
          <p className="text-sm leading-6 text-amber-50/85">
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
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('renovationExposure')}</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{t('renovationScopeTitle')}</h3>
        </div>
        <span className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{t('decisionBlockers')}</span>
      </div>
      <div className="grid gap-3">
        <DecisionBlock icon={Wrench} title={t('capexTitle')} body={capex === null ? t('capexBody') : formatSAR.format(capex)} />
        <DecisionBlock icon={AlertTriangle} title={t('decisionBlockers')} body={condition || t('renovationEmpty')} />
      </div>
      <button className="mt-5 w-full rounded-3xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100 hover:bg-amber-300/15">
        {t('requestQuotePack')}
      </button>
    </Panel>
  );
}

function OpenItemsModule({ items }: { items: string[] }) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className="p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('openItems')}</p>
      <h3 className="mt-1 text-xl font-semibold text-white">{t('openItemsModuleTitle')}</h3>
      <div className="mt-5 overflow-hidden rounded-3xl border border-white/10">
        {items.length === 0 ? (
          <p className="bg-black/20 p-4 text-sm text-slate-400">{t('openItemsEmpty')}</p>
        ) : (
          items.map((item, index) => (
            <div key={`${item}-${index}`} className="grid gap-3 border-b border-white/10 bg-black/20 px-4 py-4 text-sm last:border-b-0 md:grid-cols-[40px_1fr_120px]">
              <p className="font-mono text-xs text-slate-500">#{index + 1}</p>
              <p className="font-medium text-white">{item}</p>
              <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-center text-xs text-amber-100">{t('openStatus')}</span>
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
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('marketComps')}</p>
      <h3 className="mt-1 text-xl font-semibold text-white">{t('compsPressureTitle')}</h3>
      <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm leading-6 text-slate-300">{compsNote || t('compsEmpty')}</p>
      </div>
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
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t(titleKey)}</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{t('rightPane')}</h3>
          </div>
          <span className="h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
        </div>

        {activeModule === 'evidence' ? (
          <div className="space-y-3">
            <RightPaneRow label={t('sources')} value={String(documentCount)} />
            <RightPaneRow label={t('trust.verified')} value={t('sourceDocuments', { count: documentCount })} />
            <RightPaneRow label={t('trust.uncertain')} value={missingItems[0] || t('uncertainEmpty')} />
          </div>
        ) : null}

        {activeModule === 'model' ? (
          <div className="space-y-3">
            {scenario ? (
              <>
                <RightPaneRow label={t('acquisitionPrice')} value={formatSAR.format(scenario.price)} />
                <RightPaneRow label={t('renovationBudget')} value={formatSAR.format(scenario.renovation)} />
                <RightPaneRow label={t('monthlyRent')} value={formatSAR.format(scenario.rent)} />
              </>
            ) : (
              <p className="text-sm leading-6 text-slate-400">{t('modelEmptyBody')}</p>
            )}
          </div>
        ) : null}

        {activeModule === 'renovation' ? (
          <div className="space-y-3">
            <RightPaneRow label={t('decisionBlockers')} value={missingItems[0] || t('renovationEmpty')} />
            <RightPaneRow label={t('capexTitle')} value={metadataString(opportunity, ['capex_note', 'renovation_scope']) || t('notSet')} />
          </div>
        ) : null}

        {activeModule === 'openItems' ? (
          <div className="space-y-3">
            {missingItems.slice(0, 4).map((item, index) => (
              <RightPaneRow key={`${item}-${index}`} label={`#${index + 1}`} value={item} />
            ))}
            {missingItems.length === 0 ? <p className="text-sm text-slate-400">{t('openItemsEmpty')}</p> : null}
          </div>
        ) : null}

        {activeModule === 'comps' ? (
          <p className="text-sm leading-6 text-slate-400">{metadataString(opportunity, ['comps_note', 'market_context', 'valuation_note']) || t('compsEmpty')}</p>
        ) : null}
      </Panel>

      <Panel className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('coordinationLog')}</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{t('dealCommandChannel')}</h3>
          </div>
          <MessageSquare className="h-4 w-4 text-amber-200" />
        </div>
        <p className="mb-3 text-xs text-slate-500">{latestUpdate ? t('latestUpdate', { time: formatRelativeTime(latestUpdate) }) : t('noActivity')}</p>
        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="text-sm leading-6 text-slate-400">{t('emptyLog')}</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-2 flex justify-between gap-3">
                  <p className="text-sm font-medium text-white">{humanize(event.event_type)}</p>
                  {event.created_at ? <span className="text-xs text-slate-500">{formatRelativeTime(event.created_at)}</span> : null}
                </div>
                {event.body_text ? <p className="text-sm leading-6 text-slate-300">{event.body_text}</p> : null}
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel className="sticky bottom-5 p-3">
        <button className="w-full rounded-3xl bg-emerald-300 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-200" disabled={!opportunity}>
          {t('proceedNegotiate')}
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="rounded-3xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white" disabled={!opportunity}>{t('scheduleVisit')}</button>
          <button className="rounded-3xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm font-semibold text-rose-100" disabled={!opportunity}>{t('pass')}</button>
        </div>
      </Panel>
    </aside>
  );
}

function RightPaneRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm leading-5 text-slate-100">{value}</p>
    </div>
  );
}

function TrustRow({ label, body, tone }: { label: string; body: string; tone: 'emerald' | 'cyan' | 'amber' | 'rose' }) {
  const styles = {
    emerald: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
    cyan: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
    amber: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
    rose: 'border-rose-300/30 bg-rose-300/10 text-rose-100',
  }[tone];
  return (
    <div className="w-full rounded-3xl border border-white/10 bg-black/20 p-4 text-left">
      <span className={cn('rounded-full border px-3 py-1 text-[11px]', styles)}>{label}</span>
      <p className="mt-3 text-sm leading-6 text-slate-100">{body}</p>
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
    <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex justify-between gap-4">
        <p className="text-sm font-medium text-white">{label}</p>
        <span className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 font-mono text-sm text-amber-100">{format(value)}</span>
      </div>
      <input className="w-full accent-amber-300" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function OutputMetric({ label, value, hot = false }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={cn('rounded-3xl border p-4', hot ? 'border-amber-300/40 bg-amber-300/10' : 'border-white/10 bg-black/20')}>
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hot = false }: { icon: LucideIcon; label: string; value: string; hot?: boolean }) {
  return (
    <Panel className={cn('p-4', hot && 'border-amber-300/25 bg-amber-300/[0.07]')}>
      <Icon className="h-4 w-4 text-amber-200" />
      <p className="mt-3 truncate text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold text-white">{value}</p>
    </Panel>
  );
}

function DecisionBlock({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-medium text-white"><Icon className="mr-2 inline h-4 w-4 text-amber-200" />{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">{body}</p>
        </div>
      </div>
    </div>
  );
}

function MandateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-2xl bg-black/20 px-3 py-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-100">{value}</span>
    </div>
  );
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-3xl border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/20 backdrop-blur', className)}>
      {children}
    </div>
  );
}

function SignalDot({ hot, warn = false }: { hot?: boolean; warn?: boolean }) {
  return <span className={cn('h-2.5 w-2.5 rounded-full', hot ? 'bg-emerald-300 shadow-[0_0_14px_currentColor]' : warn ? 'bg-amber-300 shadow-[0_0_14px_currentColor]' : 'bg-slate-600')} />;
}

function TrustPill({ label, tone }: { label: string; tone: 'amber' | 'cyan' | 'slate' }) {
  const styles = {
    amber: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
    cyan: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
    slate: 'border-white/10 bg-white/[0.04] text-slate-300',
  }[tone];
  return <span className={cn('rounded-full border px-3 py-1 text-xs', styles)}>{label}</span>;
}
