'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Download, Scale, Calendar, FileText, ShieldAlert, AlertTriangle, CheckCircle, X, FileSearch, CircleHelp, Zap, Package, BookOpen, Layers } from 'lucide-react';
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
import { AnalysisRecordCard, AIConfidenceBadge, AnalysisSectionHeader, ExpandableJSON, type AIConfidence } from '@/components/analysis';
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

  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportSavedMessage, setReportSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [progressStep, setProgressStep] = useState(0);

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

  // Playbook selection (MVP): optional; defaults preserve current behavior.
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>(''); // empty = default
  const [selectedPlaybookVersionId, setSelectedPlaybookVersionId] = useState<string>('');

  // Bundle selection for run (MVP): optional; default is single-doc.
  const [bundlePacks, setBundlePacks] = useState<BundlePack[]>([]);
  const [selectedBundleId, setSelectedBundleId] = useState<string>('');
  const [showBundleModal, setShowBundleModal] = useState(false);
  const autoRunTriggered = useRef(false);

  // Rejection tracking (unified action model)
  const [rejectedVariableIds, setRejectedVariableIds] = useState<Set<string>>(new Set());
  const [rejectedClauseIds, setRejectedClauseIds] = useState<Set<string>>(new Set());
  const [rejectedObligationIds, setRejectedObligationIds] = useState<Set<string>>(new Set());
  const [rejectedRiskIds, setRejectedRiskIds] = useState<Set<string>>(new Set());
  const [rejectedCustomModuleIds, setRejectedCustomModuleIds] = useState<Set<string>>(new Set());

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
      (o) => o.confidence_state === 'needs_review' || o.confidence === 'low'
    ).length;

    // Deadlines needing verification
    const deadlinesNeedVerification = deadlines.filter((o) => o.confidence_state === 'needs_review' || o.confidence === 'low').length;

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
  }, [obligations, deadlines]);

  const tabs = useMemo(() => {
    const out: Array<{ id: string; label: string; icon: any; total: number | null; attentionCount: number }> = [
      { id: 'overview', label: t('tabs.overview'), icon: FileText, total: null, attentionCount: 0 },
    ];
    if (enabledModules.has('variables')) {
      out.push({
        id: 'variables',
        label: t('tabs.variables'),
        icon: FileText,
        total: snapshot?.variables.length ?? 0,
        attentionCount: snapshot?.variables.filter((v) => v.verification_state === 'needs_review').length ?? 0,
      });
    }
    if (enabledModules.has('clauses')) {
      out.push({ id: 'clauses', label: t('tabs.clauses'), icon: FileText, total: clauses.length, attentionCount: attention.clauses });
    }
    if (enabledModules.has('obligations')) {
      out.push({
        id: 'obligations',
        label: t('tabs.obligations'),
        icon: FileText,
        total: obligations.length,
        attentionCount: attention.obligations,
      });
    }
    if (enabledModules.has('deadlines')) {
      out.push({ id: 'deadlines', label: t('tabs.deadlines'), icon: Calendar, total: deadlines.length, attentionCount: attention.deadlines });
    }
    if (enabledModules.has('risks')) {
      out.push({ id: 'risks', label: t('tabs.risks'), icon: ShieldAlert, total: risks.length, attentionCount: attention.risks });
    }
    out.push(...customModules.map((m) => ({ id: `custom:${m.id}`, label: m.title, icon: FileText, total: null, attentionCount: 0 })));
    return out;
  }, [enabledModules, snapshot, clauses.length, obligations.length, risks.length, deadlines.length, attention, customModules]);

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
        return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
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
  useEffect(() => {
    const bundle = snapshot?.pack?.bundle;
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
        const bundlePackId = String((bundle as any).pack_id || (bundle as any).bundle_id || '').toLowerCase();
        if (bundlePackId) {
          const { data: members, error: memErr } = await supabase
            .from('pack_members')
            .select('document_id, role, sort_order')
            .eq('pack_id', bundlePackId)
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
  }, [(snapshot?.pack as any)?.bundle?.pack_id, snapshot?.pack?.bundle?.bundle_id, snapshot?.pack?.bundle?.document_ids?.join('|')]);

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
    setProgressStep(0);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userData.user.id;

      // Resolve playbook options (language/strictness/verifier) deterministically:
      // playbook spec options > UI locale > defaults.
      const selectedPb = selectedPlaybookId ? playbooks.find((p) => p.id === selectedPlaybookId) : null;
      const specOptions = (selectedPb as any)?.current_version?.spec_json?.options || null;
      const languagePref =
        (specOptions?.language === 'ar' ? 'ar' : specOptions?.language === 'en' ? 'en' : null) ||
        (locale === 'ar' ? 'ar' : 'en');
      const strictnessPref = specOptions?.strictness === 'strict' ? 'strict' : undefined;
      const enableVerifierPref = specOptions?.enable_verifier === true ? true : undefined;
      const playbook_options =
        selectedPlaybookId || languagePref === 'ar' || strictnessPref || enableVerifierPref
          ? {
              strictness: strictnessPref,
              enable_verifier: enableVerifierPref,
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
        console.log('[Contract] Analysis queued, polling action:', actionId);
        
        // Poll the action for progress
        const maxPolls = 120; // Max ~4 minutes (2s intervals)
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
              console.warn('[Contract] Action not found');
              return;
            }
            
            const output = action.output_json as any;
            const totalBatches = output?.total_batches || 6;
            const completedBatches = output?.completed_batches || 0;
            const stage = output?.stage || 'queued';
            
            // Map progress to steps (0-5)
            // Stage progression: queued -> running batches -> reducing -> done
            if (stage === 'queued') {
              setProgressStep(0); // Preparing
            } else if (stage === 'reducing' || stage === 'finalizing') {
              setProgressStep(5); // Finalizing
            } else {
              // Map completed batches to steps 1-4
              const batchProgress = Math.min(4, Math.floor((completedBatches / totalBatches) * 4) + 1);
              setProgressStep(batchProgress);
            }
            
            // Check for completion
            if (action.status === 'completed') {
              clearInterval(pollInterval);
              console.log('[Contract] Analysis complete');
              await load();
              setIsAnalyzing(false);
              return;
            }
            
            if (action.status === 'failed') {
              clearInterval(pollInterval);
              const errorMsg = output?.error || t('errors.contractAnalysisFailed');
              setError(errorMsg);
              setIsAnalyzing(false);
              return;
            }
            
            // Timeout check
            if (pollCount >= maxPolls) {
              clearInterval(pollInterval);
              setError('Analysis is taking longer than expected. Please check back later.');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.contractAnalysisFailed'));
      setIsAnalyzing(false);
    }
  }

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

  async function exportCalendar() {
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/export-calendar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          document_id: documentId,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'No obligations with due dates found');
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('content-disposition') || '';
      const match = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || 'contract_obligations.ics';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.exportCalendarFailed'));
    }
  }

  async function generateAndSaveReport() {
    setError(null);
    setReportSavedMessage(null);
    setIsGeneratingReport(true);
    try {
      // 1) Generate HTML via the existing exporter (same as iOS).
      const { data: reportData, error: reportErr } = await supabase.functions.invoke('export-contract-report', {
        body: {
          document_id: documentId,
          template: 'decision_pack',
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
        'Source: Contract Analysis',
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
          >
            <ArrowLeft className="w-5 h-5 text-text-soft" />
          </Link>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-purple-500" />
            <h1 className="font-semibold text-text">Contract Analysis</h1>
            <Badge size="sm">saved</Badge>
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
                label: 'Back to PDF',
                icon: <ArrowLeft className="w-4 h-4" />,
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
        ) : !contract ? (
          <div className="space-y-4 max-w-xl mx-auto">
            <EmptyState
              title={t('empty.notAnalyzedTitle')}
              description={t('empty.notAnalyzedDescription')}
              variant="card"
            />

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
                        href={`/workspaces/${workspaceId}/playbooks`}
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

            {snapshot?.pack?.exceptions_summary &&
              (snapshot.pack.exceptions_summary.blocker > 0 || snapshot.pack.exceptions_summary.warning > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-error" />
                      {t('needsReview.title')}
                      <Badge size="sm">
                        blockers:{snapshot.pack.exceptions_summary.blocker} warnings:{snapshot.pack.exceptions_summary.warning}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-text-soft">
                      {t('needsReview.subtitle')}
                    </p>
                    {Array.isArray(snapshot.pack.exceptions) && snapshot.pack.exceptions.length > 0 && (
                      <ul className="text-sm text-text list-disc pl-5 space-y-1">
                        {snapshot.pack.exceptions.slice(0, 10).map((e: any, idx: number) => (
                          <li key={e?.id || idx}>{e?.message || e?.type || 'Exception'}</li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )}

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
              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm text-text">
                    <span className="text-text-soft">Counterparty: </span>
                    {contract.counterparty_name || '—'}
                  </div>
                  <div className="text-sm text-text">
                    <span className="text-text-soft">Effective: </span>
                    {contract.effective_date || '—'}
                  </div>
                  <div className="text-sm text-text">
                    <span className="text-text-soft">End: </span>
                    {contract.end_date || '—'}
                  </div>
                  <div className="text-sm text-text">
                    <span className="text-text-soft">Notice: </span>
                    {contract.notice_period_days != null ? `${contract.notice_period_days} days` : '—'}
                  </div>

                  {snapshot?.pack?.bundle?.document_ids?.length ? (
                    <div className="pt-3 mt-3 border-t border-border space-y-2">
                      <div className="text-sm font-semibold text-text">Sources used</div>
                      <div className="flex flex-wrap gap-2">
                        {(bundleDocuments.length ? bundleDocuments : snapshot.pack.bundle.document_ids).map((d: any) => {
                          const id = String(d?.id || d);
                          const title = String(d?.title || id);
                          const role = d?.role ? String(d.role) : '';
                          return (
                            <Link
                              key={id}
                              href={`/workspaces/${workspaceId}/documents/${id}`}
                              className="inline-flex"
                              title={role ? `${title} (${role})` : title}
                            >
                              <Badge variant="default" className="max-w-[260px] truncate">
                                {role ? `${title} · ${role}` : title}
                              </Badge>
                            </Link>
                          );
                        })}
                      </div>

                      {Array.isArray(snapshot.pack.discrepancies) && snapshot.pack.discrepancies.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-text">Conflicts</div>
                          {snapshot.pack.discrepancies
                            .slice(0, 20)
                            .map((d: any) => {
                              const kind = String(d?.kind || '');
                              if (kind === 'variable_conflict') {
                                return (
                                  <div key={String(d.id || `${d.variable_name}`)} className="rounded-scholar border border-border bg-surface-alt p-3">
                                    <div className="text-sm font-semibold text-text">{String(d.variable_name || 'Variable')}</div>
                                    <div className="mt-2 space-y-1">
                                      {Array.isArray(d.values)
                                        ? d.values.slice(0, 6).map((v: any, idx: number) => {
                                            const ev = v?.evidence;
                                            const href = proofHref(ev);
                                            const label = `${String(v?.value ?? '—')} ${v?.ai_confidence ? `(${String(v.ai_confidence)})` : ''}`.trim();
                                            return (
                                              <div key={`${idx}-${String(v?.document_id || '')}`} className="text-xs text-text">
                                                <span className="text-text-soft">{String(v?.document_id || '').slice(0, 8)}: </span>
                                                {href ? (
                                                  <Link href={href} className="font-semibold text-accent hover:underline">
                                                    {label}
                                                  </Link>
                                                ) : (
                                                  <span>{label}</span>
                                                )}
                                              </div>
                                            );
                                          })
                                        : null}
                                    </div>
                                  </div>
                                );
                              }

                              if (kind === 'policy_conflict' || kind === 'regulatory_conflict') {
                                const contractHref = proofHref(d?.contract?.evidence);
                                const ruleHref = proofHref(d?.rule?.evidence);
                                return (
                                  <div key={String(d.id || `${kind}-${d?.rule?.rule_id}`)} className="rounded-scholar border border-border bg-surface-alt p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-sm font-semibold text-text">{String(d?.rule?.title || 'Compliance finding')}</div>
                                      <Badge size="sm">{String(d?.severity || '').toLowerCase() || 'medium'}</Badge>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                                      {contractHref ? (
                                        <Link href={contractHref} className="font-semibold text-accent hover:underline">
                                          View contract evidence
                                        </Link>
                                      ) : (
                                        <span className="text-text-soft">Contract evidence unavailable</span>
                                      )}
                                      {ruleHref ? (
                                        <Link href={ruleHref} className="font-semibold text-accent hover:underline">
                                          View policy/regulation evidence
                                        </Link>
                                      ) : (
                                        <span className="text-text-soft">Rule evidence unavailable</span>
                                      )}
                                    </div>
                                    {d?.explanation ? (
                                      <div className="mt-2 text-xs text-text-soft">{String(d.explanation).slice(0, 220)}</div>
                                    ) : null}
                                  </div>
                                );
                              }

                              return null;
                            })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="pt-3 mt-3 border-t border-border space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-text">Pinned context sets</div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={createPinnedContextSetFromThisDocument}>
                          Pin this document
                        </Button>
                        <Button size="sm" variant="secondary" onClick={generateKnowledgePackForThisDocument} disabled={isGeneratingKnowledgePack}>
                          {isGeneratingKnowledgePack ? 'Generating…' : 'Generate pack'}
                        </Button>
                        <Button size="sm" onClick={runComplianceChecks} disabled={isRunningCompliance}>
                          {isRunningCompliance ? 'Checking…' : 'Run compliance'}
                        </Button>
                      </div>
                    </div>
                    {snapshot?.pack?.context ? (
                      <div className="text-xs text-text-soft">
                        {(() => {
                          const ctx = snapshot.pack?.context as any;
                          const sets = Array.isArray(ctx?.sets) ? (ctx.sets as any[]) : [];
                          if (!sets.length) return 'Context sets are pinned, but no set metadata was recorded.';
                          return `Included: ${sets.map((s) => `${s.name || s.id}${s.kind ? ` (${s.kind})` : ''}`).join(', ')}`;
                        })()}
                      </div>
                    ) : (
                      <div className="text-xs text-text-soft">
                        No context sets recorded on this run. Create one, then re-run analysis to attach it to the run manifest.
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-3 mt-3 border-t border-border space-y-2">
                    <div className="text-sm font-semibold text-text">Renewal Timeline</div>
                    <div className="text-sm text-text">
                      <span className="text-text-soft">Auto-renewal: </span>
                      {contract.auto_renewal ? 'Yes' : 'No'}
                    </div>
                    {contract.end_date ? (
                      <div className="text-sm text-text">
                        <span className="text-text-soft">{contract.auto_renewal ? 'Renews on: ' : 'Term ends on: '}</span>
                        {contract.end_date}
                      </div>
                    ) : null}
                    {(() => {
                      const notice = computeNoticeDeadline(contract.end_date, contract.notice_period_days);
                      if (!notice) return null;
                      return (
                        <div className="text-sm text-text">
                          <span className="text-text-soft">Notice deadline: </span>
                          {notice.toLocaleDateString()}
                        </div>
                      );
                    })()}
                    {(() => {
                      const endEvidence = snapshot?.variables.find((v) => v.name === 'end_date')?.evidence;
                      const href = proofHref(endEvidence);
                      if (!href) return null;
                      return (
                        <Link href={href} className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:underline">
                          View end-date evidence in PDF
                        </Link>
                      );
                    })()}
                  </div>

                  <div className="pt-3 mt-3 border-t border-border space-y-2">
                    <div className="text-sm font-semibold text-text">Audit Trail</div>
                    <div className="text-sm text-text">
                      <span className="text-text-soft">Status: </span>
                      Provisional (pending review)
                    </div>
                    {snapshot ? (
                      <>
                        <div className="text-sm text-text">
                          <span className="text-text-soft">Schema: </span>
                          {snapshot.schema_version}
                        </div>
                        <div className="text-sm text-text">
                          <span className="text-text-soft">Template: </span>
                          {snapshot.template}
                        </div>
                        {snapshot.pack?.modules_activated?.length ? (
                          <div className="text-sm text-text">
                            <span className="text-text-soft">Modules: </span>
                            {snapshot.pack.modules_activated.join(', ')}
                          </div>
                        ) : null}
                        <div className="text-sm text-text">
                          <span className="text-text-soft">Analyzed: </span>
                          {snapshot.analyzed_at}
                        </div>
                        <div className="text-sm text-text">
                          <span className="text-text-soft">Chunks: </span>
                          {snapshot.chunks_analyzed}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-text-soft">Snapshot unavailable (re-run analysis to generate it).</div>
                    )}
                    <div className="text-xs text-text-soft">System: Zohal Evidence-Grade Analysis Platform</div>
                  </div>
                </CardContent>
              </Card>
            )}

            {tab === 'variables' && (
              <div className="space-y-3">
                {!snapshot ? (
                  <EmptyState
                    title={t('empty.noVariablesSnapshotTitle')}
                    description={t('empty.noVariablesSnapshotDescription')}
                  />
                ) : snapshot.variables.filter((v) => !rejectedVariableIds.has(v.id)).length === 0 ? (
                  <EmptyState title={t('empty.noVariablesTitle')} description={t('empty.noVariablesDescription')} />
                ) : (
                  snapshot.variables
                    .filter((v) => !rejectedVariableIds.has(v.id))
                    .map((v) => (
                      <AnalysisRecordCard
                        key={v.id}
                        icon={<FileText className="w-4 h-4" />}
                        title={v.display_name}
                        subtitle={v.value == null ? '—' : `${String(v.value)}${v.unit ? ` ${v.unit}` : ''}`}
                        confidence={v.ai_confidence as AIConfidence}
                        sourceHref={proofHref(v.evidence)}
                        sourcePage={v.evidence?.page_number ?? undefined}
                        toolAction={{ type: 'edit', label: 'Edit' }}
                        onReject={() => setRejectedVariableIds((prev) => new Set([...prev, v.id]))}
                        onToolAction={() => {
                          // TODO: Open edit modal
                        }}
                      >
                        {v.verifier?.status && (
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={cn(
                                'inline-flex w-2 h-2 rounded-full',
                                v.verifier.status === 'green' ? 'bg-success' : v.verifier.status === 'red' ? 'bg-error' : 'bg-highlight'
                              )}
                            />
                            <span className="text-text-soft">
                              Verifier: {v.verifier.status.toUpperCase()}
                              {v.verifier.reasons?.length ? ` (${v.verifier.reasons.join(', ')})` : ''}
                            </span>
                          </div>
                        )}
                      </AnalysisRecordCard>
                    ))
                )}
              </div>
            )}

            {tab === 'clauses' && (
              <div className="space-y-3">
                {(() => {
                  // Use snapshot clauses if available, otherwise fall back to DB clauses
                  const allClauses = snapshot?.clauses?.length
                    ? snapshot.clauses.map((c) => ({
                        id: c.id,
                        title: c.clause_title || c.clause_type,
                        text: c.text,
                        riskLevel: c.risk_level,
                        pageNumber: c.evidence?.page_number,
                        clauseNumber: c.clause_number,
                        href: proofHref(c.evidence),
                      }))
                    : clauses.map((c) => ({
                        id: c.id,
                        title: c.clause_title || c.clause_type,
                        text: c.text,
                        riskLevel: c.risk_level,
                        pageNumber: c.page_number,
                        clauseNumber: c.clause_number,
                        href: c.page_number
                          ? `/workspaces/${workspaceId}/documents/${documentId}?page=${c.page_number}&quote=${encodeURIComponent((c.text || '').slice(0, 120))}`
                          : null,
                      }));

                  const visibleClauses = allClauses.filter((c) => !rejectedClauseIds.has(c.id));

                  if (visibleClauses.length === 0) {
                    return <EmptyState title={t('empty.noClausesTitle')} description={t('empty.noClausesDescription')} />;
                  }

                  // Group by risk level
                  const byRisk = visibleClauses.reduce<Record<string, typeof visibleClauses>>((acc, c) => {
                    const k = c.riskLevel || 'unknown';
                    (acc[k] ||= []).push(c);
                    return acc;
                  }, {});

                  const riskOrder = ['high', 'medium', 'low', 'unknown'];
                  const riskIcons: Record<string, string> = { high: 'text-error', medium: 'text-highlight', low: 'text-success', unknown: 'text-text-soft' };

                  return Object.entries(byRisk)
                    .sort(([a], [b]) => riskOrder.indexOf(a) - riskOrder.indexOf(b))
                    .map(([risk, items]) => (
                      <div key={risk} className="space-y-2">
                        <AnalysisSectionHeader
                          icon={<AlertTriangle className="w-4 h-4" />}
                          iconColor={riskIcons[risk] || 'text-text-soft'}
                          title={risk.charAt(0).toUpperCase() + risk.slice(1) + ' Risk'}
                          count={items.length}
                          isExpanded={expandedSections.has(`clause-${risk}`) || expandedSections.size === 0}
                          onToggle={() => {
                            setExpandedSections((prev) => {
                              const next = new Set(prev);
                              const key = `clause-${risk}`;
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }}
                        />
                        {(expandedSections.has(`clause-${risk}`) || expandedSections.size === 0) &&
                          items.map((c) => (
                            <AnalysisRecordCard
                              key={c.id}
                              icon={<FileText className="w-4 h-4" />}
                              iconColor={riskIcons[risk] || 'text-text-soft'}
                              title={c.title || 'Clause'}
                              subtitle={c.clauseNumber ? `Clause ${c.clauseNumber}` : undefined}
                              sourceHref={c.href}
                              sourcePage={c.pageNumber ?? undefined}
                              onReject={() => setRejectedClauseIds((prev) => new Set([...prev, c.id]))}
                            >
                              <p className="text-sm text-text whitespace-pre-wrap line-clamp-4">{c.text}</p>
                            </AnalysisRecordCard>
                          ))}
                      </div>
                    ));
                })()}
              </div>
            )}

            {tab === 'obligations' && (
              <div className="space-y-3">
                {(() => {
                  const visibleObligations = obligations.filter((o) => !rejectedObligationIds.has(o.id));
                  
                  if (visibleObligations.length === 0) {
                    return <EmptyState title={t('empty.noObligationsTitle')} description={t('empty.noObligationsDescription')} />;
                  }

                  const byType = visibleObligations.reduce<Record<string, LegalObligation[]>>((acc, o) => {
                    const k = o.obligation_type || 'other';
                    (acc[k] ||= []).push(o);
                    return acc;
                  }, {});

                  const typeOrder = [
                    'renewal', 'notice', 'payment', 'milestone', 'deliverable',
                    'reporting', 'compliance', 'termination', 'confidentiality',
                    'indemnification', 'insurance', 'audit', 'other',
                  ];

                  const groups = Object.entries(byType).sort(([a], [b]) => {
                    const ia = typeOrder.indexOf(a);
                    const ib = typeOrder.indexOf(b);
                    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
                    return a.localeCompare(b);
                  });

                  // Sort by attention needed first, then confidence, then due date
                  const sorted = (items: LegalObligation[]) =>
                    items.slice().sort((a, b) => {
                      // 1. Needs review items first
                      const aNeedsReview = a.confidence_state === 'needs_review';
                      const bNeedsReview = b.confidence_state === 'needs_review';
                      if (aNeedsReview !== bNeedsReview) return aNeedsReview ? -1 : 1;
                      
                      // 2. Then by confidence (low → medium → high)
                      const confOrder = ['needs_review', 'extracted', 'confirmed'];
                      const aConf = confOrder.indexOf(a.confidence_state || 'extracted');
                      const bConf = confOrder.indexOf(b.confidence_state || 'extracted');
                      if (aConf !== bConf) return aConf - bConf;
                      
                      // 3. Then by due date
                      const da = a.due_at || '';
                      const db = b.due_at || '';
                      if (da && db && da !== db) return da.localeCompare(db);
                      if (da && !db) return -1;
                      if (!da && db) return 1;
                      
                      // 4. Finally by page number
                      return (a.page_number ?? 999999) - (b.page_number ?? 999999);
                    });

                  const confidenceMap: Record<string, AIConfidence> = {
                    confirmed: 'high',
                    extracted: 'medium',
                    needs_review: 'low',
                  };

                  return groups.map(([type, items]) => (
                    <div key={type} className="space-y-2">
                      <AnalysisSectionHeader
                        icon={<CheckCircle className="w-4 h-4" />}
                        iconColor="text-accent"
                        title={type.charAt(0).toUpperCase() + type.slice(1)}
                        count={items.length}
                        isExpanded={expandedSections.has(`ob-${type}`) || expandedSections.size === 0}
                        onToggle={() => {
                          setExpandedSections((prev) => {
                            const next = new Set(prev);
                            const key = `ob-${type}`;
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }}
                      />
                      {(expandedSections.has(`ob-${type}`) || expandedSections.size === 0) &&
                        sorted(items).map((o) => {
                          // Determine if this obligation needs verification
                          const needsVerification = o.confidence_state === 'needs_review' || o.confidence === 'low';
                          const suggestSpotCheck = o.confidence === 'medium' && o.confidence_state !== 'needs_review';
                          const attentionLabel = o.confidence_state === 'needs_review' 
                            ? 'Needs Review' 
                            : o.confidence === 'low' 
                              ? 'Low Confidence' 
                              : undefined;
                          
                          return (
                          <AnalysisRecordCard
                            key={o.id}
                            icon={<CheckCircle className="w-4 h-4" />}
                            title={o.summary || o.action || o.obligation_type || 'Obligation'}
                            subtitle={o.responsible_party ? `Responsible: ${o.responsible_party}` : undefined}
                            confidence={o.confidence || confidenceMap[o.confidence_state || ''] || 'medium'}
                            needsAttention={needsVerification}
                            attentionLabel={attentionLabel}
                            spotCheckSuggested={suggestSpotCheck}
                            sourceHref={
                              o.page_number != null
                                ? `/workspaces/${workspaceId}/documents/${documentId}?page=${o.page_number}&quote=${encodeURIComponent((o.summary || o.action || '').slice(0, 140))}`
                                : null
                            }
                            sourcePage={o.page_number ?? undefined}
                            toolAction={o.due_at ? { type: 'calendar', label: 'Add to Calendar' } : { type: 'task', label: 'Add Task' }}
                            onReject={() => setRejectedObligationIds((prev) => new Set([...prev, o.id]))}
                            onToolAction={
                              o.task_id
                                ? undefined // Already has task
                                : o.due_at
                                  ? () => exportCalendar()
                                  : () => addTaskFromObligation(o)
                            }
                          >
                            <div className="space-y-2">
                              {o.action && (
                                <p className="text-sm text-text">
                                  <span className="text-text-soft">Action: </span>
                                  {o.action}
                                </p>
                              )}
                              {o.due_at && (
                                <p className="text-xs text-text-soft">
                                  Due: <span className="text-text font-medium">{o.due_at}</span>
                                </p>
                              )}
                              {o.task_id && (
                                <Badge size="sm" variant="success">Task added</Badge>
                              )}
                            </div>
                          </AnalysisRecordCard>
                        );
                        })}
                    </div>
                  ));
                })()}
              </div>
            )}

            {tab === 'deadlines' && (
              <div className="space-y-3">
                {(() => {
                  const items: Array<{
                    key: string;
                    title: string;
                    dueLabel: string;
                    description: string;
                    href?: string | null;
                  }> = [];
                  
                  const endEvidence = snapshot?.variables.find((v) => v.name === 'end_date')?.evidence;
                  const noticeEvidence = endEvidence;
                  
                  if (contract.end_date) {
                    items.push({
                      key: 'contract_end',
                      title: 'Contract End Date',
                      dueLabel: contract.end_date,
                      description: 'Contract term ends',
                      href: proofHref(endEvidence),
                    });
                    if (contract.auto_renewal) {
                      items.push({
                        key: 'renewal',
                        title: 'Auto-Renewal Date',
                        dueLabel: contract.end_date,
                        description: 'Contract renews automatically unless notice is given',
                        href: proofHref(endEvidence),
                      });
                    }
                    
                    const notice = computeNoticeDeadline(contract.end_date, contract.notice_period_days);
                    if (notice) {
                      items.push({
                        key: 'notice_deadline',
                        title: 'Notice Deadline',
                        dueLabel: notice.toLocaleDateString(),
                        description: `Last day to provide ${contract.notice_period_days ?? ''}-day notice`,
                        href: proofHref(noticeEvidence),
                      });
                    }
                  }
                  
                  for (const o of deadlines) {
                    items.push({
                      key: `ob_${o.id}`,
                      title: o.obligation_type,
                      dueLabel: o.due_at || '—',
                      description: o.summary || o.action || '—',
                      href:
                        o.page_number != null
                          ? `/workspaces/${workspaceId}/documents/${documentId}?page=${o.page_number}&quote=${encodeURIComponent(
                              (o.summary || o.action || '').slice(0, 140)
                            )}`
                          : null,
                    });
                  }
                  
                  if (items.length === 0) {
                    return <EmptyState title={t('empty.noDeadlinesTitle')} description={t('empty.noDeadlinesDescription')} />;
                  }
                  
                  return items.map((it) => (
                    <Card key={it.key}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{it.title}</span>
                          <Badge size="sm">{it.dueLabel}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {it.href ? (
                          <div className="mb-2">
                            <Link
                              href={it.href}
                              className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:underline"
                            >
                              View in PDF
                            </Link>
                          </div>
                        ) : null}
                        <div className="text-sm text-text">{it.description}</div>
                      </CardContent>
                    </Card>
                  ));
                })()}
              </div>
            )}

            {tab === 'risks' && (
              <div className="space-y-3">
                {(() => {
                  // Use snapshot risks if available, otherwise fall back to DB risks
                  const allRisks = snapshot?.risks?.length
                    ? snapshot.risks.map((r) => ({
                        id: r.id,
                        description: r.description,
                        explanation: r.explanation,
                        severity: r.severity,
                        pageNumber: r.evidence?.page_number,
                        href: proofHref(r.evidence),
                      }))
                    : risks.map((r) => ({
                        id: r.id,
                        description: r.description,
                        explanation: r.explanation,
                        severity: r.severity,
                        pageNumber: r.page_number,
                        href: r.page_number
                          ? `/workspaces/${workspaceId}/documents/${documentId}?page=${r.page_number}&quote=${encodeURIComponent((r.description || '').slice(0, 140))}`
                          : null,
                      }));

                  const visibleRisks = allRisks.filter((r) => !rejectedRiskIds.has(r.id));

                  if (visibleRisks.length === 0) {
                    return <EmptyState title={t('empty.noRisksTitle')} description={t('empty.noRisksDescription')} />;
                  }

                  // Group by severity
                  const bySeverity = visibleRisks.reduce<Record<string, typeof visibleRisks>>((acc, r) => {
                    const k = r.severity || 'unknown';
                    (acc[k] ||= []).push(r);
                    return acc;
                  }, {});

                  const severityOrder = ['critical', 'high', 'medium', 'low', 'unknown'];
                  const severityConfig: Record<string, { icon: string; confidence: AIConfidence }> = {
                    critical: { icon: 'text-error', confidence: 'high' },
                    high: { icon: 'text-error', confidence: 'high' },
                    medium: { icon: 'text-highlight', confidence: 'medium' },
                    low: { icon: 'text-success', confidence: 'low' },
                    unknown: { icon: 'text-text-soft', confidence: 'medium' },
                  };

                  return Object.entries(bySeverity)
                    .sort(([a], [b]) => severityOrder.indexOf(a) - severityOrder.indexOf(b))
                    .map(([severity, items]) => {
                      const config = severityConfig[severity] || severityConfig.unknown;
                      return (
                        <div key={severity} className="space-y-2">
                          <AnalysisSectionHeader
                            icon={<ShieldAlert className="w-4 h-4" />}
                            iconColor={config.icon}
                            title={severity.charAt(0).toUpperCase() + severity.slice(1) + ' Risk'}
                            count={items.length}
                            isExpanded={expandedSections.has(`risk-${severity}`) || expandedSections.size === 0}
                            onToggle={() => {
                              setExpandedSections((prev) => {
                                const next = new Set(prev);
                                const key = `risk-${severity}`;
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              });
                            }}
                          />
                          {(expandedSections.has(`risk-${severity}`) || expandedSections.size === 0) &&
                            items.map((r) => (
                              <AnalysisRecordCard
                                key={r.id}
                                icon={<ShieldAlert className="w-4 h-4" />}
                                iconColor={config.icon}
                                title={r.description || 'Risk'}
                                confidence={config.confidence}
                                sourceHref={r.href}
                                sourcePage={r.pageNumber ?? undefined}
                                onReject={() => setRejectedRiskIds((prev) => new Set([...prev, r.id]))}
                              >
                                {r.explanation && (
                                  <p className="text-sm text-text-soft whitespace-pre-wrap line-clamp-3">{r.explanation}</p>
                                )}
                              </AnalysisRecordCard>
                            ))}
                        </div>
                      );
                    });
                })()}
              </div>
            )}

            {tab.startsWith('custom:') && (
              <div className="space-y-3">
                {(() => {
                  const id = tab.slice('custom:'.length);
                  
                  // Check if rejected (unified action model)
                  if (rejectedCustomModuleIds.has(id)) {
                    return <EmptyState title="Module Rejected" description="This custom module was marked as rejected." />;
                  }
                  
                  const m = customModules.find((x) => x.id === id);
                  if (!m) return <EmptyState title="Missing module" description="This custom module was not found in the snapshot." />;

                  const evidenceLinks = (m.evidence || [])
                    .slice(0, 8)
                    .map((e) => ({
                      page: typeof (e as any)?.page_number === 'number' ? (e as any).page_number : null,
                      quote: typeof (e as any)?.source_quote === 'string' ? (e as any).source_quote : '',
                    }))
                    .filter((e) => !!e.page && !!e.quote);

                  return (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between gap-3">
                          <span>{m.title}</span>
                          <Badge size="sm">{m.status || 'unknown'}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {m.error ? <div className="text-sm text-error">{m.error}</div> : null}
                        {m.ai_confidence ? <div className="text-sm text-text-soft">Confidence: {m.ai_confidence}</div> : null}

                        <div className="rounded-scholar border border-border bg-surface-alt p-3 font-mono text-xs whitespace-pre-wrap">
                          {m.result == null ? 'null' : typeof m.result === 'string' ? m.result : JSON.stringify(m.result, null, 2)}
                        </div>

                        {evidenceLinks.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-sm font-semibold text-text">Evidence</div>
                            <ul className="space-y-2">
                              {evidenceLinks.map((e, idx) => (
                                <li key={idx}>
                                  <Link
                                    href={`/workspaces/${workspaceId}/documents/${documentId}?page=${e.page}&quote=${encodeURIComponent(
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
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Analyzing state (visible even before contract exists) */}
        {isAnalyzing && (
          <div className="mt-4 max-w-xl mx-auto">
            <ScholarProgressCard
              title={t('progress.title')}
              titleIcon={<Scale className="w-5 h-5 text-purple-500" />}
              currentStep={progressStep}
              variant="grid"
              statusMessage={[
                'Queuing analysis…',
                'Analyzing pages (batch 1)…',
                'Analyzing pages (batch 2)…',
                'Extracting clauses & obligations…',
                'Assessing risks & deadlines…',
                'Finalizing analysis…',
              ][progressStep]}
              steps={[
                { label: 'Identify parties & key dates', description: 'Extracting key contract metadata' },
                { label: 'Extract clauses', description: 'Finding and categorizing clauses' },
                { label: 'Extract obligations & deadlines', description: 'Identifying action items' },
                { label: 'Assess risks', description: 'Analyzing potential risk factors' },
              ]}
              footer="Analysis typically takes 30–60 seconds depending on document size."
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
