'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  ExternalLink,
  Gauge,
  HelpCircle,
  Home,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  PanelRightOpen,
  Pencil,
  Radar,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AskAgentView } from '@/components/ask/AskAgentView';
import { Button, Spinner } from '@/components/ui';
import {
  acquisitionMetadataNumber,
  acquisitionMetadataString,
  acquisitionMetadataValue,
  displayTitleForOpportunity,
  photoRefsForOpportunity,
  progressStepIndexForStage,
  resolvePrimaryAcquisitionAction,
  seedScenarioFromOpportunity,
} from '@/lib/acquisition-workspace-ui';
import { createClient } from '@/lib/supabase/client';
import { cn, formatRelativeTime } from '@/lib/utils';
import { invokeZohalBackendJson } from '@/lib/zohal-backend';

type AgentScope = {
  kind: 'workspace';
  workspaceId: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  description?: string | null;
  analysis_brief?: string | null;
  org_id?: string | null;
  owner_id?: string | null;
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
  renovation_capex_json?: RenovationCapexEstimate | null;
  renovation_capex_updated_at?: string | null;
  renovation_rate_card_id?: string | null;
};

type RenovationCapexLine = {
  name?: string | null;
  category?: string | null;
  category_code?: string | null;
  quantity?: number | null;
  unit?: string | null;
  low_total?: number | null;
  base_total?: number | null;
  high_total?: number | null;
  confidence_score?: number | null;
  quantity_basis?: string | null;
};

type RenovationCapexNotice = {
  type?: string | null;
  label?: string | null;
  message?: string | null;
  description?: string | null;
  suggested_action?: string | null;
  severity?: string | null;
};

type RenovationCapexEstimate = {
  version?: number;
  mode?: string | null;
  pricing_status?: string | null;
  planning_estimate_label?: string | null;
  city?: string | null;
  city_fallback_used?: boolean | null;
  currency?: string | null;
  strategy?: string | null;
  finish_level?: string | null;
  low_total?: number | null;
  base_total?: number | null;
  high_total?: number | null;
  confidence_score?: number | null;
  confidence_label?: string | null;
  rate_card_id?: string | null;
  line_items?: RenovationCapexLine[];
  assumptions?: RenovationCapexNotice[];
  risks?: RenovationCapexNotice[];
  missing_evidence?: RenovationCapexNotice[];
  included_scope?: string[];
  excluded_scope?: string[];
  unknowns?: string[];
  generated_at?: string | null;
};

type RenovationEstimateEventRow = {
  id: string;
  event_type?: string | null;
  low_total?: number | null;
  base_total?: number | null;
  high_total?: number | null;
  confidence_score?: number | null;
  created_at?: string | null;
};

type CapexEstimateResponse = {
  estimate?: RenovationCapexEstimate;
  event?: { event_id?: string; renovation_capex_updated_at?: string } | null;
  explanation?: { summary?: string; next_action?: string };
};

type AcquisitionEventRow = {
  id: string;
  opportunity_id?: string | null;
  event_type?: string | null;
  body_text?: string | null;
  created_at?: string | null;
};

type BuyerReadinessProfileRow = {
  id: string;
  buyer_type?: string | null;
  mandate_summary?: string | null;
  funding_path?: string | null;
  readiness_level?: number | null;
  evidence_status?: string | null;
  sharing_mode?: string | null;
  visit_readiness?: string | null;
  brokerage_status?: string | null;
  kyc_state?: string | null;
  updated_at?: string | null;
};

type BuyerReadinessEvidenceRow = {
  id: string;
  evidence_type?: string | null;
  status?: string | null;
  sensitivity_level?: string | null;
  document_id?: string | null;
  verified_at?: string | null;
  expires_at?: string | null;
};

type DocumentSharingGrantRow = {
  id: string;
  document_id?: string | null;
  share_mode?: string | null;
  allowed_action?: string | null;
  purpose?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
};

type ExternalActionApprovalRow = {
  id: string;
  action_type?: string | null;
  approval_status?: string | null;
  opportunity_id?: string | null;
  executed_at?: string | null;
  created_at?: string | null;
};

type AcquisitionClaimRow = {
  id: string;
  fact_key?: string | null;
  value_json?: Record<string, unknown> | null;
  basis_label?: string | null;
  confidence?: number | null;
  source_channel?: string | null;
  evidence_refs_json?: unknown;
};

type CockpitModule = 'overview' | 'model' | 'openItems' | 'renovation' | 'outreach' | 'offer';
type WorkspaceDrawerTab = 'command' | 'evidence' | 'activity' | 'files' | 'consent' | 'map';
type PrimaryWorkspaceTab = 'overview' | 'underwriting' | 'renovation';

type ScenarioState = {
  strategy: 'rent_hold' | 'flip';
  price: number;
  renovation: number;
  rent: number;
  vacancy: number;
  hold: number;
  appreciation: number;
  ltv: number;
  arv: number;
  financingRate: number;
  refinanceEnabled: boolean;
  refinanceLtv: number;
  refinanceRate: number;
  refinanceYear: number;
  refinanceCost: number;
  targetIrr: number;
};
type NumericScenarioKey = Exclude<keyof ScenarioState, 'strategy' | 'refinanceEnabled'>;

type UnderwritingMetricSet = {
  irr?: number | null;
  cash_on_cash?: number | null;
  equity_multiple?: number | null;
  equity_required?: number | null;
  annual_cash_flow?: number | null;
};

type UnderwritingRun = {
  underwriting_engine_version?: string;
  status?: string;
  summary?: {
    recommendation?: string;
    mandate_fit_score?: number;
    median_irr?: number;
    p10_irr?: number;
    p90_irr?: number;
    probability_target_irr?: number;
    probability_capital_loss?: number;
    median_equity_multiple?: number;
    target_irr?: number;
    capex_overrun_risk?: string;
    current_ask?: number;
    max_bid?: number;
    main_risk?: string;
    next_action?: string;
    missing_assumptions?: string[];
  };
  scenarios?: Array<{
    key: string;
    label: string;
    assumptions?: Record<string, number | string | null>;
    metrics: UnderwritingMetricSet;
  }>;
  monte_carlo?: {
    runs?: number;
    p10_irr?: number;
    p50_irr?: number;
    p90_irr?: number;
    probability_target_irr?: number;
    probability_capital_loss?: number;
    histogram?: Array<{ min_irr: number; max_irr: number; count: number; pct: number }>;
  };
  financing?: {
    ltv_pct?: number | null;
    loan_amount?: number | null;
    equity_required?: number | null;
    annual_debt_service?: number | null;
    debt_service_coverage_ratio?: number | null;
    stabilized_debt_service_coverage_ratio?: number | null;
    after_repair_value?: number | null;
    exit_price?: number | null;
    refinance?: {
      enabled?: boolean;
      year?: number | null;
      valuation?: number | null;
      loan_amount?: number | null;
      payoff_balance?: number | null;
      costs?: number | null;
      net_proceeds?: number | null;
      annual_debt_service?: number | null;
    };
  };
  capex?: {
    low?: number | null;
    base?: number | null;
    high?: number | null;
    source?: string | null;
    pricing_status?: string | null;
    evidence_status?: string | null;
    confidence_score?: number | null;
    overrun_risk_label?: string | null;
    thresholds?: Array<{ key: string; label?: string; amount: number; probability: number }>;
  };
  mandate_fit?: {
    score?: number;
    components?: Array<{ key: string; label: string; score: number; max: number }>;
  };
  renovation_confidence?: {
    score?: number;
    label?: string;
    factors?: Array<{ key: string; label: string; score: number; max: number }>;
  };
  sensitivity?: {
    purchase_price?: Array<{ purchase_price: number; irr: number | null; clears_target?: boolean }>;
    financing_ltv?: Array<{ ltv_pct: number; irr: number | null; equity_required?: number | null; annual_debt_service?: number | null }>;
    financing_rate?: Array<{ financing_rate_pct: number; irr: number | null; annual_debt_service?: number | null }>;
    after_repair_value?: Array<{ after_repair_value: number; irr: number | null; exit_price?: number | null }>;
    tornado?: Array<{ key: string; upside_irr: number | null; downside_irr: number | null; impact: number }>;
  };
  risk_flags?: Array<{ key: string; label: string; level: string; detail: string }>;
  readout?: { investor_summary?: string; disclaimer?: string };
};

type UnderwritingResponse = {
  scenario?: { id?: string; outputs_json?: { underwriting?: UnderwritingRun } };
  underwriting?: UnderwritingRun;
};

type LiveFeedTone = 'lime' | 'cyan' | 'warn' | 'neutral';

type LiveFeedItem = {
  id: string;
  tag: string;
  title: string;
  body: string;
  time?: string | null;
  tone: LiveFeedTone;
};

// Borders and panel chrome for the acquisition workspace use the active
// Zohal palette (editorial / obsidian / cockpit) via CSS variables instead of
// hard-coded obsidian values, so the workspace adopts the same mood as the
// rest of the app.
const cockpitBorder = 'border-border';
const cockpitPanel =
  'bg-[image:var(--panel-bg)] shadow-[var(--shadowMd)] dark:shadow-[0_12px_36px_rgba(0,0,0,.32),inset_0_1px_0_rgba(255,255,255,.04)]';

const moduleIcons: Record<CockpitModule, LucideIcon> = {
  overview: ShieldCheck,
  model: Gauge,
  openItems: ClipboardList,
  renovation: Wrench,
  outreach: Send,
  offer: CheckCircle2,
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
  return acquisitionMetadataValue(item, keys);
}

function metadataString(item: OpportunityRow | null | undefined, keys: string[]): string | null {
  return acquisitionMetadataString(item, keys);
}

function metadataNumber(item: OpportunityRow | null | undefined, keys: string[]): number | null {
  return acquisitionMetadataNumber(item, keys);
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
  return photoRefsForOpportunity(item);
}

function displayUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return value;
  }
}

function coordinateForOpportunity(item: OpportunityRow | null | undefined): { lat: number; lng: number } | null {
  const lat = metadataNumber(item, ['latitude', 'lat', 'location_latitude', 'geo_latitude']);
  const lng = metadataNumber(item, ['longitude', 'lng', 'lon', 'location_longitude', 'geo_longitude']);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function locationLabelForOpportunity(item: OpportunityRow | null | undefined): string | null {
  const direct = metadataString(item, ['formatted_address', 'address', 'full_address', 'location', 'location_name']);
  if (direct) return direct;
  const parts = [
    metadataString(item, ['district', 'neighborhood', 'neighbourhood']),
    metadataString(item, ['city']),
    metadataString(item, ['region', 'province']),
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(', ') : null;
}

function locationQueryForOpportunity(item: OpportunityRow | null | undefined): string | null {
  const direct = locationLabelForOpportunity(item);
  if (direct) {
    return /saudi|السعودية|ksa/i.test(direct) ? direct : `${direct}, Saudi Arabia`;
  }
  const title = titleFor(item);
  return title ? `${title}, Saudi Arabia` : null;
}

function googleMapsSearchUrl(item: OpportunityRow | null | undefined): string | null {
  const coordinate = coordinateForOpportunity(item);
  const query = coordinate ? `${coordinate.lat},${coordinate.lng}` : locationQueryForOpportunity(item);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

function googleMapsEmbedUrl(item: OpportunityRow | null | undefined): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY?.trim();
  if (!key) return null;
  const coordinate = coordinateForOpportunity(item);
  const query = coordinate ? `${coordinate.lat},${coordinate.lng}` : locationQueryForOpportunity(item);
  if (!query) return null;
  const params = new URLSearchParams({
    key,
    q: query,
    zoom: '15',
    maptype: 'roadmap',
  });
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}

function titleFor(item: OpportunityRow | null | undefined): string | null {
  return displayTitleForOpportunity(item);
}

function cleanDisplayText(value: string | null | undefined): string | null {
  const cleaned = `${value ?? ''}`
    .replace(/\.\.\./g, '')
    .replace(/…/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

function investmentThesisFor(item: OpportunityRow | null | undefined, fallback: string): string {
  const summary = `${item?.summary ?? ''}`.trim();
  const weakSummary =
    !summary ||
    /^candidate can be compared against the saved mandate/i.test(summary) ||
    /core visible facts are available for a first screen/i.test(summary);
  return weakSummary ? fallback : summary;
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
  if (price === null) return null;
  const strategy = metadataString(item, ['deal_strategy', 'strategy']) === 'flip' ? 'flip' : 'rent_hold';
  const refinanceEnabledRaw = metadataString(item, ['refinance_enabled', 'refi_enabled']);
  const refinanceEnabled = refinanceEnabledRaw === 'true' || refinanceEnabledRaw === 'yes' || refinanceEnabledRaw === '1';
  return {
    strategy,
    price,
    renovation: item?.renovation_capex_json?.base_total ?? metadataNumber(item, ['renovation_budget', 'capex', 'estimated_capex']) ?? 0,
    rent: rent ?? (strategy === 'flip' ? 0 : Math.max(3500, Math.round(price * 0.0036))),
    vacancy: strategy === 'flip' ? 0 : metadataNumber(item, ['vacancy', 'vacancy_rate']) ?? 7,
    hold: metadataNumber(item, ['hold_period', 'hold_years']) ?? (strategy === 'flip' ? 1 : 5),
    appreciation: metadataNumber(item, ['appreciation', 'annual_appreciation']) ?? 4,
    ltv: metadataNumber(item, ['ltv_pct', 'loan_to_value_pct']) ?? 60,
    arv: metadataNumber(item, ['after_repair_value', 'arv', 'stabilized_value']) ?? 0,
    financingRate: metadataNumber(item, ['financing_rate_pct', 'financing_rate']) ?? 5.5,
    refinanceEnabled: strategy === 'flip' ? false : refinanceEnabled,
    refinanceLtv: metadataNumber(item, ['refinance_ltv_pct', 'refi_ltv_pct']) ?? 65,
    refinanceRate: metadataNumber(item, ['refinance_rate_pct', 'refi_rate_pct']) ?? metadataNumber(item, ['financing_rate_pct', 'financing_rate']) ?? 5.5,
    refinanceYear: metadataNumber(item, ['refinance_year', 'refi_year']) ?? 2,
    refinanceCost: metadataNumber(item, ['refinance_cost_pct', 'refi_cost_pct']) ?? 1,
    targetIrr: metadataNumber(item, ['target_irr_pct', 'target_irr']) ?? 8,
  };
}

function completeScenario(seed: Partial<ScenarioState>): ScenarioState {
  return {
    strategy: seed.strategy ?? 'rent_hold',
    price: seed.price ?? 0,
    renovation: seed.renovation ?? 0,
    rent: seed.rent ?? 0,
    vacancy: seed.vacancy ?? 7,
    hold: seed.hold ?? 5,
    appreciation: seed.appreciation ?? 4,
    ltv: seed.ltv ?? 60,
    arv: seed.arv ?? 0,
    financingRate: seed.financingRate ?? 5.5,
    refinanceEnabled: seed.refinanceEnabled ?? false,
    refinanceLtv: seed.refinanceLtv ?? 65,
    refinanceRate: seed.refinanceRate ?? seed.financingRate ?? 5.5,
    refinanceYear: seed.refinanceYear ?? 2,
    refinanceCost: seed.refinanceCost ?? 1,
    targetIrr: seed.targetIrr ?? 8,
  };
}

function scenarioMetadataForOpportunity(item: OpportunityRow, nextScenario: ScenarioState): Record<string, unknown> {
  return {
    ...(item.metadata_json ?? {}),
    deal_strategy: nextScenario.strategy,
    price: nextScenario.price,
    acquisition_price: nextScenario.price,
    monthly_rent: nextScenario.rent,
    renovation_budget: nextScenario.renovation,
    vacancy: nextScenario.vacancy,
    hold_period: nextScenario.hold,
    appreciation: nextScenario.appreciation,
    ltv_pct: nextScenario.ltv,
    after_repair_value: nextScenario.arv,
    arv: nextScenario.arv,
    financing_rate_pct: nextScenario.financingRate,
    refinance_enabled: nextScenario.refinanceEnabled,
    refinance_ltv_pct: nextScenario.refinanceLtv,
    refinance_rate_pct: nextScenario.refinanceRate,
    refinance_year: nextScenario.refinanceYear,
    refinance_cost_pct: nextScenario.refinanceCost,
    target_irr_pct: nextScenario.targetIrr,
  };
}

function modelReturns(m: ScenarioState) {
  const ltv = Math.max(0, Math.min(85, m.ltv)) / 100;
  const equity = m.price * (1 - ltv) + m.renovation;
  const debt = m.price * ltv;
  const rent = m.rent * 12 * (1 - m.vacancy / 100);
  const debtService = debt * (m.financingRate / 100 + 0.018);
  const cashFlow = m.strategy === 'flip' ? -debtService : rent * 0.82 - debtService;
  const saleBasis = m.arv > 0 ? m.arv : m.price;
  const sale = saleBasis * Math.pow(1 + m.appreciation / 100, m.hold);
  const remainingDebt = debt * Math.max(0.72, 1 - m.hold * 0.035);
  const terminal = sale * 0.975 - remainingDebt;
  const profit = cashFlow * m.hold + terminal - equity;
  const irr = Math.pow(Math.max(0.01, (equity + profit) / Math.max(1, equity)), 1 / m.hold) - 1;
  return { equity, cashFlow, irr, coc: cashFlow / Math.max(1, equity) };
}

function modelExit(m: ScenarioState) {
  const debt = m.price * Math.max(0, Math.min(85, m.ltv)) / 100;
  const saleBasis = m.arv > 0 ? m.arv : m.price;
  const sale = saleBasis * Math.pow(1 + m.appreciation / 100, m.hold);
  const remainingDebt = debt * Math.max(0.72, 1 - m.hold * 0.035);
  return { netSale: sale * 0.975, remainingDebt, terminalEquity: sale * 0.975 - remainingDebt };
}

function cashFlowProjection(m: ScenarioState) {
  return Array.from({ length: Math.max(1, Math.round(m.hold)) }, (_, index) => {
    const year = index + 1;
    const yearScenario = { ...m, rent: m.rent * Math.pow(1 + 0.018, index) };
    const projected = modelReturns(yearScenario).cashFlow;
    return { year, value: projected };
  });
}

function sensitivityScenarios(m: ScenarioState) {
  return [
    { key: 'downside', label: 'downside', scenario: { ...m, rent: m.rent * 0.92, vacancy: Math.min(24, m.vacancy + 5), appreciation: Math.max(0, m.appreciation - 1.5), renovation: m.renovation * 1.12 } },
    { key: 'base', label: 'base', scenario: m },
    { key: 'upside', label: 'upside', scenario: { ...m, rent: m.rent * 1.07, vacancy: Math.max(0, m.vacancy - 2), appreciation: m.appreciation + 1.25, renovation: m.renovation * 0.96 } },
  ].map((item) => ({ ...item, returns: modelReturns(item.scenario) }));
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function countMissingInfo(opportunities: OpportunityRow[]): number {
  return opportunities.reduce((total, opportunity) => total + missingInfoList(opportunity.missing_info_json).length, 0);
}

function activeGrantCount(grants: DocumentSharingGrantRow[]): number {
  const now = Date.now();
  return grants.filter((grant) => {
    if (grant.revoked_at) return false;
    if (!grant.expires_at) return true;
    const expires = Date.parse(grant.expires_at);
    return !Number.isFinite(expires) || expires > now;
  }).length;
}

function statusTone(value: string | null | undefined): 'neutral' | 'lime' | 'cyan' | 'warn' {
  switch (value) {
    case 'verified':
    case 'approved':
    case 'active':
    case 'signed':
    case 'brokerage_ready':
    case 'executed':
      return 'lime';
    case 'pending':
    case 'partially_verified':
    case 'self_declared':
    case 'basic_verified':
      return 'cyan';
    case 'restricted':
    case 'escalated':
    case 'rejected':
    case 'revoked':
    case 'expired':
      return 'warn';
    default:
      return 'neutral';
  }
}

export default function WorkspaceCockpitPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const headerProgressSlotId = `workspace-header-progress-${workspaceId}`;
  const t = useTranslations('workspaceCockpitPage');
  const supabase = useMemo(() => createClient(), []);

  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [events, setEvents] = useState<AcquisitionEventRow[]>([]);
  const [claims, setClaims] = useState<AcquisitionClaimRow[]>([]);
  const [readinessProfile, setReadinessProfile] = useState<BuyerReadinessProfileRow | null>(null);
  const [readinessEvidence, setReadinessEvidence] = useState<BuyerReadinessEvidenceRow[]>([]);
  const [sharingGrants, setSharingGrants] = useState<DocumentSharingGrantRow[]>([]);
  const [actionApprovals, setActionApprovals] = useState<ExternalActionApprovalRow[]>([]);
  const [documentCount, setDocumentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<CockpitModule>('model');
  const [activePrimaryTab, setActivePrimaryTab] = useState<PrimaryWorkspaceTab>('overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(430);
  const [heroMapOpen, setHeroMapOpen] = useState(false);
  const [scenario, setScenario] = useState<ScenarioState | null>(null);
  const [underwriting, setUnderwriting] = useState<UnderwritingRun | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [readinessBusy, setReadinessBusy] = useState(false);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [underwritingBusy, setUnderwritingBusy] = useState(false);
  const [capexBusy, setCapexBusy] = useState(false);
  const [capexError, setCapexError] = useState<string | null>(null);
  const [renovationEvents, setRenovationEvents] = useState<RenovationEstimateEventRow[]>([]);
  const [buyBoxEditorOpen, setBuyBoxEditorOpen] = useState(false);
  const [buyBoxDraft, setBuyBoxDraft] = useState('');
  const [buyBoxSaving, setBuyBoxSaving] = useState(false);

  const agentScope: AgentScope = { kind: 'workspace', workspaceId };

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [workspaceResult, opportunitiesResult, documentsResult, profileResult] = await Promise.all([
        supabase.from('workspaces').select('id, name, description, analysis_brief, org_id, owner_id').eq('id', workspaceId).maybeSingle(),
        supabase
          .from('acquisition_opportunities')
          .select('id, stage, title, acquisition_focus, area_summary, budget_band, metadata_json, summary, missing_info_json, screening_readiness, updated_at, renovation_capex_json, renovation_capex_updated_at, renovation_rate_card_id')
          .eq('workspace_id', workspaceId)
          .neq('stage', 'archived')
          .order('updated_at', { ascending: false })
          .limit(12),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabase
          .from('buyer_readiness_profiles')
          .select('id, buyer_type, mandate_summary, funding_path, readiness_level, evidence_status, sharing_mode, visit_readiness, brokerage_status, kyc_state, updated_at')
          .eq('workspace_id', workspaceId)
          .order('updated_at', { ascending: false })
          .limit(1),
      ]);

      const opportunityRows = (opportunitiesResult.data ?? []) as OpportunityRow[];
      const profileRows = (profileResult.data ?? []) as BuyerReadinessProfileRow[];
      const currentReadinessProfile = profileRows[0] ?? null;
      setWorkspace((workspaceResult.data as WorkspaceRow | null) ?? null);
      setOpportunities(opportunityRows);
      setReadinessProfile(currentReadinessProfile);
      setDocumentCount(documentsResult.count ?? 0);
      setSelectedOpportunityId((current) => current ?? opportunityRows[0]?.id ?? null);

      const approvalsPromise = supabase
        .from('external_action_approvals')
        .select('id, action_type, approval_status, opportunity_id, executed_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(12);

      if (currentReadinessProfile) {
        const [evidenceResult, grantsResult, approvalsResult] = await Promise.all([
          supabase
            .from('buyer_readiness_evidence')
            .select('id, evidence_type, status, sensitivity_level, document_id, verified_at, expires_at')
            .eq('profile_id', currentReadinessProfile.id)
            .order('created_at', { ascending: false })
            .limit(8),
          supabase
            .from('document_sharing_grants')
            .select('id, document_id, share_mode, allowed_action, purpose, expires_at, revoked_at')
            .eq('buyer_profile_id', currentReadinessProfile.id)
            .order('created_at', { ascending: false })
            .limit(8),
          approvalsPromise,
        ]);
        setReadinessEvidence((evidenceResult.data ?? []) as BuyerReadinessEvidenceRow[]);
        setSharingGrants((grantsResult.data ?? []) as DocumentSharingGrantRow[]);
        setActionApprovals((approvalsResult.data ?? []) as ExternalActionApprovalRow[]);
      } else {
        const approvalsResult = await approvalsPromise;
        setReadinessEvidence([]);
        setSharingGrants([]);
        setActionApprovals((approvalsResult.data ?? []) as ExternalActionApprovalRow[]);
      }

      const selectedOpportunityIds = opportunityRows.map((item) => item.id).slice(0, 6);
      if (selectedOpportunityIds.length > 0) {
        const eventsResult = await supabase
          .from('acquisition_events')
          .select('id, opportunity_id, event_type, body_text, created_at')
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
  const brokerageActive = readinessProfile?.brokerage_status === 'signed' || readinessProfile?.brokerage_status === 'active';
  const currentBlocker = !readinessProfile
    ? t('progress.nextReadiness')
    : selectedMissing.length > 0
      ? t('progress.nextDiligence')
      : !brokerageActive
        ? t('progress.nextBrokerage')
        : t('progress.nextOffer');
  const hasActionBlocker = !readinessProfile || selectedMissing.length > 0 || !brokerageActive;
  const primaryAction = resolvePrimaryAcquisitionAction({
    opportunity: selectedOpportunity,
    hasReadinessProfile: Boolean(readinessProfile),
    brokerageActive,
    activeFinancingConsentCount: activeGrantCount(sharingGrants),
  });

  useEffect(() => {
    const stored = window.localStorage.getItem('acquisition_workspace_drawer_width');
    if (!stored) return;
    const parsed = Number(stored);
    if (Number.isFinite(parsed)) setDrawerWidth(Math.min(Math.max(parsed, 340), Math.min(window.innerWidth * 0.75, 760)));
  }, []);

  useEffect(() => {
    window.localStorage.setItem('acquisition_workspace_drawer_width', String(Math.round(drawerWidth)));
  }, [drawerWidth]);

  useEffect(() => {
    setScenario(scenarioFromOpportunity(selectedOpportunity));
    setUnderwriting(null);
  }, [selectedOpportunity]);

  useEffect(() => {
    let cancelled = false;
    async function loadUnderwriting() {
      if (!selectedOpportunity?.id) {
        setUnderwriting(null);
        return;
      }
      const { data } = await supabase
        .from('acquisition_scenarios')
        .select('outputs_json')
        .eq('opportunity_id', selectedOpportunity.id)
        .eq('scenario_kind', 'base')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const output = (data?.outputs_json as { underwriting?: UnderwritingRun } | null)?.underwriting ?? null;
      if (!cancelled) setUnderwriting(output);
    }
    void loadUnderwriting();
    return () => {
      cancelled = true;
    };
  }, [selectedOpportunity?.id, supabase]);

  useEffect(() => {
    let cancelled = false;
    async function loadClaims() {
      if (!selectedOpportunity?.id) {
        setClaims([]);
        return;
      }
      const { data } = await supabase
        .from('acquisition_claims')
        .select('id, fact_key, value_json, basis_label, confidence, source_channel, evidence_refs_json')
        .eq('opportunity_id', selectedOpportunity.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!cancelled) setClaims((data ?? []) as AcquisitionClaimRow[]);
    }
    void loadClaims();
    return () => {
      cancelled = true;
    };
  }, [selectedOpportunity?.id, supabase]);

  useEffect(() => {
    let cancelled = false;
    async function loadRenovationEvents() {
      if (!selectedOpportunity?.id) {
        setRenovationEvents([]);
        return;
      }
      const { data } = await supabase
        .from('renovation_estimate_events')
        .select('id, event_type, low_total, base_total, high_total, confidence_score, created_at')
        .eq('acquisition_opportunity_id', selectedOpportunity.id)
        .order('created_at', { ascending: false })
        .limit(8);
      if (!cancelled) setRenovationEvents((data ?? []) as RenovationEstimateEventRow[]);
    }
    void loadRenovationEvents();
    return () => {
      cancelled = true;
    };
  }, [selectedOpportunity?.id, supabase]);

  const openDrawer = useCallback((tab: WorkspaceDrawerTab) => {
    window.dispatchEvent(new CustomEvent('workspace:header-menu-close'));
    if (tab === 'files') {
      const sourceParams = new URLSearchParams({ view: 'property_sources' });
      if (selectedOpportunity?.id) sourceParams.set('opportunity_id', selectedOpportunity.id);
      router.push(`/workspaces/${encodeURIComponent(workspaceId)}/sources?${sourceParams.toString()}`);
      return;
    }
    if (tab === 'consent') {
      const sourceParams = new URLSearchParams({ view: 'buyer_vault', intent: 'consent' });
      router.push(`/workspaces/${encodeURIComponent(workspaceId)}/sources?${sourceParams.toString()}`);
      return;
    }
    setDrawerOpen(true);
  }, [router, selectedOpportunity?.id, workspaceId]);

  useEffect(() => {
    function onHeaderMenuOpen() {
      setDrawerOpen(false);
    }
    window.addEventListener('workspace:header-menu-open', onHeaderMenuOpen);
    return () => window.removeEventListener('workspace:header-menu-open', onHeaderMenuOpen);
  }, []);

  useEffect(() => {
    function onOpenCommandDrawer(event: Event) {
      const tab = (event as CustomEvent<{ tab?: WorkspaceDrawerTab }>).detail?.tab;
      if (tab === 'evidence' || tab === 'activity' || tab === 'files' || tab === 'consent') {
        openDrawer(tab);
      }
    }
    window.addEventListener('workspace:open-command-drawer', onOpenCommandDrawer);
    return () => window.removeEventListener('workspace:open-command-drawer', onOpenCommandDrawer);
  }, [openDrawer]);

  const openBuyerVault = useCallback((upload = false) => {
    const sourceParams = new URLSearchParams({ view: 'buyer_vault', intent: 'readiness' });
    if (upload) sourceParams.set('upload', '1');
    router.push(`/workspaces/${encodeURIComponent(workspaceId)}/sources?${sourceParams.toString()}`);
  }, [router, workspaceId]);

  const openPropertyFiles = useCallback((options: { upload?: boolean; analysisPolicy?: string } = {}) => {
    const sourceParams = new URLSearchParams({ view: 'property_sources' });
    if (options.upload) sourceParams.set('upload', '1');
    if (options.analysisPolicy) sourceParams.set('analysis_policy', options.analysisPolicy);
    if (selectedOpportunity?.id) sourceParams.set('opportunity_id', selectedOpportunity.id);
    router.push(`/workspaces/${encodeURIComponent(workspaceId)}/sources?${sourceParams.toString()}`);
  }, [router, selectedOpportunity?.id, workspaceId]);

  const openBuyBoxEditor = useCallback(() => {
    setBuyBoxDraft(workspace?.analysis_brief || workspace?.description || '');
    setBuyBoxEditorOpen(true);
  }, [workspace]);

  const saveBuyBox = useCallback(async () => {
    const nextBrief = buyBoxDraft.trim();
    setBuyBoxSaving(true);
    setApprovalError(null);
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ analysis_brief: nextBrief || null })
        .eq('id', workspaceId);
      if (error) throw error;
      setWorkspace((current) => current ? { ...current, analysis_brief: nextBrief || null } : current);
      setBuyBoxEditorOpen(false);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : t('buyBoxSaveError'));
    } finally {
      setBuyBoxSaving(false);
    }
  }, [buyBoxDraft, supabase, t, workspaceId]);

  const requestExternalAction = useCallback(async (actionType: string, draftPayload: Record<string, string> = {}) => {
    setApprovalBusy(actionType);
    setApprovalError(null);
    try {
      const { data, error } = await supabase
        .from('external_action_approvals')
        .insert({
          workspace_id: workspaceId,
          opportunity_id: selectedOpportunity?.id ?? null,
          buyer_profile_id: readinessProfile?.id ?? null,
          action_type: actionType,
          draft_payload_json: {
            source: 'web_acquisition_cockpit',
            opportunity_title: selectedOpportunity ? titleFor(selectedOpportunity) || selectedOpportunity.summary || selectedOpportunity.id : workspace?.name || workspaceId,
            ...draftPayload,
          },
          approval_status: 'pending',
        })
        .select('id, action_type, approval_status, opportunity_id, executed_at, created_at')
        .single();
      if (error) throw error;
      setActionApprovals((current) => [data as ExternalActionApprovalRow, ...current]);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : t('approvalRequestError'));
    } finally {
      setApprovalBusy(null);
    }
  }, [readinessProfile, selectedOpportunity, supabase, t, workspace?.name, workspaceId]);

  const scheduleVisit = useCallback(async () => {
    if (!selectedOpportunity) return;
    setApprovalBusy('schedule_visit');
    setApprovalError(null);
    try {
      const response = await fetch('/google-calendar/acquisition-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          opportunity_id: selectedOpportunity.id,
          title: `Property visit: ${titleFor(selectedOpportunity) || selectedOpportunity.summary || workspace?.name || 'Acquisition opportunity'}`,
          description: selectedOpportunity.summary || workspace?.analysis_brief || workspace?.description || null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || t('approvalRequestError'));
      setOpportunities((current) => current.map((item) => item.id === selectedOpportunity.id ? { ...item, stage: 'visit_requested', updated_at: new Date().toISOString() } : item));
      if (json?.html_link) window.open(String(json.html_link), '_blank', 'noopener,noreferrer');
      await loadWorkspace();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : t('approvalRequestError'));
    } finally {
      setApprovalBusy(null);
    }
  }, [loadWorkspace, selectedOpportunity, t, workspace, workspaceId]);

  const startReadiness = useCallback(async () => {
    setReadinessBusy(true);
    setApprovalError(null);
    try {
      const mandateSummary = workspace?.analysis_brief || workspace?.description || workspace?.name || null;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('buyer_readiness_profiles')
        .insert({
          workspace_id: workspaceId,
          buyer_user_id: user?.id ?? workspace?.owner_id ?? null,
          organization_id: workspace?.org_id ?? null,
          buyer_type: 'individual',
          mandate_summary: mandateSummary,
          readiness_level: mandateSummary ? 1 : 0,
          evidence_status: 'self_declared',
          sharing_mode: 'private',
          brokerage_status: 'not_started',
          kyc_state: 'not_started',
          metadata_json: { source: 'web_acquisition_cockpit' },
        })
        .select('id, buyer_type, mandate_summary, funding_path, readiness_level, evidence_status, sharing_mode, visit_readiness, brokerage_status, kyc_state, updated_at')
        .single();
      if (error) throw error;
      setReadinessProfile(data as BuyerReadinessProfileRow);
      openBuyerVault(true);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : t('buyerReadiness.startError'));
    } finally {
      setReadinessBusy(false);
    }
  }, [openBuyerVault, supabase, t, workspace, workspaceId]);

  const saveScenarioAssumptions = useCallback(async (nextScenario: ScenarioState) => {
    if (!selectedOpportunity) return;
    setScenarioBusy(true);
    try {
      const metadata = scenarioMetadataForOpportunity(selectedOpportunity, nextScenario);
      const { error } = await supabase
        .from('acquisition_opportunities')
        .update({ metadata_json: metadata })
        .eq('id', selectedOpportunity.id);
      if (error) throw error;
      setOpportunities((current) => current.map((item) => item.id === selectedOpportunity.id ? { ...item, metadata_json: metadata } : item));
      setScenario(nextScenario);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : t('scenarioSaveError'));
    } finally {
      setScenarioBusy(false);
    }
  }, [selectedOpportunity, supabase, t]);

  const applyRenovationEstimateToDeal = useCallback(async (amount: number) => {
    const base = scenario ?? completeScenario(seedScenarioFromOpportunity(selectedOpportunity));
    await saveScenarioAssumptions({ ...base, renovation: amount });
    setActivePrimaryTab('underwriting');
  }, [saveScenarioAssumptions, scenario, selectedOpportunity]);

  const resetScenarioDraft = useCallback(() => {
    const reset = completeScenario(seedScenarioFromOpportunity(selectedOpportunity));
    setScenario(reset);
    setUnderwriting(null);
    setApprovalError(null);
  }, [selectedOpportunity]);

  const runUnderwriting = useCallback(async (nextScenario: ScenarioState) => {
    if (!selectedOpportunity) return;
    setUnderwritingBusy(true);
    setApprovalError(null);
    try {
      const metadata = scenarioMetadataForOpportunity(selectedOpportunity, nextScenario);
      const { error: saveError } = await supabase
        .from('acquisition_opportunities')
        .update({ metadata_json: metadata })
        .eq('id', selectedOpportunity.id);
      if (saveError) throw saveError;
      setOpportunities((current) => current.map((item) => item.id === selectedOpportunity.id ? { ...item, metadata_json: metadata } : item));

      const response = await invokeZohalBackendJson<UnderwritingResponse>(
        supabase,
        `/api/acquisition/v1/opportunities/${selectedOpportunity.id}/underwriting-run`,
        {
          mode: 'quick',
          save: true,
          target_irr_pct: nextScenario.targetIrr,
          deal_strategy: nextScenario.strategy,
          investment_strategy: nextScenario.strategy,
          ltv_pct: nextScenario.ltv,
          financing_rate_pct: nextScenario.financingRate,
          after_repair_value: nextScenario.arv,
          arv: nextScenario.arv,
          refinance_enabled: nextScenario.refinanceEnabled,
          refinance_ltv_pct: nextScenario.refinanceLtv,
          refinance_rate_pct: nextScenario.refinanceRate,
          refinance_year: nextScenario.refinanceYear,
          refinance_cost_pct: nextScenario.refinanceCost,
          assumptions: {
            deal_strategy: nextScenario.strategy,
            purchase_price: nextScenario.price,
            acquisition_price: nextScenario.price,
            monthly_rent: nextScenario.rent,
            renovation: nextScenario.renovation,
            vacancy_pct: nextScenario.vacancy,
            hold_period_years: nextScenario.hold,
            exit_growth_pct: nextScenario.appreciation,
            ltv_pct: nextScenario.ltv,
            financing_rate_pct: nextScenario.financingRate,
            after_repair_value: nextScenario.arv,
            arv: nextScenario.arv,
            refinance_enabled: nextScenario.refinanceEnabled,
            refinance_ltv_pct: nextScenario.refinanceLtv,
            refinance_rate_pct: nextScenario.refinanceRate,
            refinance_year: nextScenario.refinanceYear,
            refinance_cost_pct: nextScenario.refinanceCost,
            target_irr_pct: nextScenario.targetIrr,
          },
        },
      );
      setUnderwriting(response.underwriting ?? response.scenario?.outputs_json?.underwriting ?? null);
      setScenario(nextScenario);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : t('underwritingRunError'));
    } finally {
      setUnderwritingBusy(false);
    }
  }, [selectedOpportunity, supabase, t]);

  const generateCapexEstimate = useCallback(async (input: {
    strategy: string;
    finish_level: string;
    user_notes: string;
  }) => {
    if (!selectedOpportunity) return;
    setCapexBusy(true);
    setCapexError(null);
    try {
      const response = await invokeZohalBackendJson<CapexEstimateResponse>(
        supabase,
        `/api/acquisition/v1/opportunities/${selectedOpportunity.id}/capex-estimate`,
        {
          strategy: input.strategy,
          finish_level: input.finish_level,
          user_notes: input.user_notes,
          save: true,
        },
      );
      const estimate = response.estimate ?? {};
      setOpportunities((current) => current.map((item) => item.id === selectedOpportunity.id
        ? {
            ...item,
            renovation_capex_json: estimate,
            renovation_capex_updated_at: response.event?.renovation_capex_updated_at ?? new Date().toISOString(),
            renovation_rate_card_id: estimate.rate_card_id ?? null,
          }
        : item));
      if (response.event?.event_id) {
        setRenovationEvents((current) => [{
          id: response.event?.event_id ?? crypto.randomUUID(),
          event_type: 'generated',
          low_total: estimate.low_total,
          base_total: estimate.base_total,
          high_total: estimate.high_total,
          confidence_score: estimate.confidence_score,
          created_at: new Date().toISOString(),
        }, ...current].slice(0, 8));
      }
    } catch (error) {
      setCapexError(error instanceof Error ? error.message : t('capexGenerateError'));
    } finally {
      setCapexBusy(false);
    }
  }, [selectedOpportunity, supabase, t]);

  const updateSelectedStage = useCallback(async (stage: string) => {
    if (!selectedOpportunity) return;
    setApprovalBusy(`stage:${stage}`);
    try {
      const { error } = await supabase
        .from('acquisition_opportunities')
        .update({ stage })
        .eq('id', selectedOpportunity.id);
      if (error) throw error;
      setOpportunities((current) => current.map((item) => item.id === selectedOpportunity.id ? { ...item, stage, updated_at: new Date().toISOString() } : item));
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : t('approvalRequestError'));
    } finally {
      setApprovalBusy(null);
    }
  }, [selectedOpportunity, supabase, t]);

  const executePrimaryAction = useCallback(async () => {
    if (!selectedOpportunity && primaryAction.action_id !== 'add_listing_evidence') return;
    switch (primaryAction.action_id) {
      case 'add_listing_evidence': {
        openPropertyFiles({ upload: true });
        return;
      }
      case 'upload_financing_document':
        if (!readinessProfile) {
          await startReadiness();
        } else {
          openBuyerVault(true);
        }
        return;
      case 'request_missing_documents':
        await requestExternalAction('send_outreach', {
          acquisition_action_id: 'request_missing_documents',
          request_kind: 'missing_documents',
          requested_items: selectedMissing.join(', '),
        });
        return;
      case 'schedule_visit':
        await scheduleVisit();
        return;
      case 'request_contractor_evaluation':
        await requestExternalAction('send_outreach', {
          acquisition_action_id: 'request_contractor_evaluation',
          request_kind: 'contractor_evaluation',
        });
        return;
      case 'upload_property_document': {
        openPropertyFiles({ upload: true, analysisPolicy: 'acquisition_property' });
        return;
      }
      case 'activate_buyer_broker':
        await requestExternalAction('send_outreach', {
          acquisition_action_id: 'activate_buyer_broker',
          request_kind: 'brokerage_authority',
        });
        return;
      case 'share_financing_packet':
        await requestExternalAction('share_readiness_signal', {
          acquisition_action_id: 'share_financing_packet',
          consent_required: 'true',
          disclaimer: 'Zohal records readiness evidence only and does not underwrite creditworthiness.',
        });
        return;
      case 'prepare_offer':
      case 'send_offer':
        await requestExternalAction('send_offer', { acquisition_action_id: primaryAction.action_id });
        return;
      case 'pass_property':
        await updateSelectedStage('passed');
        return;
      case 'close_property':
        await updateSelectedStage('closed');
        return;
      default:
        await requestExternalAction('send_negotiation_message', { acquisition_action_id: primaryAction.action_id });
    }
  }, [
    openBuyerVault,
    openPropertyFiles,
    primaryAction.action_id,
    readinessProfile,
    requestExternalAction,
    scheduleVisit,
    selectedMissing,
    selectedOpportunity,
    startReadiness,
    updateSelectedStage,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-[image:var(--console-bg)] bg-background text-text">
      {!loading ? (
        <HeaderProgressPortal targetId={headerProgressSlotId}>
          <ProgressTracker
            opportunity={selectedOpportunity}
            missingItems={selectedMissing}
            readinessProfile={readinessProfile}
            brokerageActive={brokerageActive}
            onOpenDrawer={openDrawer}
            onRequestVisit={() => void scheduleVisit()}
            compact
          />
        </HeaderProgressPortal>
      ) : null}
      <div className={cn('relative flex min-h-0 min-w-0 flex-1 overflow-hidden', agentOpen && 'hidden lg:flex')}>
        <div className="pointer-events-none absolute inset-0 bg-[image:var(--console-bg)]" />
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_-10%,rgba(var(--highlight-rgb),.04),transparent_36rem),radial-gradient(circle_at_88%_16%,rgba(var(--accent-rgb),.055),transparent_28rem),radial-gradient(circle_at_10%_84%,rgba(var(--highlight-rgb),.035),transparent_24rem)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[var(--grid-opacity)] [background-image:linear-gradient(var(--grid-color)_1px,transparent_1px),linear-gradient(90deg,var(--grid-color)_1px,transparent_1px)] [background-size:var(--grid-size)_var(--grid-size)]" />

        <aside className="relative hidden h-full w-[328px] shrink-0 overflow-y-auto border-r border-border bg-[image:var(--panel-bg)] bg-surface p-5 shadow-[var(--shadowSm)] backdrop-blur xl:block">
          <BrandBlock />
          <BuyBoxCard
            workspace={workspace}
            onEdit={openBuyBoxEditor}
            onSource={() => void requestExternalAction('send_outreach', { request_kind: 'mandate_sourcing', mandate: workspace?.analysis_brief || workspace?.description || workspace?.name || '' })}
            onOpenAgent={() => setAgentOpen(true)}
          />
          <OpportunityRail
            opportunities={opportunities}
            selectedId={selectedOpportunity?.id ?? null}
            onSelect={setSelectedOpportunityId}
            emptyText={t('emptyCandidates')}
            candidateCount={opportunities.length}
            pursueCount={pursueCount}
          />
        </aside>

        <main className="relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto flex min-h-full w-full max-w-[1840px] flex-col gap-5 p-4 pb-10 lg:p-6 lg:pb-12">
            {loading ? (
              <div className="grid min-h-[520px] place-items-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <section className="min-w-0 flex-1 space-y-5">
                <div className="xl:hidden">
                  <OpportunityRail
                    opportunities={opportunities}
                    selectedId={selectedOpportunity?.id ?? null}
                    onSelect={setSelectedOpportunityId}
                    emptyText={t('emptyCandidates')}
                    candidateCount={opportunities.length}
                    pursueCount={pursueCount}
                    compact
                  />
                </div>

                <div className="xl:hidden">
                  <ProgressTracker
                    opportunity={selectedOpportunity}
                    missingItems={selectedMissing}
                    readinessProfile={readinessProfile}
                    brokerageActive={brokerageActive}
                    onOpenDrawer={openDrawer}
                    onRequestVisit={() => void scheduleVisit()}
                  />
                </div>

                <div className="min-h-[380px] space-y-5">
                  <CockpitHero
                    opportunity={selectedOpportunity}
                    missingCount={selectedMissing.length}
                    documentCount={documentCount}
                    latestUpdate={latestUpdate}
                    mapOpen={heroMapOpen}
                    onToggleMap={() => setHeroMapOpen((open) => !open)}
                    onOpenDrawer={openDrawer}
                  />
                  <PrimaryWorkspaceTabs
                    active={activePrimaryTab}
                    onChange={setActivePrimaryTab}
                  />
                  {activePrimaryTab === 'overview' ? (
                    <OverviewModule
                      documentCount={documentCount}
                      opportunity={selectedOpportunity}
                      claims={claims}
                      openItems={missingCount}
                      confidence={humanize(confidenceFor(selectedOpportunity)) || t('notSet')}
                      primaryActionLabel={primaryAction.label}
                      primaryActionResult={primaryAction.result}
                      currentBlocker={currentBlocker}
                      hasActionBlocker={hasActionBlocker}
                      actionBusy={Boolean(readinessBusy || approvalBusy)}
                      onPrimaryAction={() => void executePrimaryAction()}
                      onAddEvidence={() => openPropertyFiles({ upload: true })}
                      onUploadPropertyDocument={() => openPropertyFiles({ upload: true, analysisPolicy: 'acquisition_property' })}
                      onOpenBuyerVault={() => openBuyerVault(true)}
                      onScheduleVisit={() => void scheduleVisit()}
                      onPassProperty={() => void updateSelectedStage('passed')}
                      onOpenDrawer={openDrawer}
                    />
                  ) : activePrimaryTab === 'underwriting' ? (
                    <ModelModule
                      opportunity={selectedOpportunity}
                      scenario={scenario}
                      underwriting={underwriting}
                      saving={scenarioBusy}
                      running={underwritingBusy}
                      onScenarioChange={setScenario}
                      onSave={saveScenarioAssumptions}
                      onResetDraft={resetScenarioDraft}
                      onRunUnderwriting={runUnderwriting}
                    />
                  ) : activePrimaryTab === 'renovation' ? (
                    <RenovationTab
                      opportunity={selectedOpportunity}
                      scenario={scenario}
                      underwriting={underwriting}
                      saving={scenarioBusy}
                      generating={capexBusy}
                      error={capexError}
                      events={renovationEvents}
                      onGenerateEstimate={generateCapexEstimate}
                      onApplyEstimate={applyRenovationEstimateToDeal}
                      onEditDealAssumptions={() => setActivePrimaryTab('underwriting')}
                      onRequestQuote={() => void requestExternalAction('send_outreach', { request_kind: 'quote_pack' })}
                    />
                  ) : null}
                </div>
              </section>
            )}
          </div>
        </main>

        {!loading ? (
          <LiveFeedRail
            events={events}
            latestUpdate={latestUpdate}
            opportunity={selectedOpportunity}
            missingItems={selectedMissing}
            openItems={missingCount}
            confidence={humanize(confidenceFor(selectedOpportunity)) || t('notSet')}
            primaryActionResult={primaryAction.result}
            hasActionBlocker={hasActionBlocker}
          />
        ) : null}

          {drawerOpen ? (
            <WorkspaceCommandDrawer
              workspaceId={workspaceId}
              width={drawerWidth}
              documentCount={documentCount}
              opportunity={selectedOpportunity}
              missingItems={selectedMissing}
              claims={claims}
              onClose={() => setDrawerOpen(false)}
              onWidthChange={setDrawerWidth}
            />
          ) : (
              <button
              type="button"
              onClick={() => openDrawer('evidence')}
              className="absolute bottom-6 right-6 z-30 inline-flex rounded-[14px] border border-accent/30 bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)] shadow-[0_0_28px_var(--accent-soft)] min-[1440px]:hidden"
            >
              <PanelRightOpen className="mr-2 h-4 w-4" />
              {t('openEvidencePane')}
            </button>
          )}
	      </div>

      {agentOpen ? (
        <aside className="fixed inset-0 z-50 flex bg-background/60 backdrop-blur-sm lg:static lg:z-auto lg:w-[430px] lg:border-l lg:border-[rgba(var(--accent-rgb),0.16)] lg:bg-surface">
          <div className="ml-auto flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl shadow-[color:var(--border)] lg:max-w-none lg:shadow-none">
            <div className="flex items-center justify-between border-b border-[rgba(var(--accent-rgb),0.16)] px-4 py-3">
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
      {buyBoxEditorOpen ? (
        <BuyBoxEditorModal
          value={buyBoxDraft}
          saving={buyBoxSaving}
          onChange={setBuyBoxDraft}
          onSave={saveBuyBox}
          onClose={() => setBuyBoxEditorOpen(false)}
        />
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

function HeaderProgressPortal({ targetId, children }: { targetId: string; children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById(targetId));
  }, [targetId]);

  return target ? createPortal(children, target) : null;
}

function BuyBoxCard({
  workspace,
  onEdit,
  onSource,
  onOpenAgent,
}: {
  workspace: WorkspaceRow | null;
  onEdit: () => void;
  onSource: () => void;
  onOpenAgent: () => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const brief = workspace?.analysis_brief || workspace?.description || '';
  const briefParts = brief.split(';').map((part) => part.trim()).filter(Boolean);
  const isOpen = expanded || hovered;
  const compactMandate = [
    briefParts[2] ? `${t('budgetRange')}: ${briefParts[2]}` : null,
    briefParts[1] ? `${t('targetLocations')}: ${briefParts[1]}` : null,
    briefParts[3] ? `${t('riskAppetite')}: ${briefParts[3]}` : null,
  ].filter((item): item is string => Boolean(item));
  return (
    <Panel
      className={cn('mb-5 overflow-hidden p-3 transition-all duration-200', isOpen ? 'shadow-[var(--shadowMd)]' : 'shadow-[var(--shadowSm)]')}
      data-testid="acquisition-buy-box"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false);
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={isOpen}
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent/80">{t('buyBoxPinned')}</p>
          <p className="mt-1 truncate text-sm font-semibold text-text">{briefParts[0] || t('notSet')}</p>
          {!isOpen ? (
            <p className="mt-1 truncate text-xs text-text-muted">
              {(compactMandate.length ? compactMandate : [t('notSet')]).join(' · ')}
            </p>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="grid h-8 w-8 place-items-center rounded-[10px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface text-text-soft transition hover:bg-surface-alt hover:text-text"
            aria-label={isOpen ? t('collapseMandate') : t('expandMandate')}
            aria-expanded={isOpen}
          >
            <ChevronDown className={cn('h-4 w-4 transition', isOpen && 'rotate-180')} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="grid h-8 w-8 place-items-center rounded-[10px] border border-accent/25 bg-accent/10 text-accent transition hover:bg-accent/15"
            aria-label={t('editBuyBox')}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
      {isOpen ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-3 py-3 text-sm font-semibold leading-5 text-text">
            {briefParts[0] || t('notSet')}
          </div>
          <div className="grid gap-1.5">
            {(compactMandate.length ? compactMandate : [t('notSet')]).map((item) => (
              <p key={item} className="truncate text-xs text-text-soft">{item}</p>
            ))}
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={onSource}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-accent px-3 py-2 text-sm font-bold text-[color:var(--accent-text)] shadow-[0_0_18px_var(--accent-soft)] transition hover:bg-accent-alt"
            >
              <Radar className="h-4 w-4" />
              {t('sourceDeals')}
            </button>
            <button
              type="button"
              onClick={onOpenAgent}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface px-3 py-2 text-sm font-semibold text-text transition hover:bg-surface-alt"
            >
              <MessageSquare className="h-4 w-4" />
              {t('openSourcingAgent')}
            </button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function BuyBoxEditorModal({
  value,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-[20px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface p-5 shadow-2xl shadow-black/35">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">{t('editBuyBox')}</p>
            <h3 className="mt-1 text-xl font-semibold text-text">{t('editBuyBoxTitle')}</h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">{t('editBuyBoxHint')}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={7}
          className="w-full resize-y rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-background p-3 text-sm leading-6 text-text outline-none ring-accent/30 focus:ring-2"
          placeholder={t('editBuyBoxPlaceholder')}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? t('savingAssumptions') : t('saveBuyBox')}</Button>
        </div>
      </div>
    </div>
  );
}

function OpportunityRail({
  opportunities,
  selectedId,
  onSelect,
  emptyText,
  candidateCount,
  pursueCount,
  compact = false,
}: {
  opportunities: OpportunityRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyText: string;
  candidateCount: number;
  pursueCount: number;
  compact?: boolean;
}) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className={cn('p-4', compact && 'overflow-hidden')} data-testid={compact ? 'acquisition-opportunity-rail-compact' : 'acquisition-opportunity-rail'}>
      <div className={cn('flex items-start justify-between gap-3', compact ? 'mb-4' : 'mb-5')}>
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-text-soft">{t('rankedOpportunities')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-2.5 py-1 text-[11px] font-semibold text-text-soft">
              {candidateCount} {t('candidates')}
            </span>
            <span className="rounded-full border border-accent/22 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
              {pursueCount} {t('pursue')}
            </span>
          </div>
        </div>
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      </div>
      <div className={cn(compact ? 'flex gap-3 overflow-x-auto pb-1' : 'space-y-4')}>
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
                'relative rounded-[28px] border text-left transition dark:bg-[linear-gradient(180deg,rgba(18,26,21,.84),rgba(8,12,10,.90))] dark:shadow-[inset_0_1px_0_rgba(var(--accent-rgb),.055)]',
                compact ? 'min-w-[260px] p-4' : 'min-h-[238px] w-full p-6',
                selectedId === item.id
                  ? 'border-[rgba(var(--accent-rgb),0.52)] bg-[rgba(var(--accent-rgb),0.075)] shadow-[0_0_0_1px_rgba(var(--accent-rgb),.16),0_20px_48px_rgba(var(--accent-rgb),.11)]'
                  : 'border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt/70 hover:border-[rgba(var(--accent-rgb),0.26)] hover:bg-surface'
              )}
            >
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn('text-text-muted', compact ? 'text-[11px]' : 'text-sm')}>#{index + 1} · {humanize(item.stage) || t('notSet')}</p>
                  <h3 className={cn('mt-2 line-clamp-2 font-semibold text-text', compact ? 'text-sm' : 'text-xl')}>{cleanDisplayText(titleFor(item)) || t('untitledOpportunity')}</h3>
                  {arabicTitleFor(item) ? <p className={cn('mt-2 truncate text-text-soft', compact ? 'text-xs' : 'text-sm')} dir="rtl">{arabicTitleFor(item)}</p> : null}
                </div>
                {scoreFor(item) ? (
                  <span className={cn('grid shrink-0 place-items-center rounded-[16px] border border-accent/35 bg-accent/10 font-mono font-bold text-accent shadow-[0_0_22px_rgba(var(--accent-rgb),.10)]', compact ? 'h-8 min-w-12 px-2 text-xs' : 'h-14 min-w-14 px-3 text-xl')}>
                    {scoreFor(item)}
                  </span>
                ) : null}
              </div>
              <p className={cn('mt-4 text-text-soft', compact ? 'line-clamp-2 text-xs leading-5' : 'line-clamp-3 text-base leading-7')}>{investmentThesisFor(item, t('heroAnalystThesis'))}</p>
              <div className={cn('mt-5 flex items-center justify-between gap-4 font-mono text-text-muted', compact ? 'text-xs' : 'text-base')}>
                <span>{dealFacts(item).price || t('notSet')}</span>
                <span>{dealFacts(item).area || t('notSet')}</span>
              </div>
              <div className={cn('mt-4 flex justify-between text-text-soft', compact ? 'text-xs' : 'text-sm')}>
                <span>{humanize(recommendationFor(item)) || t('notSet')} · {humanize(confidenceFor(item)) || t('notSet')}</span>
                <span className={cn('rounded-full px-2 py-0.5', missingInfoList(item.missing_info_json).length > 0 ? 'text-warning' : 'text-success')}>
                  {missingInfoList(item.missing_info_json).length} {t('openItemsShort')}
                </span>
              </div>
              <div className={cn('mt-4 flex', compact ? 'gap-1.5' : 'gap-3')}>
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
  mapOpen,
  onToggleMap,
  onOpenDrawer,
}: {
  opportunity: OpportunityRow | null;
  missingCount: number;
  documentCount: number;
  latestUpdate: string | null;
  mapOpen: boolean;
  onToggleMap: () => void;
  onOpenDrawer: (tab: WorkspaceDrawerTab) => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const title = titleFor(opportunity);
  const facts = dealFacts(opportunity);
  const sourceUrl = sourceUrlFor(opportunity);
  const photos = photoRefsFor(opportunity);
  const heroPhoto = photos[0] ?? null;
  const sourceLabel = metadataString(opportunity, ['source', 'source_label', 'listing_source', 'original_source_channel']);
  const arabicTitle = arabicTitleFor(opportunity);
  const recommendation = humanize(recommendationFor(opportunity)) || t('notSet');
  const confidence = humanize(confidenceFor(opportunity)) || t('notSet');
  const displayTitle = cleanDisplayText(title);
  const thesis = investmentThesisFor(opportunity, t('heroAnalystThesis'));
  return (
    <Panel className="relative overflow-hidden rounded-[28px] border-border p-7" data-testid="acquisition-cockpit-hero">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(var(--accent-rgb),.055),transparent_36%),radial-gradient(circle_at_92%_18%,rgba(var(--highlight-rgb),.045),transparent_32%)]" />
      <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,.92fr)] xl:items-stretch">
        <div className="relative min-w-0">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-accent">{t('selectedWorkspace')}</p>
          <h2 className="max-w-4xl text-4xl font-black leading-[.96] tracking-normal text-text md:text-6xl">
            {displayTitle || t('emptyCockpitTitle')}
          </h2>
          {arabicTitle ? <p className="mt-3 text-2xl font-semibold leading-tight text-text-soft" dir="rtl">{arabicTitle}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <TrustPill label={sourceLabel ? humanize(sourceLabel) : t('notSet')} tone="cyan" />
            <TrustPill label={recommendation} tone="lime" />
            <TrustPill label={confidence} tone="cyan" />
            {facts.price ? <TrustPill label={facts.price} tone="slate" /> : null}
            {facts.area ? <TrustPill label={facts.area} tone="slate" /> : null}
            {latestUpdate ? <TrustPill label={formatRelativeTime(latestUpdate)} tone="slate" /> : null}
          </div>
          <div className="mt-6 max-w-3xl rounded-r-[18px] border-l-2 border-accent/70 bg-background/55 p-5 shadow-[inset_0_1px_0_rgba(var(--accent-rgb),.05)]">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">{t('investmentThesis')}</p>
            <p className="mt-3 text-base leading-7 text-text-soft">
              {opportunity ? thesis : t('emptyPosture')}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={onToggleMap} className="inline-flex items-center gap-2 rounded-[12px] border border-highlight/30 bg-highlight/10 px-4 py-3 text-sm font-semibold text-highlight transition hover:bg-highlight/15">
              <MapPin className="h-4 w-4" />
              {t('viewMap')}
            </button>
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="acquisition-source-link"
                className="inline-flex max-w-full items-center gap-2 rounded-[12px] border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/15"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{t('openListing')}</span>
              </a>
            ) : null}
            <button type="button" onClick={() => onOpenDrawer('evidence')} className="inline-flex items-center gap-2 rounded-[12px] border border-[rgba(var(--accent-rgb),0.18)] bg-surface/70 px-4 py-3 text-sm font-semibold text-text transition hover:bg-surface-alt">
              <ShieldCheck className="h-4 w-4" />
              {t('showEvidence')}
            </button>
          </div>
        </div>

        <div className="relative min-h-[310px] overflow-hidden rounded-[18px] border border-border bg-background shadow-[inset_0_1px_0_rgba(var(--accent-rgb),.05)]">
          {heroPhoto ? (
            <>
              <img
                src={heroPhoto}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-42 blur-2xl"
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_44%,transparent_0%,rgba(0,0,0,.18)_52%,rgba(0,0,0,.52)_100%)]" />
              <img
                src={heroPhoto}
                alt={displayTitle || t('emptyCockpitTitle')}
                data-testid="acquisition-hero-photo"
                className="absolute inset-0 h-full w-full object-contain p-3"
              />
            </>
          ) : (
            <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(var(--highlight-rgb,35,215,255),.18)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--highlight-rgb,35,215,255),.14)_1px,transparent_1px)] [background-size:34px_34px]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/20 to-transparent" />
          <div className="absolute left-4 top-4 rounded-[9px] border border-highlight/25 bg-black/35 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-highlight backdrop-blur">
            {t('photoEvidence')}
          </div>
          <div className="absolute bottom-4 left-4 right-4 grid gap-3 sm:grid-cols-4">
            <HeroChip label={t('mandateFit')} value={recommendation} />
            <HeroChip label={t('confidence')} value={confidence} />
            <HeroChip label={t('openItems')} value={missingCount.toString()} />
            <HeroChip label={t('sources')} value={documentCount.toString()} />
          </div>
        </div>
      </div>
      {mapOpen ? (
        <div className="relative mt-6 overflow-hidden rounded-[18px] border border-highlight/20 bg-background">
          <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(var(--highlight-rgb,35,215,255),.18)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--highlight-rgb,35,215,255),.14)_1px,transparent_1px)] [background-size:34px_34px]" />
          <div className="absolute left-[18%] top-[58%] h-px w-[68%] rotate-[-18deg] bg-accent/70 shadow-[0_0_20px_var(--accent)]" />
          <div className="absolute left-[58%] top-[16%] h-28 w-px rotate-[34deg] bg-highlight/60 shadow-[0_0_20px_var(--highlight)]" />
          <div className="relative min-h-[320px]">
            <div className="absolute left-[48%] top-[42%] grid h-12 w-12 place-items-center rounded-full border border-accent bg-accent/15 font-mono text-xs font-bold text-accent shadow-[0_0_28px_var(--accent-soft)]">
              {scoreFor(opportunity) ?? '--'}
            </div>
            <div className="absolute bottom-4 left-4 right-4 rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-background/80 p-3 backdrop-blur">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-highlight">{t('activeTarget')}</p>
              <p className="mt-1 text-sm font-semibold text-text">{title || t('emptyCockpitTitle')}</p>
              <p className="mt-1 text-xs leading-5 text-text-soft">{metadataString(opportunity, ['district', 'city', 'source', 'source_label', 'listing_source']) || t('marketSignalEmpty')}</p>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function HeroChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[rgba(var(--accent-rgb),0.26)] bg-black/35 px-3 py-2 backdrop-blur">
      <p className="text-xs font-semibold text-text">{label}</p>
      <p className="mt-1 truncate text-[11px] text-text-soft">{value}</p>
    </div>
  );
}

function ProgressTracker({
  opportunity,
  missingItems,
  readinessProfile,
  brokerageActive,
  onOpenDrawer,
  onRequestVisit,
  compact = false,
}: {
  opportunity: OpportunityRow | null;
  missingItems: string[];
  readinessProfile: BuyerReadinessProfileRow | null;
  brokerageActive: boolean;
  onOpenDrawer: (tab: WorkspaceDrawerTab) => void;
  onRequestVisit: () => void;
  compact?: boolean;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const steps = [
    t('progress.mandate'),
    t('progress.candidate'),
    t('progress.screened'),
    t('progress.visit'),
    t('progress.diligence'),
    t('progress.offer'),
    t('progress.close'),
  ];
  const current = progressStepIndexForStage(opportunity?.stage);
  const blockers = [
    !readinessProfile ? t('progress.blockerReadiness') : null,
    !brokerageActive ? t('progress.blockerBrokerage') : null,
    missingItems.length > 0 ? t('progress.blockerMissing', { count: missingItems.length }) : null,
  ].filter(Boolean) as string[];
  const nextAction = !readinessProfile
    ? t('progress.nextReadiness')
    : missingItems.length > 0
      ? t('progress.nextDiligence')
      : !brokerageActive
        ? t('progress.nextBrokerage')
        : current < 3
          ? t('progress.nextVisit')
          : t('progress.nextOffer');
  const blocked = blockers.length > 0;
  const tracker = (
    <div className={cn(compact ? 'w-full max-w-[620px]' : 'mt-6 overflow-x-auto pb-1')}>
      <div className={cn('grid grid-cols-7', compact ? 'min-w-0' : 'min-w-[720px]')}>
        {steps.map((step, index) => {
          const completed = index < current;
          const active = index === current;
          const pending = index > current;
          const nodeBlocked = active && blocked;
          const status = completed ? t('progress.done') : active ? t(nodeBlocked ? 'progress.blocked' : 'progress.current') : t('progress.pending');
          const detail = active
            ? (blockers[0] || nextAction)
            : index === 4
              ? t('progress.blockerMissing', { count: missingItems.length })
              : pending
                ? t('progress.notStarted')
                : t('progress.completedTooltip');
          return (
            <div key={step} className="relative flex flex-col items-center">
              {index > 0 ? (
                <div
                  className={cn(
                    'absolute right-1/2 h-0.5 w-full rounded-full',
                    compact ? 'top-[15px]' : 'top-[19px]',
                    index <= current ? 'bg-success/65' : 'bg-border'
                  )}
                />
              ) : null}
              {index < steps.length - 1 ? (
                <div
                  className={cn(
                    'absolute left-1/2 h-0.5 w-full rounded-full transition-colors',
                    compact ? 'top-[15px]' : 'top-[19px]',
                    completed ? 'bg-success/65' : active ? 'bg-accent/70' : 'bg-border'
                  )}
                />
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (index <= 1) onOpenDrawer('evidence');
                  else if (index <= 3) onOpenDrawer('evidence');
                  else if (index === 4) onOpenDrawer('evidence');
                  else onOpenDrawer('consent');
                }}
                className={cn(
                  'group relative flex w-full flex-col items-center text-center transition hover:text-text',
                  compact ? 'px-1' : 'px-2',
                  completed && 'text-success',
                  active && 'text-text',
                  pending && 'text-text-muted'
                )}
              >
                <span className={cn(
                  'relative z-[1] grid place-items-center rounded-full border font-black transition',
                  compact ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-sm',
                  completed && 'border-accent/45 bg-accent/18 text-accent',
                  active && !nodeBlocked && 'border-accent/65 bg-accent/14 text-accent shadow-[0_0_0_5px_var(--accent-dim),0_0_20px_rgba(var(--accent-rgb,183,243,74),.12)]',
                  nodeBlocked && 'border-warning bg-warning text-[color:var(--accent-text)] shadow-[0_0_0_6px_var(--warning-soft),0_0_30px_rgba(245,183,58,.18)]',
                  pending && 'border-[rgba(var(--accent-rgb),0.16)] bg-[color:var(--bg)] text-text-muted'
                )}>
                  {nodeBlocked ? (
                    <>
                      <span className="absolute inset-[-5px] rounded-full border border-warning/55 opacity-70 animate-ping" />
                      <AlertTriangle className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                    </>
                  ) : completed ? (
                    <CheckCircle2 className={cn(compact ? 'h-4 w-4' : 'h-5 w-5')} />
                  ) : active ? (
                    <Clock3 className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                  ) : (
                    index + 1
                  )}
                </span>
                <p className={cn(compact ? 'mt-1 max-w-[72px] text-[10px] leading-3' : 'mt-3 max-w-[96px] text-xs leading-4', 'font-bold', pending ? 'text-text-muted' : 'text-text')}>{step}</p>
                {!compact ? (
                  <p className={cn('mt-1 text-[10px] uppercase tracking-[0.14em]', active ? (nodeBlocked ? 'text-warning' : 'text-accent') : 'text-text-muted')}>
                    {status}
                  </p>
                ) : null}
                <span className="pointer-events-none absolute top-full z-40 mt-2 w-48 rounded-[10px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface px-3 py-2 text-left text-xs leading-5 text-text opacity-0 shadow-2xl transition group-hover:opacity-100">
                  <span className="block font-semibold">{step} · {status}</span>
                  <span className="mt-0.5 block text-text-soft">{detail}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (compact) {
    return tracker;
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">{t('progress.title')}</p>
          <h3 className="mt-1 text-xl font-bold leading-tight text-text">{nextAction}</h3>
          <p className="mt-2 text-sm leading-6 text-text-muted">{t('progress.helper')}</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {blockers.length ? blockers.map((blocker) => (
            <span key={blocker} className="rounded-full border border-warning/30 bg-warning/12 px-3 py-2 text-xs font-semibold text-text">{blocker}</span>
          )) : (
            <span className="rounded-full border border-success/30 bg-success/12 px-3 py-2 text-xs font-semibold text-success">{t('progress.noBlockers')}</span>
          )}
        </div>
      </div>
      {tracker}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onOpenDrawer(!readinessProfile ? 'files' : missingItems.length ? 'evidence' : 'activity')} className="rounded-[12px] bg-accent px-4 py-2.5 text-sm font-bold text-[color:var(--accent-text)]">
          {t('progress.primaryAction')}
        </button>
        <button type="button" onClick={onRequestVisit} disabled={!opportunity || !readinessProfile} className="rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface px-4 py-2.5 text-sm font-semibold text-text disabled:cursor-not-allowed disabled:opacity-55">
          {t('scheduleVisit')}
        </button>
        <button type="button" onClick={() => onOpenDrawer('evidence')} className="rounded-[12px] border border-highlight/30 bg-highlight/10 px-4 py-2.5 text-sm font-semibold text-highlight">
          {t('progress.coordination')}
        </button>
      </div>
    </Panel>
  );
}

function PrimaryWorkspaceTabs({
  active,
  onChange,
}: {
  active: PrimaryWorkspaceTab;
  onChange: (tab: PrimaryWorkspaceTab) => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const tabs: { key: PrimaryWorkspaceTab; label: string; icon: LucideIcon }[] = [
    { key: 'overview', label: t('overviewTab'), icon: ShieldCheck },
    { key: 'underwriting', label: t('underwritingTab'), icon: Gauge },
    { key: 'renovation', label: t('renovationTab'), icon: Wrench },
  ];
  return (
    <div className="flex w-full gap-2 rounded-[18px] border border-[rgba(var(--accent-rgb),0.18)] bg-surface-alt/75 p-2 shadow-[inset_0_1px_0_rgba(var(--accent-rgb),.05)]">
      {tabs.map(({ key, label, icon: Icon }) => {
        const selected = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              'inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[12px] px-4 text-sm font-semibold transition',
              selected ? 'border border-[rgba(var(--accent-rgb),0.34)] bg-accent/15 text-accent shadow-[0_0_18px_rgba(var(--accent-rgb),.08)]' : 'border border-transparent text-text-soft hover:bg-surface hover:text-text'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CurrentBlockerBanner({
  title,
  actionLabel,
  actionResult,
  blocked,
  busy,
  onPrimaryAction,
}: {
  title: string;
  actionLabel: string;
  actionResult: string;
  blocked: boolean;
  busy: boolean;
  onPrimaryAction: () => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <div className={cn('rounded-[14px] border p-4 shadow-[var(--shadowSm)]', blocked ? 'border-warning/35 bg-warning/12' : 'border-success/30 bg-success/10')}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[12px]', blocked ? 'bg-warning text-[color:var(--accent-text)]' : 'bg-success text-[color:var(--accent-text)]')}>
            {blocked ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div>
            <p className={cn('font-mono text-xs uppercase tracking-[0.22em]', blocked ? 'text-warning' : 'text-success')}>{blocked ? t('actions.now') : t('actions.allClear')}</p>
            <h3 className="mt-1 text-lg font-bold leading-tight text-text">{blocked ? title : t('actions.readyToProceed')}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-soft">{actionResult}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={busy}
          className={cn(
            'rounded-[12px] px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60',
            blocked ? 'bg-warning text-[color:var(--accent-text)]' : 'bg-success text-[color:var(--accent-text)]'
          )}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function ModuleTabs({ active, onChange }: { active: CockpitModule; onChange: (module: CockpitModule) => void }) {
  const t = useTranslations('workspaceCockpitPage.modules');
  const modules: CockpitModule[] = ['overview', 'model', 'openItems', 'renovation', 'outreach', 'offer'];
  return (
    <div className="flex gap-2 overflow-x-auto rounded-[16px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-2">
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
              <span>{t(module)}</span>
            </button>
          );
        })}
    </div>
  );
}

function ActionsWorkspace({
  currentBlocker,
  hasBlocker,
  primaryActionLabel,
  primaryActionResult,
  readinessProfile,
  readinessEvidence,
  sharingGrants,
  actionApprovals,
  readinessBusy,
  approvalBusy,
  selectedMissing,
  selectedOpportunity,
  brokerageActive,
  onPrimaryAction,
}: {
  currentBlocker: string;
  hasBlocker: boolean;
  primaryActionLabel: string;
  primaryActionResult: string;
  readinessProfile: BuyerReadinessProfileRow | null;
  readinessEvidence: BuyerReadinessEvidenceRow[];
  sharingGrants: DocumentSharingGrantRow[];
  actionApprovals: ExternalActionApprovalRow[];
  readinessBusy: boolean;
  approvalBusy: string | null;
  selectedMissing: string[];
  selectedOpportunity: OpportunityRow | null;
  brokerageActive: boolean;
  onPrimaryAction: () => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const readinessComplete = Boolean(readinessProfile && brokerageActive);
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-warning">{t('actions.zoneNow')}</p>
        <CurrentBlockerBanner
          title={currentBlocker}
          actionLabel={primaryActionLabel}
          actionResult={primaryActionResult}
          blocked={hasBlocker}
          busy={Boolean(readinessBusy || approvalBusy)}
          onPrimaryAction={onPrimaryAction}
        />
      </section>

      <section className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-text-muted">{t('actions.zonePending')}</p>
        <ActionSection
          title={t('buyerReadiness.title')}
          status={readinessProfile ? t('buyerReadiness.level', { level: readinessProfile.readiness_level ?? 0 }) : t('buyerReadiness.emptyTitle')}
          tone={readinessComplete ? 'success' : 'warning'}
          defaultOpen={!readinessProfile}
        >
          <BuyerReadinessPanel
            profile={readinessProfile}
            evidence={readinessEvidence}
            grants={sharingGrants}
            approvals={actionApprovals}
          />
        </ActionSection>

        <ActionSection
          title={t('openItems')}
          status={selectedMissing.length ? t('progress.blockerMissing', { count: selectedMissing.length }) : t('actions.noOpenItems')}
          tone={selectedMissing.length ? 'warning' : 'success'}
          defaultOpen={selectedMissing.length > 0}
        >
          {selectedMissing.length ? (
            <OpenItemsModule items={selectedMissing} />
          ) : (
            <p className="rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-4 py-3 text-sm text-text-soft">{t('actions.noOpenItems')}</p>
          )}
        </ActionSection>

        <ActionSection title={t('outreach.title')} status={t('actions.outreachReady')} tone="neutral" defaultOpen>
          <OutreachModule opportunity={selectedOpportunity} />
        </ActionSection>
      </section>

      <section className={cn('space-y-3 transition', hasBlocker && 'opacity-65')}>
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-text-muted">{t('actions.zoneReady')}</p>
        <OfferModule
          opportunity={selectedOpportunity}
          brokerageActive={brokerageActive && !hasBlocker}
          approvals={actionApprovals}
        />
      </section>
    </div>
  );
}

function ActionSection({
  title,
  status,
  tone,
  defaultOpen = false,
  children,
}: {
  title: string;
  status: string;
  tone: 'neutral' | 'success' | 'warning';
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneClass = {
    neutral: 'text-text-muted bg-surface-alt border-[rgba(var(--accent-rgb),0.16)]',
    success: 'text-success bg-success/10 border-success/25',
    warning: 'text-warning bg-warning/10 border-warning/25',
  }[tone];
  return (
    <Panel className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-surface-alt"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text">{title}</h3>
          <p className="mt-1 truncate text-xs text-text-muted">{status}</p>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold', toneClass)}>{status}</span>
      </button>
      {open ? <div className="border-t border-[rgba(var(--accent-rgb),0.16)] p-4">{children}</div> : null}
    </Panel>
  );
}

function OverviewModule({
  documentCount,
  opportunity,
  claims,
  openItems,
  confidence,
  primaryActionLabel,
  primaryActionResult,
  currentBlocker,
  hasActionBlocker,
  actionBusy,
  onPrimaryAction,
  onAddEvidence,
  onUploadPropertyDocument,
  onOpenBuyerVault,
  onScheduleVisit,
  onPassProperty,
  onOpenDrawer,
}: {
  documentCount: number;
  opportunity: OpportunityRow | null;
  claims: AcquisitionClaimRow[];
  openItems: number;
  confidence: string;
  primaryActionLabel: string;
  primaryActionResult: string;
  currentBlocker: string;
  hasActionBlocker: boolean;
  actionBusy: boolean;
  onPrimaryAction: () => void;
  onAddEvidence: () => void;
  onUploadPropertyDocument: () => void;
  onOpenBuyerVault: () => void;
  onScheduleVisit: () => void;
  onPassProperty: () => void;
  onOpenDrawer: (tab: WorkspaceDrawerTab) => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const sourceLabel = metadataString(opportunity, ['source', 'source_label', 'listing_source']);
  const sourceUrl = sourceUrlFor(opportunity);
  return (
    <div className="grid gap-5 [@media(min-width:1480px)]:grid-cols-[0.95fr_1.05fr]">
      <MandateActionsPanel
        openItems={openItems}
        confidence={confidence}
        title={currentBlocker}
        actionLabel={primaryActionLabel}
        actionResult={primaryActionResult}
        blocked={hasActionBlocker}
        busy={actionBusy}
        opportunity={opportunity}
        onPrimaryAction={onPrimaryAction}
        onAddEvidence={onAddEvidence}
        onUploadPropertyDocument={onUploadPropertyDocument}
        onOpenBuyerVault={onOpenBuyerVault}
        onScheduleVisit={onScheduleVisit}
        onPassProperty={onPassProperty}
      />
      <div className="grid gap-5 xl:grid-cols-2 [@media(min-width:1480px)]:grid-cols-1">
        <Panel className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('evidenceLayer')}</p>
          <h3 className="mt-1 text-xl font-semibold text-text">{t('evidenceTruthTitle')}</h3>
          <div className="mt-5 space-y-3">
            <FactCard label={t('trust.verified')} body={t('sourceDocuments', { count: documentCount })} basis="verified_source" onEvidence={() => onOpenDrawer('evidence')} info={t('info.verified')} />
            <FactCard label={t('trust.marketSignal')} body={sourceLabel || t('marketSignalEmpty')} basis="market_signal" onEvidence={() => onOpenDrawer('evidence')} info={t('info.marketSignal')} />
            <FactCard label={t('trust.counterparty')} body={metadataString(opportunity, ['broker_note', 'counterparty_note']) || t('counterpartyEmpty')} basis="counterparty_provided" onEvidence={() => onOpenDrawer('evidence')} info={t('info.counterparty')} />
            <FactCard label={t('trust.uncertain')} body={missingInfoList(opportunity?.missing_info_json)[0] || t('uncertainEmpty')} basis={missingInfoList(opportunity?.missing_info_json).length ? 'contradicted' : 'uncertain'} onEvidence={() => onOpenDrawer('evidence')} info={t('info.uncertain')} />
          </div>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('sourceDrawer')}</p>
          <h3 className="mt-2 text-2xl font-semibold text-text">{t('overviewClaimTitle')}</h3>
          <p className="mt-3 text-sm leading-6 text-text">{claims.length ? t('overviewClaimBody', { count: claims.length }) : t('evidenceBody')}</p>
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
          <div className="mt-5 rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4">
            <p className="text-xs text-text-muted">{t('sources')}</p>
            <p className="mt-1 text-sm text-text">{documentCount}</p>
          </div>
          <button type="button" onClick={() => onOpenDrawer('evidence')} className="mt-3 w-full rounded-[14px] border border-highlight/25 bg-highlight/10 px-4 py-3 text-sm font-semibold text-highlight hover:bg-highlight/15">
            {t('openEvidenceDrawer')}
          </button>
        </Panel>
      </div>
    </div>
  );
}

function ModelModule({
  opportunity,
  scenario,
  underwriting,
  saving,
  running,
  onScenarioChange,
  onSave,
  onResetDraft,
  onRunUnderwriting,
}: {
  opportunity: OpportunityRow | null;
  scenario: ScenarioState | null;
  underwriting: UnderwritingRun | null;
  saving: boolean;
  running: boolean;
  onScenarioChange: (next: ScenarioState) => void;
  onSave: (next: ScenarioState) => Promise<void>;
  onResetDraft: () => void;
  onRunUnderwriting: (next: ScenarioState) => Promise<void>;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  if (!scenario) {
    const seed = completeScenario(seedScenarioFromOpportunity(opportunity));
    return (
      <Panel className="grid min-h-[380px] place-items-center p-8 text-center">
        <div>
          <Gauge className="mx-auto h-12 w-12 text-accent" />
          <h3 className="mt-4 text-2xl font-semibold text-text">{t('modelEmptyTitle')}</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-soft">{t('modelEmptyBody')}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => onScenarioChange(seed)} className="rounded-[12px] bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)]">
              {t('addAssumptions')}
            </button>
            <button type="button" onClick={() => onScenarioChange(seed)} className="rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface px-4 py-3 text-sm font-semibold text-text">
              {t('useListingFacts')}
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  const returns = modelReturns(scenario);
  const set = (key: NumericScenarioKey) => (value: number) => onScenarioChange({ ...scenario, [key]: value });
  const anchor = scenarioFromOpportunity(opportunity) ?? completeScenario(seedScenarioFromOpportunity(opportunity));
  const setStrategy = (strategy: ScenarioState['strategy']) => {
    onScenarioChange({
      ...scenario,
      strategy,
      rent: strategy === 'flip' ? 0 : scenario.rent > 0 ? scenario.rent : anchor.rent,
      vacancy: strategy === 'flip' ? 0 : scenario.vacancy > 0 ? scenario.vacancy : anchor.vacancy,
      hold: strategy === 'flip' ? Math.min(scenario.hold, 3) : Math.max(scenario.hold, 2),
      refinanceEnabled: strategy === 'flip' ? false : scenario.refinanceEnabled,
    });
  };
  const setRefinanceEnabled = (refinanceEnabled: boolean) => onScenarioChange({ ...scenario, refinanceEnabled });
  const priceMin = Math.min(scenario.price, anchor.price * 0.85);
  const priceMax = Math.max(scenario.price, anchor.price * 1.12, priceMin + 10000);
  const renovationMax = Math.max(100000, anchor.renovation * 2.2, anchor.price * 0.18, scenario.renovation);
  const rentMin = scenario.strategy === 'flip' ? 0 : Math.min(scenario.rent, anchor.rent * 0.7);
  const rentMax = Math.max(scenario.rent, anchor.rent * 1.35, 5000);
  const arvMin = 0;
  const arvMax = Math.max(scenario.arv, scenario.price * 1.8, scenario.price + scenario.renovation * 2, arvMin + 10000);
  const refiYearMax = Math.max(1, scenario.hold - 1);
  const controls = (
    <Panel className="p-4">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-highlight">{t('underwritingTitle')}</p>
      <h3 className="mt-1 text-xl font-semibold text-text">{t('underwritingKnobsTitle')}</h3>
      <div className="mt-4 flex justify-start">
        <div className="inline-flex w-fit rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-1">
          {(['rent_hold', 'flip'] as const).map((strategy) => (
            <button
              key={strategy}
              type="button"
              onClick={() => setStrategy(strategy)}
              className={cn(
                'rounded-[9px] px-3 py-2 text-xs font-semibold transition sm:text-sm',
                scenario.strategy === strategy ? 'bg-accent text-[color:var(--accent-text)] shadow-[0_0_16px_rgba(var(--accent-rgb),0.12)]' : 'text-text-soft hover:bg-surface hover:text-text',
              )}
            >
              {t(strategy === 'flip' ? 'strategyFlip' : 'strategyRentHold')}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ScenarioSlider label={t('acquisitionPrice')} value={scenario.price} min={priceMin} max={priceMax} step={10000} format={(v) => formatSAR.format(v)} onChange={set('price')} />
        <ScenarioSlider label={t('renovationBudget')} value={scenario.renovation} min={0} max={renovationMax} step={10000} format={(v) => formatSAR.format(v)} onChange={set('renovation')} />
        {scenario.strategy === 'rent_hold' ? (
          <>
            <ScenarioSlider label={t('monthlyRent')} value={scenario.rent} min={rentMin} max={rentMax} step={500} format={(v) => formatSAR.format(v)} onChange={set('rent')} />
            <ScenarioSlider label={t('vacancy')} value={scenario.vacancy} min={0} max={20} step={1} format={(v) => `${v}%`} onChange={set('vacancy')} />
          </>
        ) : null}
        <ScenarioSlider label={t('holdPeriod')} value={scenario.hold} min={1} max={10} step={1} format={(v) => `${v} ${t('years')}`} onChange={set('hold')} />
        <ScenarioSlider label={t(scenario.strategy === 'flip' ? 'exitUplift' : 'appreciation')} value={scenario.appreciation} min={scenario.strategy === 'flip' ? -5 : 0} max={scenario.strategy === 'flip' ? 35 : 10} step={0.1} format={(v) => `${v.toFixed(1)}%`} onChange={set('appreciation')} />
        <ScenarioSlider label={t('financingRate')} value={scenario.financingRate} min={0} max={12} step={0.1} format={(v) => `${v.toFixed(1)}%`} onChange={set('financingRate')} />
        <ScenarioSlider label={t('targetIrr')} value={scenario.targetIrr} min={2} max={18} step={0.1} format={(v) => `${v.toFixed(1)}%`} onChange={set('targetIrr')} />
      </div>
      <div className="mt-4 rounded-[14px] border border-[rgba(var(--accent-rgb),0.12)] bg-surface-alt/70">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-semibold text-text">{t('advancedFinancing')}</span>
            <span className="mt-1 block text-xs leading-5 text-text-muted">{t('advancedFinancingHint')}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 text-text-soft transition', advancedOpen && 'rotate-180')} />
        </button>
        {advancedOpen ? (
          <div className="grid gap-3 border-t border-[rgba(var(--accent-rgb),0.12)] p-3 md:grid-cols-2">
            <ScenarioSlider label={t('ltv')} value={scenario.ltv} min={0} max={85} step={1} format={(v) => `${v.toFixed(0)}%`} onChange={set('ltv')} />
            <ScenarioSlider label={t('afterRepairValue')} value={scenario.arv} min={arvMin} max={arvMax} step={10000} format={(v) => v > 0 ? formatSAR.format(v) : t('notSet')} onChange={set('arv')} />
            {scenario.strategy === 'rent_hold' ? (
              <div className="md:col-span-2 rounded-[14px] border border-[rgba(var(--highlight-rgb),0.16)] bg-highlight/10 p-3">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold text-text">{t('enableRefinance')}</span>
                    <span className="mt-1 block text-xs leading-5 text-text-muted">{t('enableRefinanceHint')}</span>
                  </span>
                  <input className="h-5 w-5 accent-accent" type="checkbox" checked={scenario.refinanceEnabled} onChange={(event) => setRefinanceEnabled(event.target.checked)} />
                </label>
              </div>
            ) : null}
            {scenario.strategy === 'rent_hold' && scenario.refinanceEnabled ? (
              <>
                <ScenarioSlider label={t('refinanceYear')} value={Math.min(scenario.refinanceYear, refiYearMax)} min={1} max={refiYearMax} step={1} format={(v) => `${v.toFixed(0)} ${t('years')}`} onChange={set('refinanceYear')} />
                <ScenarioSlider label={t('refinanceLtv')} value={scenario.refinanceLtv} min={0} max={85} step={1} format={(v) => `${v.toFixed(0)}%`} onChange={set('refinanceLtv')} />
                <ScenarioSlider label={t('refinanceRate')} value={scenario.refinanceRate} min={0} max={12} step={0.1} format={(v) => `${v.toFixed(1)}%`} onChange={set('refinanceRate')} />
                <ScenarioSlider label={t('refinanceCost')} value={scenario.refinanceCost} min={0} max={4} step={0.1} format={(v) => `${v.toFixed(1)}%`} onChange={set('refinanceCost')} />
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => underwriting ? onResetDraft() : void onSave(scenario)}
          className="rounded-[14px] border border-[rgba(var(--accent-rgb),0.18)] bg-surface-alt px-4 py-3 text-sm font-semibold text-text disabled:cursor-not-allowed disabled:opacity-60"
        >
          {underwriting ? t('resetAssumptions') : saving ? t('savingAssumptions') : t('saveAssumptions')}
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => void onRunUnderwriting(scenario)}
          className="rounded-[14px] bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? t('runningUnderwriting') : t('runDealSimulation')}
        </button>
      </div>
    </Panel>
  );
  const readoutPanel = (
    <Panel className="border-accent/20 bg-accent/10 p-5">
      <p className="text-sm leading-6 text-text">
        {underwriting?.readout?.investor_summary || t('modelSensitivityNote')}
      </p>
      {underwriting?.readout?.disclaimer ? <p className="mt-3 text-xs leading-5 text-text-muted">{underwriting.readout.disclaimer}</p> : null}
    </Panel>
  );
  if (underwriting) {
    return (
      <div className="space-y-5">
        <div className="grid gap-5 [@media(min-width:1480px)]:grid-cols-[0.95fr_1.05fr]">
          {controls}
          <UnderwritingSummaryPanel underwriting={underwriting} />
        </div>
        <UnderwritingChartsGrid underwriting={underwriting} />
        {readoutPanel}
      </div>
    );
  }
  return (
    <div className="grid gap-5 [@media(min-width:1480px)]:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-5">
        {controls}
        {readoutPanel}
      </div>
      <div className="space-y-5">
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <OutputMetric label={t('equityRequired')} value={formatSAR.format(returns.equity)} hot />
          <OutputMetric label={t('annualCashFlow')} value={formatSAR.format(returns.cashFlow)} />
          <OutputMetric label={t('cashOnCash')} value={pct(returns.coc)} />
          <OutputMetric label={t('baseIrr')} value={pct(returns.irr)} hot />
        </div>
        <ScenarioCharts scenario={scenario} />
      </div>
    </div>
  );
}

function pctMaybe(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? pct(value) : '--';
}

function sarMaybe(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatSAR.format(value) : '--';
}

function capexSourceLabel(t: ReturnType<typeof useTranslations>, source?: string | null, pricingStatus?: string | null) {
  const key = source || pricingStatus;
  switch (key) {
    case 'priced_estimate':
      return t('capexSourcePricedEstimate');
    case 'saved_estimate':
      return t('capexSourceSavedEstimate');
    case 'user_assumption':
      return t('capexSourceUserAssumption');
    case 'listing_metadata':
      return t('capexSourceListingMetadata');
    case 'missing_rate_card':
      return t('capexSourcePricingMissing');
    case 'capex_assumption_required':
    case 'missing':
      return t('capexSourceNeedsAssumption');
    default:
      return key ? humanize(key) : t('capexSourceNeedsAssumption');
  }
}

function UnderwritingDashboard({ underwriting }: { underwriting: UnderwritingRun }) {
  const t = useTranslations('workspaceCockpitPage');
  const summary = underwriting.summary || {};
  if (underwriting.status === 'needs_assumptions') {
    return (
      <Panel className="border-warning/25 bg-warning/10 p-5">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-warning">{t('underwritingBlocked')}</p>
        <h3 className="mt-2 text-xl font-semibold text-text">{t('underwritingNeedsAssumptions')}</h3>
        <p className="mt-2 text-sm leading-6 text-text-soft">{(summary.missing_assumptions || []).join(', ') || t('underwritingNeedsAssumptionsBody')}</p>
      </Panel>
    );
  }
  return (
    <div className="space-y-5">
      <UnderwritingSummaryPanel underwriting={underwriting} />
      <UnderwritingChartsGrid underwriting={underwriting} />
    </div>
  );
}

function UnderwritingSummaryPanel({ underwriting }: { underwriting: UnderwritingRun }) {
  const t = useTranslations('workspaceCockpitPage');
  const summary = underwriting.summary || {};
  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-[rgba(var(--accent-rgb),0.14)] bg-surface-alt/70 px-5 py-4">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-highlight">{t('recommendationSummary')}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-3xl font-black uppercase leading-none text-text">{summary.recommendation || t('notSet')}</h3>
          <span className="rounded-[12px] border border-accent/25 bg-accent/10 px-3 py-2 font-mono text-xs font-semibold text-accent">
            {t('mandateFit')}: {summary.mandate_fit_score ?? '--'} / 100
          </span>
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <OutputMetric label={t('medianIrr')} value={pctMaybe(summary.median_irr)} hot />
        <OutputMetric label={t('targetProbability')} value={pctMaybe(summary.probability_target_irr)} />
        <OutputMetric label={t('capexOverrunRisk')} value={summary.capex_overrun_risk || '--'} />
        <OutputMetric label={t('maxBid')} value={sarMaybe(summary.max_bid)} hot />
      </div>
      <div className="grid gap-3 border-t border-[rgba(var(--accent-rgb),0.12)] p-5 md:grid-cols-3 [@media(min-width:1480px)]:grid-cols-1">
        <DecisionBlock icon={AlertTriangle} title={t('mainRisk')} body={summary.main_risk || t('uncertainEmpty')} />
        <DecisionBlock icon={TrendingUp} title={t('p10P90Irr')} body={`${pctMaybe(summary.p10_irr)} / ${pctMaybe(summary.p90_irr)}`} />
        <DecisionBlock icon={CheckCircle2} title={t('nextAction')} body={summary.next_action || t('nextActionReview')} />
      </div>
    </Panel>
  );
}

function UnderwritingChartsGrid({ underwriting }: { underwriting: UnderwritingRun }) {
  const t = useTranslations('workspaceCockpitPage');
  const summary = underwriting.summary || {};
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <ScenarioComparisonChart scenarios={underwriting.scenarios || []} target={summary.target_irr ?? null} />
      <MonteCarloChart underwriting={underwriting} />
      <FinancingStructureChart underwriting={underwriting} />
      <CapexUnderwritingChart capex={underwriting.capex} />
      <PurchaseSensitivityChart points={underwriting.sensitivity?.purchase_price || []} maxBid={summary.max_bid ?? null} currentAsk={summary.current_ask ?? null} />
      <BreakdownChart title={t('mandateFitBreakdown')} rows={underwriting.mandate_fit?.components || []} />
    </div>
  );
}

function ScenarioComparisonChart({ scenarios, target }: { scenarios: NonNullable<UnderwritingRun['scenarios']>; target: number | null }) {
  const t = useTranslations('workspaceCockpitPage');
  const max = Math.max(0.01, ...(scenarios || []).map((item) => Math.abs(item.metrics.irr || 0)), target || 0);
  return (
    <Panel className="p-5">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-soft">{t('scenarioComparison')}</p>
      <div className="mt-5 flex h-52 items-end gap-4">
        {scenarios.map((item) => {
          const value = item.metrics.irr ?? 0;
          const height = Math.max(8, Math.abs(value) / max * 180);
          const clears = target !== null && value >= target;
          return (
            <div key={item.key} className="flex flex-1 flex-col items-center gap-2">
              <span className="font-mono text-xs text-text">{pctMaybe(value)}</span>
              <div className={cn('w-full rounded-t-[10px] border border-white/10', clears ? 'bg-accent shadow-[0_0_24px_rgba(var(--accent-rgb),0.24)]' : item.key === 'downside' ? 'bg-warning' : 'bg-highlight')} style={{ height }} />
              <span className="text-xs text-text-soft">{t(item.key as 'downside' | 'base' | 'upside')}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function FinancingStructureChart({ underwriting }: { underwriting: UnderwritingRun }) {
  const t = useTranslations('workspaceCockpitPage');
  const financing = underwriting.financing;
  const debt = financing?.loan_amount ?? 0;
  const equity = financing?.equity_required ?? 0;
  const total = Math.max(1, debt + equity);
  const refi = financing?.refinance;
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-soft">{t('financingStructure')}</p>
          <p className="mt-1 text-sm text-text-soft">{t('ltv')}: {typeof financing?.ltv_pct === 'number' ? `${financing.ltv_pct.toFixed(0)}%` : '--'}</p>
        </div>
        <span className="rounded-[10px] border border-accent/25 bg-accent/10 px-3 py-1 font-mono text-xs text-accent">
          DSCR {typeof financing?.debt_service_coverage_ratio === 'number' ? financing.debt_service_coverage_ratio.toFixed(2) : '--'}
        </span>
      </div>
      <div className="mt-5 overflow-hidden rounded-[14px] border border-[rgba(var(--accent-rgb),0.14)] bg-surface-alt">
        <div className="flex h-9">
          <div className="bg-highlight/80" style={{ width: `${Math.max(0, debt / total * 100)}%` }} />
          <div className="bg-accent/85" style={{ width: `${Math.max(0, equity / total * 100)}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-3 p-3 text-xs">
          <div>
            <p className="text-text-muted">{t('debtLabel')}</p>
            <p className="mt-1 font-mono text-text">{sarMaybe(debt)}</p>
          </div>
          <div className="text-right">
            <p className="text-text-muted">{t('equityLabel')}</p>
            <p className="mt-1 font-mono text-text">{sarMaybe(equity)}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <OutputMini label={t('annualDebtService')} value={sarMaybe(financing?.annual_debt_service)} />
        <OutputMini label={t('debtServiceCoverage')} value={typeof financing?.debt_service_coverage_ratio === 'number' ? financing.debt_service_coverage_ratio.toFixed(2) : '--'} hot />
        <OutputMini label={t('afterRepairValue')} value={sarMaybe(financing?.after_repair_value)} />
        <OutputMini label={t('exitValue')} value={sarMaybe(financing?.exit_price)} />
      </div>
      {refi?.enabled ? (
        <div className="mt-4 rounded-[14px] border border-[rgba(var(--highlight-rgb),0.18)] bg-highlight/10 p-3">
          <div className="grid gap-3 text-xs sm:grid-cols-3">
            <div>
              <p className="text-text-muted">{t('refinanceYear')}</p>
              <p className="mt-1 font-mono text-text">{refi.year ?? '--'}</p>
            </div>
            <div>
              <p className="text-text-muted">{t('refiNetProceeds')}</p>
              <p className={cn('mt-1 font-mono', (refi.net_proceeds ?? 0) >= 0 ? 'text-accent' : 'text-warning')}>{sarMaybe(refi.net_proceeds)}</p>
            </div>
            <div>
              <p className="text-text-muted">{t('refiDebtService')}</p>
              <p className="mt-1 font-mono text-text">{sarMaybe(refi.annual_debt_service)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function MonteCarloChart({ underwriting }: { underwriting: UnderwritingRun }) {
  const t = useTranslations('workspaceCockpitPage');
  const bins = underwriting.monte_carlo?.histogram || [];
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const p10 = underwriting.monte_carlo?.p10_irr ?? null;
  const p50 = underwriting.monte_carlo?.p50_irr ?? null;
  const p90 = underwriting.monte_carlo?.p90_irr ?? null;
  const target = underwriting.summary?.target_irr ?? null;
  const domainMin = Math.min(...bins.map((bin) => bin.min_irr), p10 ?? 0, p50 ?? 0, p90 ?? 0, target ?? 0);
  const domainMax = Math.max(...bins.map((bin) => bin.max_irr), p10 ?? 0, p50 ?? 0, p90 ?? 0, target ?? 0.01);
  const domainSpan = Math.max(0.001, domainMax - domainMin);
  const pos = (value: number | null) => value === null ? 0 : ((value - domainMin) / domainSpan) * 100;
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-soft">{t('returnDistribution')}</p>
          <p className="mt-1 text-sm text-text-soft">{t('simulationRuns', { count: underwriting.monte_carlo?.runs ?? 0 })}</p>
        </div>
        <span className="rounded-[10px] border border-highlight/25 bg-highlight/10 px-3 py-1 font-mono text-xs text-highlight">
          P50 {pctMaybe(underwriting.monte_carlo?.p50_irr)}
        </span>
      </div>
      <div className="mt-5 rounded-[16px] border border-[rgba(var(--accent-rgb),0.12)] bg-surface-alt/70 p-3">
        <div className="flex h-28 items-end gap-1 border-b border-border/70 px-1">
          {bins.length ? bins.map((bin, index) => (
            <div key={`${bin.min_irr}-${index}`} className={cn('flex-1 rounded-t-[5px]', bin.max_irr < 0 ? 'bg-error/80' : bin.min_irr >= (target ?? Infinity) ? 'bg-accent/90' : 'bg-highlight/75')} style={{ height: `${Math.max(5, (bin.count / maxCount) * 100)}%` }} title={`${pctMaybe(bin.min_irr)} - ${pctMaybe(bin.max_irr)}`} />
          )) : (
            <div className="grid h-full flex-1 place-items-center text-xs text-text-muted">{t('notSet')}</div>
          )}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-text-muted">
          <span>{pctMaybe(domainMin)}</span>
          <span>{pctMaybe(domainMax)}</span>
        </div>
      </div>
      <div className="mt-4 rounded-[16px] border border-[rgba(var(--highlight-rgb),0.18)] bg-highlight/10 p-4">
        <div className="relative h-12">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
          <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-highlight/45" style={{ left: `${pos(p10)}%`, width: `${Math.max(2, pos(p90) - pos(p10))}%` }} />
          {target !== null ? <div className="absolute top-0 h-12 w-px bg-accent shadow-[0_0_14px_rgba(var(--accent-rgb),0.45)]" style={{ left: `${pos(target)}%` }} /> : null}
          {[
            ['P10', p10, 'bg-warning'],
            ['P50', p50, 'bg-accent'],
            ['P90', p90, 'bg-highlight'],
          ].map(([label, value, className]) => (
            <div key={label as string} className={cn('absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface', className as string)} style={{ left: `${pos(value as number | null)}%` }}>
              <span className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-text-soft">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-center font-mono text-[10px] text-text-muted">
          {target !== null ? <span className="text-accent">{t('targetIrr')} {pctMaybe(target)}</span> : null}
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <OutputMetric label="P10" value={pctMaybe(underwriting.monte_carlo?.p10_irr)} />
        <OutputMetric label="P50" value={pctMaybe(underwriting.monte_carlo?.p50_irr)} hot />
        <OutputMetric label="P90" value={pctMaybe(underwriting.monte_carlo?.p90_irr)} />
      </div>
    </Panel>
  );
}

function CapexUnderwritingChart({ capex }: { capex?: UnderwritingRun['capex'] }) {
  const t = useTranslations('workspaceCockpitPage');
  const hasRange = typeof capex?.low === 'number' && typeof capex?.base === 'number' && typeof capex?.high === 'number' && capex.base > 0;
  const low = capex?.low ?? 0;
  const base = capex?.base ?? low;
  const high = capex?.high ?? Math.max(base, low);
  const span = Math.max(1, high - low);
  const baseLeft = ((base - low) / span) * 100;
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-soft">{t('capexRange')}</p>
        <span className="rounded-full border border-[rgba(var(--highlight-rgb),0.28)] bg-highlight/10 px-2.5 py-1 text-[11px] font-semibold text-highlight">
          {capexSourceLabel(t, capex?.source, capex?.pricing_status)}
        </span>
      </div>
      {hasRange ? (
        <>
          <div className="mt-5 rounded-[16px] border border-warning/20 bg-warning/10 p-4">
            <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="font-mono uppercase tracking-[0.14em] text-text-muted">{t('capexLow')}</p>
                <p className="mt-1 font-mono text-text">{compactSAR(low)}</p>
              </div>
              <div className="text-center">
                <p className="font-mono uppercase tracking-[0.14em] text-accent">{t('capexBase')}</p>
                <p className="mt-1 font-mono text-text">{compactSAR(base)}</p>
              </div>
              <div className="text-right">
                <p className="font-mono uppercase tracking-[0.14em] text-text-muted">{t('capexHigh')}</p>
                <p className="mt-1 font-mono text-text">{compactSAR(high)}</p>
              </div>
            </div>
            <div className="relative h-8">
              <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-border" />
              <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-warning/55" />
              <div className="absolute top-0 h-8 w-1 rounded-full bg-accent shadow-[0_0_18px_rgba(var(--accent-rgb),0.5)]" style={{ left: `${baseLeft}%` }} />
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(capex?.thresholds || []).slice(0, 4).map((item) => (
              <div key={item.key} className="rounded-[12px] border border-[rgba(var(--accent-rgb),0.14)] bg-surface-alt px-3 py-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-text-soft">{item.label || humanize(item.key)}</span>
                  <span className="font-mono text-warning">{pctMaybe(item.probability)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="h-1.5 flex-1 rounded-full bg-border">
                    <div className="h-1.5 rounded-full bg-warning" style={{ width: `${Math.max(3, Math.min(100, item.probability * 100))}%` }} />
                  </div>
                  <span className="font-mono text-[10px] text-text-muted">{compactSAR(item.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-[16px] border border-warning/25 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-warning">{t('capexNeedsEvidenceTitle')}</p>
          <p className="mt-2 text-sm leading-6 text-text-soft">{t('capexNeedsEvidenceBody')}</p>
        </div>
      )}
    </Panel>
  );
}

function PurchaseSensitivityChart({ points = [], maxBid, currentAsk }: { points?: NonNullable<UnderwritingRun['sensitivity']>['purchase_price']; maxBid: number | null; currentAsk: number | null }) {
  const t = useTranslations('workspaceCockpitPage');
  const validPoints = points.filter((point) => typeof point.irr === 'number');
  const irrValues = validPoints.map((point) => point.irr as number);
  const minIrr = Math.min(0, ...irrValues);
  const maxIrr = Math.max(0.01, ...irrValues);
  const span = Math.max(0.001, maxIrr - minIrr);
  const chartPoints = validPoints.map((point, index) => {
    const x = validPoints.length === 1 ? 150 : 24 + (index / (validPoints.length - 1)) * 272;
    const y = 126 - (((point.irr as number) - minIrr) / span) * 86;
    return { ...point, x, y };
  });
  const polyline = chartPoints.map((point) => `${point.x},${point.y}`).join(' ');
  return (
    <Panel className="p-5">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-soft">{t('purchaseSensitivity')}</p>
      <div className="mt-5 rounded-[16px] border border-[rgba(var(--highlight-rgb),0.16)] bg-highlight/10 p-3">
        <svg className="h-40 w-full overflow-visible" viewBox="0 0 320 150" role="img" aria-label={t('purchaseSensitivity')}>
          <defs>
            <linearGradient id="purchase-sensitivity-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--highlight-rgb))" stopOpacity="0.32" />
              <stop offset="100%" stopColor="rgb(var(--highlight-rgb))" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[40, 78, 116].map((y) => <line key={y} x1="24" x2="296" y1={y} y2={y} className="stroke-border" strokeDasharray="4 7" />)}
          {chartPoints.length ? <polyline points={`24,130 ${polyline} 296,130`} fill="url(#purchase-sensitivity-fill)" stroke="none" /> : null}
          {chartPoints.length ? <polyline points={polyline} fill="none" stroke="rgb(var(--highlight-rgb))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" /> : null}
          {chartPoints.map((point) => (
            <g key={point.purchase_price}>
              <circle cx={point.x} cy={point.y} r="5" className={cn('stroke-surface', point.clears_target ? 'fill-accent' : 'fill-highlight')} strokeWidth="3" />
              <text x={point.x} y="146" textAnchor="middle" className="fill-text-soft text-[10px]">{compactSAR(point.purchase_price)?.replace(' SAR', '')}</text>
            </g>
          ))}
        </svg>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-text-muted">
          <span>{pctMaybe(minIrr)}</span>
          <span>{pctMaybe(maxIrr)}</span>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {points.slice(0, 3).map((point) => (
          <OutputMini key={point.purchase_price} label={compactSAR(point.purchase_price) ?? '--'} value={pctMaybe(point.irr)} hot={Boolean(point.clears_target)} />
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-text-soft">{t('maxBid')}: {sarMaybe(maxBid)} · {t('currentAsk')}: {sarMaybe(currentAsk)}</p>
    </Panel>
  );
}

function BreakdownChart({ title, rows }: { title: string; rows: Array<{ key: string; label: string; score: number; max: number }> }) {
  return (
    <Panel className="p-5">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-soft">{title}</p>
      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="space-y-1">
            <div className="flex justify-between gap-3 text-xs">
              <span className="text-text">{row.label}</span>
              <span className="font-mono text-text-soft">{row.score} / {row.max}</span>
            </div>
            <div className="h-2 rounded-full bg-border">
              <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(3, Math.min(100, (row.score / Math.max(1, row.max)) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ScenarioCharts({ scenario }: { scenario: ScenarioState }) {
  const t = useTranslations('workspaceCockpitPage');
  const cashFlow = cashFlowProjection(scenario);
  const sensitivity = sensitivityScenarios(scenario);
  const exit = modelExit(scenario);
  const returns = modelReturns(scenario);
  const equityStack = [
    { key: 'debt', label: t('debtLabel'), value: scenario.price * 0.68, className: 'bg-text-soft/45' },
    { key: 'equity', label: t('equityLabel'), value: scenario.price * 0.32, className: 'bg-accent' },
    { key: 'capex', label: t('capexLabel'), value: scenario.renovation, className: 'bg-highlight' },
  ].filter((item) => item.value > 0);
  const stackTotal = equityStack.reduce((total, item) => total + item.value, 0) || 1;
  const minCash = Math.min(0, ...cashFlow.map((item) => item.value));
  const maxCash = Math.max(1, ...cashFlow.map((item) => item.value));
  const cashSpan = Math.max(1, maxCash - minCash);
  const points = cashFlow.map((item, index) => {
    const x = cashFlow.length === 1 ? 48 : 28 + (index / (cashFlow.length - 1)) * 264;
    const y = 126 - ((item.value - minCash) / cashSpan) * 86;
    return `${x},${y}`;
  }).join(' ');
  const maxIrr = Math.max(0.01, ...sensitivity.map((item) => Math.abs(item.returns.irr)));
  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-[rgba(var(--accent-rgb),0.14)] bg-surface-alt/70 px-5 py-4">
        <p className="text-xs uppercase tracking-[0.22em] text-text-soft">{t('chartsTitle')}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-xl font-semibold text-text">{t('modelOutputs')}</h3>
          <span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 font-mono text-xs text-accent">{t('baseIrr')}: {pct(returns.irr)}</span>
        </div>
      </div>
      <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border-b border-[rgba(var(--accent-rgb),0.14)] p-5 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-text">{t('cashFlowCurve')}</p>
            <p className="font-mono text-xs text-text-soft">{t('holdPeriod')}: {scenario.hold} {t('years')}</p>
          </div>
          <svg className="h-44 w-full overflow-visible" viewBox="0 0 320 150" role="img" aria-label={t('cashFlowCurve')}>
            <defs>
              <linearGradient id="cashflow-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--accent-rgb))" stopOpacity="0.35" />
                <stop offset="100%" stopColor="rgb(var(--accent-rgb))" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[40, 78, 116].map((y) => <line key={y} x1="24" x2="304" y1={y} y2={y} className="stroke-border" strokeDasharray="4 7" />)}
            <polyline points={`28,130 ${points} 292,130`} fill="url(#cashflow-fill)" stroke="none" className="transition-all duration-500" />
            <polyline points={points} fill="none" stroke="rgb(var(--accent-rgb))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" className="transition-all duration-500" />
            {cashFlow.map((item, index) => {
              const x = cashFlow.length === 1 ? 48 : 28 + (index / (cashFlow.length - 1)) * 264;
              const y = 126 - ((item.value - minCash) / cashSpan) * 86;
              return (
                <g key={item.year} className="transition-transform duration-500">
                  <circle cx={x} cy={y} r="5" className="fill-accent stroke-surface" strokeWidth="3" />
                  <text x={x} y="146" textAnchor="middle" className="fill-text-soft text-[10px]">Y{item.year}</text>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {cashFlow.slice(0, 3).map((item) => (
              <div key={item.year} className="rounded-[12px] border border-[rgba(var(--accent-rgb),0.14)] bg-surface-alt p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">{t('yearLabel')} {item.year}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-text">{compactSAR(item.value)}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 p-5">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-text">{t('equityStack')}</p>
              <p className="font-mono text-xs text-text-soft">{compactSAR(stackTotal)}</p>
            </div>
            <div className="flex h-10 overflow-hidden rounded-full border border-[rgba(var(--accent-rgb),0.18)] bg-surface-alt">
              {equityStack.map((item) => (
                <div key={item.key} className={cn('transition-all duration-500', item.className)} style={{ width: `${(item.value / stackTotal) * 100}%` }} />
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              {equityStack.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-text-soft">{item.label}</span>
                  <span className="font-mono text-text">{compactSAR(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[16px] border border-[rgba(var(--accent-rgb),0.14)] bg-surface-alt p-4">
            <p className="text-sm font-semibold text-text">{t('exitWaterfall')}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <OutputMini label={t('netSale')} value={compactSAR(exit.netSale) ?? 'SAR 0'} />
              <OutputMini label={t('remainingDebt')} value={compactSAR(exit.remainingDebt) ?? 'SAR 0'} />
              <OutputMini label={t('terminalEquity')} value={compactSAR(exit.terminalEquity) ?? 'SAR 0'} hot />
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-text">{t('sensitivityTitle')}</p>
            <div className="space-y-2">
              {sensitivity.map((item) => (
                <div key={item.key} className="grid grid-cols-[72px_1fr_58px] items-center gap-3">
                  <span className="text-xs text-text-soft">{t(item.label)}</span>
                  <div className="h-3 rounded-full bg-border">
                    <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.max(8, (Math.abs(item.returns.irr) / maxIrr) * 100)}%` }} />
                  </div>
                  <span className="text-right font-mono text-xs text-text">{pct(item.returns.irr)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function OutputMini({ label, value, hot = false }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-[12px] border p-3', hot ? 'border-accent/25 bg-accent/10' : 'border-border bg-surface')}>
      <p className="truncate text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold text-text">{value}</p>
    </div>
  );
}

const renovationStrategies = [
  'cosmetic_refresh',
  'rental_ready',
  'value_add',
  'premium_repositioning',
  'custom_scope',
];

const finishLevels = [
  'economy',
  'standard',
  'mid_grade',
  'premium',
  'luxury',
];

function categoryBreakdown(lines: RenovationCapexLine[] = []) {
  const map = new Map<string, number>();
  for (const line of lines) {
    const category = line.category || humanize(line.category_code) || 'Other';
    map.set(category, (map.get(category) || 0) + Number(line.base_total || 0));
  }
  return [...map.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
}

function CapexRangeBar({ estimate }: { estimate: RenovationCapexEstimate }) {
  const low = Number(estimate.low_total || 0);
  const base = Number(estimate.base_total || 0);
  const high = Number(estimate.high_total || 0);
  if (!high) return <div className="h-2 rounded-full bg-border" />;
  const basePosition = Math.min(100, Math.max(0, (base / high) * 100));
  return (
    <div className="space-y-2">
      <div className="relative h-3 rounded-full bg-border">
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent/35" style={{ width: `${Math.max(8, (low / high) * 100)}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${basePosition}%` }} />
      </div>
      <div className="flex justify-between text-xs text-text-soft">
        <span>{compactSAR(low)}</span>
        <span>{compactSAR(base)}</span>
        <span>{compactSAR(high)}</span>
      </div>
    </div>
  );
}

function RenovationModule({
  opportunity,
  scenario,
  underwriting,
  saving,
  events,
  onApplyEstimate,
  onEditDealAssumptions,
  onRequestQuote,
}: {
  opportunity: OpportunityRow | null;
  scenario: ScenarioState | null;
  underwriting: UnderwritingRun | null;
  saving: boolean;
  events: RenovationEstimateEventRow[];
  onApplyEstimate: (amount: number) => Promise<void>;
  onEditDealAssumptions: () => void;
  onRequestQuote: () => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const estimate = opportunity?.renovation_capex_json || null;
  const scenarioCapex = scenario?.renovation ?? metadataNumber(opportunity, ['renovation_budget', 'capex', 'estimated_capex']);
  const condition = metadataString(opportunity, ['condition', 'renovation_scope', 'capex_note']);
  const breakdown = categoryBreakdown(estimate?.line_items);
  const totalBreakdown = breakdown.reduce((total, [, value]) => total + value, 0);
  const returnsBase = scenario && estimate?.base_total ? modelReturns({ ...scenario, renovation: estimate.base_total }) : null;
  const returnsHigh = scenario && estimate?.high_total ? modelReturns({ ...scenario, renovation: estimate.high_total }) : null;
  return (
    <Panel className="p-5 space-y-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('renovationExposure')}</p>
          <h3 className="mt-1 text-xl font-semibold text-text">{t('renovationScopeTitle')}</h3>
        </div>
        <span className="rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{estimate?.confidence_label ? humanize(estimate.confidence_label) : t('planningEstimate')}</span>
      </div>
      {estimate ? (
        <div className="rounded-[18px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-text-muted">{estimate.planning_estimate_label || t('planningEstimate')}</p>
              <h4 className="mt-1 text-2xl font-semibold text-text">
                {estimate.low_total && estimate.high_total ? `${compactSAR(estimate.low_total)} - ${compactSAR(estimate.high_total)}` : t('pricingMissingTitle')}
              </h4>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-soft">{t('baseCase')}</p>
              <p className="text-lg font-semibold text-text">{estimate.base_total ? formatSAR.format(estimate.base_total) : t('notSet')}</p>
            </div>
          </div>
          <div className="mt-4">
            <CapexRangeBar estimate={estimate} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[rgba(var(--accent-rgb),0.16)] px-3 py-1 text-text-soft">{humanize(estimate.strategy)}</span>
            <span className="rounded-full border border-[rgba(var(--accent-rgb),0.16)] px-3 py-1 text-text-soft">{humanize(estimate.finish_level)}</span>
            <span className="rounded-full border border-[rgba(var(--accent-rgb),0.16)] px-3 py-1 text-text-soft">{humanize(estimate.city)}{estimate.city_fallback_used ? ` · ${t('fallbackUsed')}` : ''}</span>
          </div>
        </div>
      ) : null}
      <div className="grid gap-3">
        <DecisionBlock icon={Wrench} title={t('usedInDealModel')} body={scenarioCapex === null ? t('capexBody') : formatSAR.format(scenarioCapex)} />
        <DecisionBlock icon={AlertTriangle} title={t('decisionBlockers')} body={condition || t('renovationEmpty')} />
      </div>
      {estimate ? (
        <div className="rounded-[18px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-text-soft">{t('applyEstimateTitle')}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([
              ['low', estimate.low_total],
              ['base', estimate.base_total],
              ['high', estimate.high_total],
            ] as const).map(([key, value]) => (
              <button
                key={key}
                type="button"
                disabled={saving || typeof value !== 'number'}
                onClick={() => typeof value === 'number' && void onApplyEstimate(value)}
                className="rounded-[12px] border border-accent/25 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t(`applyEstimate.${key}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onEditDealAssumptions}
            className="mt-3 w-full rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface px-3 py-2 text-sm font-semibold text-text-soft transition hover:bg-surface-alt hover:text-text"
          >
            {t('editInDealAssumptions')}
          </button>
        </div>
      ) : null}
      {breakdown.length ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-text-soft">{t('categoryBreakdown')}</p>
          <div className="space-y-3">
            {breakdown.slice(0, 6).map(([category, value]) => (
              <div key={category} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-text">{category}</span>
                  <span className="text-text-soft">{compactSAR(value)}</span>
                </div>
                <div className="h-2 rounded-full bg-border">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(5, Math.round((value / Math.max(1, totalBreakdown)) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {estimate?.assumptions?.length ? <NoticeList title={t('assumptions')} items={estimate.assumptions} /> : null}
      {estimate?.missing_evidence?.length ? <NoticeList title={t('missingEvidence')} items={estimate.missing_evidence} /> : null}
      {estimate?.risks?.length ? <NoticeList title={t('risks')} items={estimate.risks} /> : null}
      {underwriting?.renovation_confidence?.factors?.length ? (
        <BreakdownChart title={t('renovationConfidence')} rows={underwriting.renovation_confidence.factors} />
      ) : null}
      {returnsBase && returnsHigh ? (
        <div className="rounded-[18px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-text-soft">{t('scenarioImpact')}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <OutputMetric label={t('baseCapexYield')} value={`${(returnsBase.coc * 100).toFixed(1)}%`} />
            <OutputMetric label={t('highCapexYield')} value={`${(returnsHigh.coc * 100).toFixed(1)}%`} hot />
          </div>
        </div>
      ) : null}
      {events.length ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-text-soft">{t('estimateHistory')}</p>
          <div className="space-y-2">
            {events.slice(0, 4).map((event) => (
              <div key={event.id} className="flex items-center justify-between rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] px-3 py-2 text-xs">
                <span className="font-medium text-text">{humanize(event.event_type)}</span>
                <span className="text-text-soft">{event.base_total ? compactSAR(event.base_total) : t('scopeOnly')}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <button type="button" onClick={onRequestQuote} className="mt-5 w-full rounded-3xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent hover:bg-accent/15">
        {t('requestQuotePack')}
      </button>
    </Panel>
  );
}

function NoticeList({ title, items }: { title: string; items: RenovationCapexNotice[] }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-text-soft">{title}</p>
      <div className="space-y-2">
        {items.slice(0, 4).map((item, index) => (
          <div key={`${title}-${item.type || index}`} className="rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-3 py-2 text-sm">
            <p className="font-medium text-text">{item.label || item.message || item.description || humanize(item.type)}</p>
            {item.suggested_action ? <p className="mt-1 text-xs leading-5 text-text-soft">{item.suggested_action}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function RenovationTab({
  opportunity,
  scenario,
  underwriting,
  saving,
  generating,
  error,
  events,
  onGenerateEstimate,
  onApplyEstimate,
  onEditDealAssumptions,
  onRequestQuote,
}: {
  opportunity: OpportunityRow | null;
  scenario: ScenarioState | null;
  underwriting: UnderwritingRun | null;
  saving: boolean;
  generating: boolean;
  error: string | null;
  events: RenovationEstimateEventRow[];
  onGenerateEstimate: (input: { strategy: string; finish_level: string; user_notes: string }) => Promise<void>;
  onApplyEstimate: (amount: number) => Promise<void>;
  onEditDealAssumptions: () => void;
  onRequestQuote: () => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const [strategy, setStrategy] = useState(opportunity?.renovation_capex_json?.strategy || 'rental_ready');
  const [finishLevel, setFinishLevel] = useState(opportunity?.renovation_capex_json?.finish_level || 'mid_grade');
  const [notes, setNotes] = useState('');
  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel className="p-5">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-warning">{t('renovationTab')}</p>
        <h3 className="mt-1 text-2xl font-semibold text-text">{t('renovationModelTitle')}</h3>
        <p className="mt-2 text-sm leading-6 text-text-soft">{t('renovationModelBody')}</p>
        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{t('strategy')}</p>
            <div className="grid grid-cols-2 gap-2">
              {renovationStrategies.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStrategy(item)}
                  className={cn('rounded-[12px] border px-3 py-2 text-sm font-semibold transition', strategy === item ? 'border-accent bg-accent text-[color:var(--accent-text)]' : 'border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt text-text-soft hover:text-text')}
                >
                  {t(`strategies.${item}`)}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{t('finishLevel')}</span>
            <select value={finishLevel} onChange={(event) => setFinishLevel(event.target.value)} className="w-full rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-3 py-3 text-sm text-text outline-none focus:border-accent">
              {finishLevels.map((item) => <option key={item} value={item}>{t(`finishLevels.${item}`)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{t('renovationNotes')}</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder={t('renovationNotesPlaceholder')} className="w-full resize-none rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-3 py-3 text-sm text-text outline-none placeholder:text-text-muted focus:border-accent" />
          </label>
          {error ? <p className="rounded-[12px] border border-error/25 bg-error/10 px-3 py-2 text-sm text-error">{error}</p> : null}
          <button
            type="button"
            disabled={generating || !opportunity}
            onClick={() => void onGenerateEstimate({ strategy, finish_level: finishLevel, user_notes: notes })}
            className="w-full rounded-[14px] bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? t('generatingEstimate') : t('generateEstimate')}
          </button>
        </div>
      </Panel>
      <RenovationModule
        opportunity={opportunity}
        scenario={scenario}
        underwriting={underwriting}
        saving={saving}
        events={events}
        onApplyEstimate={onApplyEstimate}
        onEditDealAssumptions={onEditDealAssumptions}
        onRequestQuote={onRequestQuote}
      />
    </div>
  );
}

function OpenItemsModule({ items }: { items: string[] }) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className="p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('openItems')}</p>
      <h3 className="mt-1 text-xl font-semibold text-text">{t('openItemsModuleTitle')}</h3>
      <div className="mt-5 overflow-hidden rounded-3xl border border-[rgba(var(--accent-rgb),0.16)]">
        {items.length === 0 ? (
          <p className="bg-surface-alt p-4 text-sm text-text-soft">{t('openItemsEmpty')}</p>
        ) : (
          items.map((item, index) => (
            <div key={`${item}-${index}`} className="grid gap-3 border-b border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-4 py-4 text-sm last:border-b-0 md:grid-cols-[40px_1fr]">
              <p className="font-mono text-xs text-text-muted">#{index + 1}</p>
              <p className="font-medium text-text">{item}</p>
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
      <div className="mt-5 rounded-3xl border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4">
        <p className="text-sm leading-6 text-text">{compsNote || t('compsEmpty')}</p>
      </div>
    </Panel>
  );
}

function GoogleLocationMap({ opportunity, minHeight = 250 }: { opportunity: OpportunityRow | null; minHeight?: number }) {
  const t = useTranslations('workspaceCockpitPage');
  const title = titleFor(opportunity) || t('emptyCockpitTitle');
  const embedUrl = googleMapsEmbedUrl(opportunity);
  const mapsUrl = googleMapsSearchUrl(opportunity);
  const locationLabel = locationLabelForOpportunity(opportunity);
  const marketSignal = metadataString(opportunity, ['district', 'city', 'source', 'source_label', 'listing_source', 'market_context']);

  return (
    <div
      className="relative overflow-hidden rounded-[18px] border border-highlight/20 bg-background"
      style={{ minHeight } as CSSProperties}
      data-testid="acquisition-google-map"
    >
      {embedUrl ? (
        <iframe
          title={t('googleMapTitle')}
          src={embedUrl}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_24%,rgba(var(--highlight-rgb),.14),transparent_34%),var(--panel-bg)] p-6 text-center">
          <div>
            <MapPin className="mx-auto h-8 w-8 text-highlight" />
            <p className="mt-3 text-sm font-semibold text-text">{t('googleMapUnavailable')}</p>
            <p className="mt-2 text-xs leading-5 text-text-soft">{locationLabel || t('marketSignalEmpty')}</p>
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 right-4 rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-background/86 p-3 shadow-[var(--shadowSm)] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-highlight">{t('activeTarget')}</p>
            <p className="mt-1 truncate text-sm font-semibold text-text">{title}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-soft">{locationLabel || marketSignal || t('marketSignalEmpty')}</p>
          </div>
          {mapsUrl ? (
            <a href={mapsUrl} target="_blank" rel="noreferrer" aria-label={t('openGoogleMaps')} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-highlight/25 bg-highlight/10 text-highlight transition hover:bg-highlight hover:text-background">
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OutreachModule({
  opportunity,
}: {
  opportunity: OpportunityRow | null;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const brokerNote = metadataString(opportunity, ['broker_note', 'counterparty_note', 'contact_access']);
  return (
    <div className="rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4">
        <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('outreach.title')}</p>
        <h3 className="mt-1 text-xl font-semibold text-text">{t('outreach.heading')}</h3>
        <p className="mt-3 text-sm leading-6 text-text-soft">{brokerNote || t('outreach.body')}</p>
        <p className="mt-4 rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface px-4 py-3 text-sm text-text-soft">{t('actions.usePrimaryAction')}</p>
    </div>
  );
}

function OfferModule({
  opportunity,
  brokerageActive,
  approvals,
}: {
  opportunity: OpportunityRow | null;
  brokerageActive: boolean;
  approvals?: ExternalActionApprovalRow[];
}) {
  const t = useTranslations('workspaceCockpitPage');
  const latestApproval = approvals?.[0] ?? null;
  return (
    <Panel className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('offer.title')}</p>
          <h3 className="mt-1 text-xl font-semibold text-text">{t('offer.heading')}</h3>
        </div>
        {latestApproval ? (
          <span className="rounded-full border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-3 py-1 text-xs font-semibold text-text-soft">
            {humanize(latestApproval.approval_status) || t('notSet')}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-text-soft">{brokerageActive ? t('offer.readyBody') : t('brokerageGateHint')}</p>
      <p className="mt-4 rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-4 py-3 text-sm text-text-soft">
        {opportunity && brokerageActive ? t('actions.usePrimaryAction') : t('brokerageGateHint')}
      </p>
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
        <MapIcon className="h-5 w-5 text-highlight" />
      </div>

      <div className="mb-4 grid grid-cols-4 gap-1 rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-background/60 p-1">
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
        <GoogleLocationMap opportunity={opportunity} />
      ) : null}

      {mode === 'photos' ? (
        <div className="grid min-h-[250px] gap-3">
          {photoRefs.length > 0 ? (
            <>
              <div className="relative h-64 overflow-hidden rounded-[18px] border border-[rgba(var(--accent-rgb),0.16)] bg-background">
                <img
                  src={photoRefs[0]}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl"
                  loading="lazy"
                />
                <img
                  src={photoRefs[0]}
                  alt={title}
                  data-testid="acquisition-photo"
                  className="relative h-full w-full object-contain p-2"
                  loading="lazy"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {photoRefs.slice(1, 5).map((photo, index) => (
                  <img
                    key={photo}
                    src={photo}
                    alt={`${title} ${index + 2}`}
                    className="h-20 w-full rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-[18px] border border-[rgba(var(--accent-rgb),0.16)] bg-[radial-gradient(circle_at_25%_20%,rgba(var(--highlight-rgb),.18),transparent_32%),var(--panel-bg)] p-4">
                <TrustPill label={t('photoEvidence')} tone="cyan" />
                <p className="mt-4 text-sm leading-6 text-text-soft">{condition || t('photosEmpty')}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[t('facade'), t('interior'), t('roof')].map((label) => (
                  <div key={label} className="grid min-h-20 place-items-center rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-2 text-center text-xs font-medium text-text-muted">
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
            <div key={`${body}-${index}`} className="rounded-[16px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">DOC {String(index + 1).padStart(2, '0')}</p>
              <p className="mt-2 text-sm leading-6 text-text">{body}</p>
            </div>
          ))}
        </div>
      ) : null}

      {mode === 'parcel' ? (
        <div className="relative min-h-[250px] overflow-hidden rounded-[18px] border border-[rgba(var(--accent-rgb),0.16)] bg-background p-5">
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(var(--grid-color)_1px,transparent_1px),linear-gradient(90deg,var(--grid-color)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative mx-auto mt-6 h-36 w-48 rotate-[-8deg] border-2 border-highlight bg-highlight/10 shadow-[0_0_26px_rgba(var(--highlight-rgb,35,215,255),.20)]" />
          <div className="relative mt-7 rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-highlight">{t('parcelSignal')}</p>
            <p className="mt-1 text-sm text-text">{[facts.area, facts.price].filter(Boolean).join(' · ') || t('notSet')}</p>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function WorkspaceCommandDrawer({
  workspaceId,
  width,
  documentCount,
  opportunity,
  missingItems,
  claims,
  onClose,
  onWidthChange,
}: {
  workspaceId: string;
  width: number;
  documentCount: number;
  opportunity: OpportunityRow | null;
  missingItems: string[];
  claims: AcquisitionClaimRow[];
  onClose: () => void;
  onWidthChange: (width: number) => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const handleDragStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragStateRef.current = { startX: event.clientX, startWidth: width };
    setIsDragging(true);
    const isRtl = document.documentElement.dir === 'rtl';
    const onMove = (moveEvent: PointerEvent) => {
      if (!dragStateRef.current) return;
      const delta = moveEvent.clientX - dragStateRef.current.startX;
      const raw = isRtl ? dragStateRef.current.startWidth + delta : dragStateRef.current.startWidth - delta;
      onWidthChange(Math.min(Math.max(raw, 340), window.innerWidth * 0.75));
    };
    const onUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [onWidthChange, width]);

  return (
    <aside
      className="fixed inset-0 z-40 flex bg-background/55 backdrop-blur-sm xl:absolute xl:inset-y-0 xl:right-0 xl:left-auto xl:bg-transparent xl:backdrop-blur-0"
      data-testid="acquisition-command-drawer"
    >
      <button type="button" aria-label={t('close')} onClick={onClose} className="hidden flex-1 xl:block" />
      <div
        className="relative ml-auto flex h-full w-full max-w-xl flex-col border-l border-[rgba(var(--accent-rgb),0.16)] shadow-2xl shadow-black/30 dark:border-[rgba(var(--accent-rgb),0.18)] dark:shadow-black/65 xl:max-w-none"
        style={{ width: `${width}px`, background: 'var(--console-bg, var(--bg))' } as CSSProperties}
      >
        <div onPointerDown={handleDragStart} aria-hidden="true" className="absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize touch-none items-center justify-center xl:flex">
          <div className={cn('h-10 w-1 rounded-full transition-colors', isDragging ? 'bg-accent' : 'bg-border hover:bg-accent/60')} />
        </div>
        <div className="flex items-center justify-between border-b border-[rgba(var(--accent-rgb),0.16)] bg-background px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-text">{t('evidencePaneTitle')}</p>
            <p className="text-xs text-text-muted">{opportunity ? titleFor(opportunity) : t('emptyCockpitTitle')}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <DrawerEvidence workspaceId={workspaceId} opportunity={opportunity} claims={claims} documentCount={documentCount} missingItems={missingItems} />
        </div>
      </div>
    </aside>
  );
}

function claimValue(claim: AcquisitionClaimRow): string {
  const value = claim.value_json?.value ?? claim.value_json;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') return JSON.stringify(value);
  return '';
}

function firstEvidenceRef(claim: AcquisitionClaimRow): Record<string, unknown> | null {
  const refs = claim.evidence_refs_json;
  if (Array.isArray(refs) && refs[0] && typeof refs[0] === 'object') return refs[0] as Record<string, unknown>;
  if (refs && typeof refs === 'object') return refs as Record<string, unknown>;
  return null;
}

function evidenceHrefForClaim(claim: AcquisitionClaimRow, workspaceId: string): string | null {
  const ref = firstEvidenceRef(claim);
  if (!ref) return null;
  const sourceUrl = typeof ref.source_url === 'string' ? ref.source_url : null;
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  const documentId = typeof ref.document_id === 'string' ? ref.document_id : typeof ref.source_document_id === 'string' ? ref.source_document_id : null;
  if (!documentId) return null;
  const params = new URLSearchParams();
  const page = typeof ref.page === 'number' ? ref.page : typeof ref.page_number === 'number' ? ref.page_number : null;
  const quote = typeof ref.quote === 'string' ? ref.quote : typeof ref.snippet === 'string' ? ref.snippet : null;
  const bbox = ref.bbox && typeof ref.bbox === 'object' ? ref.bbox as Record<string, unknown> : null;
  if (page) params.set('page', String(page));
  if (quote) params.set('quote', quote);
  if (bbox && ['x', 'y', 'width', 'height'].every((key) => typeof bbox[key] === 'number')) {
    params.set('bbox', `${bbox.x},${bbox.y},${bbox.width},${bbox.height}`);
  }
  return `/workspaces/${encodeURIComponent(workspaceId)}/documents/${encodeURIComponent(documentId)}${params.size ? `?${params.toString()}` : ''}`;
}

function DrawerEvidence({
  workspaceId,
  opportunity,
  claims,
  documentCount,
  missingItems,
}: {
  workspaceId: string;
  opportunity: OpportunityRow | null;
  claims: AcquisitionClaimRow[];
  documentCount: number;
  missingItems: string[];
}) {
  const t = useTranslations('workspaceCockpitPage');
  const sourceUrl = sourceUrlFor(opportunity);
  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-highlight">{t('drawer.evidence')}</p>
        <h3 className="mt-1 text-xl font-semibold text-text">{t('evidenceDrawerTitle')}</h3>
        <p className="mt-2 text-sm leading-6 text-text-soft">{t('sourceDocuments', { count: documentCount })}</p>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex max-w-full items-center gap-2 rounded-[12px] border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent">
            <ExternalLink className="h-4 w-4" />
            <span className="truncate">{displayUrl(sourceUrl)}</span>
          </a>
        ) : null}
      </Panel>
      {claims.length === 0 ? (
        <Panel className="p-5">
          <p className="text-sm leading-6 text-text-soft">{t('noClaims')}</p>
        </Panel>
      ) : claims.map((claim) => {
        const href = evidenceHrefForClaim(claim, workspaceId);
        return (
          <Panel key={claim.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">{humanize(claim.fact_key) || t('factFallback')}</p>
                <p className="mt-1 break-words text-sm leading-6 text-text-soft">{claimValue(claim) || t('notSet')}</p>
                <p className="mt-2 text-xs text-text-muted">{[humanize(claim.basis_label), claim.source_channel, claim.confidence ? `${Math.round(claim.confidence * 100)}%` : null].filter(Boolean).join(' · ')}</p>
              </div>
              <ConfidenceDot basis={claim.basis_label} />
            </div>
            {href ? (
              <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-[10px] border border-highlight/25 bg-highlight/10 px-3 py-2 text-xs font-semibold text-highlight">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t('showSource')}
              </a>
            ) : (
              <p className="mt-3 rounded-[10px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-3 py-2 text-xs text-text-muted">{t('noSourceAttached')}</p>
            )}
          </Panel>
        );
      })}
      {missingItems.length ? (
        <Panel className="p-5">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-warning">{t('decisionBlockers')}</p>
          <div className="mt-3 space-y-2">
            {missingItems.slice(0, 6).map((item) => <p key={item} className="rounded-[10px] bg-warning/10 px-3 py-2 text-sm text-text">{item}</p>)}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function DrawerMap({ opportunity }: { opportunity: OpportunityRow | null }) {
  const t = useTranslations('workspaceCockpitPage');
  const title = titleFor(opportunity) || t('emptyCockpitTitle');
  return (
    <Panel className="p-4">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-highlight">{t('drawer.map')}</p>
      <h3 className="mt-1 text-xl font-semibold text-text">{title}</h3>
      <div className="mt-4">
        <GoogleLocationMap opportunity={opportunity} minHeight={360} />
      </div>
    </Panel>
  );
}

function LiveFeedRail({
  events,
  latestUpdate,
  opportunity,
  missingItems,
  openItems,
  confidence,
  primaryActionResult,
  hasActionBlocker,
}: {
  events: AcquisitionEventRow[];
  latestUpdate: string | null;
  opportunity: OpportunityRow | null;
  missingItems: string[];
  openItems: number;
  confidence: string;
  primaryActionResult: string;
  hasActionBlocker: boolean;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const marketSignal = metadataString(opportunity, ['comps_note', 'market_context', 'valuation_note']);
  const brokerSignal = metadataString(opportunity, ['broker_note', 'counterparty_note', 'seller_note']);
  const titleSignal = metadataString(opportunity, ['title_note', 'title_status', 'deed_status']);
  const selectedEvents = events
    .filter((event) => !opportunity?.id || !event.opportunity_id || event.opportunity_id === opportunity.id)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const eventFeedItems: LiveFeedItem[] = selectedEvents.map((event) => ({
    id: event.id,
    tag: feedTagForEvent(event.event_type, t),
    title: humanize(event.event_type) || t('feedEventTitle'),
    body: event.body_text || t('emptyLog'),
    time: event.created_at,
    tone: feedToneForEvent(event.event_type),
  }));
  const rawFeedItems: Array<LiveFeedItem | null> = [
    ...eventFeedItems,
    {
      id: 'next-action',
      tag: t('feedTags.next'),
      title: t('feedNextTitle'),
      body: primaryActionResult,
      time: latestUpdate,
      tone: hasActionBlocker ? 'warn' : 'lime',
    },
    missingItems[0] ? {
      id: 'risk',
      tag: t('feedTags.risk'),
      title: t('feedRiskTitle'),
      body: missingItems[0],
      time: latestUpdate,
      tone: 'warn',
    } : null,
    {
      id: 'diligence',
      tag: openItems > 0 ? t('feedTags.risk') : t('feedTags.clear'),
      title: t('feedDiligenceTitle'),
      body: openItems > 0 ? t('feedDiligenceBody', { count: openItems }) : t('feedDiligenceClear'),
      time: latestUpdate,
      tone: openItems > 0 ? 'warn' : 'lime',
    },
    {
      id: 'confidence',
      tag: t('confidence'),
      title: t('feedConfidenceTitle'),
      body: t('feedConfidenceBody', { confidence }),
      time: latestUpdate,
      tone: 'cyan',
    },
    marketSignal ? {
      id: 'market',
      tag: t('feedTags.market'),
      title: t('trust.marketSignal'),
      body: marketSignal,
      time: latestUpdate,
      tone: 'lime',
    } : null,
    brokerSignal ? {
      id: 'broker',
      tag: t('feedTags.broker'),
      title: t('trust.counterparty'),
      body: brokerSignal,
      time: latestUpdate,
      tone: 'cyan',
    } : null,
    titleSignal ? {
      id: 'title',
      tag: t('feedTags.title'),
      title: t('feedTitleTitle'),
      body: titleSignal,
      time: latestUpdate,
      tone: 'neutral',
    } : null,
  ];
  const feedItems = rawFeedItems.filter((item): item is LiveFeedItem => Boolean(item)).slice(0, 10);

  return (
    <aside className="relative hidden h-full w-[344px] shrink-0 overflow-y-auto border-l border-border bg-[radial-gradient(circle_at_24%_8%,rgba(var(--accent-rgb),.045),transparent_32%),var(--panel-bg)] bg-surface p-5 shadow-[var(--shadowSm)] backdrop-blur min-[1440px]:block 2xl:w-[388px]">
      <div className="space-y-4">
        <Panel className="overflow-hidden rounded-[18px] border-[rgba(var(--accent-rgb),0.12)] p-0">
          <div className="px-5 py-5">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">{t('liveFeed')}</p>
              <h3 className="mt-2 text-2xl font-bold leading-tight text-text">{t('coordinationLog')}</h3>
              <p className="mt-2 text-sm leading-6 text-text-soft">{t('feedSubtitle')}</p>
            </div>
          </div>

          <div className="space-y-3 px-5 pb-5">
            {feedItems.length === 0 ? (
              <p className="rounded-[18px] border border-[rgba(var(--accent-rgb),0.18)] bg-surface-alt/70 p-4 text-sm leading-6 text-text-soft">{t('emptyLog')}</p>
            ) : (
              feedItems.map((item) => <LiveFeedRow key={item.id} item={item} />)
            )}
          </div>
        </Panel>
      </div>
    </aside>
  );
}

function MandateActionsPanel({
  openItems,
  confidence,
  title,
  actionLabel,
  actionResult,
  blocked,
  busy,
  opportunity,
  onPrimaryAction,
  onAddEvidence,
  onUploadPropertyDocument,
  onOpenBuyerVault,
  onScheduleVisit,
  onPassProperty,
}: {
  openItems: number;
  confidence: string;
  title: string;
  actionLabel: string;
  actionResult: string;
  blocked: boolean;
  busy: boolean;
  opportunity: OpportunityRow | null;
  onPrimaryAction: () => void;
  onAddEvidence: () => void;
  onUploadPropertyDocument: () => void;
  onOpenBuyerVault: () => void;
  onScheduleVisit: () => void;
  onPassProperty: () => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const commands = [
    { key: 'evidence', label: t('actionDock.addEvidence'), meta: t('actionDock.addEvidenceMeta'), onClick: onAddEvidence, disabled: false },
    { key: 'property-document', label: t('actionDock.uploadPropertyDocument'), meta: t('actionDock.uploadPropertyDocumentMeta'), onClick: onUploadPropertyDocument, disabled: !opportunity },
    { key: 'buyer-vault', label: t('actionDock.openBuyerVault'), meta: t('actionDock.openBuyerVaultMeta'), onClick: onOpenBuyerVault, disabled: false },
    { key: 'visit', label: t('scheduleVisit'), meta: t('progress.nextVisit'), onClick: onScheduleVisit, disabled: !opportunity },
    { key: 'pass', label: t('pass'), meta: t('actionDock.passMeta'), onClick: onPassProperty, disabled: !opportunity },
  ];
  return (
    <Panel className={cn('overflow-hidden p-0', blocked ? 'border-warning/30' : 'border-success/25')}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-text-soft">{t('mandateActions')}</p>
            <h3 className="mt-2 text-xl font-bold leading-tight text-text">{title}</h3>
          </div>
          <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[12px]', blocked ? 'bg-warning text-[color:var(--accent-text)]' : 'bg-success text-[color:var(--accent-text)]')}>
            {blocked ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold', openItems > 0 ? 'border-warning/30 bg-warning/10 text-warning' : 'border-success/25 bg-success/10 text-success')}>
            {openItems} {t('openItems')}
          </span>
          <span className="rounded-full border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt px-2.5 py-1 text-[11px] font-semibold text-text-soft">
            {t('confidence')}: {confidence}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-text-soft">{actionResult}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className={cn('h-px flex-1', blocked ? 'bg-warning/30' : 'bg-success/25')} />
          <p className={cn('font-mono text-[11px] uppercase tracking-[0.2em]', blocked ? 'text-warning' : 'text-success')}>
            {t('actionDock.title')}
          </p>
          <div className={cn('h-px flex-1', blocked ? 'bg-warning/30' : 'bg-success/25')} />
        </div>
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={busy}
          className={cn(
            'mt-3 w-full rounded-[14px] px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60',
            blocked ? 'bg-warning text-[color:var(--accent-text)]' : 'bg-success text-[color:var(--accent-text)]'
          )}
        >
          {busy ? t('actionDock.working') : actionLabel}
        </button>
      </div>
      <details className="group border-t border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt/55">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-text-soft transition hover:text-text">
          <span>{t('actionDock.moreCommands')}</span>
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-2 px-3 pb-3">
          {commands.map((command) => (
            <button
              key={command.key}
              type="button"
              onClick={command.onClick}
              disabled={busy || command.disabled}
              className="w-full rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface px-3 py-2 text-left transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="block text-sm font-semibold text-text">{command.label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-text-muted">{command.meta}</span>
            </button>
          ))}
        </div>
      </details>
    </Panel>
  );
}

function LiveFeedRow({ item }: { item: LiveFeedItem }) {
  const toneClass = {
    lime: 'text-accent',
    cyan: 'text-highlight',
    warn: 'text-warning',
    neutral: 'text-text-muted',
  }[item.tone];
  const toneBorder = {
    lime: 'border-accent/18 shadow-[inset_0_1px_0_rgba(var(--accent-rgb),.05)]',
    cyan: 'border-highlight/18 shadow-[inset_0_1px_0_rgba(var(--highlight-rgb),.05)]',
    warn: 'border-warning/22 shadow-[inset_0_1px_0_rgba(255,199,89,.06)]',
    neutral: 'border-[rgba(var(--accent-rgb),0.12)] shadow-[inset_0_1px_0_rgba(var(--accent-rgb),.04)]',
  }[item.tone];
  const dotClass = {
    lime: 'bg-accent shadow-[0_0_12px_var(--accent-soft)]',
    cyan: 'bg-highlight shadow-[0_0_12px_rgba(var(--highlight-rgb),.22)]',
    warn: 'bg-warning shadow-[0_0_12px_rgba(255,199,89,.2)]',
    neutral: 'bg-text-muted',
  }[item.tone];
  return (
    <article className={cn('rounded-[18px] border bg-surface-alt/40 px-4 py-3.5 transition hover:border-accent/28', toneBorder)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />
          <p className={cn('truncate font-mono text-[10px] uppercase tracking-[0.2em]', toneClass)}>{item.tag}</p>
        </div>
        {item.time ? <span className={cn('shrink-0 text-right text-[11px] font-semibold', toneClass)}>{formatRelativeTime(item.time)}</span> : null}
      </div>
      <p className="mt-3 line-clamp-2 break-words text-sm font-semibold leading-5 text-text" dir="auto">{item.title}</p>
      <p className="mt-1.5 line-clamp-3 break-words text-sm leading-6 text-text-soft" dir="auto">{item.body}</p>
    </article>
  );
}

function feedTagForEvent(eventType: string | null | undefined, t: ReturnType<typeof useTranslations>): string {
  const type = `${eventType ?? ''}`.toLowerCase();
  if (type.includes('broker') || type.includes('outreach') || type.includes('message')) return t('feedTags.broker');
  if (type.includes('risk') || type.includes('missing') || type.includes('diligence')) return t('feedTags.risk');
  if (type.includes('title') || type.includes('deed')) return t('feedTags.title');
  if (type.includes('evidence') || type.includes('document') || type.includes('source')) return t('feedTags.records');
  return t('feedTags.action');
}

function feedToneForEvent(eventType: string | null | undefined): LiveFeedTone {
  const type = `${eventType ?? ''}`.toLowerCase();
  if (type.includes('risk') || type.includes('missing') || type.includes('diligence')) return 'warn';
  if (type.includes('evidence') || type.includes('document') || type.includes('source') || type.includes('broker')) return 'cyan';
  return 'neutral';
}

function RightPane({
  activeModule,
  events,
  latestUpdate,
  documentCount,
  opportunity,
  missingItems,
  scenario,
  readinessProfile,
  readinessEvidence,
  sharingGrants,
  actionApprovals,
  brokerageActive,
  approvalBusy,
  approvalError,
  onRequestAction,
}: {
  activeModule: CockpitModule;
  events: AcquisitionEventRow[];
  latestUpdate: string | null;
  documentCount: number;
  opportunity: OpportunityRow | null;
  missingItems: string[];
  scenario: ScenarioState | null;
  readinessProfile: BuyerReadinessProfileRow | null;
  readinessEvidence: BuyerReadinessEvidenceRow[];
  sharingGrants: DocumentSharingGrantRow[];
  actionApprovals: ExternalActionApprovalRow[];
  brokerageActive: boolean;
  approvalBusy: string | null;
  approvalError: string | null;
  onRequestAction: (actionType: string) => Promise<void>;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const titleKey = {
    overview: 'rightPaneTitles.evidence',
    model: 'rightPaneTitles.model',
    renovation: 'rightPaneTitles.renovation',
    openItems: 'rightPaneTitles.openItems',
    outreach: 'rightPaneTitles.openItems',
    offer: 'rightPaneTitles.model',
  }[activeModule];

  return (
    <aside className="space-y-5">
      <BuyerReadinessPanel
        profile={readinessProfile}
        evidence={readinessEvidence}
        grants={sharingGrants}
        approvals={actionApprovals}
      />

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

        <div className="mb-5 flex h-20 items-end gap-1 rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-background/50 p-3">
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
              <div key={event.id} className="rounded-3xl border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4">
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
        <button
          className="w-full rounded-[12px] bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)] shadow-[0_0_22px_var(--accent-soft)] hover:bg-accent-alt disabled:cursor-not-allowed disabled:opacity-55"
          disabled={!opportunity || !brokerageActive || Boolean(approvalBusy)}
          onClick={() => void onRequestAction('send_negotiation_message')}
        >
          {t('proceedNegotiate')}
        </button>
        {!brokerageActive ? (
          <p className="mt-2 rounded-[10px] border border-warning/25 bg-warning/10 px-3 py-2 text-xs leading-5 text-text-soft">
            {t('brokerageGateHint')}
          </p>
        ) : null}
        {approvalError ? (
          <p className="mt-2 rounded-[10px] border border-error/25 bg-error/10 px-3 py-2 text-xs leading-5 text-error">
            {approvalError}
          </p>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className="rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface px-4 py-3 text-sm font-semibold text-text disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!opportunity || !readinessProfile || Boolean(approvalBusy)}
            onClick={() => void onRequestAction('schedule_visit')}
          >
            {t('scheduleVisit')}
          </button>
          <button className="rounded-[12px] border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error disabled:cursor-not-allowed disabled:opacity-55" disabled={!opportunity}>{t('pass')}</button>
        </div>
      </Panel>
    </aside>
  );
}

function BuyerReadinessPanel({
  profile,
  evidence,
  grants,
  approvals,
}: {
  profile: BuyerReadinessProfileRow | null;
  evidence: BuyerReadinessEvidenceRow[];
  grants: DocumentSharingGrantRow[];
  approvals: ExternalActionApprovalRow[];
}) {
  const t = useTranslations('workspaceCockpitPage');
  if (!profile) {
    return (
      <Panel className="p-5" data-testid="buyer-readiness-panel">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-highlight">{t('buyerReadiness.title')}</p>
            <h3 className="mt-1 text-xl font-semibold text-text">{t('buyerReadiness.emptyTitle')}</h3>
          </div>
          <ShieldCheck className="h-5 w-5 text-highlight" />
        </div>
        <p className="text-sm leading-6 text-text-soft">{t('buyerReadiness.emptyBody')}</p>
        <p className="mt-3 rounded-[12px] border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">{t('buyerReadiness.usePrimaryAction')}</p>
      </Panel>
    );
  }

  const level = Math.max(0, Math.min(5, Math.round(profile.readiness_level ?? 0)));
  const activeGrants = activeGrantCount(grants);
  const evidenceChecklist = readinessChecklist(profile, evidence, {
    mandate: t('buyerReadiness.checklistMandate'),
    identity: t('buyerReadiness.checklistIdentity'),
    funding: t('buyerReadiness.checklistFunding'),
    commercialRegistration: t('buyerReadiness.checklistCommercialRegistration'),
    authority: t('buyerReadiness.checklistAuthority'),
    beneficialOwner: t('buyerReadiness.checklistBeneficialOwner'),
    brokerage: t('buyerReadiness.checklistBrokerage'),
    complete: t('buyerReadiness.checklistComplete'),
    missing: t('buyerReadiness.checklistMissing'),
  });
  return (
    <Panel className="p-5" data-testid="buyer-readiness-panel">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-highlight">{t('buyerReadiness.title')}</p>
          <h3 className="mt-1 text-xl font-semibold text-text">{t('buyerReadiness.level', { level })}</h3>
          <p className="mt-2 text-xs leading-5 text-text-muted">{profile.mandate_summary || t('buyerReadiness.noMandate')}</p>
        </div>
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] border border-highlight/30 bg-highlight/10 font-mono text-lg font-bold text-highlight">
          {level}/5
        </div>
      </div>

      <div className="grid gap-2">
        <RightPaneRow label={t('buyerReadiness.buyerType')} value={humanize(profile.buyer_type) || t('notSet')} tone="neutral" />
        <RightPaneRow label={t('buyerReadiness.fundingPath')} value={humanize(profile.funding_path) || t('notSet')} tone={statusTone(profile.evidence_status)} />
        <RightPaneRow label={t('buyerReadiness.sharingMode')} value={humanize(profile.sharing_mode) || t('notSet')} tone={activeGrants > 0 ? 'lime' : 'neutral'} />
        <RightPaneRow label={t('buyerReadiness.visitReadiness')} value={profile.visit_readiness || t('notSet')} tone="cyan" />
        <RightPaneRow label={t('buyerReadiness.brokerageStatus')} value={humanize(profile.brokerage_status) || t('notSet')} tone={statusTone(profile.brokerage_status)} />
        <RightPaneRow label={t('buyerReadiness.kycState')} value={humanize(profile.kyc_state) || t('notSet')} tone={statusTone(profile.kyc_state)} />
      </div>

      <div className="mt-5 grid gap-3">
        <ReadinessList
          title={t('buyerReadiness.checklistTitle')}
          empty={t('buyerReadiness.noChecklist')}
          items={evidenceChecklist.map((item) => ({
            id: item.id,
            label: item.label,
            meta: item.status,
            tone: item.complete ? 'lime' : 'warn',
          }))}
        />
        <ReadinessList
          title={t('buyerReadiness.evidenceTitle')}
          empty={t('buyerReadiness.noEvidence')}
          items={evidence.map((item) => ({
            id: item.id,
            label: humanize(item.evidence_type) || t('buyerReadiness.evidenceFallback'),
            meta: [
              humanize(item.status),
              humanize(item.sensitivity_level),
              item.expires_at ? t('buyerReadiness.expires', { time: formatRelativeTime(item.expires_at) }) : null,
            ].filter(Boolean).join(' · '),
            tone: statusTone(item.status),
          }))}
        />
        <ReadinessList
          title={t('buyerReadiness.sharingTitle')}
          empty={t('buyerReadiness.noSharing')}
          items={grants.map((item) => ({
            id: item.id,
            label: humanize(item.share_mode) || t('buyerReadiness.shareFallback'),
            meta: [
              humanize(item.allowed_action),
              item.revoked_at ? t('buyerReadiness.revoked') : item.expires_at ? t('buyerReadiness.expires', { time: formatRelativeTime(item.expires_at) }) : t('buyerReadiness.noExpiry'),
            ].filter(Boolean).join(' · '),
            tone: item.revoked_at ? 'warn' : 'lime',
          }))}
        />
        <ReadinessList
          title={t('buyerReadiness.approvalsTitle')}
          empty={t('buyerReadiness.noApprovals')}
          items={approvals.map((item) => ({
            id: item.id,
            label: humanize(item.action_type) || t('buyerReadiness.actionFallback'),
            meta: [
              humanize(item.approval_status),
              item.executed_at ? t('buyerReadiness.executed', { time: formatRelativeTime(item.executed_at) }) : null,
            ].filter(Boolean).join(' · '),
            tone: statusTone(item.approval_status),
          }))}
        />
      </div>
    </Panel>
  );
}

function ReadinessList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { id: string; label: string; meta: string; tone: 'neutral' | 'lime' | 'cyan' | 'warn' }[];
}) {
  const toneClass = {
    neutral: 'border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt text-text-muted',
    lime: 'border-accent/20 bg-accent/10 text-accent',
    cyan: 'border-highlight/20 bg-highlight/10 text-highlight',
    warn: 'border-warning/25 bg-warning/10 text-warning',
  };
  return (
    <div className="rounded-[12px] border border-[rgba(var(--accent-rgb),0.16)] bg-background/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm leading-5 text-text-soft">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 4).map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded-[10px] bg-surface-alt px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{item.label}</p>
                {item.meta ? <p className="mt-0.5 text-xs leading-5 text-text-muted">{item.meta}</p> : null}
              </div>
              <span className={cn('mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border', toneClass[item.tone])} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function readinessChecklist(
  profile: BuyerReadinessProfileRow,
  evidence: BuyerReadinessEvidenceRow[],
  labels: {
    mandate: string;
    identity: string;
    funding: string;
    commercialRegistration: string;
    authority: string;
    beneficialOwner: string;
    brokerage: string;
    complete: string;
    missing: string;
  }
) {
  const evidenceTypes = new Set(evidence.map((item) => item.evidence_type).filter(Boolean));
  const hasAny = (...keys: string[]) => keys.some((key) => evidenceTypes.has(key));
  const buyerType = profile.buyer_type || 'individual';
  const isEntity = buyerType === 'company' || buyerType === 'family_office';
  const items = [
    { id: 'mandate', label: labels.mandate, complete: Boolean(profile.mandate_summary) },
  ];

  if (isEntity) {
    items.push(
      { id: 'commercial_registration', label: labels.commercialRegistration, complete: hasAny('commercial_registration') },
      { id: 'authority', label: labels.authority, complete: hasAny('authority_letter') },
      { id: 'beneficial_owner', label: labels.beneficialOwner, complete: hasAny('self_attestation') }
    );
  } else {
    items.push({ id: 'identity', label: labels.identity, complete: hasAny('identity') });
  }

  items.push(
    { id: 'funding', label: labels.funding, complete: Boolean(profile.funding_path) || hasAny('proof_of_funds', 'mortgage_preapproval') },
    { id: 'brokerage', label: labels.brokerage, complete: profile.brokerage_status === 'signed' || profile.brokerage_status === 'active' || hasAny('brokerage_agreement') }
  );

  return items.map((item) => ({
    ...item,
    status: item.complete ? labels.complete : labels.missing,
  }));
}

function RightPaneRow({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'lime' | 'cyan' | 'warn' }) {
  const toneClass = {
    neutral: 'border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt',
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

function basisTone(value: string | null | undefined): 'green' | 'cyan' | 'amber' | 'red' | 'grey' {
  switch (value) {
    case 'verified_source':
    case 'verified':
      return 'green';
    case 'counterparty_provided':
    case 'market_signal':
      return 'cyan';
    case 'modeled_output':
    case 'user_assumption':
      return 'amber';
    case 'contradicted':
    case 'rejected':
      return 'red';
    default:
      return 'grey';
  }
}

function ConfidenceDot({ basis }: { basis: string | null | undefined }) {
  const styles = {
    green: 'border-success/30 bg-success text-success',
    cyan: 'border-highlight/30 bg-highlight text-highlight',
    amber: 'border-accent/30 bg-accent text-accent',
    red: 'border-error/30 bg-error text-error',
    grey: 'border-[rgba(var(--accent-rgb),0.16)] bg-text-muted text-text-muted',
  }[basisTone(basis)];
  return <span className={cn('mt-1 h-3 w-3 shrink-0 rounded-full border shadow-[0_0_14px_currentColor]', styles)} />;
}

function FactCard({
  label,
  body,
  basis,
  info,
  onEvidence,
}: {
  label: string;
  body: string;
  basis: string;
  info: string;
  onEvidence: () => void;
}) {
  return (
    <div className="w-full rounded-[16px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4 text-left">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ConfidenceDot basis={basis} />
          <span className="rounded-[6px] border border-[rgba(var(--accent-rgb),0.16)] bg-background/40 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-text">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onEvidence} className="rounded-[8px] border border-highlight/25 bg-highlight/10 p-1.5 text-highlight" aria-label="Evidence">
            <ShieldCheck className="h-3.5 w-3.5" />
          </button>
          <span className="group relative rounded-[8px] border border-[rgba(var(--accent-rgb),0.16)] bg-background/40 p-1.5 text-text-muted">
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-56 rounded-[10px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface p-3 text-xs leading-5 text-text shadow-xl group-hover:block">
              {info}
            </span>
          </span>
        </div>
      </div>
      <p className="text-sm leading-6 text-text">{body}</p>
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
    <div className="w-full rounded-[16px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4 text-left">
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
    <div className="rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="truncate text-xs font-semibold text-text-soft">{label}</p>
        <span className="rounded-[7px] border border-[rgba(var(--accent-rgb),0.24)] bg-accent/10 px-2 py-1 font-mono text-xs text-accent">{format(value)}</span>
      </div>
      <input className="w-full accent-accent" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function OutputMetric({ label, value, hot = false }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={cn('min-w-0 overflow-hidden rounded-[16px] border p-4', hot ? 'border-[rgba(var(--accent-rgb),0.42)] bg-accent/10' : 'border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt')}>
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-text-soft">{label}</p>
      <p className="mt-2 min-w-0 overflow-hidden break-words font-mono text-2xl font-semibold leading-tight text-text 2xl:text-3xl">{value}</p>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hot = false, compact = false }: { icon: LucideIcon; label: string; value: string; hot?: boolean; compact?: boolean }) {
  return (
    <Panel className={cn(compact ? 'p-3' : 'p-4', hot && 'border-[rgba(var(--accent-rgb),0.34)] bg-accent/10')}>
      <Icon className="h-4 w-4 text-accent" />
      <p className="mt-3 truncate text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className={cn('mt-1 truncate font-semibold text-text', compact ? 'text-xl' : 'text-2xl')}>{value}</p>
    </Panel>
  );
}

function DecisionBlock({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-[16px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-4">
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
      className={cn('rounded-[20px] border', cockpitBorder, cockpitPanel, 'backdrop-blur', className)}
      {...props}
    >
      {children}
    </div>
  );
}

function SignalDot({ hot, warn = false }: { hot?: boolean; warn?: boolean }) {
  return <span className={cn('h-3 w-3 rounded-full', hot ? 'bg-success shadow-[0_0_14px_currentColor]' : warn ? 'bg-warning shadow-[0_0_14px_currentColor]' : 'bg-text-muted')} />;
}

function TrustPill({ label, tone }: { label: string; tone: 'lime' | 'amber' | 'cyan' | 'slate' }) {
  const styles = {
    lime: 'border-accent/30 bg-accent/10 text-accent',
    amber: 'border-warning/30 bg-warning/10 text-warning',
    cyan: 'border-highlight/30 bg-highlight/10 text-highlight',
    slate: 'border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt text-text',
  }[tone];
  return <span className={cn('rounded-[8px] border px-3 py-1 font-mono text-xs uppercase tracking-[0.08em]', styles)}>{label}</span>;
}
