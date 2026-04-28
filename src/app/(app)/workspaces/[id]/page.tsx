'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileText,
  Gauge,
  HelpCircle,
  Home,
  Map,
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
  seedScenarioFromOpportunity,
} from '@/lib/acquisition-workspace-ui';
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
};

type AcquisitionEventRow = {
  id: string;
  event_type?: string | null;
  body_text?: string | null;
  created_at?: string | null;
};

type BuyerReadinessProfileRow = {
  id: string;
  buyer_entity_id?: string | null;
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

type BuyerEntityRow = {
  id: string;
  entity_type?: string | null;
  display_name?: string | null;
  legal_name?: string | null;
  default_kyc_state?: string | null;
  status?: string | null;
};

type BuyerEntityDocumentRow = {
  id: string;
  buyer_entity_id?: string | null;
  document_id?: string | null;
  document_role?: string | null;
  sensitivity_level?: string | null;
  status?: string | null;
  expires_at?: string | null;
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
type PrimaryWorkspaceTab = 'deal' | 'actions';
type EvidencePaneTab = 'evidence' | 'activity' | 'files' | 'consent';

type ScenarioState = {
  price: number;
  renovation: number;
  rent: number;
  vacancy: number;
  hold: number;
  appreciation: number;
};

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

function titleFor(item: OpportunityRow | null | undefined): string | null {
  return displayTitleForOpportunity(item);
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
  const [buyerEntity, setBuyerEntity] = useState<BuyerEntityRow | null>(null);
  const [buyerEntityDocuments, setBuyerEntityDocuments] = useState<BuyerEntityDocumentRow[]>([]);
  const [readinessEvidence, setReadinessEvidence] = useState<BuyerReadinessEvidenceRow[]>([]);
  const [sharingGrants, setSharingGrants] = useState<DocumentSharingGrantRow[]>([]);
  const [actionApprovals, setActionApprovals] = useState<ExternalActionApprovalRow[]>([]);
  const [documentCount, setDocumentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<CockpitModule>('model');
  const [activePrimaryTab, setActivePrimaryTab] = useState<PrimaryWorkspaceTab>('deal');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeEvidenceTab, setActiveEvidenceTab] = useState<EvidencePaneTab>('evidence');
  const [drawerWidth, setDrawerWidth] = useState(430);
  const [heroMapOpen, setHeroMapOpen] = useState(false);
  const [scenario, setScenario] = useState<ScenarioState | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [readinessBusy, setReadinessBusy] = useState(false);
  const [scenarioBusy, setScenarioBusy] = useState(false);
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
          .select('id, stage, title, acquisition_focus, area_summary, budget_band, metadata_json, summary, missing_info_json, screening_readiness, updated_at')
          .eq('workspace_id', workspaceId)
          .neq('stage', 'archived')
          .order('updated_at', { ascending: false })
          .limit(12),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabase
          .from('buyer_readiness_profiles')
          .select('id, buyer_entity_id, buyer_type, mandate_summary, funding_path, readiness_level, evidence_status, sharing_mode, visit_readiness, brokerage_status, kyc_state, updated_at')
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
        const [entityResult, entityDocsResult, evidenceResult, grantsResult, approvalsResult] = await Promise.all([
          currentReadinessProfile.buyer_entity_id
            ? supabase
                .from('buyer_entities')
                .select('id, entity_type, display_name, legal_name, default_kyc_state, status')
                .eq('id', currentReadinessProfile.buyer_entity_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          currentReadinessProfile.buyer_entity_id
            ? supabase
                .from('buyer_entity_documents')
                .select('id, buyer_entity_id, document_id, document_role, sensitivity_level, status, expires_at')
                .eq('buyer_entity_id', currentReadinessProfile.buyer_entity_id)
                .order('created_at', { ascending: false })
                .limit(12)
            : Promise.resolve({ data: [] }),
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
        setBuyerEntity((entityResult.data as BuyerEntityRow | null) ?? null);
        setBuyerEntityDocuments((entityDocsResult.data ?? []) as BuyerEntityDocumentRow[]);
        setReadinessEvidence((evidenceResult.data ?? []) as BuyerReadinessEvidenceRow[]);
        setSharingGrants((grantsResult.data ?? []) as DocumentSharingGrantRow[]);
        setActionApprovals((approvalsResult.data ?? []) as ExternalActionApprovalRow[]);
      } else {
        const approvalsResult = await approvalsPromise;
        setBuyerEntity(null);
        setBuyerEntityDocuments([]);
        setReadinessEvidence([]);
        setSharingGrants([]);
        setActionApprovals((approvalsResult.data ?? []) as ExternalActionApprovalRow[]);
      }

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
  const brokerageActive = readinessProfile?.brokerage_status === 'signed' || readinessProfile?.brokerage_status === 'active';
  const currentBlocker = !readinessProfile
    ? t('progress.nextReadiness')
    : selectedMissing.length > 0
      ? t('progress.nextDiligence')
      : !brokerageActive
        ? t('progress.nextBrokerage')
        : t('progress.nextOffer');

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
  }, [selectedOpportunity]);

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

  const openDrawer = useCallback((tab: WorkspaceDrawerTab) => {
    if (tab === 'activity' || tab === 'files' || tab === 'consent' || tab === 'evidence') {
      setActiveEvidenceTab(tab);
    } else {
      setActiveEvidenceTab('evidence');
    }
    setDrawerOpen(true);
  }, []);

  const openBuyerVault = useCallback((upload = false) => {
    const sourceParams = new URLSearchParams({ view: 'buyer_vault', intent: 'readiness' });
    if (upload) sourceParams.set('upload', '1');
    router.push(`/workspaces/${encodeURIComponent(workspaceId)}/sources?${sourceParams.toString()}`);
  }, [router, workspaceId]);

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

  const startReadiness = useCallback(async () => {
    setReadinessBusy(true);
    setApprovalError(null);
    try {
      const mandateSummary = workspace?.analysis_brief || workspace?.description || workspace?.name || null;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: entityData, error: entityError } = await supabase
        .from('buyer_entities')
        .insert({
          owner_user_id: user?.id ?? workspace?.owner_id ?? null,
          organization_id: workspace?.org_id ?? null,
          entity_type: 'individual',
          display_name: mandateSummary || workspace?.name || 'Buyer',
          default_kyc_state: 'not_started',
          metadata_json: { source: 'web_acquisition_cockpit' },
        })
        .select('id, entity_type, display_name, legal_name, default_kyc_state, status')
        .single();
      if (entityError) throw entityError;
      const { data, error } = await supabase
        .from('buyer_readiness_profiles')
        .insert({
          workspace_id: workspaceId,
          buyer_entity_id: entityData.id,
          mandate_summary: mandateSummary,
          readiness_level: mandateSummary ? 1 : 0,
          evidence_status: 'self_declared',
          sharing_mode: 'private',
          brokerage_status: 'not_started',
          kyc_state: 'not_started',
        })
        .select('id, buyer_entity_id, buyer_type, mandate_summary, funding_path, readiness_level, evidence_status, sharing_mode, visit_readiness, brokerage_status, kyc_state, updated_at')
        .single();
      if (error) throw error;
      setBuyerEntity(entityData as BuyerEntityRow);
      setBuyerEntityDocuments([]);
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
      const metadata = {
        ...(selectedOpportunity.metadata_json ?? {}),
        price: nextScenario.price,
        acquisition_price: nextScenario.price,
        monthly_rent: nextScenario.rent,
        renovation_budget: nextScenario.renovation,
        vacancy: nextScenario.vacancy,
        hold_period: nextScenario.hold,
        appreciation: nextScenario.appreciation,
      };
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

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-background text-text dark:bg-[image:var(--console-bg)]">
      {!loading ? (
        <HeaderProgressPortal targetId={headerProgressSlotId}>
          <ProgressTracker
            opportunity={selectedOpportunity}
            missingItems={selectedMissing}
            readinessProfile={readinessProfile}
            brokerageActive={brokerageActive}
            onOpenDrawer={openDrawer}
            onRequestVisit={() => void requestExternalAction('schedule_visit')}
            compact
          />
        </HeaderProgressPortal>
      ) : null}
      <div className={cn('relative flex min-h-0 min-w-0 flex-1 overflow-hidden', agentOpen && 'hidden lg:flex')}>
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_-10%,rgba(var(--highlight-rgb,35,215,255),.12),transparent_36rem),radial-gradient(circle_at_88%_16%,rgba(var(--accent-rgb,185,255,38),.10),transparent_28rem),radial-gradient(circle_at_10%_84%,rgba(255,91,112,.06),transparent_24rem)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[var(--grid-opacity)] [background-image:linear-gradient(var(--grid-color)_1px,transparent_1px),linear-gradient(90deg,var(--grid-color)_1px,transparent_1px)] [background-size:var(--grid-size)_var(--grid-size)]" />

        <aside className="relative hidden h-full w-[360px] shrink-0 overflow-y-auto border-r border-border bg-surface-alt/85 p-6 shadow-[var(--shadowSm)] backdrop-blur xl:block">
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
          />
        </aside>

        <main
          className="relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain transition-[margin] duration-200"
          style={{ marginRight: drawerOpen ? drawerWidth : 0 }}
        >
          <div className="mx-auto flex min-h-full w-full max-w-[1760px] flex-col gap-5 p-4 pb-10 lg:p-6 lg:pb-12">
            {loading ? (
              <div className="grid min-h-[520px] place-items-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <div className="flex flex-1 gap-5">
                <section className="min-w-0 flex-1 space-y-5">
                  <div className="xl:hidden">
                    <OpportunityRail
                      opportunities={opportunities}
                      selectedId={selectedOpportunity?.id ?? null}
                      onSelect={setSelectedOpportunityId}
                      emptyText={t('emptyCandidates')}
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
                        onRequestVisit={() => void requestExternalAction('schedule_visit')}
                      />
                    </div>

                    <PrimaryWorkspaceTabs
                      active={activePrimaryTab}
                      openItems={selectedMissing.length}
                      onChange={setActivePrimaryTab}
                    />

	                  <div className="min-h-[380px] space-y-5">
                      {activePrimaryTab === 'deal' ? (
                        <>
                          <CockpitHero
                            opportunity={selectedOpportunity}
                            missingCount={selectedMissing.length}
                            documentCount={documentCount}
                            latestUpdate={latestUpdate}
                            mapOpen={heroMapOpen}
                            onToggleMap={() => setHeroMapOpen((open) => !open)}
                            onOpenDrawer={openDrawer}
                          />
                          <MandatePulse
                            candidates={opportunities.length}
                            pursue={pursueCount}
                            openItems={missingCount}
                            confidence={humanize(confidenceFor(selectedOpportunity)) || t('notSet')}
                          />
                          <ModelModule
                          opportunity={selectedOpportunity}
                          scenario={scenario}
                          saving={scenarioBusy}
                          onScenarioChange={setScenario}
                          onSave={saveScenarioAssumptions}
                        />
                          <RenovationModule
                            opportunity={selectedOpportunity}
                            onRequestQuote={() => void requestExternalAction('send_outreach', { request_kind: 'quote_pack' })}
                          />
                        </>
                      ) : (
                        <>
                          <CurrentBlockerBanner
                            title={currentBlocker}
                            onPrimaryAction={() => {
                              if (!readinessProfile) void startReadiness();
                              else if (selectedMissing.length) setActivePrimaryTab('actions');
                              else if (!brokerageActive) void requestExternalAction('share_readiness_signal');
                              else void requestExternalAction('send_negotiation_message');
                            }}
                            busy={Boolean(readinessBusy || approvalBusy)}
                          />
                          <BuyerReadinessPanel
                            profile={readinessProfile}
                            buyerEntity={buyerEntity}
                            buyerEntityDocuments={buyerEntityDocuments}
                            evidence={readinessEvidence}
                            grants={sharingGrants}
                            approvals={actionApprovals}
                            busy={readinessBusy}
                            onStart={startReadiness}
                            onAttachEvidence={() => openBuyerVault(true)}
                            onShareReadiness={() => void requestExternalAction('share_readiness_signal')}
                          />
                          <OpenItemsModule
                          items={selectedMissing}
                          onRequestItem={(item) => void requestExternalAction('send_outreach', { request_kind: 'missing_document', requested_item: item })}
                        />
                          <OutreachModule
                          opportunity={selectedOpportunity}
                          approvals={actionApprovals}
                          approvalBusy={approvalBusy}
                          onRequestAction={requestExternalAction}
                        />
                          <OfferModule
                          opportunity={selectedOpportunity}
                          brokerageActive={brokerageActive}
                          approvalBusy={approvalBusy}
                          onRequestAction={requestExternalAction}
                        />
                        </>
                      )}
	                  </div>
	                </section>
	              </div>
	            )}
	          </div>
	        </main>

          {drawerOpen ? (
            <WorkspaceCommandDrawer
              workspaceId={workspaceId}
              activeTab={activeEvidenceTab}
              width={drawerWidth}
              events={events}
              latestUpdate={latestUpdate}
              documentCount={documentCount}
              opportunity={selectedOpportunity}
              missingItems={selectedMissing}
              claims={claims}
              readinessEvidence={readinessEvidence}
              sharingGrants={sharingGrants}
              actionApprovals={actionApprovals}
              onTabChange={setActiveEvidenceTab}
              onClose={() => setDrawerOpen(false)}
              onWidthChange={setDrawerWidth}
            />
          ) : (
            <button
              type="button"
              onClick={() => openDrawer('evidence')}
              className="absolute bottom-6 right-6 z-30 hidden rounded-[14px] border border-accent/30 bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)] shadow-[0_0_28px_var(--accent-soft)] xl:inline-flex"
            >
              <PanelRightOpen className="mr-2 h-4 w-4" />
              {t('openEvidencePane')}
            </button>
          )}
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
  const brief = workspace?.analysis_brief || workspace?.description || '';
  const briefParts = brief.split(';').map((part) => part.trim()).filter(Boolean);
  const compactMandate = [
    briefParts[2] ? `${t('budgetRange')}: ${briefParts[2]}` : null,
    briefParts[1] ? `${t('targetLocations')}: ${briefParts[1]}` : null,
    briefParts[3] ? `${t('riskAppetite')}: ${briefParts[3]}` : null,
  ].filter((item): item is string => Boolean(item));
  return (
    <Panel className="mb-5 p-4" data-testid="acquisition-buy-box">
      <div className="mb-4 flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent/80">{t('buyBoxPinned')}</p>
          <p className="mt-1 text-xs text-text-muted">{t('buyBoxSubtitle')}</p>
          <p className="mt-2 truncate text-sm font-semibold text-text">{briefParts[0] || t('notSet')}</p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="grid h-9 w-9 place-items-center rounded-[10px] border border-border bg-surface text-text-soft transition hover:bg-surface-alt hover:text-text"
            aria-label={expanded ? t('collapseMandate') : t('expandMandate')}
            aria-expanded={expanded}
          >
            <ChevronDown className={cn('h-4 w-4 transition', expanded && 'rotate-180')} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="grid h-9 w-9 place-items-center rounded-[10px] border border-accent/25 bg-accent/10 text-accent transition hover:bg-accent/15"
            aria-label={t('editBuyBox')}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className={cn('space-y-2', !expanded && 'rounded-[12px] border border-border bg-surface-alt px-3 py-3')}>
        {!expanded ? (
          <div className="flex flex-wrap gap-2">
            {(compactMandate.length ? compactMandate : [t('notSet')]).map((item) => (
              <span key={item} className="max-w-full truncate rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-text-soft">
                {item}
              </span>
            ))}
          </div>
        ) : null}
        {expanded ? (
          <>
        <div className="rounded-[12px] border border-border bg-surface-alt px-3 py-3 text-sm font-semibold leading-5 text-text">
          {briefParts[0] || t('notSet')}
        </div>
        <div className="space-y-1.5">
          {(compactMandate.length ? compactMandate : [t('notSet')]).map((item) => (
            <p key={item} className="truncate text-xs text-text-soft">{item}</p>
          ))}
        </div>
          </>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={onSource}
          className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-accent px-3 py-2.5 text-sm font-bold text-[color:var(--accent-text)] shadow-[0_0_18px_var(--accent-soft)] transition hover:bg-accent-alt"
        >
          <Radar className="h-4 w-4" />
          {t('sourceDeals')}
        </button>
        <button
          type="button"
          onClick={onOpenAgent}
          className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-text transition hover:bg-surface-alt"
        >
          <MessageSquare className="h-4 w-4" />
          {t('openSourcingAgent')}
        </button>
      </div>
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
      <div className="w-full max-w-xl rounded-[20px] border border-border bg-surface p-5 shadow-2xl shadow-black/35">
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
          className="w-full resize-y rounded-[14px] border border-border bg-background p-3 text-sm leading-6 text-text outline-none ring-accent/30 focus:ring-2"
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
                missingInfoList(item.missing_info_json).length > 0 && 'border-l-4 border-l-warning',
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
                <span>{humanize(recommendationFor(item)) || t('notSet')} · {humanize(confidenceFor(item)) || t('notSet')}</span>
                <span className={cn('rounded-full px-2 py-0.5', missingInfoList(item.missing_info_json).length > 0 ? 'bg-warning/15 text-warning' : 'bg-success/10 text-success')}>
                  {missingInfoList(item.missing_info_json).length} {t('openItemsShort')}
                </span>
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
  return (
    <Panel className="relative overflow-hidden p-6 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(9,31,32,.92),rgba(8,13,17,.95)_52%,rgba(18,28,17,.92))] dark:shadow-[0_24px_90px_rgba(0,0,0,.42)]" data-testid="acquisition-cockpit-hero">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(var(--highlight-rgb,35,215,255),.14),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(var(--accent-rgb,185,255,38),.14),transparent_30%)]" />
      <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,.92fr)] xl:items-stretch">
        <div className="relative min-w-0">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-accent">{t('selectedWorkspace')}</p>
          <h2 className="line-clamp-2 max-w-4xl text-4xl font-black leading-[.96] tracking-normal text-text md:text-6xl">
            {title || t('emptyCockpitTitle')}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <TrustPill label={sourceLabel ? humanize(sourceLabel) : t('notSet')} tone="cyan" />
            <TrustPill label={humanize(recommendationFor(opportunity)) || t('notSet')} tone="amber" />
            <TrustPill label={humanize(confidenceFor(opportunity)) || t('notSet')} tone="cyan" />
            {facts.price ? <TrustPill label={facts.price} tone="slate" /> : null}
            {facts.area ? <TrustPill label={facts.area} tone="slate" /> : null}
            {latestUpdate ? <TrustPill label={formatRelativeTime(latestUpdate)} tone="slate" /> : null}
          </div>
          <div className="mt-6 max-w-3xl border-l-2 border-accent/60 bg-surface/40 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">{t('investmentThesis')}</p>
            <p className="mt-3 text-base leading-7 text-text-soft">
            {opportunity?.summary || (opportunity ? t('heroBody') : t('emptyPosture'))}
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
            <button type="button" onClick={() => onOpenDrawer('evidence')} className="inline-flex items-center gap-2 rounded-[12px] border border-border bg-surface/70 px-4 py-3 text-sm font-semibold text-text transition hover:bg-surface-alt">
              <ShieldCheck className="h-4 w-4" />
              {t('showEvidence')}
            </button>
          </div>
        </div>

        <div className="relative min-h-[310px] overflow-hidden rounded-[18px] border border-highlight/20 bg-[#030509]">
          {heroPhoto ? (
            <img
              src={heroPhoto}
              alt={title || t('emptyCockpitTitle')}
              data-testid="acquisition-hero-photo"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(var(--highlight-rgb,35,215,255),.18)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--highlight-rgb,35,215,255),.14)_1px,transparent_1px)] [background-size:34px_34px]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 grid gap-3 sm:grid-cols-4">
            <HeroChip label={t('mandateFit')} value={humanize(recommendationFor(opportunity)) || t('notSet')} />
            <HeroChip label={t('confidence')} value={humanize(confidenceFor(opportunity)) || t('notSet')} />
            <HeroChip label={t('openItems')} value={missingCount.toString()} />
            <HeroChip label={t('sources')} value={documentCount.toString()} />
          </div>
        </div>
      </div>
      {mapOpen ? (
        <div className="relative mt-6 overflow-hidden rounded-[18px] border border-highlight/20 bg-[#030509]">
          <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(var(--highlight-rgb,35,215,255),.18)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--highlight-rgb,35,215,255),.14)_1px,transparent_1px)] [background-size:34px_34px]" />
          <div className="absolute left-[18%] top-[58%] h-px w-[68%] rotate-[-18deg] bg-accent/70 shadow-[0_0_20px_var(--accent)]" />
          <div className="absolute left-[58%] top-[16%] h-28 w-px rotate-[34deg] bg-highlight/60 shadow-[0_0_20px_var(--highlight)]" />
          <div className="relative min-h-[320px]">
            <div className="absolute left-[48%] top-[42%] grid h-12 w-12 place-items-center rounded-full border border-accent bg-accent/15 font-mono text-xs font-bold text-accent shadow-[0_0_28px_var(--accent-soft)]">
              {scoreFor(opportunity) ?? '--'}
            </div>
            <div className="absolute bottom-4 left-4 right-4 rounded-[14px] border border-border bg-background/80 p-3 backdrop-blur">
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
    <div className="rounded-2xl border border-border bg-surface-alt px-3 py-2">
      <p className="text-xs font-medium text-text">{label}</p>
      <p className="mt-1 truncate text-[11px] text-text-muted">{value}</p>
    </div>
  );
}

function MandatePulse({
  candidates,
  pursue,
  openItems,
  confidence,
}: {
  candidates: number;
  pursue: number;
  openItems: number;
  confidence: string;
}) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className="p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-text-soft">{t('mandatePulse')}</p>
        <Search className="h-4 w-4 text-accent" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={Search} label={t('candidates')} value={candidates.toString()} compact />
        <MetricCard icon={TrendingUp} label={t('pursue')} value={pursue.toString()} hot compact />
        <MetricCard icon={ClipboardList} label={t('openItems')} value={openItems.toString()} compact />
        <MetricCard icon={BarChart3} label={t('confidence')} value={confidence} compact />
      </div>
    </Panel>
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
                  else if (index <= 3) onOpenDrawer('activity');
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
                  completed && 'border-success bg-success text-[#030509]',
                  active && !nodeBlocked && 'border-accent bg-accent text-[color:var(--accent-text)] shadow-[0_0_0_6px_var(--accent-dim),0_0_26px_var(--accent-soft)]',
                  nodeBlocked && 'border-warning bg-warning text-[#030509] shadow-[0_0_0_6px_var(--warning-soft),0_0_30px_rgba(255,176,32,.18)]',
                  pending && 'border-border bg-[color:var(--bg)] text-text-muted'
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
                <span className="pointer-events-none absolute top-full z-40 mt-2 w-48 rounded-[10px] border border-border bg-surface px-3 py-2 text-left text-xs leading-5 text-text opacity-0 shadow-2xl transition group-hover:opacity-100">
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
        <button type="button" onClick={onRequestVisit} disabled={!opportunity || !readinessProfile} className="rounded-[12px] border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text disabled:cursor-not-allowed disabled:opacity-55">
          {t('scheduleVisit')}
        </button>
        <button type="button" onClick={() => onOpenDrawer('activity')} className="rounded-[12px] border border-highlight/30 bg-highlight/10 px-4 py-2.5 text-sm font-semibold text-highlight">
          {t('progress.coordination')}
        </button>
      </div>
    </Panel>
  );
}

function PrimaryWorkspaceTabs({
  active,
  openItems,
  onChange,
}: {
  active: PrimaryWorkspaceTab;
  openItems: number;
  onChange: (tab: PrimaryWorkspaceTab) => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const tabs: { key: PrimaryWorkspaceTab; label: string; icon: LucideIcon }[] = [
    { key: 'deal', label: t('dealTab'), icon: Building2 },
    { key: 'actions', label: t('actionsTab'), icon: ClipboardList },
  ];
  return (
    <div className="flex w-full gap-2 rounded-[16px] border border-border bg-surface-alt p-2 dark:bg-[#07101A]/95">
      {tabs.map(({ key, label, icon: Icon }) => {
        const selected = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              'inline-flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition',
              selected ? 'bg-accent text-[color:var(--accent-text)]' : 'text-text-soft hover:bg-surface hover:text-text'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {key === 'actions' && openItems > 0 ? (
              <span className="rounded-full bg-warning px-2 py-0.5 font-mono text-[11px] font-bold text-[#030509]">
                {openItems}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function CurrentBlockerBanner({
  title,
  busy,
  onPrimaryAction,
}: {
  title: string;
  busy: boolean;
  onPrimaryAction: () => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className="border-warning/35 bg-warning/10 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-warning">{t('currentBlocker')}</p>
          <h3 className="mt-1 text-xl font-bold leading-tight text-text">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={busy}
          className="rounded-[12px] bg-warning px-4 py-3 text-sm font-bold text-[#030509] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('progress.primaryAction')}
        </button>
      </div>
    </Panel>
  );
}

function ModuleTabs({ active, onChange }: { active: CockpitModule; onChange: (module: CockpitModule) => void }) {
  const t = useTranslations('workspaceCockpitPage.modules');
  const modules: CockpitModule[] = ['overview', 'model', 'openItems', 'renovation', 'outreach', 'offer'];
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
              <span>{t(module)}</span>
            </button>
          );
        })}
    </div>
  );
}

function OverviewModule({
  documentCount,
  opportunity,
  claims,
  onOpenDrawer,
}: {
  documentCount: number;
  opportunity: OpportunityRow | null;
  claims: AcquisitionClaimRow[];
  onOpenDrawer: (tab: WorkspaceDrawerTab) => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const sourceLabel = metadataString(opportunity, ['source', 'source_label', 'listing_source']);
  const sourceUrl = sourceUrlFor(opportunity);
  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
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
        <div className="mt-5 rounded-3xl border border-border bg-surface-alt p-4">
          <p className="text-xs text-text-muted">{t('sources')}</p>
          <p className="mt-1 text-sm text-text">{documentCount}</p>
        </div>
        <button type="button" onClick={() => onOpenDrawer('evidence')} className="mt-3 w-full rounded-[14px] border border-highlight/25 bg-highlight/10 px-4 py-3 text-sm font-semibold text-highlight hover:bg-highlight/15">
          {t('openEvidenceDrawer')}
        </button>
      </Panel>
    </div>
  );
}

function ModelModule({
  opportunity,
  scenario,
  saving,
  onScenarioChange,
  onSave,
}: {
  opportunity: OpportunityRow | null;
  scenario: ScenarioState | null;
  saving: boolean;
  onScenarioChange: (next: ScenarioState) => void;
  onSave: (next: ScenarioState) => Promise<void>;
}) {
  const t = useTranslations('workspaceCockpitPage');
  if (!scenario) {
    const seed = seedScenarioFromOpportunity(opportunity);
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
            <button type="button" onClick={() => onScenarioChange(seed)} className="rounded-[12px] border border-border bg-surface px-4 py-3 text-sm font-semibold text-text">
              {t('useListingFacts')}
            </button>
          </div>
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
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave(scenario)}
          className="mt-4 w-full rounded-[14px] bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? t('savingAssumptions') : t('saveAssumptions')}
        </button>
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

function RenovationModule({ opportunity, onRequestQuote }: { opportunity: OpportunityRow | null; onRequestQuote: () => void }) {
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
      <button type="button" onClick={onRequestQuote} className="mt-5 w-full rounded-3xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent hover:bg-accent/15">
        {t('requestQuotePack')}
      </button>
    </Panel>
  );
}

function OpenItemsModule({ items, onRequestItem }: { items: string[]; onRequestItem: (item: string) => void }) {
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
            <div key={`${item}-${index}`} className="grid gap-3 border-b border-border bg-surface-alt px-4 py-4 text-sm last:border-b-0 md:grid-cols-[40px_1fr_150px]">
              <p className="font-mono text-xs text-text-muted">#{index + 1}</p>
              <p className="font-medium text-text">{item}</p>
              <button type="button" onClick={() => onRequestItem(item)} className="rounded-full bg-accent/10 px-2.5 py-1 text-center text-xs font-semibold text-accent hover:bg-accent/15">{t('requestFromBroker')}</button>
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

function OutreachModule({
  opportunity,
  approvals,
  approvalBusy,
  onRequestAction,
}: {
  opportunity: OpportunityRow | null;
  approvals: ExternalActionApprovalRow[];
  approvalBusy: string | null;
  onRequestAction: (actionType: string, draftPayload?: Record<string, string>) => Promise<void>;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const brokerNote = metadataString(opportunity, ['broker_note', 'counterparty_note', 'contact_access']);
  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('outreach.title')}</p>
        <h3 className="mt-1 text-xl font-semibold text-text">{t('outreach.heading')}</h3>
        <p className="mt-3 text-sm leading-6 text-text-soft">{brokerNote || t('outreach.body')}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={!opportunity || Boolean(approvalBusy)} onClick={() => void onRequestAction('send_outreach', { request_kind: 'broker_questions' })} className="rounded-[14px] bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)] disabled:opacity-60">
            {t('outreach.requestQuestions')}
          </button>
          <button type="button" disabled={!opportunity || Boolean(approvalBusy)} onClick={() => void onRequestAction('share_readiness_signal')} className="rounded-[14px] border border-highlight/25 bg-highlight/10 px-4 py-3 text-sm font-semibold text-highlight disabled:opacity-60">
            {t('outreach.shareReadiness')}
          </button>
        </div>
      </Panel>
      <Panel className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('buyerReadiness.approvalsTitle')}</p>
        <div className="mt-4 space-y-3">
          {approvals.length === 0 ? (
            <p className="text-sm leading-6 text-text-soft">{t('buyerReadiness.noApprovals')}</p>
          ) : approvals.slice(0, 5).map((item) => (
            <RightPaneRow key={item.id} label={humanize(item.action_type) || t('buyerReadiness.actionFallback')} value={humanize(item.approval_status) || t('notSet')} tone={statusTone(item.approval_status)} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function OfferModule({
  opportunity,
  brokerageActive,
  approvalBusy,
  onRequestAction,
}: {
  opportunity: OpportunityRow | null;
  brokerageActive: boolean;
  approvalBusy: string | null;
  onRequestAction: (actionType: string, draftPayload?: Record<string, string>) => Promise<void>;
}) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className="p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-text-soft">{t('offer.title')}</p>
      <h3 className="mt-1 text-xl font-semibold text-text">{t('offer.heading')}</h3>
      <p className="mt-3 text-sm leading-6 text-text-soft">{brokerageActive ? t('offer.readyBody') : t('brokerageGateHint')}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={!opportunity || !brokerageActive || Boolean(approvalBusy)} onClick={() => void onRequestAction('send_offer')} className="rounded-[14px] bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-55">
          {t('offer.sendOffer')}
        </button>
        <button type="button" disabled={!opportunity || !brokerageActive || Boolean(approvalBusy)} onClick={() => void onRequestAction('send_negotiation_message')} className="rounded-[14px] border border-border bg-surface px-4 py-3 text-sm font-semibold text-text disabled:cursor-not-allowed disabled:opacity-55">
          {t('proceedNegotiate')}
        </button>
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

function WorkspaceCommandDrawer({
  workspaceId,
  activeTab,
  width,
  events,
  latestUpdate,
  documentCount,
  opportunity,
  missingItems,
  claims,
  readinessEvidence,
  sharingGrants,
  actionApprovals,
  onTabChange,
  onClose,
  onWidthChange,
}: {
  workspaceId: string;
  activeTab: EvidencePaneTab;
  width: number;
  events: AcquisitionEventRow[];
  latestUpdate: string | null;
  documentCount: number;
  opportunity: OpportunityRow | null;
  missingItems: string[];
  claims: AcquisitionClaimRow[];
  readinessEvidence: BuyerReadinessEvidenceRow[];
  sharingGrants: DocumentSharingGrantRow[];
  actionApprovals: ExternalActionApprovalRow[];
  onTabChange: (tab: EvidencePaneTab) => void;
  onClose: () => void;
  onWidthChange: (width: number) => void;
}) {
  const t = useTranslations('workspaceCockpitPage');
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const tabs: { key: EvidencePaneTab; label: string; icon: LucideIcon }[] = [
    { key: 'evidence', label: t('drawer.evidence'), icon: ShieldCheck },
    { key: 'activity', label: t('drawer.coordination'), icon: MessageSquare },
    { key: 'files', label: t('drawer.files'), icon: FileText },
    { key: 'consent', label: t('drawer.consent'), icon: CheckCircle2 },
  ];
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
        className="relative ml-auto flex h-full w-full max-w-xl flex-col border-l border-border shadow-2xl shadow-black/30 dark:border-white/12 dark:shadow-black/65 xl:max-w-none"
        style={{ width: `${width}px`, background: 'var(--console-bg, var(--bg))' } as CSSProperties}
      >
        <div onPointerDown={handleDragStart} aria-hidden="true" className="absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize touch-none items-center justify-center xl:flex">
          <div className={cn('h-10 w-1 rounded-full transition-colors', isDragging ? 'bg-accent' : 'bg-border hover:bg-accent/60')} />
        </div>
        <div className="flex items-center justify-between border-b border-border bg-[color:var(--bg)] px-4 py-3 dark:bg-[#030509]">
          <div>
            <p className="text-sm font-semibold text-text">{t('evidencePaneTitle')}</p>
            <p className="text-xs text-text-muted">{opportunity ? titleFor(opportunity) : t('emptyCockpitTitle')}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1 border-b border-border bg-[color:var(--bg)] p-2 dark:bg-[#07101A]">
          {tabs.map(({ key, label, icon: Icon }) => {
            const selected = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange(key)}
                className={cn(
                  'inline-flex min-h-9 items-center justify-center gap-1 rounded-[9px] px-2 text-xs font-semibold transition',
                  selected ? 'bg-accent text-[color:var(--accent-text)]' : 'text-text-soft hover:bg-surface hover:text-text'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {activeTab === 'evidence' ? (
            <DrawerEvidence workspaceId={workspaceId} opportunity={opportunity} claims={claims} documentCount={documentCount} missingItems={missingItems} />
          ) : null}
          {activeTab === 'files' ? (
            <DrawerFiles documentCount={documentCount} evidence={readinessEvidence} />
          ) : null}
          {activeTab === 'activity' ? (
            <DrawerActivity events={events} latestUpdate={latestUpdate} />
          ) : null}
          {activeTab === 'consent' ? (
            <DrawerConsent grants={sharingGrants} approvals={actionApprovals} />
          ) : null}
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
              <p className="mt-3 rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-xs text-text-muted">{t('noSourceAttached')}</p>
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

function DrawerActivity({ events, latestUpdate }: { events: AcquisitionEventRow[]; latestUpdate: string | null }) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className="p-5">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">{t('coordinationLog')}</p>
      <h3 className="mt-1 text-xl font-semibold text-text">{t('dealCommandChannel')}</h3>
      <p className="mb-3 mt-2 text-xs text-text-muted">{latestUpdate ? t('latestUpdate', { time: formatRelativeTime(latestUpdate) }) : t('noActivity')}</p>
      <div className="space-y-3">
        {events.length === 0 ? (
          <p className="text-sm leading-6 text-text-soft">{t('emptyLog')}</p>
        ) : events.map((event) => (
          <div key={event.id} className="rounded-[14px] border border-border bg-surface-alt p-4">
            <div className="mb-2 flex justify-between gap-3">
              <p className="text-sm font-medium text-text">{humanize(event.event_type)}</p>
              {event.created_at ? <span className="text-xs text-text-muted">{formatRelativeTime(event.created_at)}</span> : null}
            </div>
            {event.body_text ? <p className="text-sm leading-6 text-text">{event.body_text}</p> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DrawerFiles({ documentCount, evidence }: { documentCount: number; evidence: BuyerReadinessEvidenceRow[] }) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <Panel className="p-5">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-highlight">{t('drawer.files')}</p>
      <h3 className="mt-1 text-xl font-semibold text-text">{t('filesDrawerTitle')}</h3>
      <p className="mt-2 text-sm leading-6 text-text-soft">{t('sourceDocuments', { count: documentCount })}</p>
      <ReadinessList
        title={t('buyerReadiness.evidenceTitle')}
        empty={t('buyerReadiness.noEvidence')}
        items={evidence.map((item) => ({
          id: item.id,
          label: humanize(item.evidence_type) || t('buyerReadiness.evidenceFallback'),
          meta: [humanize(item.status), humanize(item.sensitivity_level)].filter(Boolean).join(' · '),
          tone: statusTone(item.status),
        }))}
      />
    </Panel>
  );
}

function DrawerConsent({ grants, approvals }: { grants: DocumentSharingGrantRow[]; approvals: ExternalActionApprovalRow[] }) {
  const t = useTranslations('workspaceCockpitPage');
  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-highlight">{t('drawer.consent')}</p>
        <h3 className="mt-1 text-xl font-semibold text-text">{t('consentDrawerTitle')}</h3>
        <ReadinessList
          title={t('buyerReadiness.sharingTitle')}
          empty={t('buyerReadiness.noSharing')}
          items={grants.map((item) => ({
            id: item.id,
            label: humanize(item.share_mode) || t('buyerReadiness.shareFallback'),
            meta: [humanize(item.allowed_action), item.revoked_at ? t('buyerReadiness.revoked') : item.expires_at ? t('buyerReadiness.expires', { time: formatRelativeTime(item.expires_at) }) : t('buyerReadiness.noExpiry')].filter(Boolean).join(' · '),
            tone: item.revoked_at ? 'warn' : 'lime',
          }))}
        />
      </Panel>
      <Panel className="p-5">
        <ReadinessList
          title={t('buyerReadiness.approvalsTitle')}
          empty={t('buyerReadiness.noApprovals')}
          items={approvals.map((item) => ({
            id: item.id,
            label: humanize(item.action_type) || t('buyerReadiness.actionFallback'),
            meta: humanize(item.approval_status) || '',
            tone: statusTone(item.approval_status),
          }))}
        />
      </Panel>
    </div>
  );
}

function DrawerMap({ opportunity }: { opportunity: OpportunityRow | null }) {
  const t = useTranslations('workspaceCockpitPage');
  const title = titleFor(opportunity) || t('emptyCockpitTitle');
  const sourceLabel = metadataString(opportunity, ['district', 'city', 'source', 'source_label', 'listing_source']);
  return (
    <Panel className="p-4">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-highlight">{t('drawer.map')}</p>
      <h3 className="mt-1 text-xl font-semibold text-text">{title}</h3>
      <div className="relative mt-4 min-h-[360px] overflow-hidden rounded-[18px] border border-highlight/20 bg-[#030509]">
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
            className="rounded-[12px] border border-border bg-surface px-4 py-3 text-sm font-semibold text-text disabled:cursor-not-allowed disabled:opacity-55"
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
  buyerEntity,
  buyerEntityDocuments,
  evidence,
  grants,
  approvals,
  busy = false,
  onStart,
  onAttachEvidence,
  onShareReadiness,
}: {
  profile: BuyerReadinessProfileRow | null;
  buyerEntity?: BuyerEntityRow | null;
  buyerEntityDocuments?: BuyerEntityDocumentRow[];
  evidence: BuyerReadinessEvidenceRow[];
  grants: DocumentSharingGrantRow[];
  approvals: ExternalActionApprovalRow[];
  busy?: boolean;
  onStart?: () => void;
  onAttachEvidence?: () => void;
  onShareReadiness?: () => void;
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
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={onStart} className="rounded-[12px] bg-accent px-4 py-3 text-sm font-bold text-[color:var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? t('buyerReadiness.starting') : t('buyerReadiness.start')}
          </button>
          <button type="button" onClick={onAttachEvidence} className="rounded-[12px] border border-border bg-surface px-4 py-3 text-sm font-semibold text-text">
            {t('buyerReadiness.attachEvidence')}
          </button>
        </div>
      </Panel>
    );
  }

  const level = Math.max(0, Math.min(5, Math.round(profile.readiness_level ?? 0)));
  const activeGrants = activeGrantCount(grants);
  const vaultDocuments = buyerEntityDocuments ?? [];
  const evidenceChecklist = readinessChecklist(profile, evidence, vaultDocuments, {
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
          <h3 className="mt-1 text-xl font-semibold text-text">{buyerEntity?.display_name || t('buyerReadiness.level', { level })}</h3>
          <p className="mt-2 text-xs leading-5 text-text-muted">{profile.mandate_summary || t('buyerReadiness.noMandate')}</p>
        </div>
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] border border-highlight/30 bg-highlight/10 font-mono text-lg font-bold text-highlight">
          {level}/5
        </div>
      </div>

      <div className="grid gap-2">
        <RightPaneRow label={t('buyerReadiness.buyerType')} value={humanize(buyerEntity?.entity_type || profile.buyer_type) || t('notSet')} tone="neutral" />
        <RightPaneRow label={t('buyerReadiness.fundingPath')} value={humanize(profile.funding_path) || t('notSet')} tone={statusTone(profile.evidence_status)} />
        <RightPaneRow label={t('buyerReadiness.sharingMode')} value={humanize(profile.sharing_mode) || t('notSet')} tone={activeGrants > 0 ? 'lime' : 'neutral'} />
        <RightPaneRow label={t('buyerReadiness.visitReadiness')} value={profile.visit_readiness || t('notSet')} tone="cyan" />
        <RightPaneRow label={t('buyerReadiness.brokerageStatus')} value={humanize(profile.brokerage_status) || t('notSet')} tone={statusTone(profile.brokerage_status)} />
        <RightPaneRow label={t('buyerReadiness.kycState')} value={humanize(profile.kyc_state) || t('notSet')} tone={statusTone(profile.kyc_state)} />
      </div>

      <div className="mt-5 grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onAttachEvidence} className="rounded-[12px] border border-highlight/25 bg-highlight/10 px-4 py-3 text-sm font-semibold text-highlight">
            {t('buyerReadiness.attachEvidence')}
          </button>
          <button type="button" onClick={onShareReadiness} className="rounded-[12px] border border-border bg-surface px-4 py-3 text-sm font-semibold text-text">
            {t('outreach.shareReadiness')}
          </button>
        </div>
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
    neutral: 'border-border bg-surface-alt text-text-muted',
    lime: 'border-accent/20 bg-accent/10 text-accent',
    cyan: 'border-highlight/20 bg-highlight/10 text-highlight',
    warn: 'border-warning/25 bg-warning/10 text-warning',
  };
  return (
    <div className="rounded-[12px] border border-border bg-background/40 p-3">
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
  buyerDocs: BuyerEntityDocumentRow[],
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
  const documentRoles = new Set(buyerDocs.map((item) => item.document_role).filter(Boolean));
  const hasAny = (...keys: string[]) => keys.some((key) => evidenceTypes.has(key) || documentRoles.has(key));
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
    grey: 'border-border bg-text-muted text-text-muted',
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
    <div className="w-full rounded-[16px] border border-border bg-surface-alt p-4 text-left">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ConfidenceDot basis={basis} />
          <span className="rounded-[6px] border border-border bg-background/40 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-text">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onEvidence} className="rounded-[8px] border border-highlight/25 bg-highlight/10 p-1.5 text-highlight" aria-label="Evidence">
            <ShieldCheck className="h-3.5 w-3.5" />
          </button>
          <span className="group relative rounded-[8px] border border-border bg-background/40 p-1.5 text-text-muted">
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-56 rounded-[10px] border border-border bg-surface p-3 text-xs leading-5 text-text shadow-xl group-hover:block">
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

function MetricCard({ icon: Icon, label, value, hot = false, compact = false }: { icon: LucideIcon; label: string; value: string; hot?: boolean; compact?: boolean }) {
  return (
    <Panel className={cn(compact ? 'p-3' : 'p-4', hot && 'border-accent/25 bg-accent/10')}>
      <Icon className="h-4 w-4 text-accent" />
      <p className="mt-3 truncate text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className={cn('mt-1 truncate font-semibold text-text', compact ? 'text-xl' : 'text-2xl')}>{value}</p>
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
