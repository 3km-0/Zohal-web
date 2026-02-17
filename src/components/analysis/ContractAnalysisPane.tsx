'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Download, Scale, Calendar, FileText, ShieldAlert, AlertTriangle, CheckCircle, X, FileSearch, CircleHelp, Zap, Package, BookOpen, Layers, RefreshCw, Settings, Table2, ScrollText, ClipboardCheck, Puzzle } from 'lucide-react';
import {
  Button,
  Spinner,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  EmptyState,
  ScholarNotebookCard,
  ScholarTabs,
  ScholarTabContent,
  ScholarActionMenu,
  ScholarProgressCard,
  ScholarSelect,
  type ScholarTab,
} from '@/components/ui';
import { AnalysisRecordCard, AIConfidenceBadge, AnalysisSectionHeader, ExpandableJSON, type AIConfidence, AtAGlanceSummary, OverviewTab, GenericModuleTab, type GenericModuleItem, DeadlinesTab, type DeadlineItem } from '@/components/analysis';
import { BundleManagerModal } from '@/components/document/BundleManagerModal';
import { createClient } from '@/lib/supabase/client';
import type { Document, LegalClause, LegalContract, LegalObligation, LegalRiskFlag } from '@/types/database';
import type { EvidenceGradeSnapshot } from '@/types/evidence-grade';
import { parseSnapshot } from '@/types/evidence-grade';
import { cn } from '@/lib/utils';
import { mapHttpError } from '@/lib/errors';
import { useToast } from '@/components/ui/Toast';
import type { AnalysisRunSummary } from '@/types/analysis-runs';
import { normalizeAnalysisRunStatus, selectDefaultAnalysisRun, toAnalysisRunSummary } from '@/lib/analysis/runs';

type Tab = string;

type PlaybookRecord = {
  id: string;
  name: string;
  is_system_preset?: boolean;
  workspace_id?: string | null;
  current_version_id?: string | null;
  current_version?: { id: string; version_number: number; spec_json?: any } | null;
};

type BundlePack = {
  id: string;
  name: string | null;
  member_count?: number;
};

type PlaybookScope = 'single' | 'bundle' | 'either';
type RunScope = 'single' | 'bundle';
type BundleSchemaRole = { role: string; required: boolean; multiple: boolean };
type DocsetMode = 'ephemeral' | 'saved';

type WorkspaceFolder = {
  id: string;
  name: string;
  parent_id: string | null;
};

type WorkspaceDoc = {
  id: string;
  title: string;
  folder_id: string | null;
};

type DocsetMember = {
  document_id: string;
  role: string;
  sort_order: number;
};

type RejectedSets = {
  variables: Set<string>;
  clauses: Set<string>;
  obligations: Set<string>;
  risks: Set<string>;
  modules: Set<string>;
  records: Set<string>;
  verdicts: Set<string>;
  exceptions: Set<string>;
};

function toRejectedSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(
    value
      .map((x) => String(x || '').trim())
      .filter(Boolean)
  );
}

interface ContractAnalysisPaneProps {
  embedded?: boolean;
  onSwitchToChat?: () => void;
}

export function ContractAnalysisPane({ embedded = false, onSwitchToChat }: ContractAnalysisPaneProps = {}) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const documentId = params.docId as string;
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('contractAnalysis');
  const locale = useLocale();
  const toast = useToast();

  // Run settings (per-run execution; does NOT require duplicating templates)
  const [runLanguage, setRunLanguage] = useState<'auto' | 'en' | 'ar'>('auto');
  const [runStrictness, setRunStrictness] = useState<'auto' | 'default' | 'strict'>('auto');

  // Persist run settings locally (best-effort; per-browser preference).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('zohal.contractAnalysis.runSettings');
      if (!raw) return;
      const json = JSON.parse(raw);
      const lang = json?.language;
      const strict = json?.strictness;
      if (lang === 'auto' || lang === 'en' || lang === 'ar') setRunLanguage(lang);
      if (strict === 'auto' || strict === 'default' || strict === 'strict') setRunStrictness(strict);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'zohal.contractAnalysis.runSettings',
        JSON.stringify({ language: runLanguage, strictness: runStrictness })
      );
    } catch {
      // ignore
    }
  }, [runLanguage, runStrictness]);

  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportSavedMessage, setReportSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [progressDetail, setProgressDetail] = useState<{ stage: string; completed: number; total: number } | null>(null);

  const [contract, setContract] = useState<LegalContract | null>(null);
  const [clauses, setClauses] = useState<LegalClause[]>([]);
  const [obligations, setObligations] = useState<LegalObligation[]>([]);
  const [risks, setRisks] = useState<LegalRiskFlag[]>([]);
  const [snapshot, setSnapshot] = useState<EvidenceGradeSnapshot | null>(null);
  const [verificationObjectId, setVerificationObjectId] = useState<string | null>(null);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [verificationObjectState, setVerificationObjectState] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isExportingAuditPack, setIsExportingAuditPack] = useState(false);
  const [creatingTaskFor, setCreatingTaskFor] = useState<string | null>(null);
  const [documentRow, setDocumentRow] = useState<Pick<Document, 'privacy_mode' | 'source_metadata'> | null>(null);
  const [bundleDocuments, setBundleDocuments] = useState<Array<{ id: string; title: string; role?: string }>>([]);
  const [isRunningCompliance, setIsRunningCompliance] = useState(false);
  const [isGeneratingKnowledgePack, setIsGeneratingKnowledgePack] = useState(false);
  const [isPatchingSnapshot, setIsPatchingSnapshot] = useState(false);
  const [runs, setRuns] = useState<AnalysisRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunStatus, setSelectedRunStatus] = useState<AnalysisRunSummary['status'] | null>(null);

  // Playbook selection (MVP): optional; defaults preserve current behavior.
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>(''); // empty = default
  const [selectedPlaybookVersionId, setSelectedPlaybookVersionId] = useState<string>('');

  // DocSet/run setup state.
  const [scope, setScope] = useState<RunScope>('single');
  const [bundlePacks, setBundlePacks] = useState<BundlePack[]>([]);
  const [selectedBundleId, setSelectedBundleId] = useState<string>('');
  const [docsetMode, setDocsetMode] = useState<DocsetMode>('ephemeral');
  const [docsetMembers, setDocsetMembers] = useState<DocsetMember[]>([]);
  const [docsetName, setDocsetName] = useState<string>('');
  const [saveDocset, setSaveDocset] = useState(false);
  const [docsetSearch, setDocsetSearch] = useState('');
  const [docsetIssues, setDocsetIssues] = useState<string[]>([]);
  const [docsetPrimaryDocumentId, setDocsetPrimaryDocumentId] = useState<string>(documentId);
  const [docsetPrecedencePolicy, setDocsetPrecedencePolicy] = useState<'manual' | 'primary_first' | 'latest_wins'>('manual');
  const [workspaceDocs, setWorkspaceDocs] = useState<WorkspaceDoc[]>([]);
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([]);
  const [showBundleModal, setShowBundleModal] = useState(false);
  const autoRunTriggered = useRef(false);

  // Expanded sections for collapsible groups
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const selectedRun = useMemo(
    () => runs.find((run) => run.runId === selectedRunId) ?? null,
    [runs, selectedRunId]
  );

  const isHistoricalRunSelected = useMemo(() => {
    if (!selectedRun || !selectedRun.versionId || !currentVersionId) return false;
    return selectedRun.versionId !== currentVersionId;
  }, [currentVersionId, selectedRun]);
  const isPatchReadOnly = isPatchingSnapshot || isHistoricalRunSelected;

  const selectedPlaybook = useMemo(
    () => playbooks.find((p) => p.id === selectedPlaybookId) || null,
    [playbooks, selectedPlaybookId]
  );

  const selectedPlaybookSpec = useMemo(() => {
    const raw = selectedPlaybook?.current_version?.spec_json;
    return raw && typeof raw === 'object' ? raw : null;
  }, [selectedPlaybook]);

  const enforcedPlaybookScope = useMemo<PlaybookScope>(() => {
    const raw = String((selectedPlaybookSpec as any)?.scope || '').trim().toLowerCase();
    if (raw === 'single' || raw === 'bundle' || raw === 'either') return raw;
    return 'either';
  }, [selectedPlaybookSpec]);

  const bundleSchemaRoles = useMemo<BundleSchemaRole[]>(() => {
    const roles = (selectedPlaybookSpec as any)?.bundle_schema?.roles;
    if (!Array.isArray(roles)) return [];
    return roles
      .map((r: any) => ({
        role: String(r?.role || '').trim(),
        required: r?.required === true,
        multiple: r?.multiple === true,
      }))
      .filter((r: BundleSchemaRole) => !!r.role);
  }, [selectedPlaybookSpec]);

  const effectiveScope = useMemo<RunScope>(() => {
    if (enforcedPlaybookScope === 'bundle') return 'bundle';
    if (enforcedPlaybookScope === 'single') return 'single';
    return scope;
  }, [enforcedPlaybookScope, scope]);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of workspaceFolders) map.set(f.id, f.name);
    return map;
  }, [workspaceFolders]);

  const filteredWorkspaceDocs = useMemo(() => {
    const q = docsetSearch.trim().toLowerCase();
    if (!q) return workspaceDocs;
    return workspaceDocs.filter((d) => {
      const title = d.title.toLowerCase();
      const folder = d.folder_id ? (folderNameById.get(d.folder_id) || '').toLowerCase() : '';
      return title.includes(q) || folder.includes(q);
    });
  }, [docsetSearch, folderNameById, workspaceDocs]);

  function proofHref(evidence: EvidenceGradeSnapshot['variables'][number]['evidence'] | undefined | null) {
    if (!evidence?.page_number) return null;
    const quote = (evidence.snippet || '').slice(0, 160);
    const bbox = evidence.bbox ? `${evidence.bbox.x},${evidence.bbox.y},${evidence.bbox.width},${evidence.bbox.height}` : null;
    const targetDocId = (evidence as any).document_id ? String((evidence as any).document_id) : documentId;
    const paneParam = embedded ? '&pane=analysis' : '';
    const base = `/workspaces/${workspaceId}/documents/${targetDocId}?page=${evidence.page_number}&quote=${encodeURIComponent(quote)}${paneParam}`;
    return bbox ? `${base}&bbox=${encodeURIComponent(bbox)}` : base;
  }

  const deadlines = useMemo(() => {
    return obligations
      .filter((o) => !!o.due_at)
      .slice()
      .sort((a, b) => (a.due_at || '').localeCompare(b.due_at || ''));
  }, [obligations]);

  const customModules = useMemo(() => {
    // v2: modules live at snapshot.pack.modules as a map keyed by module id.
    const pack: any = snapshot?.pack as any;
    const dict = pack?.modules && typeof pack.modules === 'object' && !Array.isArray(pack.modules) ? pack.modules : null;
    if (!dict) return [];
    const core = new Set(['variables', 'clauses', 'obligations', 'risks', 'deadlines']);
    return Object.entries(dict)
      .map(([id, raw]) => {
        const m: any = raw && typeof raw === 'object' ? raw : {};
        return {
          id: String(m?.id || id || '').trim(),
          title: String(m?.title || id || '').trim(),
          status: String(m?.status || ''),
          error: m?.error ? String(m.error) : null,
          ai_confidence: m?.ai_confidence ? String(m.ai_confidence) : null,
          result: m?.result ?? null,
          evidence: Array.isArray(m?.evidence) ? (m.evidence as any[]) : [],
        };
      })
      .filter((m) => !!m.id && !!m.title && !core.has(m.id));
  }, [snapshot]);

  const v3Records = useMemo(() => {
    const arr = (snapshot?.pack as any)?.records;
    return Array.isArray(arr) ? (arr as Array<Record<string, any>>) : [];
  }, [snapshot]);

  const v3Verdicts = useMemo(() => {
    const arr = (snapshot?.pack as any)?.verdicts;
    return Array.isArray(arr) ? (arr as Array<Record<string, any>>) : [];
  }, [snapshot]);

  const v3Exceptions = useMemo(() => {
    const arr = (snapshot?.pack as any)?.exceptions_v3;
    return Array.isArray(arr) ? (arr as Array<Record<string, any>>) : [];
  }, [snapshot]);

  const rejectedSets = useMemo<RejectedSets>(() => {
    const pack = (snapshot?.pack as any) || {};
    const reviewRejected = pack?.review?.rejected && typeof pack.review.rejected === 'object' ? pack.review.rejected : null;
    const legacyRejected = pack?.rejected && typeof pack.rejected === 'object' ? pack.rejected : null;
    const src = reviewRejected || legacyRejected || {};
    return {
      variables: toRejectedSet(src.variables),
      clauses: toRejectedSet(src.clauses),
      obligations: toRejectedSet(src.obligations),
      risks: toRejectedSet(src.risks),
      modules: toRejectedSet(src.modules),
      records: toRejectedSet(src.records),
      verdicts: toRejectedSet(src.verdicts),
      exceptions: toRejectedSet(src.exceptions),
    };
  }, [snapshot]);

  const enabledModules = useMemo<Set<string>>(() => {
    const defaults = new Set<string>(['variables', 'clauses', 'obligations', 'risks', 'deadlines']);
    const pb = (snapshot?.pack as any)?.playbook as any;
    const raw = Array.isArray(pb?.modules_enabled) ? pb.modules_enabled : Array.isArray(pb?.modules) ? pb.modules : null;
    const set = new Set<string>((raw || []).map((x: any) => String(x || '').trim()).filter(Boolean));
    if (set.size === 0) return defaults;
    // Dependency rules (match backend intent)
    if (set.has('deadlines')) set.add('variables');
    if (!set.has('obligations')) set.delete('deadlines');
    return set;
  }, [snapshot]);

  // Verification-based attention counts
  // This is about AI confidence / needs_review status, NOT content risk.
  // - Variables: Items with verification_state = needs_review (handled inline in tab definition)
  // - Obligations: Items with low AI confidence OR needs_review state
  // - Clauses: No verification field in projection, so 0 (risk level is content-based, not verification)
  // - Risks: No AI confidence in projection, so 0 (severity is content-based, not verification)
  const attention = useMemo(() => {
    // Obligations needing verification: low confidence OR needs_review state
    const obligationsNeedVerification = obligations.filter(
      (o) => !rejectedSets.obligations.has(o.id) && (o.confidence_state === 'needs_review' || o.confidence === 'low')
    ).length;

    // Deadlines needing verification
    const deadlinesNeedVerification = deadlines.filter(
      (o) => !rejectedSets.obligations.has(o.id) && (o.confidence_state === 'needs_review' || o.confidence === 'low')
    ).length;

    return {
      // Clauses don't have verification_state in projection - risk level is content-based
      clauses: 0,
      // Obligations needing verification
      obligations: obligationsNeedVerification,
      // Deadlines needing verification
      deadlines: deadlinesNeedVerification,
      // Risks don't have ai_confidence in projection - severity is content-based
      risks: 0,
    };
  }, [obligations, deadlines, rejectedSets]);

  const tabs = useMemo(() => {
    const out: Array<{ id: string; label: string; icon: any; total: number | null; attentionCount: number }> = [
      { id: 'overview', label: t('tabs.overview'), icon: FileText, total: null, attentionCount: 0 },
    ];
    if (enabledModules.has('variables')) {
      const visibleVariables = (snapshot?.variables || []).filter((v) => !rejectedSets.variables.has(v.id));
      out.push({
        id: 'variables',
        label: t('tabs.variables'),
        icon: Table2,
        total: visibleVariables.length,
        attentionCount: visibleVariables.filter((v) => v.verification_state === 'needs_review').length,
      });
    }
    if (enabledModules.has('clauses')) {
      const totalClauses = (snapshot?.clauses?.length
        ? snapshot.clauses.filter((c: any) => !rejectedSets.clauses.has(String(c?.id || '').trim())).length
        : clauses.filter((c) => !rejectedSets.clauses.has(c.id)).length);
      out.push({ id: 'clauses', label: t('tabs.clauses'), icon: ScrollText, total: totalClauses, attentionCount: attention.clauses });
    }
    if (enabledModules.has('obligations')) {
      const visibleObligations = obligations.filter((o) => !rejectedSets.obligations.has(o.id));
      out.push({
        id: 'obligations',
        label: t('tabs.obligations'),
        icon: ClipboardCheck,
        total: visibleObligations.length,
        attentionCount: attention.obligations,
      });
    }
    if (enabledModules.has('deadlines')) {
      const visibleDeadlines = deadlines.filter((o) => !rejectedSets.obligations.has(o.id));
      out.push({ id: 'deadlines', label: t('tabs.deadlines'), icon: Calendar, total: visibleDeadlines.length, attentionCount: attention.deadlines });
    }
    if (enabledModules.has('risks')) {
      const totalRisks = (snapshot?.risks?.length
        ? snapshot.risks.filter((r: any) => !rejectedSets.risks.has(String(r?.id || '').trim())).length
        : risks.filter((r) => !rejectedSets.risks.has(r.id)).length);
      out.push({ id: 'risks', label: t('tabs.risks'), icon: ShieldAlert, total: totalRisks, attentionCount: attention.risks });
    }
    const v3Enabled = !!(snapshot?.pack as any)?.capabilities?.analysis_v3?.enabled;
    if (v3Enabled || v3Records.length > 0) {
      const visibleRecords = v3Records.filter((r, idx) => !rejectedSets.records.has(String(r?.id || `record_${idx}`)));
      out.push({ id: 'records', label: t('tabs.records'), icon: Layers, total: visibleRecords.length, attentionCount: 0 });
    }
    if (v3Enabled || v3Verdicts.length > 0) {
      const visibleVerdicts = v3Verdicts.filter((v, idx) => !rejectedSets.verdicts.has(String(v?.id || `${v?.rule_id || 'verdict'}_${idx}`)));
      const attentionCount = visibleVerdicts.filter((v) => String(v?.status || '') !== 'pass').length;
      out.push({ id: 'verdicts', label: t('tabs.verdicts'), icon: Scale, total: visibleVerdicts.length, attentionCount });
    }
    if (v3Enabled || v3Exceptions.length > 0) {
      const visibleExceptions = v3Exceptions.filter((ex, idx) => !rejectedSets.exceptions.has(String(ex?.id || `${ex?.kind || ex?.type || 'exception'}_${idx}`)));
      out.push({ id: 'exceptions', label: t('tabs.exceptions'), icon: AlertTriangle, total: visibleExceptions.length, attentionCount: visibleExceptions.length });
    }
    out.push(...customModules.map((m) => ({ id: `custom:${m.id}`, label: m.title, icon: Puzzle, total: null, attentionCount: 0 })));
    return out;
  }, [enabledModules, snapshot, clauses, obligations, risks, deadlines, attention, customModules, v3Records, v3Verdicts, v3Exceptions, rejectedSets, t]);

  useEffect(() => {
    // If the current tab becomes unavailable due to template module gating, fall back to overview.
    const ids = new Set(tabs.map((t) => t.id));
    if (!ids.has(tab)) setTab('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.map((t) => t.id).join('|')]);

  function computeNoticeDeadline(endDateIso: string | null | undefined, noticeDays: number | null | undefined): Date | null {
    if (!endDateIso || noticeDays == null) return null;
    const end = new Date(endDateIso);
    if (Number.isNaN(end.getTime())) return null;
    const d = new Date(end.getTime());
    d.setDate(d.getDate() - noticeDays);
    return d;
  }

  async function loadSnapshotVersion(versionId: string | null, sourceDocId: string = documentId) {
    if (!versionId) {
      return;
    }

    const { data, error } = await supabase
      .from('verification_object_versions')
      .select('snapshot_json')
      .eq('id', versionId)
      .maybeSingle();
    if (error || !data?.snapshot_json) return;

    const parsed = parseSnapshot(data.snapshot_json, sourceDocId);
    setSnapshot(parsed);
  }

  async function loadRuns(options?: { keepSelection?: boolean }) {
    setRunsLoading(true);
    try {
      const { data, error } = await supabase
        .from('extraction_runs')
        .select('id, status, created_at, updated_at, input_config, output_summary')
        .eq('workspace_id', workspaceId)
        .eq('document_id', documentId)
        .eq('extraction_type', 'contract_analysis')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error || !data) {
        setRuns([]);
        return;
      }

      const rows = data as Array<any>;
      const actionIds = Array.from(
        new Set(
          rows
            .map((row) => {
              const input = row.input_config && typeof row.input_config === 'object' ? row.input_config : {};
              const actionId = (input as any).action_id || (input as any).actionId;
              return typeof actionId === 'string' && actionId ? actionId : null;
            })
            .filter(Boolean) as string[]
        )
      );

      const actionsById = new Map<string, any>();
      if (actionIds.length > 0) {
        const { data: actionData } = await supabase
          .from('actions')
          .select('id, status, updated_at, output_json')
          .in('id', actionIds);
        (actionData || []).forEach((action: any) => {
          actionsById.set(String(action.id), action);
        });
      }

      const normalized = rows
        .map((row) => {
          const input = row.input_config && typeof row.input_config === 'object' ? row.input_config : {};
          const actionId = (input as any).action_id || (input as any).actionId || null;
          const action = actionId ? actionsById.get(String(actionId)) : null;
          return toAnalysisRunSummary(
            {
              ...row,
              input_config: row.input_config ?? null,
              output_summary: row.output_summary ?? null,
              extraction_type: 'contract_analysis',
              document_id: documentId,
              workspace_id: workspaceId,
              user_id: '',
              completed_at: null,
              error: null,
              id: String(row.id),
              model: 'unknown',
              prompt_version: 'unknown',
              started_at: null,
              status: String(row.status || ''),
              created_at: String(row.created_at),
              updated_at: String(row.updated_at || row.created_at),
            } as any,
            action
          );
        })
        .map((run) => {
          const action = run.actionId ? actionsById.get(run.actionId) : null;
          return {
            ...run,
            status: normalizeAnalysisRunStatus(run.status, action?.status ?? null),
          } as AnalysisRunSummary;
        });

      setRuns(normalized);

      const existingSelected = normalized.find((run) => run.runId === selectedRunId) ?? null;
      const nextSelected = options?.keepSelection && existingSelected
        ? existingSelected
        : selectDefaultAnalysisRun(normalized);

      if (nextSelected) {
        setSelectedRunId(nextSelected.runId);
        setSelectedRunStatus(nextSelected.status);
        if (nextSelected.versionId) {
          await loadSnapshotVersion(nextSelected.versionId);
        }
      } else {
        setSelectedRunId(null);
        setSelectedRunStatus(null);
      }
    } finally {
      setRunsLoading(false);
    }
  }

  async function selectRun(run: AnalysisRunSummary) {
    setSelectedRunId(run.runId);
    setSelectedRunStatus(run.status);
    if (run.versionId) {
      await loadSnapshotVersion(run.versionId);
      return;
    }
    // For in-flight runs without version output, keep current snapshot data and refresh contract tables.
    await load();
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Fetch document row for Privacy Mode UI + redaction report (safe metadata only).
      const { data: docData, error: docErr } = await supabase
        .from('documents')
        .select('privacy_mode, source_metadata')
        .eq('id', documentId)
        .maybeSingle();
      if (!docErr) setDocumentRow((docData || null) as any);

      const { data: contractData, error: contractError } = await supabase
        .from('legal_contracts')
        .select('*')
        .eq('document_id', documentId)
        .maybeSingle();

      if (contractError) throw contractError;

      if (!contractData) {
        setContract(null);
        setClauses([]);
        setObligations([]);
        setRisks([]);
        setSnapshot(null);
        setVerificationObjectId(null);
        setCurrentVersionId(null);
        setVerificationObjectState(null);
        return { hasContract: false as const };
      }

      setContract(contractData);
      setSnapshot(null);
      setVerificationObjectId(contractData.verification_object_id || null);
      setCurrentVersionId(null);
      setVerificationObjectState(null);
      
      // If we found a contract, analysis is complete - reset analyzing state
      // This handles the case where user left and came back after completion
      setIsAnalyzing(false);

      const [clausesRes, obligationsRes, risksRes] = await Promise.all([
        supabase.from('legal_clauses').select('*').eq('contract_id', contractData.id).order('page_number', { ascending: true }),
        supabase.from('legal_obligations').select('*').eq('contract_id', contractData.id).order('due_at', { ascending: true }),
        supabase.from('legal_risk_flags').select('*').eq('contract_id', contractData.id),
      ]);

      if (clausesRes.error) throw clausesRes.error;
      if (obligationsRes.error) throw obligationsRes.error;
      if (risksRes.error) throw risksRes.error;

      setClauses((clausesRes.data || []) as LegalClause[]);
      setObligations((obligationsRes.data || []) as LegalObligation[]);
      setRisks((risksRes.data || []) as LegalRiskFlag[]);

      // Load evidence-grade snapshot (canonical) to power Variables + verifier
      if (contractData.verification_object_id) {
        const { data: vo, error: voErr } = await supabase
          .from('verification_objects')
          .select('current_version_id, state, finalized_at')
          .eq('id', contractData.verification_object_id)
          .maybeSingle();
        if (!voErr && vo?.current_version_id) {
          setCurrentVersionId(String(vo.current_version_id));
          setVerificationObjectState(String(vo.state || 'provisional'));
          const { data: vov, error: vovErr } = await supabase
            .from('verification_object_versions')
            .select('snapshot_json')
            .eq('id', vo.current_version_id)
            .maybeSingle();
          if (!vovErr && vov?.snapshot_json) {
            const parsed = parseSnapshot(vov.snapshot_json, documentId);
            setSnapshot(parsed);
          }
        } else {
          setCurrentVersionId(null);
          setVerificationObjectState(vo?.state ? String(vo.state) : null);
        }
      }
      return { hasContract: true as const };
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
    return { hasContract: false as const };
  }

  async function loadPlaybooks() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('playbooks-list', {
        body: { workspace_id: workspaceId, kind: 'contract' },
      });
      if (error) return;
      if (data?.ok && Array.isArray(data.playbooks)) {
        const pbs = data.playbooks as PlaybookRecord[];
        setPlaybooks(pbs);
        
        // Auto-select template if none selected
        if (!selectedPlaybookId && pbs.length > 0) {
          // Prefer "General Contract Analysis" as the product default.
          const defaultPb = pbs.find((p) => p.name === 'General Contract Analysis') || pbs[0];
          setSelectedPlaybookId(defaultPb.id);
          setSelectedPlaybookVersionId(defaultPb.current_version?.id || '');
        }
      }
    } catch {
      // Best-effort: ignore and fall back to default analysis
    }
  }

  async function loadBundlePacks() {
    try {
      // Fetch bundle packs for this workspace
      const { data: packs, error } = await supabase
        .from('packs')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .eq('pack_type', 'bundle')
        .order('created_at', { ascending: false });

      if (error || !packs) return;

      // Get member counts for each pack
      const packsWithCounts = await Promise.all(
        packs.map(async (p) => {
          const { count } = await supabase
            .from('pack_members')
            .select('id', { count: 'exact', head: true })
            .eq('pack_id', p.id);
          return { id: p.id, name: p.name, member_count: count ?? 0 };
        })
      );

      setBundlePacks(packsWithCounts);
    } catch {
      // Best-effort
    }
  }

  async function loadWorkspaceDocsetSources() {
    try {
      const [{ data: docs }, { data: folders }] = await Promise.all([
        supabase
          .from('documents')
          .select('id,title,folder_id,storage_path')
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .neq('storage_path', 'local')
          .order('updated_at', { ascending: false }),
        supabase
          .from('workspace_folders')
          .select('id,name,parent_id')
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .order('name', { ascending: true }),
      ]);

      const nextDocs: WorkspaceDoc[] = ((docs || []) as any[])
        .map((d) => ({
          id: String(d.id),
          title: String(d.title || d.id),
          folder_id: d.folder_id ? String(d.folder_id) : null,
        }));
      setWorkspaceDocs(nextDocs);
      setWorkspaceFolders(
        ((folders || []) as any[]).map((f) => ({
          id: String(f.id),
          name: String(f.name || ''),
          parent_id: f.parent_id ? String(f.parent_id) : null,
        }))
      );

      // Ensure current document is always in the selectable set.
      if (!nextDocs.some((d) => d.id === documentId)) {
        setWorkspaceDocs((prev) => [
          { id: documentId, title: 'Current document', folder_id: null },
          ...prev,
        ]);
      }
    } catch {
      // best-effort
    }
  }

  async function loadDocsetFromSavedPack(packId: string) {
    if (!packId) return;
    try {
      const [{ data: packRow }, { data: members, error: membersErr }, { data: docRows }] = await Promise.all([
        supabase
          .from('packs')
          .select('id,name,precedence_policy,primary_document_id')
          .eq('id', packId)
          .maybeSingle(),
        supabase
          .from('pack_members')
          .select('document_id,role,sort_order')
          .eq('pack_id', packId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('documents')
          .select('id,title')
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null),
      ]);
      if (membersErr) return;

      const titlesById = new Map<string, string>();
      for (const d of (docRows || []) as any[]) {
        titlesById.set(String(d.id), String(d.title || d.id));
      }

      const normalized = ((members || []) as any[])
        .map((m, idx) => ({
          document_id: String(m?.document_id || '').toLowerCase(),
          role: String(m?.role || 'other').trim().toLowerCase() || 'other',
          sort_order: Number.isFinite(m?.sort_order) ? Number(m.sort_order) : idx,
        }))
        .filter((m) => !!m.document_id);

      setSelectedBundleId(packId);
      setDocsetMode('saved');
      setDocsetName(String((packRow as any)?.name || '').trim());
      setDocsetPrecedencePolicy(
        (String((packRow as any)?.precedence_policy || 'manual').toLowerCase() as any) === 'primary_first'
          ? 'primary_first'
          : (String((packRow as any)?.precedence_policy || 'manual').toLowerCase() as any) === 'latest_wins'
            ? 'latest_wins'
            : 'manual'
      );
      setDocsetPrimaryDocumentId(
        String((packRow as any)?.primary_document_id || documentId).toLowerCase()
      );
      setDocsetMembers(
        normalized.map((m, idx) => ({
          document_id: m.document_id,
          role: m.role,
          sort_order: idx,
        }))
      );

      // Keep local source cache fresh for titles/search.
      setWorkspaceDocs((prev) => {
        const next = [...prev];
        for (const m of normalized) {
          if (!next.some((d) => d.id === m.document_id)) {
            next.push({
              id: m.document_id,
              title: titlesById.get(m.document_id) || m.document_id,
              folder_id: null,
            });
          }
        }
        return next;
      });
    } catch {
      // best-effort
    }
  }

  function addDocumentToDocset(docId: string) {
    setSelectedBundleId('');
    setDocsetMode('ephemeral');
    setDocsetMembers((prev) => {
      if (prev.some((m) => m.document_id === docId)) return prev;
      const role = docId === docsetPrimaryDocumentId ? 'primary' : 'other';
      return [...prev, { document_id: docId, role, sort_order: prev.length }];
    });
  }

  function removeDocumentFromDocset(docId: string) {
    setSelectedBundleId('');
    setDocsetMode('ephemeral');
    setDocsetMembers((prev) =>
      prev
        .filter((m) => m.document_id !== docId)
        .map((m, idx) => ({ ...m, sort_order: idx }))
    );
  }

  function moveDocsetMember(docId: string, direction: 'up' | 'down') {
    setSelectedBundleId('');
    setDocsetMode('ephemeral');
    setDocsetMembers((prev) => {
      const idx = prev.findIndex((m) => m.document_id === docId);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[swapIdx];
      next[swapIdx] = tmp;
      return next.map((m, i) => ({ ...m, sort_order: i }));
    });
  }

  function updateDocsetMemberRole(docId: string, role: string) {
    setSelectedBundleId('');
    setDocsetMode('ephemeral');
    setDocsetMembers((prev) =>
      prev.map((m) => (m.document_id === docId ? { ...m, role: role.trim().toLowerCase() || 'other' } : m))
    );
  }

  // Multi-document bundle packs: load source document titles/roles for UI chips.
  const bundlePackId = (snapshot?.pack as any)?.bundle?.pack_id ?? snapshot?.pack?.bundle?.bundle_id ?? null;
  const bundleBundleId = snapshot?.pack?.bundle?.bundle_id ?? null;
  const bundleDocIdsKey = snapshot?.pack?.bundle?.document_ids?.join('|') ?? null;
  const bundle = snapshot?.pack?.bundle;

  useEffect(() => {
    const docIds = bundle?.document_ids;
    if (!bundle || !Array.isArray(docIds) || docIds.length === 0) {
      setBundleDocuments([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const ids = Array.from(new Set(docIds.map((x) => String(x)).filter(Boolean)));
        const { data: docs, error: docsErr } = await supabase
          .from('documents')
          .select('id,title')
          .in('id', ids);
        if (docsErr) throw docsErr;

        let rolesById: Record<string, string> = {};
        const resolvedPackId = String(bundlePackId || '').toLowerCase();
        if (resolvedPackId) {
          const { data: members, error: memErr } = await supabase
            .from('pack_members')
            .select('document_id, role, sort_order')
            .eq('pack_id', resolvedPackId)
            .order('sort_order', { ascending: true });
          if (!memErr && Array.isArray(members)) {
            for (const m of members as any[]) {
              const did = String(m?.document_id || '');
              if (did) rolesById[did] = String(m?.role || '');
            }
          }
        }

        const byId: Record<string, string> = {};
        for (const d of (docs || []) as any[]) byId[String(d.id)] = String(d.title || '');

        const ordered = ids.map((id) => ({
          id,
          title: byId[id] || id,
          role: rolesById[id] || undefined,
        }));
        if (!cancelled) setBundleDocuments(ordered);
      } catch {
        if (!cancelled) setBundleDocuments(docIds.map((id) => ({ id: String(id), title: String(id) })));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bundlePackId, bundleBundleId, bundleDocIdsKey, bundle, supabase]);

  useEffect(() => {
    if (enforcedPlaybookScope === 'bundle') setScope('bundle');
    if (enforcedPlaybookScope === 'single') setScope('single');
  }, [enforcedPlaybookScope]);

  useEffect(() => {
    if (effectiveScope !== 'bundle') {
      setDocsetIssues([]);
      return;
    }

    // Seed current document by default the first time bundle scope is selected.
    if (!docsetMembers.some((m) => m.document_id === documentId)) {
      setDocsetMembers((prev) => {
        if (prev.some((m) => m.document_id === documentId)) return prev;
        return [{ document_id: documentId, role: 'primary', sort_order: 0 }, ...prev].map((m, idx) => ({
          ...m,
          sort_order: idx,
        }));
      });
      return;
    }

    if (!docsetMembers.some((m) => m.document_id === docsetPrimaryDocumentId)) {
      setDocsetPrimaryDocumentId(documentId);
    }

    const issues: string[] = [];
    if (docsetMembers.length < 2) {
      issues.push(t('docset.validation.minTwoDocuments'));
    }
    if (!docsetMembers.some((m) => m.document_id === documentId)) {
      issues.push(t('docset.validation.currentDocumentRequired'));
    }

    if (bundleSchemaRoles.length > 0) {
      const counts = new Map<string, number>();
      for (const m of docsetMembers) {
        const role = String(m.role || '').trim().toLowerCase();
        if (!role) continue;
        counts.set(role, (counts.get(role) || 0) + 1);
      }
      for (const def of bundleSchemaRoles) {
        const role = def.role.trim().toLowerCase();
        const count = counts.get(role) || 0;
        if (def.required && count === 0) {
          issues.push(t('docset.validation.missingRequiredRole', { role: def.role }));
        }
        if (!def.multiple && count > 1) {
          issues.push(t('docset.validation.roleMustBeUnique', { role: def.role }));
        }
      }
    }

    setDocsetIssues(issues);
  }, [
    bundleSchemaRoles,
    docsetMembers,
    docsetPrimaryDocumentId,
    documentId,
    effectiveScope,
    enforcedPlaybookScope,
    t,
  ]);

  async function createPinnedContextSetFromThisDocument() {
    const name = window.prompt(t('prompts.referencePackName'));
    if (!name) return;
    const kind = window.prompt(t('prompts.referencePackKind'), 'policy') || 'policy';
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error(t('errors.notAuthenticated'));
      const userId = session.user.id;

      const { data: p, error: pErr } = await supabase
        .from('packs')
        .insert({ workspace_id: workspaceId, name, kind, pack_type: 'context', created_by: userId })
        .select('id')
        .single();
      if (pErr) throw pErr;

      const { error: memErr } = await supabase
        .from('pack_members')
        .insert({ pack_id: p.id, document_id: documentId, sort_order: 0, role: 'context', added_by: userId });
      if (memErr) throw memErr;

      const { error: pinErr } = await supabase
        .from('workspace_pinned_packs')
        .insert({ workspace_id: workspaceId, pack_id: p.id, created_by: userId });
      if (pinErr) throw pinErr;

      await load();
      await loadRuns({ keepSelection: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.createReferencePackFailed'));
    }
  }

  async function generateKnowledgePackForThisDocument() {
    const kind = (window.prompt(t('prompts.knowledgePackKind'), 'policy') || 'policy') as any;
    setIsGeneratingKnowledgePack(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-knowledge-pack', {
        body: { workspace_id: workspaceId, document_id: documentId, kind },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || t('errors.generateKnowledgePackFailed'));
      await load();
      await loadRuns({ keepSelection: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generateKnowledgePackFailed'));
    } finally {
      setIsGeneratingKnowledgePack(false);
    }
  }

  async function runComplianceChecks() {
    setIsRunningCompliance(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-compliance', {
        body: { workspace_id: workspaceId, document_id: documentId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || t('errors.complianceCheckFailed'));
      await load();
      await loadRuns({ keepSelection: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.complianceCheckFailed'));
    } finally {
      setIsRunningCompliance(false);
    }
  }

  async function persistDocsetAsPack(userId: string): Promise<string> {
    const name = docsetName.trim() || null;
    const { data: pack, error: packErr } = await supabase
      .from('packs')
      .insert({
        workspace_id: workspaceId,
        name,
        pack_type: 'bundle',
        precedence_policy: docsetPrecedencePolicy,
        primary_document_id: docsetPrimaryDocumentId || documentId,
        created_by: userId,
      })
      .select('id')
      .single();
    if (packErr || !pack?.id) {
      throw packErr || new Error('Failed to create DocSet');
    }

    if (docsetMembers.length > 0) {
      const rows = docsetMembers.map((m, idx) => ({
        pack_id: pack.id,
        document_id: m.document_id,
        role: String(m.role || 'other').trim().toLowerCase() || 'other',
        sort_order: idx,
        added_by: userId,
      }));
      const { error: membersErr } = await supabase
        .from('pack_members')
        .upsert(rows, { onConflict: 'pack_id,document_id' });
      if (membersErr) throw membersErr;
    }

    return String(pack.id);
  }

  async function analyzeOnce() {
    setIsAnalyzing(true);
    setError(null);
    setProgressDetail({ stage: 'starting', completed: 0, total: 0 });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userData.user.id;

      // Resolve playbook options (language/strictness) deterministically:
      // Run settings override playbook defaults; playbook defaults override UI locale.
      const selectedPb = selectedPlaybookId ? playbooks.find((p) => p.id === selectedPlaybookId) : null;
      const specOptions = (selectedPb as any)?.current_version?.spec_json?.options || null;
      const specLang = specOptions?.language === 'ar' ? 'ar' : specOptions?.language === 'en' ? 'en' : null;
      const languagePref =
        (runLanguage === 'ar' ? 'ar' : runLanguage === 'en' ? 'en' : null) ||
        specLang ||
        (locale === 'ar' ? 'ar' : 'en');
      const strictnessPref =
        (runStrictness === 'strict' ? 'strict' : runStrictness === 'default' ? 'default' : null) ||
        (specOptions?.strictness === 'strict' ? 'strict' : null);
      const playbook_options =
        selectedPlaybookId || languagePref === 'ar' || strictnessPref
          ? {
              strictness: strictnessPref || undefined,
              language: languagePref,
            }
          : undefined;

      const shouldUseDocset = effectiveScope === 'bundle';
      if (shouldUseDocset && docsetIssues.length > 0) {
        setError(docsetIssues[0] || t('docset.validation.invalidDocset'));
        setIsAnalyzing(false);
        return;
      }

      const normalizedDocsetMembers: DocsetMember[] = shouldUseDocset
        ? docsetMembers
            .map((m, idx) => ({
              document_id: String(m.document_id || '').toLowerCase().trim(),
              role: String(m.role || 'other').trim().toLowerCase() || 'other',
              sort_order: Number.isFinite(m.sort_order) ? Number(m.sort_order) : idx,
            }))
            .filter((m) => !!m.document_id)
            .sort((a, b) => a.sort_order - b.sort_order)
        : [];

      const docsetDocumentIds = shouldUseDocset
        ? Array.from(new Set(normalizedDocsetMembers.map((m) => m.document_id)))
        : [];

      let resolvedPackId: string | undefined;
      let resolvedDocsetMode: DocsetMode = 'ephemeral';
      if (shouldUseDocset) {
        if (saveDocset) {
          resolvedPackId = await persistDocsetAsPack(userId);
          resolvedDocsetMode = 'saved';
          setSelectedBundleId(resolvedPackId);
          setDocsetMode('saved');
          await loadBundlePacks();
        } else if (selectedBundleId && docsetMode === 'saved') {
          resolvedPackId = selectedBundleId;
          resolvedDocsetMode = 'saved';
        }
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          document_id: documentId,
          workspace_id: workspaceId,
          user_id: userId,
          ...(playbook_options ? { playbook_options } : {}),
          ...(shouldUseDocset
            ? {
                ...(resolvedPackId ? { pack_id: resolvedPackId } : {}),
                document_ids: docsetDocumentIds,
                member_roles: normalizedDocsetMembers,
                primary_document_id: docsetPrimaryDocumentId || documentId,
                precedence_policy: docsetPrecedencePolicy,
                docset_mode: resolvedDocsetMode,
                ...(resolvedDocsetMode === 'saved' && docsetName.trim()
                  ? { saved_docset_name: docsetName.trim() }
                  : {}),
              }
            : {}),
          ...(selectedPlaybookId
            ? {
                playbook_id: selectedPlaybookId,
                playbook_version_id: selectedPlaybookVersionId || undefined,
              }
            : {}),
        }),
      });

      const json = await res.json().catch(() => null);

      // Handle 4xx/5xx errors (except 202)
      if (!res.ok && res.status !== 202) {
        const uiErr = mapHttpError(res.status, json, 'analyze-contract');
        toast.show(uiErr);
        setError(uiErr.message);
        setIsAnalyzing(false);
        return;
      }

      // 202 = Queued for batch processing. Poll for completion.
      if (res.status === 202 && json?.accepted && json?.action_id) {
        const actionId = json.action_id;
        
        // Poll the action for progress
        const maxPolls = 900; // Max ~30 minutes (2s intervals) - queue-based runs can be longer
        let pollCount = 0;
        
        const pollInterval = setInterval(async () => {
          pollCount++;
          
          try {
            const { data: action, error: actionError } = await supabase
              .from('actions')
              .select('status, output_json')
              .eq('id', actionId)
              .maybeSingle();
            
            if (actionError) {
              console.warn('[Contract] Poll error:', actionError.message);
              return;
            }
            
            if (!action) {
              return;
            }
            
            const output = action.output_json as any;
            const totalBatches = output?.total_batches || 6;
            const completedBatches = output?.completed_batches ?? output?.batch_index ?? 0;
            const stage = output?.stage || 'queued';

            setProgressDetail({
              stage: String(stage),
              completed: Number.isFinite(completedBatches) ? Number(completedBatches) : 0,
              total: Number.isFinite(totalBatches) ? Number(totalBatches) : 0,
            });

            const actionStatus = String((action as any).status || '').toLowerCase();
            const isSuccess = actionStatus === 'succeeded' || actionStatus === 'completed' || actionStatus === 'success';
            const isFailed = actionStatus === 'failed' || actionStatus === 'error';

            // Check for completion
            if (isSuccess) {
              clearInterval(pollInterval);
              // Results can take a moment to become queryable (eventual consistency).
              // Retry a few times so the UI updates without requiring tab switching.
              const maxRefreshAttempts = 10;
              let attempt = 0;
              while (attempt < maxRefreshAttempts) {
                attempt++;
                const r = await load();
                if (r?.hasContract) break;
                await new Promise((r) => setTimeout(r, 800));
              }
              await loadRuns({ keepSelection: true });
              setIsAnalyzing(false);
              setShowSettings(false);
              return;
            }
            
            if (isFailed) {
              clearInterval(pollInterval);
              const errorMsg = output?.error || t('errors.contractAnalysisFailed');
              setError(errorMsg);
              setIsAnalyzing(false);
              return;
            }
            
            // Timeout check
            if (pollCount >= maxPolls) {
              clearInterval(pollInterval);
              setError(t('errors.analysisTakingLonger'));
              setIsAnalyzing(false);
            }
          } catch (pollErr) {
            console.warn('[Contract] Poll exception:', pollErr);
          }
        }, 2000); // Poll every 2 seconds
        
        return; // Exit early - polling handles the rest
      }

      // 202 without accepted: document not ready / fast-return informational responses.
      if (res.status === 202 && json?.error === 'document_not_ready') {
        setError(json?.message || 'Document is still being processed. Please wait a few seconds and try again.');
        setIsAnalyzing(false);
        return;
      }

      // Synchronous success (legacy path or immediate completion)
      await load();
      await loadRuns({ keepSelection: true });
      setIsAnalyzing(false);
      setShowSettings(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.contractAnalysisFailed'));
      setIsAnalyzing(false);
    }
  }

  // When analysis starts, auto-scroll the progress card into view so users
  // don't think nothing is happening (especially on shorter viewports).
  useEffect(() => {
    if (!isAnalyzing) return;
    // Wait a tick for the progress UI to render.
    const id = window.setTimeout(() => {
      progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(id);
  }, [isAnalyzing]);

  // If navigated with autorun params, hydrate local state and kick off analysis once.
  useEffect(() => {
    const autorun = searchParams.get('autorun') === '1';
    if (!autorun) return;

    const pbId = searchParams.get('playbook_id') || '';
    const pbVid = searchParams.get('playbook_version_id') || '';
    const bId = searchParams.get('pack_id') || searchParams.get('bundle_id') || '';

    if (pbId) setSelectedPlaybookId(pbId);
    if (pbVid) setSelectedPlaybookVersionId(pbVid);
    if (bId) {
      setScope('bundle');
      void loadDocsetFromSavedPack(bId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const autorun = searchParams.get('autorun') === '1';
    if (!autorun) return;
    if (autoRunTriggered.current) return;
    if (loading) return;
    if (isAnalyzing) return;
    // If analysis already exists, don't rerun.
    if (contract) return;
    autoRunTriggered.current = true;
    void analyzeOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, isAnalyzing, contract]);

  function exportCalendar() {
    setError(null);
    try {
      // Trigger a same-origin download route synchronously to avoid browser blocking
      // downloads that occur after async awaits.
      const href = `/export-calendar?document_id=${encodeURIComponent(documentId)}`;
      const opened = window.open(href, '_blank', 'noopener,noreferrer');
      if (!opened) window.location.assign(href);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.exportCalendarFailed'));
    }
  }

  async function generateAndSaveReport() {
    setError(null);
    setReportSavedMessage(null);
    setIsGeneratingReport(true);
    try {
      // Align report language with run settings; fall back to playbook defaults; then UI locale.
      const selectedPb = selectedPlaybookId ? playbooks.find((p) => p.id === selectedPlaybookId) : null;
      const specOptions = (selectedPb as any)?.current_version?.spec_json?.options || null;
      const specLang = specOptions?.language === 'ar' ? 'ar' : specOptions?.language === 'en' ? 'en' : null;
      const reportLanguage =
        (runLanguage === 'ar' ? 'ar' : runLanguage === 'en' ? 'en' : null) ||
        specLang ||
        (locale === 'ar' ? 'ar' : 'en');

      // 1) Generate HTML via the existing exporter (same as iOS).
      const { data: reportData, error: reportErr } = await supabase.functions.invoke('export-contract-report', {
        body: {
          document_id: documentId,
          template: 'decision_pack',
          language: reportLanguage,
          // The exporter accepts an optional title, but this page doesn't load full document metadata.
        },
      });
      if (reportErr) throw reportErr;
      const html = String(reportData?.html || '').trim();
      if (!html) throw new Error('Report generation returned empty content');

      // 2) Persist it as a workspace report.
      const { error: createErr } = await supabase.functions.invoke('create-report', {
        body: {
          workspace_id: workspaceId,
          document_id: documentId,
          title: `Decision Pack${contract?.counterparty_name ? ` • ${contract.counterparty_name}` : ''}`,
          subtitle: null,
          template: 'decision_pack',
          output_type: 'download',
          format: 'html',
          html,
        },
      });
      if (createErr) throw createErr;

      setReportSavedMessage(t('reports.savedToWorkspace'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generateReportFailed'));
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function finalizeVerificationObject() {
    if (!verificationObjectId) return;
    setError(null);
    setIsFinalizing(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userRes.user.id;

      const { data, error: fnErr } = await supabase.functions.invoke('finalize-verification-object', {
        body: {
          verification_object_id: String(verificationObjectId).toLowerCase(),
          user_id: String(userId).toLowerCase(),
        },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(String(data.error));
      if (data?.success !== true) throw new Error('Finalization failed');

      setReportSavedMessage(t('reports.verificationFinalized'));
      await load();
      await loadRuns({ keepSelection: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Finalization failed');
    } finally {
      setIsFinalizing(false);
    }
  }

  async function downloadAuditPack() {
    if (!verificationObjectId && !currentVersionId) return;
    setError(null);
    setIsExportingAuditPack(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('export-audit-pack', {
        body: {
          version_id: currentVersionId || undefined,
          verification_object_id: currentVersionId ? undefined : verificationObjectId || undefined,
          include_actions: true,
          include_runs: true,
          mirror_to_enterprise_exports: false,
        },
      });
      if (fnErr) throw fnErr;
      if (!data?.ok || !data?.audit_pack) throw new Error('Audit Pack export failed');

      const blob = new Blob([JSON.stringify(data.audit_pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const v = snapshot?.schema_version ? `_${snapshot.schema_version}` : '';
      a.download = `audit_pack_v1_${documentId}${v}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audit Pack export failed');
    } finally {
      setIsExportingAuditPack(false);
    }
  }

  async function addTaskFromObligation(o: LegalObligation) {
    try {
      setCreatingTaskFor(o.id);
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userRes.user.id;

      const titleBase = o.summary || o.action || o.obligation_type || 'Contract obligation';
      const title = `${o.obligation_type}: ${titleBase}`.slice(0, 120);
      const descriptionParts = [
        'Source: Document Analysis',
        `Document: ${documentId}`,
        o.page_number != null ? `Page: ${o.page_number}` : null,
        '',
        o.summary ? `Summary: ${o.summary}` : null,
        o.action ? `Action: ${o.action}` : null,
        o.condition ? `Condition: ${o.condition}` : null,
      ].filter(Boolean) as string[];

      const { data: task, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          workspace_id: workspaceId,
          document_id: documentId,
          created_by: userId,
          title,
          description: descriptionParts.join('\n'),
          status: 'pending',
          due_at: o.due_at || null,
        })
        .select('*')
        .single();
      if (taskErr) throw taskErr;

      // Link obligation to task for UI state
      const { error: linkErr } = await supabase.from('legal_obligations').update({ task_id: task.id }).eq('id', o.id);
      if (linkErr) throw linkErr;

      setObligations((prev) => prev.map((x) => (x.id === o.id ? { ...x, task_id: task.id } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.createTaskFailed'));
    } finally {
      setCreatingTaskFor(null);
    }
  }

  async function applySnapshotPatches(patches: Array<Record<string, unknown>>, changeNotes?: string) {
    if (isHistoricalRunSelected) {
      setError(t('errors.historicalRunReadOnly'));
      return false;
    }
    if (!verificationObjectId || !currentVersionId) {
      setError(t('errors.snapshotVersionMissing'));
      return false;
    }
    try {
      setIsPatchingSnapshot(true);
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userRes.user.id;

      const { data, error: fnErr } = await supabase.functions.invoke('update-verification-snapshot', {
        body: {
          verification_object_id: verificationObjectId,
          base_version_id: currentVersionId,
          user_id: userId,
          patches,
          ...(changeNotes ? { change_notes: changeNotes } : {}),
        },
      });
      if (fnErr) throw fnErr;
      if (!data?.success) throw new Error(data?.error || t('errors.snapshotPatchFailed'));
      await load();
      await loadRuns({ keepSelection: true });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.snapshotPatchFailed'));
      return false;
    } finally {
      setIsPatchingSnapshot(false);
    }
  }

  async function rejectItem(
    category: 'variable' | 'clause' | 'obligation' | 'risk' | 'module' | 'record' | 'verdict' | 'exception',
    targetId: string
  ) {
    if (!targetId || isPatchingSnapshot) return;
    await applySnapshotPatches(
      [{ op: 'reject_item', target_id: targetId, value: { category } }],
      `${t('v3.changeNotePrefix')}: reject ${category}`
    );
  }

  async function restoreItem(
    category: 'variable' | 'clause' | 'obligation' | 'risk' | 'module' | 'record' | 'verdict' | 'exception',
    targetId: string
  ) {
    if (!targetId || isPatchingSnapshot) return;
    await applySnapshotPatches(
      [{ op: 'unreject_item', target_id: targetId, value: { category } }],
      `${t('v3.changeNotePrefix')}: restore ${category}`
    );
  }

  async function addFindingRecord() {
    const title = window.prompt(t('v3.addFindingPromptTitle'));
    if (!title || !title.trim()) return;
    const summary = window.prompt(t('v3.addFindingPromptSummary')) || '';
    await applySnapshotPatches(
      [
        {
          op: 'add_record',
          value: {
            record_type: 'finding',
            title: title.trim(),
            summary: summary.trim() || undefined,
            severity: 'medium',
          },
        },
      ],
      t('v3.addFindingChangeNote')
    );
  }

  async function updateRecordStatus(recordId: string, status: 'confirmed' | 'rejected' | 'resolved') {
    const op = status === 'confirmed' ? 'confirm_record' : status === 'rejected' ? 'reject_record' : 'resolve_record';
    await applySnapshotPatches([{ op, target_id: recordId }], `${t('v3.changeNotePrefix')}: ${status}`);
  }

  useEffect(() => {
    load();
    loadPlaybooks();
    loadBundlePacks();
    loadWorkspaceDocsetSources();
    loadRuns();
    
    // Re-load when tab becomes visible (handles laptop sleep, tab switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Contract] Tab visible, refreshing data...');
        load();
        loadRuns({ keepSelection: true });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      {!embedded && (
      <header className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-3">
          <Link
            href={`/workspaces/${workspaceId}/documents/${documentId}`}
            className="p-2 rounded-lg hover:bg-surface-alt transition-colors"
            title="Close and return to PDF"
          >
            <X className="w-5 h-5 text-text-soft" />
          </Link>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-purple-500" />
            <h1 className="font-semibold text-text">Document Analysis</h1>
            {contract && !showSettings && <Badge size="sm">saved</Badge>}
            {contract && showSettings && <Badge size="sm" variant="warning">re-configuring</Badge>}
            {documentRow?.privacy_mode && (
              <Badge size="sm">
                Privacy Mode
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('zohal:start-tour', {
                  detail: { tourId: 'contract-analysis', force: true },
                })
              );
            }}
            aria-label="Take a tour"
            title="Take a tour"
          >
            <CircleHelp className="w-4 h-4" />
            Tour
          </Button>
          <ScholarActionMenu
            icon={<Zap className="w-4 h-4" />}
            label="Actions"
            isLoading={isGeneratingReport || isFinalizing || isExportingAuditPack}
            dataTour="contract-actions"
            items={[
              ...(contract ? [{
                label: t('actions.reanalyze'),
                icon: <RefreshCw className="w-4 h-4" />,
                onClick: () => { setShowSettings(true); setTab('overview'); },
              },
              { type: 'divider' as const }] : []),
              { type: 'section', label: 'Report' },
              {
                label: isGeneratingReport ? 'Generating report…' : 'Generate Report',
                icon: <FileText className="w-4 h-4" />,
                onClick: () => generateAndSaveReport(),
                disabled: isGeneratingReport || !contract || isHistoricalRunSelected,
              },
              { type: 'divider' },
              { type: 'section', label: 'Dates' },
              {
                label: 'Export Calendar',
                icon: <Calendar className="w-4 h-4" />,
                onClick: () => exportCalendar(),
                disabled: !contract || isHistoricalRunSelected,
              },
              { type: 'divider' },
              { type: 'section', label: 'Audit' },
              {
                label: verificationObjectState === 'finalized'
                  ? 'Finalized'
                  : (isFinalizing ? 'Finalizing…' : 'Finalize (Provisional → Finalized)'),
                icon: <CheckCircle className="w-4 h-4" />,
                onClick: () => finalizeVerificationObject(),
                disabled: !verificationObjectId || !contract || verificationObjectState === 'finalized' || isFinalizing || isHistoricalRunSelected,
              },
              {
                label: isExportingAuditPack ? 'Exporting Audit Pack…' : 'Download Audit Pack (JSON)',
                icon: <Download className="w-4 h-4" />,
                onClick: () => downloadAuditPack(),
                disabled: (!verificationObjectId && !currentVersionId) || !contract || isExportingAuditPack,
              },
              { type: 'divider' },
              ...(!embedded ? [{
                label: 'Close & Return to PDF',
                icon: <X className="w-4 h-4" />,
                onClick: () => router.push(`/workspaces/${workspaceId}/documents/${documentId}`),
              }] : []),
            ]}
          />
        </div>
      </header>
      )}

      {/* Body */}
      <div className={cn('flex-1 overflow-auto', embedded ? 'p-3' : 'p-4')}>
        <div className="mb-3 p-3 border border-border rounded-scholar bg-surface-alt">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-soft">{t('runs.title')}</p>
              <p className="text-sm text-text-soft">
                {runsLoading
                  ? t('runs.loading')
                  : runs.length > 0
                    ? t('runs.recentCount', { count: runs.length })
                    : t('runs.empty')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {runs.length > 0 && (
                <Button
                  variant={showSettings ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    setShowSettings(true);
                    setTab('overview');
                  }}
                >
                  {t('runs.newRun')}
                </Button>
              )}
              {embedded && onSwitchToChat && (
                <Button variant="ghost" size="sm" onClick={onSwitchToChat}>
                  {t('runs.chat')}
                </Button>
              )}
            </div>
          </div>
          {runs.length > 0 && (
            <div className="mt-3 space-y-2 max-h-44 overflow-auto pr-1">
              {runs.map((run) => (
                <button
                  key={run.runId}
                  type="button"
                  onClick={() => {
                    void selectRun(run);
                  }}
                  className={cn(
                    'w-full text-left p-2 rounded-scholar border transition-colors',
                    selectedRunId === run.runId
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent/40 bg-surface'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-text truncate">
                      {run.playbookLabel || t('runs.defaultLabel')}
                    </p>
                    <div className="flex items-center gap-1">
                      {run.scope === 'bundle' && run.docsetMode === 'ephemeral' && (
                        <Badge size="sm" variant="warning">{t('runs.unsaved')}</Badge>
                      )}
                      {run.scope === 'bundle' && run.docsetMode === 'saved' && run.savedDocsetName && (
                        <Badge size="sm">{run.savedDocsetName}</Badge>
                      )}
                      <Badge
                        size="sm"
                        variant={run.status === 'failed' ? 'error' : run.status === 'running' ? 'warning' : run.status === 'succeeded' ? 'success' : 'default'}
                      >
                        {run.status}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-text-soft">
                    {run.scope === 'bundle' ? t('runs.scopeDocset') : t('runs.scopeSingle')} · {new Date(run.createdAt).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {isHistoricalRunSelected && (
          <div className="mb-3 p-3 rounded-scholar border border-warning/40 bg-warning/10 text-warning text-sm">
            {t('runs.historicalReadOnly')}
          </div>
        )}

        {selectedRunStatus && selectedRunStatus !== 'succeeded' && (
          <div className="mb-3 p-3 rounded-scholar border border-border bg-surface-alt text-sm text-text-soft">
            {t('runs.selectedStatus', { status: selectedRunStatus })}
          </div>
        )}

        {reportSavedMessage && (
          <div className="mb-4 p-3 bg-success/10 border border-success/20 rounded-scholar text-success text-sm font-medium">
            {reportSavedMessage}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : !contract || showSettings ? (
          <div className="space-y-4 max-w-xl mx-auto">
            {/* Show a back-to-results button when re-configuring an existing analysis */}
            {contract && showSettings && (
              <div className="flex items-center justify-between p-3 bg-surface-alt border border-border rounded-scholar">
                <p className="text-sm text-text-soft">
                  An analysis already exists. Configure and run again to replace it.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(false)}
                >
                  View Results
                </Button>
              </div>
            )}
            {!contract && (
              <EmptyState
                title={t('empty.notAnalyzedTitle')}
                description={t('empty.notAnalyzedDescription')}
                variant="card"
              />
            )}

            {/* Analysis Configuration */}
            <ScholarNotebookCard>
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-text-soft">{t('docset.templateHelp')}</p>
                    <Link
                      href={`/workspaces/${workspaceId}/playbooks?returnTo=${encodeURIComponent(
                        `/workspaces/${workspaceId}/documents/${documentId}/contract-analysis`
                      )}`}
                      className="text-xs font-semibold text-accent hover:underline"
                    >
                      {t('playbook.manage')}
                    </Link>
                  </div>
                  {playbooks.length === 0 ? (
                    <div className="p-4 rounded-scholar border border-border bg-surface-alt text-center">
                      <p className="text-sm text-text-soft mb-2">{t('playbook.loadingTemplates')}</p>
                      <p className="text-xs text-text-soft">{t('playbook.templatesAutoCreated')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-auto pr-1">
                      {playbooks.map((pb) => (
                        <button
                          key={pb.id}
                          onClick={() => {
                            setSelectedPlaybookId(pb.id);
                            setSelectedPlaybookVersionId(pb.current_version?.id || '');
                          }}
                          className={cn(
                            'w-full flex items-center justify-between p-3 rounded-scholar border transition-colors text-left',
                            selectedPlaybookId === pb.id
                              ? 'border-accent bg-accent/5'
                              : 'border-border bg-surface-alt hover:border-accent/50'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <BookOpen className={cn('w-4 h-4', selectedPlaybookId === pb.id ? 'text-accent' : 'text-text-soft')} />
                            <span className="font-semibold text-text">{pb.name}</span>
                          </div>
                          {selectedPlaybookId === pb.id && <CheckCircle className="w-4 h-4 text-accent" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-border space-y-2">
                  <div className="text-xs font-semibold text-text-soft uppercase tracking-wider">{t('docset.scopeTitle')}</div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={effectiveScope === 'single' ? 'primary' : 'secondary'}
                      onClick={() => setScope('single')}
                      disabled={enforcedPlaybookScope === 'bundle'}
                    >
                      {t('docset.scopeSingle')}
                    </Button>
                    <Button
                      size="sm"
                      variant={effectiveScope === 'bundle' ? 'primary' : 'secondary'}
                      onClick={() => setScope('bundle')}
                      disabled={enforcedPlaybookScope === 'single'}
                    >
                      {t('docset.scopeDocset')}
                    </Button>
                  </div>
                  {enforcedPlaybookScope !== 'either' && (
                    <p className="text-xs text-text-soft">
                      {t('docset.scopeEnforced', {
                        scope: enforcedPlaybookScope === 'single' ? t('docset.scopeSingle') : t('docset.scopeDocset'),
                      })}
                    </p>
                  )}
                </div>

                {effectiveScope === 'bundle' && (
                  <div className="pt-3 border-t border-border space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-text-soft uppercase tracking-wider">{t('docset.title')}</div>
                        <button
                          onClick={() => setShowBundleModal(true)}
                          className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent/80 transition-colors px-2 py-1 rounded-md hover:bg-accent/5"
                        >
                          <Settings className="w-3 h-3" />
                          {t('docset.manageSaved')}
                        </button>
                      </div>
                      <p className="text-xs text-text-soft">{t('docset.help')}</p>
                      <select
                        value={selectedBundleId}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (!value) {
                            setSelectedBundleId('');
                            setDocsetMode('ephemeral');
                            return;
                          }
                          void loadDocsetFromSavedPack(value);
                        }}
                        className="w-full px-2.5 py-2 border border-border rounded-md bg-surface-alt text-sm text-text cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors"
                      >
                        <option value="">{t('docset.savedPickerPlaceholder')}</option>
                        {bundlePacks.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name || t('docset.unnamed')} ({b.member_count || 0})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 border border-border rounded-scholar bg-surface-alt space-y-2.5">
                        <div className="text-[11px] font-semibold text-text-soft uppercase tracking-wider">{t('docset.add')}</div>
                        <div className="relative">
                          <FileSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-soft pointer-events-none" />
                          <input
                            value={docsetSearch}
                            onChange={(e) => setDocsetSearch(e.target.value)}
                            placeholder={t('docset.searchPlaceholder')}
                            className="w-full pl-8 pr-3 py-2 rounded-md border border-border bg-surface text-sm text-text placeholder:text-text-soft/50 focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors"
                          />
                        </div>
                        <div className="max-h-72 overflow-y-auto overscroll-contain space-y-1.5 pr-1">
                          {filteredWorkspaceDocs.map((d) => {
                            const inDocset = docsetMembers.some((m) => m.document_id === d.id);
                            return (
                              <div
                                key={d.id}
                                className={cn(
                                  'flex items-center justify-between gap-2 p-2.5 rounded-md border transition-colors',
                                  inDocset
                                    ? 'border-accent/30 bg-accent/5'
                                    : 'border-border bg-surface hover:border-accent/20'
                                )}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className={cn(
                                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                                    inDocset ? 'bg-accent/15' : 'bg-surface-alt'
                                  )}>
                                    {inDocset
                                      ? <CheckCircle className="w-3.5 h-3.5 text-accent" />
                                      : <FileText className="w-3 h-3 text-text-soft" />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm text-text truncate">{d.title}</p>
                                    <p className="text-[11px] text-text-soft truncate">
                                      {d.folder_id ? folderNameById.get(d.folder_id) || t('docset.workspaceRoot') : t('docset.workspaceRoot')}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant={inDocset ? 'secondary' : 'primary'}
                                  onClick={() => (inDocset ? removeDocumentFromDocset(d.id) : addDocumentToDocset(d.id))}
                                  className="flex-shrink-0"
                                >
                                  {inDocset ? t('docset.remove') : t('docset.add')}
                                </Button>
                              </div>
                            );
                          })}
                          {filteredWorkspaceDocs.length === 0 && (
                            <p className="text-xs text-text-soft text-center py-4">{t('docset.searchPlaceholder')}</p>
                          )}
                        </div>
                      </div>

                      <div className="p-3 border border-border rounded-scholar bg-surface-alt space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-semibold text-text-soft uppercase tracking-wider">
                            {t('docset.selectedTitle', { count: docsetMembers.length })}
                          </div>
                        </div>
                        {docsetMembers.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-5 text-text-soft">
                            <Package className="w-5 h-5 mb-1.5 opacity-40" />
                            <p className="text-xs">{t('docset.emptySelection')}</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-56 overflow-y-auto overscroll-contain pr-1">
                            {docsetMembers
                              .slice()
                              .sort((a, b) => a.sort_order - b.sort_order)
                              .map((m, idx) => {
                                const doc = workspaceDocs.find((d) => d.id === m.document_id);
                                return (
                                  <div key={`${m.document_id}_${idx}`} className="flex items-center gap-2 p-2 border border-border rounded-md bg-surface">
                                    <span className="text-[11px] font-medium text-text-soft w-5 text-center flex-shrink-0">{idx + 1}</span>
                                    <span className="text-sm text-text truncate flex-1 min-w-0">{doc?.title || m.document_id}</span>
                                    <select
                                      value={m.role}
                                      onChange={(e) => updateDocsetMemberRole(m.document_id, e.target.value)}
                                      className="px-2 py-1 border border-border rounded-md bg-surface-alt text-xs text-text flex-shrink-0 cursor-pointer"
                                    >
                                      {bundleSchemaRoles.length > 0
                                        ? bundleSchemaRoles.map((r) => (
                                            <option key={r.role} value={r.role.toLowerCase()}>
                                              {r.role}
                                            </option>
                                          ))
                                        : (
                                          <>
                                            <option value="primary">primary</option>
                                            <option value="other">other</option>
                                          </>
                                        )}
                                    </select>
                                    <div className="flex items-center flex-shrink-0">
                                      <button
                                        onClick={() => moveDocsetMember(m.document_id, 'up')}
                                        disabled={idx === 0}
                                        className="p-1 rounded hover:bg-surface-alt disabled:opacity-30 transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5 text-text-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 15l7-7 7 7" /></svg>
                                      </button>
                                      <button
                                        onClick={() => moveDocsetMember(m.document_id, 'down')}
                                        disabled={idx === docsetMembers.length - 1}
                                        className="p-1 rounded hover:bg-surface-alt disabled:opacity-30 transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5 text-text-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 9l-7 7-7-7" /></svg>
                                      </button>
                                    </div>
                                    <button
                                      onClick={() => removeDocumentFromDocset(m.document_id)}
                                      className="p-1 rounded hover:bg-error/10 transition-colors flex-shrink-0"
                                    >
                                      <X className="w-3.5 h-3.5 text-error/70" />
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('docset.primaryDocument')}</div>
                        <select
                          value={docsetPrimaryDocumentId}
                          onChange={(e) => setDocsetPrimaryDocumentId(e.target.value)}
                          className="w-full px-2.5 py-2 border border-border rounded-md bg-surface-alt text-sm text-text cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors"
                        >
                          {docsetMembers.map((m) => {
                            const doc = workspaceDocs.find((d) => d.id === m.document_id);
                            return (
                              <option key={m.document_id} value={m.document_id}>
                                {doc?.title || m.document_id}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('docset.precedencePolicy')}</div>
                        <ScholarSelect
                          value={docsetPrecedencePolicy}
                          onChange={(e) => setDocsetPrecedencePolicy(e.target.value as 'manual' | 'primary_first' | 'latest_wins')}
                          options={[
                            { value: 'manual', label: t('docset.precedence.manual') },
                            { value: 'primary_first', label: t('docset.precedence.primaryFirst') },
                            { value: 'latest_wins', label: t('docset.precedence.latestWins') },
                          ]}
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer group">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={saveDocset}
                          onChange={(e) => setSaveDocset(e.target.checked)}
                          className="peer sr-only"
                        />
                        <div className="w-8 h-[18px] rounded-full bg-border peer-checked:bg-accent transition-colors" />
                        <div className="absolute left-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-3.5" />
                      </div>
                      <span className="text-sm">{t('docset.saveToggle')}</span>
                    </label>
                    {saveDocset && (
                      <input
                        value={docsetName}
                        onChange={(e) => setDocsetName(e.target.value)}
                        placeholder={t('docset.namePlaceholder')}
                        className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text placeholder:text-text-soft/50 focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors"
                      />
                    )}

                    {docsetIssues.length > 0 && (
                      <div className="flex items-start gap-2.5 p-3 border border-highlight/30 bg-highlight/5 rounded-scholar">
                        <AlertTriangle className="w-4 h-4 text-highlight flex-shrink-0 mt-0.5" />
                        <div className="space-y-1 text-xs">
                          {docsetIssues.map((issue, idx) => (
                            <p key={`${issue}_${idx}`} className="text-text">{issue}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-3 border-t border-border space-y-3">
                  {(selectedPlaybookId || effectiveScope === 'bundle') && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedPlaybookId && (
                        <Badge size="sm">
                          <BookOpen className="w-3 h-3 mr-1" />
                          {playbooks.find((p) => p.id === selectedPlaybookId)?.name || t('runs.defaultLabel')}
                        </Badge>
                      )}
                      {effectiveScope === 'bundle' && (
                        <Badge size="sm" variant={saveDocset || selectedBundleId ? 'success' : 'warning'}>
                          {saveDocset || selectedBundleId ? t('runs.scopeDocsetSaved') : t('runs.scopeDocsetUnsaved')}
                        </Badge>
                      )}
                    </div>
                  )}
                  <Button
                    onClick={() => {
                      if (!isAnalyzing) analyzeOnce();
                    }}
                    variant="primary"
                    disabled={isAnalyzing || (effectiveScope === 'bundle' && docsetIssues.length > 0)}
                    data-tour="contract-analyze"
                    className="w-full justify-center"
                  >
                    {isAnalyzing ? t('docset.running') : t('docset.run')}
                  </Button>
                </div>

                {/* Run Settings (per-run; does not require duplicating templates) */}
                <div className="pt-3 border-t border-border space-y-2.5">
                  <div className="text-[11px] font-semibold text-text-soft uppercase tracking-wider">
                    {t('runSettings.title')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('runSettings.language')}</div>
                      <ScholarSelect
                        value={runLanguage}
                        onChange={(e) => setRunLanguage(e.target.value as 'auto' | 'en' | 'ar')}
                        options={[
                          { value: 'auto', label: t('runSettings.auto') },
                          { value: 'en', label: t('runSettings.english') },
                          { value: 'ar', label: t('runSettings.arabic') },
                        ]}
                      />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('runSettings.strictness')}</div>
                      <ScholarSelect
                        value={runStrictness}
                        onChange={(e) => setRunStrictness(e.target.value as 'auto' | 'default' | 'strict')}
                        options={[
                          { value: 'auto', label: t('runSettings.auto') },
                          { value: 'default', label: t('runSettings.default') },
                          { value: 'strict', label: t('runSettings.strict') },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-text-soft">
                    {t('runSettings.caption')}
                  </div>
                </div>
              </div>
            </ScholarNotebookCard>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="p-3 rounded-scholar border border-error/30 bg-error/5 text-error text-sm">
                {error}
              </div>
            )}

            {/* Needs-Review Alert Banner */}
            {snapshot?.pack?.exceptions_summary &&
              (snapshot.pack.exceptions_summary.blocker > 0 || snapshot.pack.exceptions_summary.warning > 0) && (
                <div className={cn(
                  'flex items-start gap-3 p-4 rounded-scholar border',
                  snapshot.pack.exceptions_summary.blocker > 0
                    ? 'bg-error/5 border-error/20'
                    : 'bg-highlight/5 border-highlight/20',
                )}>
                  <ShieldAlert className={cn(
                    'w-5 h-5 flex-shrink-0 mt-0.5',
                    snapshot.pack.exceptions_summary.blocker > 0 ? 'text-error' : 'text-highlight',
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-text">{t('needsReview.title')}</span>
                      {snapshot.pack.exceptions_summary.blocker > 0 && (
                        <Badge size="sm" variant="error">{snapshot.pack.exceptions_summary.blocker} blockers</Badge>
                      )}
                      {snapshot.pack.exceptions_summary.warning > 0 && (
                        <Badge size="sm" variant="warning">{snapshot.pack.exceptions_summary.warning} warnings</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-soft mt-1">{t('needsReview.subtitle')}</p>
                    {Array.isArray(snapshot.pack.exceptions) && snapshot.pack.exceptions.length > 0 && (
                      <ul className="text-xs text-text mt-2 space-y-0.5 list-disc pl-4">
                        {snapshot.pack.exceptions.slice(0, 5).map((e: any, idx: number) => (
                          <li key={e?.id || idx}>{e?.message || e?.type || 'Exception'}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    onClick={() => setTab('exceptions')}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex-shrink-0',
                      snapshot.pack.exceptions_summary.blocker > 0
                        ? 'text-error bg-error/10 hover:bg-error/20 border border-error/20'
                        : 'text-highlight bg-highlight/10 hover:bg-highlight/20 border border-highlight/20',
                    )}
                  >
                    Jump to Exceptions
                  </button>
                </div>
              )}

            {/* At-a-Glance Summary Bar */}
            <AtAGlanceSummary
              risks={(snapshot?.risks || []).map(r => ({ severity: r.severity }))}
              confidences={[
                ...(snapshot?.variables || []).map(v => ({ confidence: v.ai_confidence })),
                ...obligations.map(o => ({ confidence: o.confidence || 'medium' })),
              ]}
              noticeDeadline={(() => {
                if (!contract.end_date || contract.notice_period_days == null) return null;
                const end = new Date(contract.end_date);
                if (Number.isNaN(end.getTime())) return null;
                const d = new Date(end.getTime());
                d.setDate(d.getDate() - contract.notice_period_days);
                return d.toISOString();
              })()}
            />

            {documentRow?.privacy_mode && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span>🔒</span>
                    {t('privacyMode.sanitizedTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-text-soft">
                    {t('privacyMode.sanitizedSubtitle')}
                  </p>
                  {(() => {
                    const report = (documentRow.source_metadata as any)?.privacy_redaction_report;
                    if (!report) return null;
                    const counts = report.counts || {};
                    const pages = report.pagesAffected || [];
                    return (
                      <div className="text-sm text-text">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(counts).map(([k, v]) => (
                            <Badge key={k} size="sm">
                              {k}:{String(v)}
                            </Badge>
                          ))}
                        </div>
                        {pages.length > 0 && (
                          <div className="mt-2 text-text-soft">
                            Pages affected: {pages.join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Tabs */}
            <ScholarTabs
              tabs={tabs.map((t) => ({
                id: t.id,
                label: t.label,
                icon: <t.icon className="w-4 h-4" />,
                count: t.total,
                attentionCount: t.attentionCount,
              }))}
              activeTab={tab}
              onTabChange={(id) => setTab(id)}
              dataTour="contract-tabs"
            />

            {tab === 'overview' && (
              <OverviewTab
                contract={contract}
                snapshot={snapshot}
                workspaceId={workspaceId}
                documentId={documentId}
                bundleDocuments={bundleDocuments}
                verificationObjectState={verificationObjectState}
                onCreatePinnedContext={createPinnedContextSetFromThisDocument}
                onGenerateKnowledgePack={generateKnowledgePackForThisDocument}
                onRunCompliance={runComplianceChecks}
                isGeneratingKnowledgePack={isGeneratingKnowledgePack}
                isRunningCompliance={isRunningCompliance}
                proofHref={proofHref}
              />
            )}

            {tab === 'variables' && (
              <GenericModuleTab
                moduleId="variables"
                moduleTitle={t('tabs.variables')}
                emptyTitle={t('empty.noVariablesTitle')}
                emptyDescription={!snapshot ? t('empty.noVariablesSnapshotDescription') : t('empty.noVariablesDescription')}
                workspaceId={workspaceId}
                documentId={documentId}
                onReject={(id) => rejectItem('variable', id)}
                isPatchingSnapshot={isPatchReadOnly}
                items={(snapshot?.variables || [])
                  .filter((v) => !rejectedSets.variables.has(v.id))
                  .map((v) => ({
                    id: v.id,
                    title: v.display_name,
                    subtitle: v.value == null ? '—' : `${String(v.value)}${v.unit ? ` ${v.unit}` : ''}`,
                    confidence: v.ai_confidence as AIConfidence,
                    evidence: v.evidence,
                    sourceHref: proofHref(v.evidence),
                    sourcePage: v.evidence?.page_number ?? undefined,
                    icon: <Table2 className="w-4 h-4" />,
                    toolAction: { type: 'edit' as const, label: 'Edit' },
                    needsAttention: v.verification_state === 'needs_review',
                    attentionLabel: v.verification_state === 'needs_review' ? 'Needs Review' : undefined,
                    children: v.verifier?.status ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className={cn(
                          'inline-flex w-2 h-2 rounded-full',
                          v.verifier.status === 'green' ? 'bg-success' : v.verifier.status === 'red' ? 'bg-error' : 'bg-highlight'
                        )} />
                        <span className="text-text-soft">
                          Verifier: {v.verifier.status.toUpperCase()}
                          {v.verifier.reasons?.length ? ` (${v.verifier.reasons.join(', ')})` : ''}
                        </span>
                      </div>
                    ) : undefined,
                  }))}
              />
            )}

            {tab === 'clauses' && (
              <GenericModuleTab
                moduleId="clauses"
                moduleTitle={t('tabs.clauses')}
                emptyTitle={t('empty.noClausesTitle')}
                emptyDescription={t('empty.noClausesDescription')}
                workspaceId={workspaceId}
                documentId={documentId}
                groupBy="severity"
                onReject={(id) => rejectItem('clause', id)}
                isPatchingSnapshot={isPatchReadOnly}
                items={(() => {
                  const allClauses = snapshot?.clauses?.length
                    ? snapshot.clauses.map((c) => ({
                        id: c.id,
                        title: c.clause_title || c.clause_type || 'Clause',
                        subtitle: c.clause_number ? `Clause ${c.clause_number}` : undefined,
                        body: c.text,
                        severity: c.risk_level,
                        evidence: c.evidence,
                        sourceHref: proofHref(c.evidence),
                        sourcePage: c.evidence?.page_number ?? undefined,
                        icon: <ScrollText className="w-4 h-4" />,
                        iconColor: c.risk_level === 'high' ? 'text-error' : c.risk_level === 'medium' ? 'text-highlight' : c.risk_level === 'low' ? 'text-success' : 'text-text-soft',
                      }))
                    : clauses.map((c) => ({
                        id: c.id,
                        title: c.clause_title || c.clause_type || 'Clause',
                        subtitle: c.clause_number ? `Clause ${c.clause_number}` : undefined,
                        body: c.text,
                        severity: c.risk_level,
                        sourceHref: c.page_number
                          ? `/workspaces/${workspaceId}/documents/${documentId}?page=${c.page_number}&quote=${encodeURIComponent((c.text || '').slice(0, 120))}`
                          : null,
                        sourcePage: c.page_number ?? undefined,
                        icon: <ScrollText className="w-4 h-4" />,
                        iconColor: c.risk_level === 'high' ? 'text-error' : c.risk_level === 'medium' ? 'text-highlight' : c.risk_level === 'low' ? 'text-success' : 'text-text-soft',
                      }));
                  return allClauses.filter((c) => !rejectedSets.clauses.has(c.id)) as GenericModuleItem[];
                })()}
              />
            )}

            {tab === 'obligations' && (
              <GenericModuleTab
                moduleId="obligations"
                moduleTitle={t('tabs.obligations')}
                emptyTitle={t('empty.noObligationsTitle')}
                emptyDescription={t('empty.noObligationsDescription')}
                workspaceId={workspaceId}
                documentId={documentId}
                groupBy="metadata"
                onReject={(id) => rejectItem('obligation', id)}
                isPatchingSnapshot={isPatchReadOnly}
                items={(() => {
                  const confidenceMap: Record<string, AIConfidence> = { confirmed: 'high', extracted: 'medium', needs_review: 'low' };
                  const normalizedObligations = isHistoricalRunSelected && snapshot?.obligations?.length
                    ? snapshot.obligations.map((o) => ({
                        id: o.id,
                        summary: o.summary || o.action || 'Obligation',
                        action: o.action || '',
                        obligation_type: o.obligation_type || '',
                        responsible_party: o.responsible_party || '',
                        confidence: o.ai_confidence || undefined,
                        confidence_state: o.verification_state || undefined,
                        page_number: o.evidence?.page_number ?? null,
                        due_at: o.due_at || null,
                        task_id: null,
                      }))
                    : obligations;

                  return normalizedObligations
                    .filter((o) => !rejectedSets.obligations.has(o.id))
                    .sort((a, b) => {
                      const aNR = a.confidence_state === 'needs_review' ? 0 : 1;
                      const bNR = b.confidence_state === 'needs_review' ? 0 : 1;
                      if (aNR !== bNR) return aNR - bNR;
                      const da = a.due_at || '';
                      const db = b.due_at || '';
                      if (da && db && da !== db) return da.localeCompare(db);
                      return (a.page_number ?? 999999) - (b.page_number ?? 999999);
                    })
                    .map((o) => {
                      const isDbObligation = 'contract_id' in o;
                      const canAddTask = !isHistoricalRunSelected && isDbObligation && !o.task_id && !o.due_at;

                      return {
                        id: o.id,
                        title: o.summary || o.action || o.obligation_type || 'Obligation',
                        subtitle: o.responsible_party ? `Responsible: ${o.responsible_party}` : undefined,
                        confidence: (o.confidence || confidenceMap[o.confidence_state || ''] || 'medium') as AIConfidence,
                        needsAttention: o.confidence_state === 'needs_review' || o.confidence === 'low',
                        attentionLabel: o.confidence_state === 'needs_review' ? 'Needs Review' : o.confidence === 'low' ? 'Low Confidence' : undefined,
                        spotCheckSuggested: o.confidence === 'medium' && o.confidence_state !== 'needs_review',
                        severity: o.obligation_type,
                        sourceHref: o.page_number != null
                          ? `/workspaces/${workspaceId}/documents/${documentId}?page=${o.page_number}&quote=${encodeURIComponent((o.summary || o.action || '').slice(0, 140))}`
                          : null,
                        sourcePage: o.page_number ?? undefined,
                        icon: <ClipboardCheck className="w-4 h-4" />,
                        toolAction: o.due_at ? { type: 'calendar' as const, label: 'Add to Calendar' } : { type: 'task' as const, label: 'Add Task' },
                        onToolAction: isHistoricalRunSelected
                          ? undefined
                          : o.task_id
                            ? undefined
                            : o.due_at
                              ? () => exportCalendar()
                              : canAddTask
                                ? () => addTaskFromObligation(o as LegalObligation)
                                : undefined,
                        children: (
                          <div className="space-y-2">
                            {o.action && (
                              <p className="text-sm text-text">
                                <span className="text-text-soft">Action: </span>{o.action}
                              </p>
                            )}
                            {o.due_at && (
                              <p className="text-xs text-text-soft">
                                Due: <span className="text-text font-medium">{o.due_at}</span>
                              </p>
                            )}
                            {o.task_id && <Badge size="sm" variant="success">Task added</Badge>}
                          </div>
                        ),
                      };
                    }) as GenericModuleItem[];
                })()}
              />
            )}

            {tab === 'deadlines' && (
              <DeadlinesTab
                documentId={documentId}
                effectiveDate={contract.effective_date}
                endDate={contract.end_date}
                noticeDeadline={(() => {
                  const notice = computeNoticeDeadline(contract.end_date, contract.notice_period_days);
                  return notice?.toISOString() ?? null;
                })()}
                emptyTitle={t('empty.noDeadlinesTitle')}
                emptyDescription={t('empty.noDeadlinesDescription')}
                items={(() => {
                  const items: DeadlineItem[] = [];
                  const endEvidence = snapshot?.variables.find((v) => v.name === 'end_date')?.evidence;
                  
                  if (contract.end_date) {
                    items.push({
                      key: 'contract_end',
                      title: 'Contract End Date',
                      dueDate: contract.end_date,
                      dueLabel: contract.end_date,
                      description: 'Contract term ends',
                      href: proofHref(endEvidence),
                      isContractDate: true,
                    });
                    if (contract.auto_renewal) {
                      items.push({
                        key: 'renewal',
                        title: 'Auto-Renewal Date',
                        dueDate: contract.end_date,
                        dueLabel: contract.end_date,
                        description: 'Contract renews automatically unless notice is given',
                        href: proofHref(endEvidence),
                        isContractDate: true,
                      });
                    }
                    const notice = computeNoticeDeadline(contract.end_date, contract.notice_period_days);
                    if (notice) {
                      items.push({
                        key: 'notice_deadline',
                        title: 'Notice Deadline',
                        dueDate: notice.toISOString(),
                        dueLabel: notice.toLocaleDateString(),
                        description: `Last day to provide ${contract.notice_period_days ?? ''}-day notice`,
                        href: proofHref(endEvidence),
                        isContractDate: true,
                      });
                    }
                  }
                  for (const o of deadlines.filter((x) => !rejectedSets.obligations.has(x.id))) {
                    items.push({
                      key: `ob_${o.id}`,
                      title: o.obligation_type,
                      dueDate: o.due_at || null,
                      dueLabel: o.due_at || '—',
                      description: o.summary || o.action || '—',
                      href: o.page_number != null
                        ? `/workspaces/${workspaceId}/documents/${documentId}?page=${o.page_number}&quote=${encodeURIComponent((o.summary || o.action || '').slice(0, 140))}`
                        : null,
                    });
                  }
                  return items;
                })()}
              />
            )}

            {tab === 'risks' && (
              <GenericModuleTab
                moduleId="risks"
                moduleTitle={t('tabs.risks')}
                emptyTitle={t('empty.noRisksTitle')}
                emptyDescription={t('empty.noRisksDescription')}
                workspaceId={workspaceId}
                documentId={documentId}
                groupBy="severity"
                onReject={(id) => rejectItem('risk', id)}
                isPatchingSnapshot={isPatchReadOnly}
                items={(() => {
                  const severityConf: Record<string, AIConfidence> = { critical: 'high', high: 'high', medium: 'medium', low: 'low', unknown: 'medium' };
                  const allRisks = snapshot?.risks?.length
                    ? snapshot.risks.map((r) => ({
                        id: r.id,
                        title: r.description || 'Risk',
                        body: r.explanation,
                        severity: r.severity,
                        confidence: severityConf[r.severity || 'unknown'] || ('medium' as AIConfidence),
                        evidence: r.evidence,
                        sourceHref: proofHref(r.evidence),
                        sourcePage: r.evidence?.page_number ?? undefined,
                        icon: <ShieldAlert className="w-4 h-4" />,
                        iconColor: r.severity === 'critical' || r.severity === 'high' ? 'text-error' : r.severity === 'medium' ? 'text-highlight' : r.severity === 'low' ? 'text-success' : 'text-text-soft',
                      }))
                    : risks.map((r) => ({
                        id: r.id,
                        title: r.description || 'Risk',
                        body: r.explanation,
                        severity: r.severity,
                        confidence: severityConf[r.severity || 'unknown'] || ('medium' as AIConfidence),
                        sourceHref: r.page_number
                          ? `/workspaces/${workspaceId}/documents/${documentId}?page=${r.page_number}&quote=${encodeURIComponent((r.description || '').slice(0, 140))}`
                          : null,
                        sourcePage: r.page_number ?? undefined,
                        icon: <ShieldAlert className="w-4 h-4" />,
                        iconColor: r.severity === 'critical' || r.severity === 'high' ? 'text-error' : r.severity === 'medium' ? 'text-highlight' : r.severity === 'low' ? 'text-success' : 'text-text-soft',
                      }));
                  return allRisks.filter((r) => !rejectedSets.risks.has(r.id)) as GenericModuleItem[];
                })()}
              />
            )}

            {tab === 'records' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-text-soft">{t('v3.recordsSubtitle')}</p>
                  <Button size="sm" onClick={addFindingRecord} disabled={isPatchingSnapshot}>
                    {isPatchingSnapshot ? t('v3.saving') : t('v3.addFinding')}
                  </Button>
                </div>
                {v3Records.filter((r, idx) => !rejectedSets.records.has(String(r?.id || `record_${idx}`))).length === 0 ? (
                  <EmptyState title={t('v3.noRecordsTitle')} description={t('v3.noRecordsDescription')} />
                ) : (
                  v3Records
                    .filter((r, idx) => !rejectedSets.records.has(String(r?.id || `record_${idx}`)))
                    .map((r, idx) => {
                    const id = String(r?.id || `record_${idx}`);
                    const status = String(r?.status || 'proposed');
                    const severity = String(r?.severity || '').toLowerCase();
                    const evidenceLinks = Array.isArray((r as any)?.evidence)
                      ? ((r as any).evidence as any[])
                          .slice(0, 8)
                          .map((e) => ({
                            page: typeof e?.page_number === 'number' ? e.page_number : null,
                            quote: typeof e?.source_quote === 'string' ? e.source_quote : typeof e?.snippet === 'string' ? e.snippet : '',
                            docId: typeof e?.document_id === 'string' ? e.document_id : documentId,
                          }))
                          .filter((e) => !!e.page && !!e.quote)
                      : [];
                    return (
                      <Card key={id}>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between gap-2">
                            <span>{String(r?.title || r?.summary || r?.record_type || 'Record')}</span>
                            <div className="flex items-center gap-2">
                              <Badge size="sm">{status}</Badge>
                              {severity ? <Badge size="sm">{severity}</Badge> : null}
                            </div>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {r?.summary ? <p className="text-sm text-text">{String(r.summary)}</p> : null}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={isPatchingSnapshot || status === 'confirmed'}
                              onClick={() => updateRecordStatus(id, 'confirmed')}
                            >
                              {t('v3.confirm')}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={isPatchingSnapshot || status === 'rejected'}
                              onClick={() => updateRecordStatus(id, 'rejected')}
                            >
                              {t('v3.reject')}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={isPatchingSnapshot || status === 'resolved'}
                              onClick={() => updateRecordStatus(id, 'resolved')}
                            >
                              {t('v3.resolve')}
                            </Button>
                          </div>
                          {evidenceLinks.length > 0 ? (
                            <ul className="space-y-2">
                              {evidenceLinks.map((e, eidx) => (
                                <li key={`${id}_ev_${eidx}`}>
                                  <Link
                                    href={`/workspaces/${workspaceId}/documents/${e.docId}?page=${e.page}&quote=${encodeURIComponent(
                                      e.quote.slice(0, 160)
                                    )}`}
                                    className="text-sm font-semibold text-accent hover:underline"
                                  >
                                    Page {e.page}
                                  </Link>
                                  <div className="text-sm text-text-soft">“{e.quote}”</div>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            )}

            {tab === 'verdicts' && (
              <div className="space-y-3">
                {v3Verdicts.filter((v, idx) => !rejectedSets.verdicts.has(String(v?.id || `${v?.rule_id || 'verdict'}_${idx}`))).length === 0 ? (
                  <EmptyState title={t('v3.noVerdictsTitle')} description={t('v3.noVerdictsDescription')} />
                ) : (
                  v3Verdicts
                    .filter((v, idx) => !rejectedSets.verdicts.has(String(v?.id || `${v?.rule_id || 'verdict'}_${idx}`)))
                    .map((v, idx) => {
                    const verdictId = String(v?.id || `${v?.rule_id || 'verdict'}_${idx}`);
                    const status = String(v?.status || 'uncertain').toLowerCase();
                    const evidenceLinks = Array.isArray((v as any)?.evidence)
                      ? ((v as any).evidence as any[])
                          .slice(0, 8)
                          .map((e) => ({
                            page: typeof e?.page_number === 'number' ? e.page_number : null,
                            quote: typeof e?.source_quote === 'string' ? e.source_quote : typeof e?.snippet === 'string' ? e.snippet : '',
                            docId: typeof e?.document_id === 'string' ? e.document_id : documentId,
                          }))
                          .filter((e) => !!e.page && !!e.quote)
                      : [];
                    return (
                      <Card key={verdictId}>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between gap-2">
                            <span>{String(v?.rule_id || t('v3.unnamedRule'))}</span>
                            <div className="flex items-center gap-2">
                              <Badge size="sm">{status}</Badge>
                              <Badge size="sm">{String(v?.severity || 'warning')}</Badge>
                            </div>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1">
                          {v?.explanation ? <p className="text-sm text-text">{String(v.explanation)}</p> : null}
                          <p className="text-xs text-text-soft">{t('v3.confidence')}: {String(v?.confidence || 'low')}</p>
                          <div className="pt-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={isPatchingSnapshot}
                              onClick={() => rejectItem('verdict', verdictId)}
                            >
                              {t('v3.reject')}
                            </Button>
                          </div>
                          {evidenceLinks.length > 0 ? (
                            <ul className="space-y-2">
                              {evidenceLinks.map((e, eidx) => (
                                <li key={`${verdictId}_ev_${eidx}`}>
                                  <Link
                                    href={`/workspaces/${workspaceId}/documents/${e.docId}?page=${e.page}&quote=${encodeURIComponent(
                                      e.quote.slice(0, 160)
                                    )}`}
                                    className="text-sm font-semibold text-accent hover:underline"
                                  >
                                    Page {e.page}
                                  </Link>
                                  <div className="text-sm text-text-soft">“{e.quote}”</div>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            )}

            {tab === 'exceptions' && (
              <div className="space-y-3">
                {v3Exceptions.filter((ex, idx) => !rejectedSets.exceptions.has(String(ex?.id || `${ex?.kind || ex?.type || 'exception'}_${idx}`))).length === 0 ? (
                  <EmptyState title={t('v3.noExceptionsTitle')} description={t('v3.noExceptionsDescription')} />
                ) : (
                  v3Exceptions
                    .filter((ex, idx) => !rejectedSets.exceptions.has(String(ex?.id || `${ex?.kind || ex?.type || 'exception'}_${idx}`)))
                    .map((ex, idx) => {
                    const exId = String(ex?.id || `${ex?.kind || ex?.type || 'exception'}_${idx}`);
                    return (
                    <Card key={exId}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between gap-2">
                          <span>{String(ex?.kind || ex?.type || t('v3.exception'))}</span>
                          <div className="flex items-center gap-2">
                            <Badge size="sm">{String(ex?.status || 'open')}</Badge>
                            <Badge size="sm">{String(ex?.severity || 'warning')}</Badge>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm text-text">{String(ex?.message || t('v3.noMessage'))}</p>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isPatchingSnapshot}
                          onClick={() => rejectItem('exception', exId)}
                        >
                          {t('v3.reject')}
                        </Button>
                      </CardContent>
                    </Card>
                  )})
                )}
              </div>
            )}

            {tab.startsWith('custom:') && (() => {
              const moduleId = tab.slice('custom:'.length);
              const m = customModules.find((x) => x.id === moduleId);
              
              const customItems: GenericModuleItem[] = [];
              if (m) {
                if (Array.isArray(m.result)) {
                  for (let i = 0; i < m.result.length; i++) {
                    const item = m.result[i];
                    const itemObj = typeof item === 'object' && item ? item : {};
                    customItems.push({
                      id: `${moduleId}_${i}`,
                      title: String(itemObj.title || itemObj.name || `Item ${i + 1}`),
                      subtitle: itemObj.subtitle || undefined,
                      body: itemObj.description || itemObj.summary || (typeof item === 'string' ? item : undefined),
                      severity: itemObj.severity || itemObj.risk_level,
                      confidence: (itemObj.confidence || itemObj.ai_confidence || m.ai_confidence) as AIConfidence | undefined,
                      icon: <Puzzle className="w-4 h-4" />,
                    });
                  }
                } else {
                  customItems.push({
                    id: `${moduleId}_result`,
                    title: m.title,
                    subtitle: m.status || undefined,
                    confidence: m.ai_confidence as AIConfidence | undefined,
                    body: m.result == null ? 'null' : typeof m.result === 'string' ? m.result : JSON.stringify(m.result, null, 2),
                    icon: <Puzzle className="w-4 h-4" />,
                    evidence: m.evidence?.[0] ? {
                      page_number: (m.evidence[0] as any)?.page_number,
                      snippet: (m.evidence[0] as any)?.source_quote || (m.evidence[0] as any)?.snippet,
                    } : undefined,
                    sourceHref: m.evidence?.[0] && (m.evidence[0] as any)?.page_number
                      ? `/workspaces/${workspaceId}/documents/${documentId}?page=${(m.evidence[0] as any).page_number}&quote=${encodeURIComponent(((m.evidence[0] as any)?.source_quote || '').slice(0, 160))}`
                      : null,
                  });
                }
              }

              return (
                <GenericModuleTab
                  moduleId={moduleId}
                  moduleTitle={m?.title || moduleId}
                  workspaceId={workspaceId}
                  documentId={documentId}
                  onReject={() => rejectItem('module', moduleId)}
                  isModuleRejected={rejectedSets.modules.has(moduleId)}
                  onRestoreModule={() => restoreItem('module', moduleId)}
                  isPatchingSnapshot={isPatchReadOnly}
                  emptyTitle="Missing module"
                  emptyDescription="This custom module was not found in the snapshot."
                  items={customItems}
                />
              );
            })()}
          </div>
        )}

        {/* Analyzing state (visible even before contract exists) */}
        {isAnalyzing && (
          <div ref={progressRef} className="mt-4 max-w-xl mx-auto">
            <ScholarProgressCard
              title={t('progress.title')}
              titleIcon={<Scale className="w-5 h-5 text-purple-500" />}
              currentStep={0}
              steps={[{ label: '…' }]}
              variant="bar"
              progressPercent={(() => {
                const stage = String(progressDetail?.stage || 'starting').toLowerCase();
                const total = Number(progressDetail?.total || 0);
                const completed = Number(progressDetail?.completed || 0);
                const frac = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;

                // Map stage + batch progress into a truthful 0-100 progress:
                // - 0..90%: chunk/batch analysis (MAP)
                // - 90..100%: reduce/finalize (+ optional verifier pass)
                if (stage.includes('queue') || stage === 'starting' || stage === 'queued') return 3;
                if (stage.includes('reduce')) return 95;
                if (stage.includes('final')) return 99;
                if (stage.includes('verify')) return 92;
                // Default: batch progress (0..90)
                return Math.round(frac * 90);
              })()}
              statusMessage={(() => {
                const stage = progressDetail?.stage || '';
                const total = progressDetail?.total || 0;
                const completed = progressDetail?.completed || 0;
                const percent = (() => {
                  const st = String(stage || 'starting').toLowerCase();
                  const t0 = Number(total || 0);
                  const c0 = Number(completed || 0);
                  const frac = t0 > 0 ? Math.max(0, Math.min(1, c0 / t0)) : 0;
                  if (st.includes('queue') || st === 'starting' || st === 'queued') return 3;
                  if (st.includes('reduce')) return 95;
                  if (st.includes('final')) return 99;
                  if (st.includes('verify')) return 92;
                  return Math.round(frac * 90);
                })();

                const st = String(stage).toLowerCase();
                if (st.includes('queue') || st === 'starting' || st === 'queued') {
                  return t('progress.status.queued', { percent });
                }
                if (st.includes('verify')) {
                  return t('progress.status.verifying', { percent });
                }
                if (st.includes('reduce')) {
                  return t('progress.status.reducing', { percent });
                }
                if (st.includes('final')) {
                  return t('progress.status.finalizing', { percent });
                }
                if (total > 0) {
                  return t('progress.status.analyzingChunks', {
                    completed: Math.min(completed, total),
                    total,
                    percent,
                  });
                }
                return t('progress.status.analyzing', { percent });
              })()}
              footer={t('progress.footer')}
            />
          </div>
        )}
      </div>

      {/* Bundle Manager Modal */}
      {showBundleModal && (
        <BundleManagerModal
          workspaceId={workspaceId}
          documentId={documentId}
          selectedBundleId={selectedBundleId}
          onSelectBundle={(bundleId) => {
            setSelectedBundleId(bundleId);
            // Reload bundles to get updated counts
            loadBundlePacks();
          }}
          onClose={() => setShowBundleModal(false)}
        />
      )}
    </div>
  );
}
