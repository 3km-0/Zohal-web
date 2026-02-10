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

export default function ContractAnalysisPage() {
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

  // Playbook selection (MVP): optional; defaults preserve current behavior.
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>(''); // empty = default
  const [selectedPlaybookVersionId, setSelectedPlaybookVersionId] = useState<string>('');

  // Bundle selection for run (MVP): optional; default is single-doc.
  const [bundlePacks, setBundlePacks] = useState<BundlePack[]>([]);
  const [selectedBundleId, setSelectedBundleId] = useState<string>('');
  const [showBundleModal, setShowBundleModal] = useState(false);
  const autoRunTriggered = useRef(false);

  // Expanded sections for collapsible groups
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  function proofHref(evidence: EvidenceGradeSnapshot['variables'][number]['evidence'] | undefined | null) {
    if (!evidence?.page_number) return null;
    const quote = (evidence.snippet || '').slice(0, 160);
    const bbox = evidence.bbox ? `${evidence.bbox.x},${evidence.bbox.y},${evidence.bbox.width},${evidence.bbox.height}` : null;
    const targetDocId = (evidence as any).document_id ? String((evidence as any).document_id) : documentId;
    const base = `/workspaces/${workspaceId}/documents/${targetDocId}?page=${evidence.page_number}&quote=${encodeURIComponent(quote)}`;
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
        
        // Auto-select first template if none selected
        if (!selectedPlaybookId && pbs.length > 0) {
          // Prefer "Default (Renewal Pack)" if it exists, otherwise use first
          const defaultPb = pbs.find(p => p.name === 'Default (Renewal Pack)') || pbs[0];
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
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.complianceCheckFailed'));
    } finally {
      setIsRunningCompliance(false);
    }
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

      // If a bundle pack is selected, include it (and document_ids for reproducibility).
      let bundleDocumentIds: string[] | undefined = undefined;
      const packId = selectedBundleId || '';
      if (packId) {
        const { data: members, error: memErr } = await supabase
          .from('pack_members')
          .select('document_id, sort_order')
          .eq('pack_id', packId)
          .order('sort_order', { ascending: true });
        if (!memErr && Array.isArray(members)) {
          bundleDocumentIds = (members as any[])
            .map((m) => String(m?.document_id || '').toLowerCase())
            .filter(Boolean);
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
          ...(packId
            ? {
                pack_id: packId,
                document_ids: bundleDocumentIds && bundleDocumentIds.length > 0 ? bundleDocumentIds : undefined,
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
    if (bId) setSelectedBundleId(bId);
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
    
    // Re-load when tab becomes visible (handles laptop sleep, tab switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Contract] Tab visible, refreshing data...');
        load();
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
                label: 'Re-analyze',
                icon: <RefreshCw className="w-4 h-4" />,
                onClick: () => { setShowSettings(true); setTab('template-select'); },
              },
              { type: 'divider' as const }] : []),
              { type: 'section', label: 'Report' },
              {
                label: isGeneratingReport ? 'Generating report…' : 'Generate Report',
                icon: <FileText className="w-4 h-4" />,
                onClick: () => generateAndSaveReport(),
                disabled: isGeneratingReport || !contract,
              },
              { type: 'divider' },
              { type: 'section', label: 'Dates' },
              {
                label: 'Export Calendar',
                icon: <Calendar className="w-4 h-4" />,
                onClick: () => exportCalendar(),
                disabled: !contract,
              },
              { type: 'divider' },
              { type: 'section', label: 'Audit' },
              {
                label: verificationObjectState === 'finalized'
                  ? 'Finalized'
                  : (isFinalizing ? 'Finalizing…' : 'Finalize (Provisional → Finalized)'),
                icon: <CheckCircle className="w-4 h-4" />,
                onClick: () => finalizeVerificationObject(),
                disabled: !verificationObjectId || !contract || verificationObjectState === 'finalized' || isFinalizing,
              },
              {
                label: isExportingAuditPack ? 'Exporting Audit Pack…' : 'Download Audit Pack (JSON)',
                icon: <Download className="w-4 h-4" />,
                onClick: () => downloadAuditPack(),
                disabled: (!verificationObjectId && !currentVersionId) || !contract || isExportingAuditPack,
              },
              { type: 'divider' },
              {
                label: 'Close & Return to PDF',
                icon: <X className="w-4 h-4" />,
                onClick: () => router.push(`/workspaces/${workspaceId}/documents/${documentId}`),
              },
            ]}
          />
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
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

            {/* Analysis Configuration - Tabbed Interface */}
            <ScholarNotebookCard>
              <div className="p-4 space-y-4">
                {/* Mini tabs for Template/Bundle selection */}
                <div className="flex border-b border-border">
                  <button
                    onClick={() => setTab('template-select')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px",
                      tab === 'template-select' || tab === 'overview'
                        ? "border-accent text-accent"
                        : "border-transparent text-text-soft hover:text-text"
                    )}
                  >
                    <BookOpen className="w-4 h-4" />
                    Template
                    {selectedPlaybookId && (
                      <Badge size="sm" variant="success">Selected</Badge>
                    )}
                  </button>
                  <button
                    onClick={() => setTab('bundle-select')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px",
                      tab === 'bundle-select'
                        ? "border-accent text-accent"
                        : "border-transparent text-text-soft hover:text-text"
                    )}
                  >
                    <Layers className="w-4 h-4" />
                    Bundle
                    {selectedBundleId && (
                      <Badge size="sm" variant="success">Selected</Badge>
                    )}
                  </button>
                </div>

                {/* Template Selection Content */}
                {(tab === 'template-select' || tab === 'overview') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-text-soft">
                        Choose an analysis template to use.
                      </p>
                      <Link
                        href={`/workspaces/${workspaceId}/playbooks?returnTo=${encodeURIComponent(
                          `/workspaces/${workspaceId}/documents/${documentId}/contract-analysis`
                        )}`}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        {t('playbook.manage')}
                      </Link>
                    </div>
                    <div className="space-y-2">
                      {/* All templates from database - no hardcoded options */}
                      {playbooks.length === 0 ? (
                        <div className="p-4 rounded-scholar border border-border bg-surface-alt text-center">
                          <p className="text-sm text-text-soft mb-2">{t('playbook.loadingTemplates')}</p>
                          <p className="text-xs text-text-soft">{t('playbook.templatesAutoCreated')}</p>
                        </div>
                      ) : (
                        <>
                          {/* System Templates */}
                          {playbooks.filter(pb => pb.is_system_preset).length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-text-soft uppercase tracking-wider px-1">
                                {t('playbook.zohalTemplates')}
                              </div>
                              {playbooks.filter(pb => pb.is_system_preset).map((pb) => (
                                <button
                                  key={pb.id}
                                  onClick={() => {
                                    setSelectedPlaybookId(pb.id);
                                    setSelectedPlaybookVersionId(pb.current_version?.id || '');
                                  }}
                                  className={cn(
                                    "w-full flex items-center justify-between p-3 rounded-scholar border transition-colors text-left",
                                    selectedPlaybookId === pb.id
                                      ? "border-accent bg-accent/5"
                                      : "border-border bg-surface-alt hover:border-accent/50"
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <BookOpen className={cn("w-4 h-4", selectedPlaybookId === pb.id ? "text-accent" : "text-text-soft")} />
                                    <span className="font-semibold text-text">{pb.name}</span>
                                  </div>
                                  {selectedPlaybookId === pb.id && (
                                    <CheckCircle className="w-4 h-4 text-accent" />
                                  )}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* User Templates */}
                          {playbooks.filter(pb => !pb.is_system_preset).length > 0 && (
                            <div className="space-y-2 mt-4">
                              <div className="text-xs font-semibold text-text-soft uppercase tracking-wider px-1">
                                {t('playbook.yourTemplates')}
                              </div>
                              {playbooks.filter(pb => !pb.is_system_preset).map((pb) => (
                                <button
                                  key={pb.id}
                                  onClick={() => {
                                    setSelectedPlaybookId(pb.id);
                                    setSelectedPlaybookVersionId(pb.current_version?.id || '');
                                  }}
                                  className={cn(
                                    "w-full flex items-center justify-between p-3 rounded-scholar border transition-colors text-left",
                                    selectedPlaybookId === pb.id
                                      ? "border-accent bg-accent/5"
                                      : "border-border bg-surface-alt hover:border-accent/50"
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <BookOpen className={cn("w-4 h-4", selectedPlaybookId === pb.id ? "text-accent" : "text-text-soft")} />
                                    <span className="font-semibold text-text">{pb.name}</span>
                                  </div>
                                  {selectedPlaybookId === pb.id && (
                                    <CheckCircle className="w-4 h-4 text-accent" />
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Bundle Selection Content */}
                {tab === 'bundle-select' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-text-soft">
                        Optionally analyze multiple documents together.
                      </p>
                      <button
                        onClick={() => setShowBundleModal(true)}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        Manage Bundles
                      </button>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={() => setSelectedBundleId('')}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-scholar border transition-colors text-left",
                          !selectedBundleId
                            ? "border-accent bg-accent/5"
                            : "border-border bg-surface-alt hover:border-accent/50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <FileText className={cn("w-4 h-4", !selectedBundleId ? "text-accent" : "text-text-soft")} />
                          <span className="font-semibold text-text">Single document (this file only)</span>
                        </div>
                        {!selectedBundleId && (
                          <CheckCircle className="w-4 h-4 text-accent" />
                        )}
                      </button>
                      {bundlePacks.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => setSelectedBundleId(b.id)}
                          className={cn(
                            "w-full flex items-center justify-between p-3 rounded-scholar border transition-colors text-left",
                            selectedBundleId === b.id
                              ? "border-accent bg-accent/5"
                              : "border-border bg-surface-alt hover:border-accent/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Package className={cn("w-4 h-4", selectedBundleId === b.id ? "text-accent" : "text-text-soft")} />
                            <div>
                              <span className="font-semibold text-text">{b.name || 'Unnamed Bundle'}</span>
                              <span className="text-xs text-text-soft ml-2">({b.member_count} docs)</span>
                            </div>
                          </div>
                          {selectedBundleId === b.id && (
                            <CheckCircle className="w-4 h-4 text-accent" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Run Button */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-sm text-text-soft">
                    {selectedPlaybookId && (
                      <Badge size="sm">
                        <BookOpen className="w-3 h-3 mr-1" />
                        {playbooks.find(p => p.id === selectedPlaybookId)?.name || 'Template'}
                      </Badge>
                    )}
                    {selectedBundleId && (
                      <Badge size="sm">
                        <Package className="w-3 h-3 mr-1" />
                        {bundlePacks.find(b => b.id === selectedBundleId)?.name || 'Bundle'}
                      </Badge>
                    )}
                  </div>
                  <Button
                    onClick={() => {
                      if (!isAnalyzing) analyzeOnce();
                    }}
                    variant="primary"
                    disabled={isAnalyzing}
                    data-tour="contract-analyze"
                  >
                    {isAnalyzing ? 'Analyzing…' : 'Run Analysis'}
                  </Button>
                </div>

                {/* Run Settings (per-run; does not require duplicating templates) */}
                <div className="pt-3 border-t border-border space-y-2">
                  <div className="text-xs font-semibold text-text-soft uppercase tracking-wider">
                    {t('runSettings.title')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-text-soft mb-1">{t('runSettings.language')}</div>
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
                      <div className="text-xs text-text-soft mb-1">{t('runSettings.strictness')}</div>
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
                  <div className="text-xs text-text-soft">
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
                isPatchingSnapshot={isPatchingSnapshot}
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
                isPatchingSnapshot={isPatchingSnapshot}
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
                isPatchingSnapshot={isPatchingSnapshot}
                items={(() => {
                  const confidenceMap: Record<string, AIConfidence> = { confirmed: 'high', extracted: 'medium', needs_review: 'low' };
                  return obligations
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
                    .map((o) => ({
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
                      onToolAction: o.task_id ? undefined : o.due_at ? () => exportCalendar() : () => addTaskFromObligation(o),
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
                    })) as GenericModuleItem[];
                })()}
              />
            )}

            {tab === 'deadlines' && (
              <DeadlinesTab
                effectiveDate={contract.effective_date}
                endDate={contract.end_date}
                noticeDeadline={(() => {
                  const notice = computeNoticeDeadline(contract.end_date, contract.notice_period_days);
                  return notice?.toISOString() ?? null;
                })()}
                emptyTitle={t('empty.noDeadlinesTitle')}
                emptyDescription={t('empty.noDeadlinesDescription')}
                getAddToCalendarHref={(item) =>
                  `/export-deadline?document_id=${encodeURIComponent(documentId)}&key=${encodeURIComponent(item.key)}`
                }
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
                isPatchingSnapshot={isPatchingSnapshot}
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
                  isPatchingSnapshot={isPatchingSnapshot}
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
