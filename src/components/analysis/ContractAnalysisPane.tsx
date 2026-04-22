'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Download, Scale, Calendar, FileText, ShieldAlert, AlertTriangle, CheckCircle, X, FileSearch, CircleHelp, Zap, Package, BookOpen, Layers, RefreshCw, Table2, ScrollText, ClipboardCheck, Puzzle, Globe2 } from 'lucide-react';
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
  ScholarToggle,
  type ScholarTab,
} from '@/components/ui';
import {
  AnalysisRecordCard,
  AIConfidenceBadge,
  AnalysisSectionHeader,
  ExpandableJSON,
  type AIConfidence,
  AtAGlanceSummary,
  OverviewTab,
  GenericModuleTab,
  type GenericModuleItem,
  DeadlinesTab,
  type DeadlineItem,
} from '@/components/analysis';
import {
  ComplianceDeviationsTab,
  GenericSummaryTab,
  InvoiceExceptionsTab,
  InvoiceSummaryTab,
  RenewalActionsTab,
  RenewalSummaryTab,
  AmendmentConflictTab,
  ObligationDependenciesTab,
  VendorOnboardingChecksTab,
  LeaseConflictsTab,
  CoverageGapsTab,
  PolicyConformanceTab,
} from '@/components/analysis/TemplateRunTabs';
import { createClient } from '@/lib/supabase/client';
import type { Document, LegalClause, LegalContract, LegalObligation, LegalRiskFlag } from '@/types/database';
import type { EvidenceGradeSnapshot } from '@/types/evidence-grade';
import { parseSnapshot } from '@/types/evidence-grade';
import type {
  BundleSchemaRole,
  PlaybookRecord,
  PlaybookScope,
  TemplateFilter,
  TemplateSpecV1,
} from '@/types/templates';
import { cn } from '@/lib/utils';
import { mapHttpError } from '@/lib/errors';
import { useToast } from '@/components/ui/Toast';
import type { AnalysisRunSummary, AnalysisScopeMode, AnalysisScopeComparisonPolicy } from '@/types/analysis-runs';
import {
  mergeVerificationObjectFallbackRun,
  normalizeAnalysisRunStatus,
  selectDefaultAnalysisRun,
  selectRememberedRelatedDocuments,
  toAnalysisRunSummary,
} from '@/lib/analysis/runs';
import {
  deriveModuleDescriptors,
  deriveTabDescriptors,
  getSnapshotTemplateId,
  moduleResultToFindingCards,
  recordsToFindingCards,
  selectSummaryRenderer,
  type AnalysisModuleDescriptor,
  type AnalysisTabDescriptor,
  type SummaryMetric,
  type SummarySectionModel,
} from '@/lib/analysis/pane';
import { resolveRecommendedPlaybook } from '@/lib/document-analysis';
import { getTemplateDescription, getTemplateEmoji, getTemplateGroup, getTemplateGroupLabel, groupSystemPlaybooks } from '@/lib/template-library';

type Tab = string;

type RunScope = 'single' | 'bundle';
type ScopeAnchorKind = 'none' | 'event_time' | 'document_time' | 'api_fetch_time' | 'business_day';
type ScopePartitionGrain = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

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
  initialView?: 'results' | 'run';
  presentation?: 'full' | 'run-config';
  onRunConfigured?: () => void;
}

type WorkspaceExperienceSummary = {
  experience_id: string;
  workspace_id: string;
  corpus_id: string;
  template_id: string;
  template_version: string;
  publication_status: string;
  experience_lane?: string | null;
  default_visibility: string;
  visibility: string;
  publication_lane: string;
  scaffold_status?: string | null;
  materialization_status?: string | null;
  last_canonical_version_id?: string | null;
  title: string;
  description?: string | null;
  host?: string | null;
  path_family?: string | null;
  path_key?: string | null;
  document_id?: string | null;
  verification_object_id?: string | null;
  active_revision_id?: string | null;
  previous_revision_id?: string | null;
  compatibility_status?: string | null;
  validity_status?: string | null;
  public_url?: string | null;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
};

type WorkspaceExperiencesEnvelope = {
  ok: boolean;
  workspace_id: string;
  experiences: WorkspaceExperienceSummary[];
};

type OpenPrivateLiveEnvelope = {
  ok: boolean;
  live_url?: string | null;
  redeem_url?: string | null;
};

const EXTERNAL_SURFACE_PATH_FAMILIES = new Set(['market']);

function sortPublishedSurfaceSummaries(left: WorkspaceExperienceSummary, right: WorkspaceExperienceSummary) {
  const familyRank = (value?: string | null) => (value === 'market' ? 0 : 1);
  const leftRank = familyRank(left.path_family);
  const rightRank = familyRank(right.path_family);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
}

export function ContractAnalysisPane({
  embedded = false,
  initialView = 'results',
  presentation = 'full',
  onRunConfigured,
}: ContractAnalysisPaneProps = {}) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const documentId = params.docId as string;
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('contractAnalysis');
  const locale = useLocale();
  const toast = useToast();
  const isArabic = locale === 'ar';
  const compactRunConfig = presentation === 'run-config';

  // Run settings (per-run execution; does NOT require duplicating templates)
  const [runLanguage, setRunLanguage] = useState<'en' | 'ar'>(() => (locale === 'ar' ? 'ar' : 'en'));
  const [runStrictness, setRunStrictness] = useState<'default' | 'strict'>('default');

  // Persist run settings locally (best-effort; per-browser preference).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('zohal.contractAnalysis.runSettings');
      if (!raw) return;
      const json = JSON.parse(raw);
      const lang = json?.language;
      const strict = json?.strictness;
      if (lang === 'en' || lang === 'ar') {
        setRunLanguage(lang);
      } else if (lang === 'auto') {
        setRunLanguage(locale === 'ar' ? 'ar' : 'en');
      }
      if (strict === 'default' || strict === 'strict') {
        setRunStrictness(strict);
      } else if (strict === 'auto') {
        setRunStrictness('default');
      }
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

  // API data sources
  const [apiConnections, setApiConnections] = useState<Array<{
    id: string;
    name: string;
    status: string;
    enabled_by_default?: boolean | null;
    endpoint_url?: string | null;
    source_kind?: 'http' | 'mcp' | 'finance_builtin' | null;
  }>>([]);
  const [selectedApiConnectionIds, setSelectedApiConnectionIds] = useState<string[]>([]);
  const [includeDocumentSource, setIncludeDocumentSource] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    const loadApiConnections = async () => {
      try {
        const sb = createClient();
        const { data } = await sb.functions.invoke('workspace-api-connections', {
          body: { action: 'list', workspace_id: workspaceId },
        });
        const conns = data?.data?.connections || data?.connections || [];
        const activeConnections = conns.filter((c: { status: string }) => c.status === 'active');
        setApiConnections(activeConnections);
        setSelectedApiConnectionIds((current) =>
          current.length > 0
            ? current.filter((id) => activeConnections.some((conn: { id: string }) => conn.id === id))
            : activeConnections
                .filter((conn: { enabled_by_default?: boolean | null }) => conn.enabled_by_default !== false)
                .map((conn: { id: string }) => conn.id)
        );
      } catch {
        // silently handle
      }
    };
    loadApiConnections();
  }, [workspaceId]);

  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportSavedMessage, setReportSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [progressDetail, setProgressDetail] = useState<{
    stage: string;
    completed: number;
    total: number;
    message?: string | null;
  } | null>(null);

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
  const [documentRow, setDocumentRow] = useState<Pick<Document, 'privacy_mode' | 'source_metadata' | 'title' | 'original_filename' | 'document_type'> | null>(null);
  const [bundleDocuments, setBundleDocuments] = useState<Array<{ id: string; title: string; role?: string }>>([]);
  const [isRunningCompliance, setIsRunningCompliance] = useState(false);
  const [isGeneratingKnowledgePack, setIsGeneratingKnowledgePack] = useState(false);
  const [isPatchingSnapshot, setIsPatchingSnapshot] = useState(false);
  const [runs, setRuns] = useState<AnalysisRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunStatus, setSelectedRunStatus] = useState<AnalysisRunSummary['status'] | null>(null);
  const [liveExperience, setLiveExperience] = useState<WorkspaceExperienceSummary | null>(null);
  const [isLoadingLiveExperience, setIsLoadingLiveExperience] = useState(false);
  const [isOpeningLiveExperience, setIsOpeningLiveExperience] = useState(false);
  const [liveExperienceError, setLiveExperienceError] = useState<string | null>(null);

  // Playbook selection (MVP): optional; defaults preserve current behavior.
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>(''); // empty = default
  const [selectedPlaybookVersionId, setSelectedPlaybookVersionId] = useState<string>('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  const [didInitializeRecommendedPlaybook, setDidInitializeRecommendedPlaybook] = useState(false);

  // DocSet/run setup state.
  const [scope, setScope] = useState<RunScope>('single');
  const [docsetMembers, setDocsetMembers] = useState<DocsetMember[]>([]);
  const [docsetSearch, setDocsetSearch] = useState('');
  const [docsetIssues, setDocsetIssues] = useState<string[]>([]);
  const [docsetPrimaryDocumentId, setDocsetPrimaryDocumentId] = useState<string>(documentId);
  const [docsetPrecedencePolicy, setDocsetPrecedencePolicy] = useState<'manual' | 'primary_first' | 'latest_wins'>('manual');
  const [analysisScopeMode, setAnalysisScopeMode] = useState<AnalysisScopeMode>('rolling');
  const [scopeDisplayLabel, setScopeDisplayLabel] = useState('');
  const [scopeAnchorKind, setScopeAnchorKind] = useState<ScopeAnchorKind>('none');
  const [scopeAnchorField, setScopeAnchorField] = useState('');
  const [partitionGrain, setPartitionGrain] = useState<ScopePartitionGrain>('day');
  const [partitionKey, setPartitionKey] = useState('');
  const [windowLookbackValue, setWindowLookbackValue] = useState('7');
  const [windowLookbackUnit, setWindowLookbackUnit] = useState<'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'>('day');
  const [comparisonPolicy, setComparisonPolicy] = useState<AnalysisScopeComparisonPolicy>('none');
  const [workspaceDocs, setWorkspaceDocs] = useState<WorkspaceDoc[]>([]);
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([]);
  const [rememberedSourceRunId, setRememberedSourceRunId] = useState<string | null>(null);
  const [didPrefillRememberedRelatedDocs, setDidPrefillRememberedRelatedDocs] = useState(false);
  const autoRunTriggered = useRef(false);

  // Expanded sections for collapsible groups
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!includeDocumentSource && scope === 'bundle') {
      setScope('single');
    }
  }, [includeDocumentSource, scope]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.runId === selectedRunId) ?? null,
    [runs, selectedRunId]
  );
  const workspaceDocumentTitleById = useMemo(
    () =>
      new Map(
        workspaceDocs.map((doc) => [doc.id, doc.title || doc.id] as const)
      ),
    [workspaceDocs]
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

  const recommendedTemplateIds = useMemo(() => {
    const raw = (documentRow?.source_metadata as any)?.recommended_template_ids;
    if (!Array.isArray(raw)) return [] as string[];
    return raw
      .map((v: any) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
  }, [documentRow?.source_metadata]);

  const resolvedRecommendedPlaybook = useMemo(() => {
    if (!documentRow || playbooks.length === 0) return null;
    return resolveRecommendedPlaybook(playbooks, {
      documentType: documentRow.document_type || 'contract',
      title: documentRow.title,
      originalFilename: documentRow.original_filename,
      recommendedTemplateIds,
    });
  }, [documentRow, playbooks, recommendedTemplateIds]);

  const localizedTemplateText = useCallback(
    (
      key:
        | 'all'
        | 'zohal_templates'
        | 'specializations'
        | 'custom'
        | 'systemLabel'
        | 'search'
        | 'autoDescription'
        | 'customTemplate',
      version?: number
    ) => {
      const ar = {
        all: 'الكل',
        zohal_templates: 'القوالب',
        specializations: 'القوالب',
        custom: 'مخصص',
        systemLabel: 'من زحل',
        search: 'ابحث في القوالب…',
        autoDescription: 'يختار زحل القالب الأنسب لمستندك.',
        customTemplate: version ? `قالب مخصص • v${version}` : 'قالب مخصص',
      } as const;
      const en = {
        all: 'All',
        zohal_templates: 'Templates',
        specializations: 'Templates',
        custom: 'Custom',
        systemLabel: 'System',
        search: 'Search templates…',
        autoDescription: 'Zohal picks the best template for your document.',
        customTemplate: version ? `Custom template • v${version}` : 'Custom template',
      } as const;
      return (isArabic ? ar : en)[key];
    },
    [isArabic]
  );

  const noTemplateMatchText = useCallback(
    (query: string) => (isArabic ? `لا توجد قوالب تطابق "${query}".` : `No templates match "${query}".`),
    [isArabic]
  );

  const templateCategoryLabel = useCallback(
    (category: TemplateFilter) => {
      switch (category) {
        case 'all':
          return localizedTemplateText('all');
        case 'zohal_templates':
          return localizedTemplateText('zohal_templates');
        case 'specializations':
          return localizedTemplateText('specializations');
        case 'custom':
          return localizedTemplateText('custom');
      }
    },
    [localizedTemplateText]
  );

  const templateCategory = useCallback((playbook: PlaybookRecord): TemplateFilter => {
    return playbook.is_system_preset ? getTemplateGroup(playbook) : 'custom';
  }, []);

  const templateEmoji = useCallback((playbook: PlaybookRecord) => {
    return getTemplateEmoji(playbook);
  }, []);

  const templateDescription = useCallback(
    (playbook: PlaybookRecord) => {
      if (!playbook.is_system_preset) {
        const version = playbook.current_version?.version_number;
        return localizedTemplateText('customTemplate', version);
      }
      return getTemplateDescription(playbook, isArabic ? 'ar' : 'en');
    },
    [isArabic, localizedTemplateText]
  );

  const normalizedTemplateSearch = useMemo(() => templateSearch.trim().toLowerCase(), [templateSearch]);

  const filteredPlaybooks = useMemo(() => {
    return playbooks.filter((playbook) => {
      const category = templateCategory(playbook);
      const matchesFilter = templateFilter === 'all' || templateFilter === category || (templateFilter === 'custom' && category === 'custom');
      const matchesSearch = !normalizedTemplateSearch || playbook.name.toLowerCase().includes(normalizedTemplateSearch);
      return matchesFilter && matchesSearch;
    });
  }, [normalizedTemplateSearch, playbooks, templateCategory, templateFilter]);

  const filteredSystemPlaybooks = useMemo(
    () => filteredPlaybooks.filter((playbook) => playbook.is_system_preset),
    [filteredPlaybooks]
  );

  const groupedSystemPlaybooks = useMemo(
    () => groupSystemPlaybooks(filteredSystemPlaybooks),
    [filteredSystemPlaybooks]
  );

  const recommendedSystemPlaybook = useMemo(() => {
    if (!resolvedRecommendedPlaybook?.is_system_preset) return null;
    const recommendedId = resolvedRecommendedPlaybook.id;
    return filteredSystemPlaybooks.find((playbook) => playbook.id === recommendedId) || null;
  }, [filteredSystemPlaybooks, resolvedRecommendedPlaybook]);

  const displayGroupedSystemPlaybooks = useMemo(() => {
    if (!recommendedSystemPlaybook) return groupedSystemPlaybooks;
    return groupedSystemPlaybooks
      .map(({ group, playbooks }) => ({
        group,
        playbooks: playbooks.filter((playbook) => playbook.id !== recommendedSystemPlaybook.id),
      }))
      .filter(({ playbooks }) => playbooks.length > 0);
  }, [groupedSystemPlaybooks, recommendedSystemPlaybook]);

  const filteredCustomPlaybooks = useMemo(
    () => filteredPlaybooks.filter((playbook) => !playbook.is_system_preset),
    [filteredPlaybooks]
  );

  const selectedPlaybookSpec = useMemo(() => {
    const raw = selectedPlaybook?.current_version?.spec_json;
    return raw && typeof raw === 'object' ? (raw as TemplateSpecV1) : null;
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

  const normalizedScopeDisplayLabel = useMemo(() => {
    const explicit = scopeDisplayLabel.trim();
    if (explicit) return explicit;
    if (analysisScopeMode === 'pinned') return t('scopePolicy.modePinned');
    if (analysisScopeMode === 'windowed') return t('scopePolicy.modeWindowed');
    if (analysisScopeMode === 'period_partitioned') return t('scopePolicy.modePartitioned');
    return t('scopePolicy.modeRolling');
  }, [analysisScopeMode, scopeDisplayLabel, t]);

  const scopePolicyPayload = useMemo(() => {
    const payload: Record<string, unknown> = {
      mode: analysisScopeMode,
      display_label: normalizedScopeDisplayLabel,
      anchor: {
        kind: scopeAnchorKind,
        ...(scopeAnchorField.trim() ? { field: scopeAnchorField.trim() } : {}),
        timezone: locale === 'ar' ? 'Asia/Riyadh' : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      },
      comparison_policy: comparisonPolicy,
      freeze_policy: analysisScopeMode === 'pinned' ? 'freeze_on_run' : 'mutable',
      api_policy: 'manual',
      selection_policy: effectiveScope === 'bundle' ? 'manual' : 'all_included',
    };
    if (analysisScopeMode === 'windowed') {
      payload.window = {
        kind: 'relative',
        lookback_value: Number(windowLookbackValue) > 0 ? Number(windowLookbackValue) : 7,
        lookback_unit: windowLookbackUnit,
      };
    }
    if (analysisScopeMode === 'period_partitioned') {
      payload.partition = {
        grain: partitionGrain,
        ...(partitionKey.trim() ? { key: partitionKey.trim() } : {}),
      };
    }
    return payload;
  }, [
    analysisScopeMode,
    comparisonPolicy,
    effectiveScope,
    locale,
    normalizedScopeDisplayLabel,
    partitionGrain,
    partitionKey,
    scopeAnchorField,
    scopeAnchorKind,
    windowLookbackUnit,
    windowLookbackValue,
  ]);

  const runPreviewItems = useMemo(() => {
    const documentCount = includeDocumentSource
      ? effectiveScope === 'bundle'
        ? docsetMembers.length
        : 1
      : 0;
    const apiCount = selectedApiConnectionIds.length;
    const preview: string[] = [
      t('scopePolicy.previewSources', { count: documentCount }),
      t('scopePolicy.previewApis', { count: apiCount }),
      t(`scopePolicy.previewMode.${analysisScopeMode}` as any),
    ];
    if (analysisScopeMode === 'windowed') {
      preview.push(
        t('scopePolicy.previewWindow', {
          count: Number(windowLookbackValue) > 0 ? Number(windowLookbackValue) : 7,
          unit: t(`scopePolicy.unit.${windowLookbackUnit}` as any),
        })
      );
    }
    if (analysisScopeMode === 'period_partitioned') {
      preview.push(
        t('scopePolicy.previewPartition', {
          grain: t(`scopePolicy.unit.${partitionGrain}` as any),
          key: partitionKey.trim() || t('scopePolicy.currentPartition'),
        })
      );
    }
    if (comparisonPolicy !== 'none') {
      preview.push(t(`scopePolicy.comparison.${comparisonPolicy}` as any));
    }
    return preview;
  }, [
    analysisScopeMode,
    comparisonPolicy,
    docsetMembers.length,
    effectiveScope,
    includeDocumentSource,
    partitionGrain,
    partitionKey,
    selectedApiConnectionIds.length,
    t,
    windowLookbackUnit,
    windowLookbackValue,
  ]);

  const runConfigError = useMemo(() => {
    if (!includeDocumentSource && selectedApiConnectionIds.length === 0) {
      return t('apiSources.apiOnlyNeedsSource');
    }
    if (!includeDocumentSource && effectiveScope === 'bundle') {
      return t('apiSources.apiOnlyBundleWarning');
    }
    if (effectiveScope === 'bundle' && docsetIssues.length > 0) {
      return docsetIssues[0] || t('docset.validation.invalidDocset');
    }
    return null;
  }, [docsetIssues, effectiveScope, includeDocumentSource, selectedApiConnectionIds.length, t]);

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

  const proofHref = useCallback((evidence: EvidenceGradeSnapshot['variables'][number]['evidence'] | undefined | null) => {
    if (!evidence) return null;
    if ((evidence as any).source_type === 'api') return null;
    if (!evidence.page_number) return null;
    const quote = (evidence.snippet || '').slice(0, 160);
    const bbox = evidence.bbox ? `${evidence.bbox.x},${evidence.bbox.y},${evidence.bbox.width},${evidence.bbox.height}` : null;
    const targetDocId = (evidence as any).document_id ? String((evidence as any).document_id) : documentId;
    const paneParam = embedded ? '&pane=analysis' : '';
    const base = `/workspaces/${workspaceId}/documents/${targetDocId}?page=${evidence.page_number}&quote=${encodeURIComponent(quote)}${paneParam}`;
    return bbox ? `${base}&bbox=${encodeURIComponent(bbox)}` : base;
  }, [documentId, embedded, workspaceId]);

  const deadlines = useMemo(() => {
    return obligations
      .filter((o) => !!o.due_at)
      .slice()
      .sort((a, b) => (a.due_at || '').localeCompare(b.due_at || ''));
  }, [obligations]);

  const currentTemplateId = useMemo(() => getSnapshotTemplateId(snapshot), [snapshot]);

  const packModules = useMemo(() => {
    const pack: any = snapshot?.pack as any;
    const dict = pack?.modules && typeof pack.modules === 'object' && !Array.isArray(pack.modules) ? pack.modules : null;
    return dict ? (dict as Record<string, any>) : {};
  }, [snapshot]);

  const moduleDescriptors = useMemo(() => deriveModuleDescriptors(snapshot), [snapshot]);

  const moduleDescriptorById = useMemo(
    () => new Map(moduleDescriptors.map((descriptor) => [descriptor.id, descriptor])),
    [moduleDescriptors]
  );

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
    const core = ['variables', 'clauses', 'obligations', 'risks', 'deadlines'] as const;
    const hasCoreInSet = core.some((id) => set.has(id));
    if (!hasCoreInSet) {
      // Backward-safe recovery for snapshots where modules_enabled was accidentally written with only custom module ids.
      if ((snapshot?.variables || []).length > 0) set.add('variables');
      if ((snapshot?.clauses || []).length > 0) set.add('clauses');
      if ((snapshot?.obligations || []).length > 0) set.add('obligations');
      if ((snapshot?.risks || []).length > 0) set.add('risks');
      if ((snapshot?.obligations || []).some((o: any) => !!o?.due_at)) set.add('deadlines');
    }
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

  const hydrateFindingItems = useCallback(
    (items: GenericModuleItem[]): GenericModuleItem[] =>
      items.map((item) => ({
        ...item,
        sourceHref: item.sourceHref ?? proofHref(item.evidence as any),
        sourcePage: item.sourcePage ?? item.evidence?.page_number ?? undefined,
      })),
    [proofHref]
  );

  const moduleItemsById = useMemo(() => {
    const entries = new Map<string, GenericModuleItem[]>();
    for (const descriptor of moduleDescriptors) {
      const moduleRecords = v3Records.filter(
        (record) =>
          String((record as any)?.module_id || '').trim() === descriptor.id &&
          String((record as any)?.status || '').toLowerCase() !== 'rejected'
      );
      const raw = packModules[descriptor.id];
      const moduleValue = raw && typeof raw === 'object' ? raw : {};
      const recordFirstItems = recordsToFindingCards(
        moduleRecords as Array<Record<string, unknown>>
      ) as GenericModuleItem[];
      const fallbackItems = moduleResultToFindingCards({
        moduleId: descriptor.id,
        moduleTitle: descriptor.title,
        result: (moduleValue as any).result,
        evidence: (moduleValue as any).evidence,
        moduleConfidence: (moduleValue as any).ai_confidence,
      }) as GenericModuleItem[];
      const items = hydrateFindingItems(recordFirstItems.length > 0 ? recordFirstItems : fallbackItems);
      entries.set(
        descriptor.id,
        items.filter((item) =>
          item.recordId
            ? !rejectedSets.records.has(item.recordId)
            : !rejectedSets.modules.has(item.id)
        )
      );
    }
    return entries;
  }, [hydrateFindingItems, moduleDescriptors, packModules, rejectedSets.modules, rejectedSets.records, v3Records]);

  const recordItems = useMemo(
    () =>
      hydrateFindingItems(
        recordsToFindingCards(v3Records)
          .filter((item) => !rejectedSets.records.has(item.id)) as GenericModuleItem[]
      ),
    [hydrateFindingItems, rejectedSets.records, v3Records]
  );

  const coreCounts = useMemo(() => {
    const visibleVariables = (snapshot?.variables || []).filter((v) => !rejectedSets.variables.has(v.id));
    const visibleClauses = (snapshot?.clauses?.length
      ? snapshot.clauses.filter((c: any) => !rejectedSets.clauses.has(String(c?.id || '').trim()))
      : clauses.filter((c) => !rejectedSets.clauses.has(c.id)));
    const visibleObligations = obligations.filter((o) => !rejectedSets.obligations.has(o.id));
    const visibleDeadlines = deadlines.filter((o) => !rejectedSets.obligations.has(o.id));
    const visibleRisks = (snapshot?.risks?.length
      ? snapshot.risks.filter((r: any) => !rejectedSets.risks.has(String(r?.id || '').trim()))
      : risks.filter((r) => !rejectedSets.risks.has(r.id)));

    return {
      variables: visibleVariables.length,
      clauses: visibleClauses.length,
      obligations: visibleObligations.length,
      deadlines: visibleDeadlines.length,
      risks: visibleRisks.length,
      variablesAttention: visibleVariables.filter((v) => v.verification_state === 'needs_review').length,
    };
  }, [clauses, deadlines, obligations, rejectedSets, risks, snapshot]);

  const visibleVerdicts = useMemo(
    () =>
      v3Verdicts.filter(
        (v, idx) => !rejectedSets.verdicts.has(String(v?.id || `${v?.rule_id || 'verdict'}_${idx}`))
      ),
    [rejectedSets.verdicts, v3Verdicts]
  );

  const visibleExceptions = useMemo(
    () =>
      v3Exceptions.filter(
        (ex, idx) => !rejectedSets.exceptions.has(String(ex?.id || `${ex?.kind || ex?.type || 'exception'}_${idx}`))
      ),
    [rejectedSets.exceptions, v3Exceptions]
  );

  const tabDescriptors = useMemo<AnalysisTabDescriptor[]>(() => {
    const moduleCounts = Object.fromEntries(
      moduleDescriptors.map((descriptor) => [descriptor.id, moduleItemsById.get(descriptor.id)?.length ?? 0])
    );
    const moduleAttentionCounts = Object.fromEntries(
      moduleDescriptors.map((descriptor) => [
        descriptor.id,
        (moduleItemsById.get(descriptor.id) || []).filter((item) => item.needsAttention).length,
      ])
    );

    return deriveTabDescriptors({
      enabledCoreModules: enabledModules,
      moduleDescriptors,
      counts: {
        variables: coreCounts.variables,
        clauses: coreCounts.clauses,
        obligations: coreCounts.obligations,
        deadlines: coreCounts.deadlines,
        risks: coreCounts.risks,
        records: recordItems.length,
        ...moduleCounts,
      },
      attentionCounts: {
        variables: coreCounts.variablesAttention,
        clauses: attention.clauses,
        obligations: attention.obligations,
        deadlines: attention.deadlines,
        risks: attention.risks,
        records: recordItems.filter((item) => item.needsAttention).length,
        ...moduleAttentionCounts,
      },
      hasRecords: recordItems.length > 0,
      recordCount: recordItems.length,
      hasVerdicts: !!(snapshot?.pack as any)?.capabilities?.analysis_v3?.enabled || visibleVerdicts.length > 0,
      verdictCount: visibleVerdicts.length,
      verdictAttentionCount: visibleVerdicts.filter((v) => String(v?.status || '') !== 'pass').length,
      hasExceptions: !!(snapshot?.pack as any)?.capabilities?.analysis_v3?.enabled || visibleExceptions.length > 0,
      exceptionCount: visibleExceptions.length,
      exceptionAttentionCount: visibleExceptions.length,
    });
  }, [attention, coreCounts, enabledModules, moduleDescriptors, moduleItemsById, recordItems, snapshot, visibleExceptions, visibleVerdicts]);

  const tabs = useMemo(() => {
    const iconForTab = (descriptor: AnalysisTabDescriptor) => {
      switch (descriptor.id) {
        case 'overview':
          return FileText;
        case 'variables':
          return Table2;
        case 'clauses':
          return ScrollText;
        case 'obligations':
          return ClipboardCheck;
        case 'deadlines':
          return Calendar;
        case 'risks':
          return ShieldAlert;
        case 'records':
          return BookOpen;
        case 'verdicts':
          return Scale;
        case 'exceptions':
          return AlertTriangle;
        default:
          return Puzzle;
      }
    };

    const labelForTab = (descriptor: AnalysisTabDescriptor) => {
      switch (descriptor.id) {
        case 'overview':
          return t('tabs.overview');
        case 'variables':
          return t('tabs.variables');
        case 'clauses':
          return t('tabs.clauses');
        case 'obligations':
          return t('tabs.obligations');
        case 'deadlines':
          return t('tabs.deadlines');
        case 'risks':
          return t('tabs.risks');
        case 'records':
          return t('tabs.records');
        case 'verdicts':
          return t('tabs.verdicts');
        case 'exceptions':
          return t('tabs.exceptions');
        default:
          return moduleDescriptorById.get(descriptor.moduleId || '')?.title || descriptor.id;
      }
    };

    return tabDescriptors.map((descriptor) => ({
      id: descriptor.id,
      label: labelForTab(descriptor),
      icon: iconForTab(descriptor),
      total: descriptor.count,
      attentionCount: descriptor.attentionCount,
    }));
  }, [moduleDescriptorById, t, tabDescriptors]);

  const templateTitle = useMemo(() => {
    const playbook = (snapshot?.pack as any)?.playbook;
    const playbookName =
      (playbook && typeof playbook.playbook_name === 'string' && playbook.playbook_name.trim()) ||
      selectedRun?.playbookLabel ||
      selectedPlaybook?.name;
    if (playbookName) return playbookName;
    return currentTemplateId
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }, [currentTemplateId, selectedPlaybook?.name, selectedRun?.playbookLabel, snapshot]);

  const summaryRenderer = useMemo(() => selectSummaryRenderer(currentTemplateId), [currentTemplateId]);

  const genericSummaryMetrics = useMemo<SummaryMetric[]>(() => {
    const issueCount = coreCounts.risks + visibleExceptions.length;
    const sourceCount = bundleDocuments.length > 0 ? bundleDocuments.length : 1;
    return [
      { label: t('summary.metrics.sources'), value: String(sourceCount) },
      { label: t('summary.metrics.variables'), value: String(coreCounts.variables + recordItems.length) },
      {
        label: t('summary.metrics.issues'),
        value: String(issueCount),
        tone: issueCount > 0 ? 'warning' : 'success',
      },
      {
        label: t('summary.metrics.status'),
        value: verificationObjectState === 'finalized' ? t('summary.status.finalized') : t('summary.status.provisional'),
      },
    ];
  }, [bundleDocuments.length, coreCounts.risks, coreCounts.variables, recordItems.length, t, verificationObjectState, visibleExceptions.length]);

  const summarySections = useMemo<SummarySectionModel[]>(() => {
    const topVariables = (snapshot?.variables || [])
      .filter((v) => !rejectedSets.variables.has(v.id))
      .slice(0, 6)
      .map((variable) => ({
        id: variable.id,
        label: variable.display_name,
        value: variable.value == null ? t('summary.noValue') : `${String(variable.value)}${variable.unit ? ` ${variable.unit}` : ''}`,
        href: proofHref(variable.evidence),
      }));

    const sourceItems = (bundleDocuments.length > 0
      ? bundleDocuments.map((doc) => ({
          id: doc.id,
          label: doc.role ? t('summary.sourceRole') : t('summary.sourceDocument'),
          value: doc.role ? `${doc.title} · ${doc.role}` : doc.title,
          href: `/workspaces/${workspaceId}/documents/${doc.id}`,
        }))
      : [
          {
            id: documentId,
            label: t('summary.sourceDocument'),
            value: documentRow?.title || documentId,
            href: `/workspaces/${workspaceId}/documents/${documentId}`,
          },
        ]);

    const issueItems = [
      ...visibleExceptions.slice(0, 4).map((item, index) => ({
        id: `ex-${index}`,
        label: t('summary.sections.exceptions'),
        value: String(item?.message || item?.kind || item?.type || t('summary.noValue')),
      })),
      ...(snapshot?.risks || [])
        .filter((risk) => !rejectedSets.risks.has(risk.id))
        .slice(0, 4)
        .map((risk) => ({
          id: risk.id,
          label: t('summary.sections.risks'),
          value: risk.description,
          href: proofHref(risk.evidence),
        })),
    ];

    return [
      { id: 'sources', title: t('summary.sections.sources'), items: sourceItems },
      { id: 'key-facts', title: t('summary.sections.keyFacts'), items: topVariables },
      { id: 'issues', title: t('summary.sections.issues'), items: issueItems },
    ];
  }, [bundleDocuments, documentId, documentRow?.title, proofHref, rejectedSets.risks, rejectedSets.variables, snapshot, t, visibleExceptions, workspaceId]);

  const renewalSummaryMetrics = useMemo<SummaryMetric[]>(() => {
    const noticeVariable = snapshot?.variables.find((variable) => variable.name === 'notice_deadline');
    return [
      {
        label: t('summary.metrics.endDate'),
        value: contract?.end_date || t('summary.noValue'),
      },
      {
        label: t('summary.metrics.noticeDeadline'),
        value: noticeVariable?.value ? String(noticeVariable.value) : t('summary.noValue'),
        tone: noticeVariable?.value ? 'warning' : 'default',
      },
      {
        label: t('summary.metrics.actions'),
        value: String(moduleItemsById.get('renewal_actions')?.length || 0),
      },
      {
        label: t('summary.metrics.issues'),
        value: String(coreCounts.risks + visibleExceptions.length),
        tone: coreCounts.risks + visibleExceptions.length > 0 ? 'warning' : 'success',
      },
    ];
  }, [contract?.end_date, coreCounts.risks, moduleItemsById, snapshot?.variables, t, visibleExceptions.length]);

  const invoiceSummaryMetrics = useMemo<SummaryMetric[]>(() => {
    const getVariableValue = (name: string) => {
      const value = snapshot?.variables.find((variable) => variable.name === name)?.value;
      return value == null ? t('summary.noValue') : String(value);
    };
    return [
      { label: t('summary.metrics.vendor'), value: getVariableValue('vendor_name') },
      { label: t('summary.metrics.invoice'), value: getVariableValue('invoice_number') },
      { label: t('summary.metrics.total'), value: getVariableValue('total_amount') },
      {
        label: t('summary.metrics.issues'),
        value: String(moduleItemsById.get('invoice_exceptions')?.length || visibleExceptions.length || coreCounts.risks),
        tone: (moduleItemsById.get('invoice_exceptions')?.length || visibleExceptions.length || coreCounts.risks) > 0 ? 'warning' : 'success',
      },
    ];
  }, [coreCounts.risks, moduleItemsById, snapshot?.variables, t, visibleExceptions.length]);

  const renewalNextAction = useMemo(() => moduleItemsById.get('renewal_actions')?.[0]?.title || null, [moduleItemsById]);

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

  function getSnapshotVariableValue(parsed: EvidenceGradeSnapshot | null, name: string): unknown {
    return parsed?.variables.find((variable) => variable.name === name)?.value;
  }

  function toOptionalString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return undefined;
  }

  function toOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  function toOptionalBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', '1'].includes(normalized)) return true;
      if (['false', 'no', '0'].includes(normalized)) return false;
    }
    return undefined;
  }

  function buildContractFromSnapshot(
    parsed: EvidenceGradeSnapshot,
    verificationObjectIdValue: string,
  ): LegalContract {
    const analyzedAt = parsed.analyzed_at || new Date().toISOString();
    return {
      id: verificationObjectIdValue,
      document_id: documentId,
      workspace_id: workspaceId,
      contract_type: toOptionalString(getSnapshotVariableValue(parsed, 'contract_type')),
      effective_date: toOptionalString(getSnapshotVariableValue(parsed, 'effective_date')),
      end_date: toOptionalString(getSnapshotVariableValue(parsed, 'end_date')),
      term_length_months: toOptionalNumber(getSnapshotVariableValue(parsed, 'term_length_months')),
      notice_period_days: toOptionalNumber(getSnapshotVariableValue(parsed, 'notice_period_days')),
      auto_renewal: toOptionalBoolean(getSnapshotVariableValue(parsed, 'auto_renewal')),
      termination_for_convenience: toOptionalBoolean(getSnapshotVariableValue(parsed, 'termination_for_convenience')),
      governing_law: toOptionalString(getSnapshotVariableValue(parsed, 'governing_law')),
      counterparty_name: toOptionalString(getSnapshotVariableValue(parsed, 'counterparty_name')),
      status: 'active',
      verification_object_id: verificationObjectIdValue,
      created_at: analyzedAt,
      updated_at: analyzedAt,
    };
  }

  async function loadTaskLinksForObligations(obligationIds: string[]): Promise<Map<string, string>> {
    const links = new Map<string, string>();
    if (obligationIds.length === 0) return links;

    const { data: taskRows, error } = await supabase
      .from('tasks')
      .select('id, metadata')
      .eq('workspace_id', workspaceId)
      .eq('document_id', documentId)
      .is('deleted_at', null);

    if (error || !Array.isArray(taskRows)) return links;

    const wanted = new Set(obligationIds.map((id) => String(id).toLowerCase()));
    for (const row of taskRows as Array<{ id?: string; metadata?: Record<string, unknown> | null }>) {
      const metadata = row?.metadata;
      const sourceType = metadata && typeof metadata === 'object'
        ? String(metadata.source_record_type || '')
        : '';
      const sourceId = metadata && typeof metadata === 'object'
        ? String(metadata.source_record_id || '').toLowerCase()
        : '';
      if (sourceType === 'obligation' && sourceId && wanted.has(sourceId) && row?.id) {
        links.set(sourceId, String(row.id));
      }
    }

    return links;
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
    if (verificationObjectId && parsed) {
      const nextContract = buildContractFromSnapshot(parsed, verificationObjectId);
      const taskLinks = await loadTaskLinksForObligations(parsed.obligations.map((obligation) => String(obligation.id)));
      applySnapshotToCoreModules(parsed, nextContract, taskLinks);
    }
  }

  function applySnapshotToCoreModules(
    parsed: EvidenceGradeSnapshot | null,
    nextContract: LegalContract,
    taskLinks?: Map<string, string>,
  ) {
    // Snapshot-canonical rendering: use snapshot arrays when available.
    // Projections remain as accelerators and fallback for older runs / partial snapshots.
    if (!parsed) return;
    setContract(nextContract);

    if (Array.isArray(parsed.clauses) && parsed.clauses.length > 0) {
      const mapped: LegalClause[] = parsed.clauses.map((c) => ({
        id: String(c.id),
        contract_id: String(nextContract.id),
        clause_type: String(c.clause_type || 'other'),
        clause_title: c.clause_title ? String(c.clause_title) : undefined,
        clause_number: c.clause_number ? String(c.clause_number) : undefined,
        text: String(c.text || ''),
        risk_level: (c.risk_level === 'high' || c.risk_level === 'medium' || c.risk_level === 'low') ? c.risk_level : 'low',
        page_number: c.evidence?.page_number,
        start_page: undefined,
        end_page: undefined,
        char_start: c.evidence?.char_start,
        char_end: c.evidence?.char_end,
        is_missing_standard_protection: Boolean(c.is_missing_standard_protection),
        created_at: nextContract.created_at,
      }));
      setClauses(mapped);
    }

    if (Array.isArray(parsed.obligations) && parsed.obligations.length > 0) {
      const mapped: LegalObligation[] = parsed.obligations.map((o) => {
        const vState = String(o.verification_state || 'extracted');
        const confidenceState: 'extracted' | 'needs_review' | 'confirmed' =
          vState === 'needs_review' ? 'needs_review' : (vState === 'verified' || vState === 'finalized' ? 'confirmed' : 'extracted');
        const conf = o.ai_confidence === 'high' || o.ai_confidence === 'medium' || o.ai_confidence === 'low' ? o.ai_confidence : undefined;
        return {
          id: String(o.id),
          contract_id: String(nextContract.id),
          task_id: taskLinks?.get(String(o.id).toLowerCase()),
          obligation_type: String(o.obligation_type || 'other'),
          due_at: o.due_at ? String(o.due_at) : undefined,
          recurrence: o.recurrence ? String(o.recurrence) : undefined,
          summary: o.summary ? String(o.summary) : undefined,
          action: o.action ? String(o.action) : undefined,
          condition: o.condition ? String(o.condition) : undefined,
          responsible_party: o.responsible_party ? String(o.responsible_party) : undefined,
          confidence_state: confidenceState,
          confidence: conf,
          source_clause_id: undefined,
          page_number: o.evidence?.page_number,
          user_notes: undefined,
          confirmed_at: confidenceState === 'confirmed' ? nextContract.updated_at : undefined,
          confirmed_by: undefined,
          created_at: nextContract.created_at,
        };
      });
      setObligations(mapped);
    }

    if (Array.isArray(parsed.risks) && parsed.risks.length > 0) {
      const mapped: LegalRiskFlag[] = parsed.risks.map((r) => ({
        id: String(r.id),
        contract_id: String(nextContract.id),
        severity: (r.severity === 'critical' || r.severity === 'high' || r.severity === 'medium' || r.severity === 'low') ? r.severity : 'low',
        description: String(r.description || ''),
        explanation: r.explanation ? String(r.explanation) : undefined,
        resolved: Boolean(r.resolved),
        page_number: r.evidence?.page_number ?? null,
        created_at: nextContract.created_at,
      }));
      setRisks(mapped);
    }
  }

  async function loadRuns(options?: { keepSelection?: boolean }) {
    setRunsLoading(true);
    try {
      const [{ data, error }, { data: verificationObject }] = await Promise.all([
        supabase
          .from('extraction_runs')
          .select('id, status, created_at, updated_at, input_config, output_summary, extraction_type')
          .eq('workspace_id', workspaceId)
          .eq('document_id', documentId)
          .in('extraction_type', ['contract_analysis', 'document_analysis'])
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('verification_objects')
          .select('id, title, state, created_at, updated_at, current_version_id')
          .eq('document_id', documentId)
          .in('object_type', ['contract_analysis', 'document_analysis'])
          .maybeSingle(),
      ]);
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

      const normalized = mergeVerificationObjectFallbackRun(
        rows.map((row) => {
          const input = row.input_config && typeof row.input_config === 'object' ? row.input_config : {};
          const actionId = (input as any).action_id || (input as any).actionId || null;
          const action = actionId ? actionsById.get(String(actionId)) : null;
          return toAnalysisRunSummary(
            {
              ...row,
              input_config: row.input_config ?? null,
              output_summary: row.output_summary ?? null,
              extraction_type: row.extraction_type ?? 'document_analysis',
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
        }).map((run) => {
          const action = run.actionId ? actionsById.get(run.actionId) : null;
          return {
            ...run,
            status: normalizeAnalysisRunStatus(run.status, action?.status ?? null),
          } as AnalysisRunSummary;
        }),
        verificationObject as any
      );

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

  async function loadLiveExperience() {
    setIsLoadingLiveExperience(true);
    setLiveExperienceError(null);
    try {
      const response = await fetch(
        `/api/experiences/v1/experiences/workspaces/${encodeURIComponent(workspaceId)}/experiences`
      );
      const data = (await response.json()) as WorkspaceExperiencesEnvelope;
      if (!response.ok) {
        throw new Error((data as any)?.message || 'Failed to load experiences');
      }
      const experiences = Array.isArray(data.experiences) ? data.experiences : [];
      const match = experiences
        .filter(
          (item) =>
            item.document_id === documentId &&
            EXTERNAL_SURFACE_PATH_FAMILIES.has(String(item.path_family || '').trim().toLowerCase())
        )
        .sort(sortPublishedSurfaceSummaries)[0] || null;
      setLiveExperience(match);
    } catch (e) {
      setLiveExperience(null);
      setLiveExperienceError(e instanceof Error ? e.message : t('liveExperience.loadFailed'));
    } finally {
      setIsLoadingLiveExperience(false);
    }
  }

  async function openLiveExperience() {
    if (!liveExperience?.experience_id) return;
    setIsOpeningLiveExperience(true);
    setLiveExperienceError(null);
    try {
      if (liveExperience.experience_lane === 'private_live') {
        const response = await fetch('/api/experiences/v1/experiences/private-live/open', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ experience_id: liveExperience.experience_id }),
        });
        const data = (await response.json()) as OpenPrivateLiveEnvelope & { message?: string };
        if (!response.ok || !data.redeem_url) {
          throw new Error(data.message || t('liveExperience.openFailed'));
        }
        window.open(data.redeem_url, '_blank', 'noopener,noreferrer');
        return;
      }

      const target = liveExperience.public_url;
      if (!target) {
        throw new Error(t('liveExperience.preparing'));
      }
      window.open(target, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setLiveExperienceError(e instanceof Error ? e.message : t('liveExperience.openFailed'));
    } finally {
      setIsOpeningLiveExperience(false);
    }
  }

  async function selectRun(run: AnalysisRunSummary) {
    setSelectedRunId(run.runId);
    setSelectedRunStatus(run.status);
    setShowSettings(false);
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
        .select('privacy_mode, source_metadata, title, original_filename, document_type')
        .eq('id', documentId)
        .maybeSingle();
      if (!docErr) setDocumentRow((docData || null) as any);

      const { data: verificationObject, error: verificationObjectError } = await supabase
        .from('verification_objects')
        .select('id, current_version_id, state, finalized_at')
        .eq('document_id', documentId)
        .in('object_type', ['contract_analysis', 'document_analysis'])
        .maybeSingle();

      if (verificationObjectError) throw verificationObjectError;

      if (!verificationObject?.id || !verificationObject.current_version_id) {
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

      setSnapshot(null);
      setVerificationObjectId(String(verificationObject.id));
      setCurrentVersionId(String(verificationObject.current_version_id));
      setVerificationObjectState(String(verificationObject.state || 'provisional'));
      
      // If we found a contract, analysis is complete - reset analyzing state
      // This handles the case where user left and came back after completion
      setIsAnalyzing(false);

      const { data: versionData, error: versionError } = await supabase
        .from('verification_object_versions')
        .select('snapshot_json')
        .eq('id', verificationObject.current_version_id)
        .maybeSingle();
      if (versionError) throw versionError;
      if (versionData?.snapshot_json) {
        const parsed = parseSnapshot(versionData.snapshot_json, documentId);
        if (!parsed) {
          throw new Error('Failed to parse analysis snapshot');
        }
        setSnapshot(parsed);
        const nextContract = buildContractFromSnapshot(parsed, String(verificationObject.id));
        const taskLinks = await loadTaskLinksForObligations(parsed.obligations.map((obligation) => String(obligation.id)));
        applySnapshotToCoreModules(parsed, nextContract, taskLinks);
      } else {
        setContract(null);
        setClauses([]);
        setObligations([]);
        setRisks([]);
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

      const { data, error } = await supabase.functions.invoke('templates-list', {
        body: { workspace_id: workspaceId, kind: 'document' },
      });
      if (error) return;
      if (data?.ok && Array.isArray(data.templates)) {
        const pbs = data.templates as PlaybookRecord[];
        setPlaybooks(pbs);
        
        if (!didInitializeRecommendedPlaybook && !selectedPlaybookId && pbs.length > 0) {
          const recommendedPlaybook = resolveRecommendedPlaybook(pbs, {
            documentType: documentRow?.document_type || 'contract',
            title: documentRow?.title,
            originalFilename: documentRow?.original_filename,
            recommendedTemplateIds,
          });
          if (recommendedPlaybook) {
            setSelectedPlaybookId(recommendedPlaybook.id);
            setSelectedPlaybookVersionId(recommendedPlaybook.current_version?.id || recommendedPlaybook.current_version_id || '');
          }
          setDidInitializeRecommendedPlaybook(true);
        }
      }
    } catch {
      // Best-effort: ignore and fall back to default analysis
    }
  }

  useEffect(() => {
    if (!documentRow || playbooks.length === 0 || didInitializeRecommendedPlaybook || selectedPlaybookId) return;

    const recommendedPlaybook = resolvedRecommendedPlaybook;
    if (recommendedPlaybook) {
      setSelectedPlaybookId(recommendedPlaybook.id);
      setSelectedPlaybookVersionId(recommendedPlaybook.current_version?.id || recommendedPlaybook.current_version_id || '');
    }
    setDidInitializeRecommendedPlaybook(true);
  }, [didInitializeRecommendedPlaybook, documentRow, playbooks, resolvedRecommendedPlaybook, selectedPlaybookId]);

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
      setRememberedSourceRunId(null);
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

  function clearRememberedRelatedDocuments() {
    setRememberedSourceRunId(null);
  }

  function addDocumentToDocset(docId: string) {
    clearRememberedRelatedDocuments();
    setDocsetMembers((prev) => {
      if (prev.some((m) => m.document_id === docId)) return prev;
      const role = docId === docsetPrimaryDocumentId ? 'primary' : 'other';
      return [...prev, { document_id: docId, role, sort_order: prev.length }];
    });
  }

  function removeDocumentFromDocset(docId: string) {
    clearRememberedRelatedDocuments();
    setDocsetMembers((prev) =>
      prev
        .filter((m) => m.document_id !== docId)
        .map((m, idx) => ({ ...m, sort_order: idx }))
    );
  }

  function moveDocsetMember(docId: string, direction: 'up' | 'down') {
    clearRememberedRelatedDocuments();
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
    clearRememberedRelatedDocuments();
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
    if (!showSettings) {
      setDidPrefillRememberedRelatedDocs(false);
    }
  }, [showSettings]);

  useEffect(() => {
    if (!showSettings || didPrefillRememberedRelatedDocs) return;

    const remembered = selectRememberedRelatedDocuments(runs, documentId);
    if (!remembered) {
      setRememberedSourceRunId(null);
      setDidPrefillRememberedRelatedDocs(true);
      return;
    }

    setScope('bundle');
    setRememberedSourceRunId(remembered.sourceRunId);
    setDocsetPrimaryDocumentId(remembered.primaryDocumentId || documentId);
    setDocsetPrecedencePolicy(remembered.precedencePolicy);
    setDocsetMembers(
      remembered.memberRoles.map((member, idx) => ({
        document_id: member.documentId,
        role: member.role,
        sort_order: idx,
      }))
    );
    setDidPrefillRememberedRelatedDocs(true);
  }, [didPrefillRememberedRelatedDocs, documentId, runs, showSettings]);

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
    if (!docsetMembers.some((m) => m.document_id === docsetPrimaryDocumentId)) {
      issues.push(t('docset.validation.primaryDocumentRequired'));
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
      const { data, error, response } = await supabase.functions.invoke('analyze-knowledge-pack', {
        body: { workspace_id: workspaceId, document_id: documentId, kind },
      });
      if (error) {
        const json = await response?.json().catch(() => null);
        const uiErr = mapHttpError(response?.status ?? 500, json, 'analyze-knowledge-pack');
        toast.show(uiErr);
        throw new Error(uiErr.message);
      }
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
      const { data, error, response } = await supabase.functions.invoke('analyze-compliance', {
        body: { workspace_id: workspaceId, document_id: documentId },
      });
      if (error) {
        const json = await response?.json().catch(() => null);
        const uiErr = mapHttpError(response?.status ?? 500, json, 'analyze-compliance');
        toast.show(uiErr);
        throw new Error(uiErr.message);
      }
      if (!data?.ok) throw new Error(data?.message || t('errors.complianceCheckFailed'));
      await load();
      await loadRuns({ keepSelection: true });
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

      // Resolve per-run settings deterministically from explicit run controls.
      const languagePref = runLanguage === 'ar' ? 'ar' : 'en';
      const strictnessPref = runStrictness === 'strict' ? 'strict' : 'default';
      const playbook_options = {
        strictness: strictnessPref,
        language: languagePref,
      };

      if (!includeDocumentSource && selectedApiConnectionIds.length === 0) {
        setError(t('apiSources.apiOnlyNeedsSource'));
        setIsAnalyzing(false);
        return;
      }

      if (!includeDocumentSource && effectiveScope === 'bundle') {
        setError(t('apiSources.apiOnlyBundleWarning'));
        setIsAnalyzing(false);
        return;
      }

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

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...(includeDocumentSource ? { document_id: documentId } : {}),
          workspace_id: workspaceId,
          user_id: userId,
          scope_mode: analysisScopeMode,
          scope_policy: scopePolicyPayload,
          ...(comparisonPolicy !== 'none'
            ? { comparison_target: { mode: comparisonPolicy } }
            : {}),
          ...(analysisScopeMode === 'period_partitioned' && partitionKey.trim()
            ? { partition_key: partitionKey.trim() }
            : {}),
          ...(playbook_options ? { playbook_options } : {}),
          ...(shouldUseDocset
            ? {
                document_ids: docsetDocumentIds,
                member_roles: normalizedDocsetMembers,
                primary_document_id: docsetPrimaryDocumentId || documentId,
                precedence_policy: docsetPrecedencePolicy,
                docset_mode: 'ephemeral',
              }
            : {}),
          ...(selectedPlaybookId
            ? {
                playbook_id: selectedPlaybookId,
                playbook_version_id: selectedPlaybookVersionId || undefined,
              }
            : {}),
          ...(selectedApiConnectionIds.length > 0
            ? { api_connection_ids: selectedApiConnectionIds }
            : {}),
        }),
      });

      const json = await res.json().catch(() => null);

      // Handle 4xx/5xx errors (except 202)
      if (!res.ok && res.status !== 202) {
        const uiErr = mapHttpError(res.status, json, 'analyze-document');
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
              message:
                typeof output?.status_message === 'string' && output.status_message.trim()
                  ? output.status_message.trim()
                  : typeof output?.message === 'string' && output.message.trim()
                    ? output.message.trim()
                    : null,
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
              await loadLiveExperience();
              setIsAnalyzing(false);
              setShowSettings(false);
              onRunConfigured?.();
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
      await loadLiveExperience();
      setIsAnalyzing(false);
      setShowSettings(false);
      onRunConfigured?.();
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

  useEffect(() => {
    const requestedView = searchParams.get('view');
    const shouldOpenRunSetup = initialView === 'run' || requestedView === 'run';
    setShowSettings(compactRunConfig || shouldOpenRunSetup || !contract);
    if (shouldOpenRunSetup) {
      setTab('overview');
    }
  }, [compactRunConfig, contract, initialView, searchParams]);

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
      // Align report language with explicit run settings.
      const reportLanguage = runLanguage === 'ar' ? 'ar' : 'en';

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

  useEffect(() => {
    const handleNewRun = () => {
      setShowSettings(true);
      setTab('overview');
      progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleGenerateReport = () => {
      if (!contract || isGeneratingReport || isHistoricalRunSelected) return;
      void generateAndSaveReport();
    };

    const handleExportCalendar = () => {
      if (!contract || isHistoricalRunSelected) return;
      exportCalendar();
    };

    const handleFinalize = () => {
      if (!verificationObjectId || !contract || verificationObjectState === 'finalized' || isFinalizing || isHistoricalRunSelected) return;
      void finalizeVerificationObject();
    };

    const handleSelectRun = (event: Event) => {
      const customEvent = event as CustomEvent<{ runId?: string }>;
      const runId = customEvent.detail?.runId;
      if (!runId) return;
      const nextRun = runs.find((candidate) => candidate.runId === runId);
      if (nextRun) {
        void selectRun(nextRun);
      }
    };

    window.addEventListener('zohal:analysis:new-run', handleNewRun);
    window.addEventListener('zohal:analysis:generate-report', handleGenerateReport);
    window.addEventListener('zohal:analysis:export-calendar', handleExportCalendar);
    window.addEventListener('zohal:analysis:finalize', handleFinalize);
    window.addEventListener('zohal:analysis:select-run', handleSelectRun as EventListener);

    return () => {
      window.removeEventListener('zohal:analysis:new-run', handleNewRun);
      window.removeEventListener('zohal:analysis:generate-report', handleGenerateReport);
      window.removeEventListener('zohal:analysis:export-calendar', handleExportCalendar);
      window.removeEventListener('zohal:analysis:finalize', handleFinalize);
      window.removeEventListener('zohal:analysis:select-run', handleSelectRun as EventListener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, isFinalizing, isGeneratingReport, isHistoricalRunSelected, runs, verificationObjectId, verificationObjectState]);

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
          metadata: {
            source: 'document_analysis',
            source_record_type: 'obligation',
            source_record_id: String(o.id).toLowerCase(),
            page_number: o.page_number ?? null,
          },
        })
        .select('*')
        .single();
      if (taskErr) throw taskErr;

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

  async function rejectModuleItem(item: GenericModuleItem) {
    if (item.recordId) {
      await rejectItem('record', item.recordId);
      return;
    }
    await rejectItem('module', item.id);
  }

  async function addManualRisk() {
    const description = window.prompt(t('v3.addRiskPromptDescription'));
    if (!description || !description.trim()) return;
    const severity = (window.prompt(t('v3.addRiskPromptSeverity')) || 'medium').trim().toLowerCase();
    const explanation = (window.prompt(t('v3.addRiskPromptExplanation')) || '').trim();
    await applySnapshotPatches(
      [
        {
          op: 'add_risk',
          value: {
            severity,
            description: description.trim(),
            explanation: explanation || undefined,
          },
        },
      ],
      t('v3.addRiskChangeNote')
    );
  }

  async function addManualObligation() {
    const summary = window.prompt(t('v3.addObligationPromptSummary'));
    if (!summary || !summary.trim()) return;
    const obligationType = (window.prompt(t('v3.addObligationPromptType')) || 'other').trim().toLowerCase();
    const dueAt = (window.prompt(t('v3.addObligationPromptDueAt')) || '').trim();
    await applySnapshotPatches(
      [
        {
          op: 'add_obligation',
          value: {
            obligation_type: obligationType || 'other',
            summary: summary.trim(),
            due_at: dueAt || undefined,
          },
        },
      ],
      t('v3.addObligationChangeNote')
    );
  }

  async function addManualClause() {
    const text = window.prompt(t('v3.addClausePromptText'));
    if (!text || !text.trim()) return;
    const clauseType = (window.prompt(t('v3.addClausePromptType')) || 'other').trim().toLowerCase();
    const riskLevel = (window.prompt(t('v3.addClausePromptRisk')) || 'low').trim().toLowerCase();
    await applySnapshotPatches(
      [
        {
          op: 'add_clause',
          value: {
            clause_type: clauseType || 'other',
            text: text.trim(),
            risk_level: riskLevel || 'low',
          },
        },
      ],
      t('v3.addClauseChangeNote')
    );
  }

  useEffect(() => {
    load();
    loadPlaybooks();
    loadWorkspaceDocsetSources();
    loadRuns();
    loadLiveExperience();
    
    // Re-load when tab becomes visible (handles laptop sleep, tab switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Contract] Tab visible, refreshing data...');
        load();
        loadRuns({ keepSelection: true });
        loadLiveExperience();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', embedded && 'h-full')}>
      {/* Header */}
      {!embedded && (
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-surface px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/workspaces/${workspaceId}/documents/${documentId}`}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:bg-surface-alt"
            title="Close and return to PDF"
          >
            <X className="w-5 h-5 text-text-soft" />
          </Link>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
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

        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
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
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [touch-action:pan-y]',
          embedded ? 'p-3 pb-[calc(env(safe-area-inset-bottom)+12rem)]' : 'p-4'
        )}
      >
        {!compactRunConfig && (
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
                        {run.scope === 'bundle' && (
                          <Badge size="sm" variant="warning">
                            {t('runs.scopeDocset')}
                          </Badge>
                        )}
                        {run.analysisScopeMode !== 'rolling' && (
                          <Badge size="sm">
                            {t(`scopePolicy.modeBadge.${run.analysisScopeMode}` as any)}
                          </Badge>
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
                      {run.scope === 'bundle' ? t('runs.scopeDocset') : t('runs.scopeSingle')}
                      {run.partitionKey ? ` · ${run.partitionKey}` : ''}
                      {' · '}
                      {new Date(run.createdAt).toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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

        {selectedRun && (selectedRun.corpusResolution || selectedRun.playbookLabel) && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>{t('inspector.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {selectedRun.playbookLabel && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                    {t('inspector.recipe')}
                  </div>
                  <div className="mt-1 text-text">{selectedRun.playbookLabel}</div>
                </div>
              )}

              {selectedRun.corpusResolution && (
                <>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                      {t('inspector.includedSources')}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedRun.corpusResolution.documentIds.map((documentId) => {
                        const role =
                          selectedRun.corpusResolution?.memberRoles.find((member) => member.documentId === documentId)?.role ||
                          (selectedRun.corpusResolution?.primaryDocumentId === documentId ? 'primary' : 'other');
                        return (
                          <Badge key={documentId} size="sm" variant="default">
                            {workspaceDocumentTitleById.get(documentId) || documentId}
                            <span className="ml-2 text-text-soft">{role}</span>
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {selectedRun.corpusResolution.primaryDocumentId && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                        {t('inspector.primarySource')}
                      </div>
                      <div className="mt-1 text-text">
                        {workspaceDocumentTitleById.get(selectedRun.corpusResolution.primaryDocumentId) ||
                          selectedRun.corpusResolution.primaryDocumentId}
                      </div>
                    </div>
                  )}

                  {selectedRun.corpusResolution.librarySources.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                        {t('inspector.libraryReferences')}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedRun.corpusResolution.librarySources.map((source) => (
                          <Badge key={source.libraryItemId} size="sm">
                            {source.title || source.libraryItemId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
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
        ) : compactRunConfig || !contract || showSettings ? (
          <div className="space-y-4 max-w-xl mx-auto">
            {/* Show a back-to-results button when re-configuring an existing analysis */}
            {contract && showSettings && !compactRunConfig && (
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
                    <div className="rounded-scholar border border-border bg-surface p-3 space-y-3">
                      <input
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        placeholder={localizedTemplateText('search')}
                        className="w-full rounded-scholar border border-border bg-surface-alt px-3 py-2 text-sm text-text outline-none placeholder:text-text-soft"
                      />
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {(['all', 'zohal_templates', 'custom'] as TemplateFilter[]).map(
                          (filter) => (
                            <button
                              key={filter}
                              type="button"
                              onClick={() => setTemplateFilter(filter)}
                              className={cn(
                                'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                                templateFilter === filter
                                  ? 'bg-accent text-white'
                                  : 'bg-surface-alt text-text-soft hover:text-text'
                              )}
                            >
                              {templateCategoryLabel(filter)}
                            </button>
                          )
                        )}
                      </div>
                      <div className="space-y-2 max-h-72 overflow-auto pr-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlaybookId('');
                            setSelectedPlaybookVersionId('');
                          }}
                          className={cn(
                            'w-full rounded-scholar border p-3 text-left transition-colors',
                            selectedPlaybookId === ''
                              ? 'border-accent bg-accent/5'
                              : 'border-border bg-surface-alt hover:border-accent/50'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="text-xl leading-none">✨</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-text">{t('playbook.defaultRenewalPack')}</span>
                                <Badge size="sm">{localizedTemplateText('systemLabel')}</Badge>
                              </div>
                              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                                {localizedTemplateText('all')}
                              </div>
                              <p className="mt-1 text-sm text-text-soft">{localizedTemplateText('autoDescription')}</p>
                              {resolvedRecommendedPlaybook?.name ? (
                                <p className="mt-2 text-xs font-semibold text-accent">
                                  {isArabic ? 'الموصى به:' : 'Recommended:'} {resolvedRecommendedPlaybook.name}
                                </p>
                              ) : null}
                            </div>
                            {selectedPlaybookId === '' && <CheckCircle className="mt-0.5 h-4 w-4 text-accent" />}
                          </div>
                        </button>

                        {recommendedSystemPlaybook && (
                          <div className="space-y-2">
                            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                              {isArabic ? 'القالب الموصى به' : 'Recommended'}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPlaybookId(recommendedSystemPlaybook.id);
                                setSelectedPlaybookVersionId(
                                  recommendedSystemPlaybook.current_version?.id ||
                                    recommendedSystemPlaybook.current_version_id ||
                                    ''
                                );
                              }}
                              className={cn(
                                'w-full rounded-scholar border p-3 text-left transition-colors',
                                selectedPlaybookId === recommendedSystemPlaybook.id
                                  ? 'border-accent bg-accent/5'
                                  : 'border-accent bg-accent/5 hover:border-accent/50'
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <div className="text-xl leading-none">{templateEmoji(recommendedSystemPlaybook)}</div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-text">{recommendedSystemPlaybook.name}</span>
                                    <Badge size="sm">{localizedTemplateText('systemLabel')}</Badge>
                                    <Badge size="sm" variant="warning">
                                      {isArabic ? 'موصى به' : 'Recommended'}
                                    </Badge>
                                  </div>
                                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                                    {getTemplateGroupLabel(getTemplateGroup(recommendedSystemPlaybook), isArabic ? 'ar' : 'en')}
                                  </div>
                                  <p className="mt-1 text-sm text-text-soft">{templateDescription(recommendedSystemPlaybook)}</p>
                                </div>
                                {selectedPlaybookId === recommendedSystemPlaybook.id ? (
                                  <CheckCircle className="mt-0.5 h-4 w-4 text-accent" />
                                ) : null}
                              </div>
                            </button>
                          </div>
                        )}

                        {displayGroupedSystemPlaybooks.length > 0 && (
                          <div className="space-y-2">
                            {displayGroupedSystemPlaybooks.map(({ group, playbooks }) => (
                              <div key={group} className="space-y-2">
                                <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                                  {getTemplateGroupLabel(group, isArabic ? 'ar' : 'en')}
                                </div>
                                {playbooks.map((pb) => (
                                  <button
                                    key={pb.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedPlaybookId(pb.id);
                                      setSelectedPlaybookVersionId(pb.current_version?.id || pb.current_version_id || '');
                                    }}
                                    className={cn(
                                      'w-full rounded-scholar border p-3 text-left transition-colors',
                                      selectedPlaybookId === pb.id
                                        ? 'border-accent bg-accent/5'
                                        : 'border-border bg-surface-alt hover:border-accent/50'
                                    )}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="text-xl leading-none">{templateEmoji(pb)}</div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-text">{pb.name}</span>
                                          <Badge size="sm">{localizedTemplateText('systemLabel')}</Badge>
                                        </div>
                                        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                                          {getTemplateGroupLabel(getTemplateGroup(pb), isArabic ? 'ar' : 'en')}
                                        </div>
                                        <p className="mt-1 text-sm text-text-soft">{templateDescription(pb)}</p>
                                      </div>
                                      {selectedPlaybookId === pb.id ? <CheckCircle className="mt-0.5 h-4 w-4 text-accent" /> : null}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}

                        {filteredCustomPlaybooks.length > 0 && (
                          <div className="space-y-2">
                            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                              {getTemplateGroupLabel('custom', isArabic ? 'ar' : 'en')}
                            </div>
                            {filteredCustomPlaybooks.map((pb) => (
                              <button
                                key={pb.id}
                                type="button"
                                onClick={() => {
                                  setSelectedPlaybookId(pb.id);
                                  setSelectedPlaybookVersionId(pb.current_version?.id || pb.current_version_id || '');
                                }}
                                className={cn(
                                  'w-full rounded-scholar border p-3 text-left transition-colors',
                                  selectedPlaybookId === pb.id
                                    ? 'border-accent bg-accent/5'
                                    : 'border-border bg-surface-alt hover:border-accent/50'
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="text-xl leading-none">📝</div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-text">{pb.name}</div>
                                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                                      {localizedTemplateText('custom')}
                                    </div>
                                    <p className="mt-1 text-sm text-text-soft">{templateDescription(pb)}</p>
                                  </div>
                                  {selectedPlaybookId === pb.id && <CheckCircle className="mt-0.5 h-4 w-4 text-accent" />}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {recommendedSystemPlaybook === null &&
                        displayGroupedSystemPlaybooks.length === 0 &&
                        filteredCustomPlaybooks.length === 0 &&
                        normalizedTemplateSearch ? (
                          <div className="rounded-scholar border border-dashed border-border bg-surface-alt px-3 py-5 text-sm text-text-soft">
                            {noTemplateMatchText(templateSearch)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-border space-y-2">
                  <div className="text-xs font-semibold text-text-soft uppercase tracking-wider">{t('sources.title')}</div>
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
                      disabled={enforcedPlaybookScope === 'single' || !includeDocumentSource}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            clearRememberedRelatedDocuments();
                            setScope('single');
                            setDocsetPrimaryDocumentId(documentId);
                            setDocsetPrecedencePolicy('manual');
                            setDocsetMembers([{ document_id: documentId, role: 'primary', sort_order: 0 }]);
                          }}
                        >
                          {t('docset.reset')}
                        </Button>
                      </div>
                      <p className="text-xs text-text-soft">{t('docset.help')}</p>
                      {rememberedSourceRunId && (
                        <div className="rounded-scholar border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-text">
                          {t('docset.prefill')}
                        </div>
                      )}
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
                                  <Badge size="sm">{t('sources.manualBadge')}</Badge>
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
                          onChange={(e) => {
                            clearRememberedRelatedDocuments();
                            setDocsetPrimaryDocumentId(e.target.value);
                          }}
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
                          onChange={(e) => {
                            clearRememberedRelatedDocuments();
                            setDocsetPrecedencePolicy(e.target.value as 'manual' | 'primary_first' | 'latest_wins');
                          }}
                          options={[
                            { value: 'manual', label: t('docset.precedence.manual') },
                            { value: 'primary_first', label: t('docset.precedence.primaryFirst') },
                            { value: 'latest_wins', label: t('docset.precedence.latestWins') },
                          ]}
                        />
                      </div>
                    </div>

                    {docsetIssues.length > 0 && (
                      <div className="flex items-start gap-2.5 p-3 border border-accent/30 bg-accent/5 rounded-scholar">
                        <AlertTriangle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
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
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-text-soft uppercase tracking-wider">{t('scopePolicy.title')}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {([
                        ['rolling', t('scopePolicy.modeRolling')],
                        ['pinned', t('scopePolicy.modePinned')],
                        ['windowed', t('scopePolicy.modeWindowed')],
                        ['period_partitioned', t('scopePolicy.modePartitioned')],
                      ] as const).map(([value, label]) => (
                        <Button
                          key={value}
                          size="sm"
                          variant={analysisScopeMode === value ? 'primary' : 'secondary'}
                          onClick={() => setAnalysisScopeMode(value)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-text-soft">{t('scopePolicy.help')}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('scopePolicy.displayLabel')}</div>
                      <input
                        value={scopeDisplayLabel}
                        onChange={(e) => setScopeDisplayLabel(e.target.value)}
                        placeholder={normalizedScopeDisplayLabel}
                        className="w-full px-2.5 py-2 rounded-md border border-border bg-surface-alt text-sm text-text placeholder:text-text-soft/50 focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors"
                      />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('scopePolicy.anchorKind')}</div>
                      <ScholarSelect
                        value={scopeAnchorKind}
                        onChange={(e) => setScopeAnchorKind(e.target.value as ScopeAnchorKind)}
                        options={[
                          { value: 'none', label: t('scopePolicy.anchor.none') },
                          { value: 'event_time', label: t('scopePolicy.anchor.event_time') },
                          { value: 'document_time', label: t('scopePolicy.anchor.document_time') },
                          { value: 'api_fetch_time', label: t('scopePolicy.anchor.api_fetch_time') },
                          { value: 'business_day', label: t('scopePolicy.anchor.business_day') },
                        ]}
                      />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('scopePolicy.anchorField')}</div>
                      <input
                        value={scopeAnchorField}
                        onChange={(e) => setScopeAnchorField(e.target.value)}
                        placeholder={t('scopePolicy.anchorFieldPlaceholder')}
                        className="w-full px-2.5 py-2 rounded-md border border-border bg-surface-alt text-sm text-text placeholder:text-text-soft/50 focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors"
                      />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('scopePolicy.comparisonTitle')}</div>
                      <ScholarSelect
                        value={comparisonPolicy}
                        onChange={(e) => setComparisonPolicy(e.target.value as AnalysisScopeComparisonPolicy)}
                        options={[
                          { value: 'none', label: t('scopePolicy.comparison.none') },
                          { value: 'previous_run', label: t('scopePolicy.comparison.previous_run') },
                          { value: 'previous_partition', label: t('scopePolicy.comparison.previous_partition') },
                        ]}
                      />
                    </div>
                  </div>

                  {analysisScopeMode === 'windowed' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('scopePolicy.windowLookback')}</div>
                        <input
                          type="number"
                          min={1}
                          value={windowLookbackValue}
                          onChange={(e) => setWindowLookbackValue(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-md border border-border bg-surface-alt text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('scopePolicy.windowUnit')}</div>
                        <ScholarSelect
                          value={windowLookbackUnit}
                          onChange={(e) => setWindowLookbackUnit(e.target.value as typeof windowLookbackUnit)}
                          options={[
                            { value: 'hour', label: t('scopePolicy.unit.hour') },
                            { value: 'day', label: t('scopePolicy.unit.day') },
                            { value: 'week', label: t('scopePolicy.unit.week') },
                            { value: 'month', label: t('scopePolicy.unit.month') },
                            { value: 'quarter', label: t('scopePolicy.unit.quarter') },
                            { value: 'year', label: t('scopePolicy.unit.year') },
                          ]}
                        />
                      </div>
                    </div>
                  )}

                  {analysisScopeMode === 'period_partitioned' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('scopePolicy.partitionGrain')}</div>
                        <ScholarSelect
                          value={partitionGrain}
                          onChange={(e) => setPartitionGrain(e.target.value as ScopePartitionGrain)}
                          options={[
                            { value: 'day', label: t('scopePolicy.unit.day') },
                            { value: 'week', label: t('scopePolicy.unit.week') },
                            { value: 'month', label: t('scopePolicy.unit.month') },
                            { value: 'quarter', label: t('scopePolicy.unit.quarter') },
                            { value: 'year', label: t('scopePolicy.unit.year') },
                            { value: 'custom', label: t('scopePolicy.unit.custom') },
                          ]}
                        />
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('scopePolicy.partitionKey')}</div>
                        <input
                          value={partitionKey}
                          onChange={(e) => setPartitionKey(e.target.value)}
                          placeholder={t('scopePolicy.partitionKeyPlaceholder')}
                          className="w-full px-2.5 py-2 rounded-md border border-border bg-surface-alt text-sm text-text placeholder:text-text-soft/50 focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors"
                        />
                      </div>
                    </div>
                  )}

                  <div className="rounded-scholar border border-border bg-surface-alt px-3 py-3">
                    <div className="text-[11px] font-semibold text-text-soft uppercase tracking-wider">{t('scopePolicy.previewTitle')}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {runPreviewItems.map((item) => (
                        <Badge key={item} size="sm">{item}</Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border space-y-3">
                  <div className="space-y-2.5">
                    <div className="text-[11px] font-semibold text-text-soft uppercase tracking-wider">
                      {t('apiSources.title')}
                    </div>
                    <div className="rounded-scholar border border-border bg-surface-alt px-3 py-3">
                      <ScholarToggle
                        label={t('apiSources.includeDocument')}
                        caption={t('apiSources.includeDocumentCaption')}
                        checked={includeDocumentSource}
                        onCheckedChange={setIncludeDocumentSource}
                      />
                    </div>
                    {!includeDocumentSource ? (
                      <div className="rounded-scholar border border-accent/20 bg-accent/5 px-3 py-3 text-sm text-text-soft">
                        {t('apiSources.apiOnlyHint')}
                      </div>
                    ) : null}
                    {apiConnections.length === 0 ? (
                      <div className="rounded-scholar border border-dashed border-border bg-surface-alt px-3 py-4 text-sm text-text-soft">
                        <p>{t('apiSources.empty')}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/workspaces/${workspaceId}/data-sources`}
                            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-scholar border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-all duration-200 hover:border-[color:var(--button-primary-bg)] hover:bg-surface-alt"
                          >
                            {t('apiSources.manageWorkspace')}
                          </Link>
                          <Link
                            href="/integrations"
                            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-scholar px-3 py-2 text-sm font-semibold text-text-soft transition-all duration-200 hover:bg-surface-alt hover:text-text"
                          >
                            {t('apiSources.openLibrary')}
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {apiConnections.map((connection) => {
                          const selected = selectedApiConnectionIds.includes(connection.id);
                          return (
                            <button
                              key={connection.id}
                              type="button"
                              onClick={() =>
                                setSelectedApiConnectionIds((current) =>
                                  current.includes(connection.id)
                                    ? current.filter((id) => id !== connection.id)
                                    : [...current, connection.id]
                                )
                              }
                              className={cn(
                                'flex w-full items-start gap-3 rounded-scholar border px-3 py-3 text-left transition-colors',
                                selected
                                  ? 'border-accent/40 bg-accent/5'
                                  : 'border-border bg-surface-alt hover:border-accent/20'
                              )}
                            >
                              <div className={cn('mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center', selected ? 'border-accent bg-accent text-white' : 'border-border text-transparent')}>
                                <CheckCircle className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-text">{connection.name}</span>
                                  <Badge size="sm" variant="accent">
                                    {t('apiSources.attachedBadge')}
                                  </Badge>
                                  {connection.source_kind ? (
                                    <Badge size="sm">
                                      {connection.source_kind === 'finance_builtin'
                                        ? 'Finance connector'
                                        : connection.source_kind === 'mcp'
                                          ? 'MCP tool'
                                          : 'API'}
                                    </Badge>
                                  ) : null}
                                  {connection.enabled_by_default !== false ? (
                                    <Badge size="sm">{t('apiSources.defaultBadge')}</Badge>
                                  ) : null}
                                  {selected ? (
                                    <Badge size="sm">{t('sources.manualBadge')}</Badge>
                                  ) : null}
                                </div>
                                {connection.endpoint_url ? (
                                  <div className="mt-1 truncate font-mono text-xs text-text-soft">{connection.endpoint_url}</div>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Link
                            href={`/workspaces/${workspaceId}/data-sources`}
                            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-scholar border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-all duration-200 hover:border-[color:var(--button-primary-bg)] hover:bg-surface-alt"
                          >
                            {t('apiSources.manageWorkspace')}
                          </Link>
                          <Link
                            href="/integrations"
                            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-scholar px-3 py-2 text-sm font-semibold text-text-soft transition-all duration-200 hover:bg-surface-alt hover:text-text"
                          >
                            {t('apiSources.openLibrary')}
                          </Link>
                        </div>
                      </div>
                    )}
                    {runConfigError ? (
                      <div className="rounded-scholar border border-accent/20 bg-accent/5 px-3 py-3 text-sm text-text">
                        {runConfigError}
                      </div>
                    ) : null}
                  </div>

                  {(selectedPlaybookId || effectiveScope === 'bundle') && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedPlaybookId && (
                        <Badge size="sm">
                          <BookOpen className="w-3 h-3 mr-1" />
                          {playbooks.find((p) => p.id === selectedPlaybookId)?.name || t('runs.defaultLabel')}
                        </Badge>
                      )}
                      {effectiveScope === 'bundle' && (
                        <Badge size="sm" variant="warning">
                          {rememberedSourceRunId ? t('docset.remembered') : t('runs.scopeDocset')}
                        </Badge>
                      )}
                    </div>
                  )}
                  <Button
                    onClick={() => {
                      if (!isAnalyzing) analyzeOnce();
                    }}
                    variant="primary"
                    disabled={isAnalyzing || runConfigError !== null}
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
                        onChange={(e) => setRunLanguage(e.target.value as 'en' | 'ar')}
                        options={[
                          { value: 'en', label: t('runSettings.english') },
                          { value: 'ar', label: t('runSettings.arabic') },
                        ]}
                      />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-text-soft mb-1.5">{t('runSettings.strictness')}</div>
                      <ScholarSelect
                        value={runStrictness}
                        onChange={(e) => setRunStrictness(e.target.value as 'default' | 'strict')}
                        options={[
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
                    : 'bg-accent/5 border-accent/20',
                )}>
                  <ShieldAlert className={cn(
                    'w-5 h-5 flex-shrink-0 mt-0.5',
                    snapshot.pack.exceptions_summary.blocker > 0 ? 'text-error' : 'text-accent',
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
                        : 'text-accent bg-accent/10 hover:bg-accent/20 border border-accent/20',
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

            <Card>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-text">{t('liveExperience.title')}</div>
                    <p className="mt-1 text-sm text-text-soft">
                      {liveExperience?.experience_lane === 'private_live'
                        ? t('liveExperience.privateDescription')
                        : t('liveExperience.publicDescription')}
                    </p>
                  </div>
                  {liveExperience?.experience_lane === 'private_live' ? (
                    <Badge size="sm" variant="warning">{t('liveExperience.privateBadge')}</Badge>
                  ) : liveExperience ? (
                    <Badge size="sm">{t('liveExperience.liveBadge')}</Badge>
                  ) : null}
                </div>

                {liveExperience ? (
                  <>
                    <div className="rounded-scholar border border-border bg-surface-alt p-3 text-sm">
                      <div className="text-text-soft">{t('liveExperience.canonicalPath')}</div>
                      <div className="mt-1 break-all font-medium text-text">
                        {liveExperience.public_url || t('liveExperience.preparing')}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        size="sm"
                        onClick={() => void openLiveExperience()}
                        isLoading={isOpeningLiveExperience}
                      >
                        <Globe2 className="h-4 w-4" />
                        {liveExperience.experience_lane === 'private_live'
                          ? t('liveExperience.openPrivate')
                          : t('liveExperience.openLive')}
                      </Button>
                      <p className="text-xs text-text-soft">
                        {liveExperience.experience_lane === 'private_live'
                          ? t('liveExperience.privateHint')
                          : t('liveExperience.publicHint')}
                      </p>
                    </div>
                  </>
                ) : isLoadingLiveExperience ? (
                  <div className="flex items-center gap-2 text-sm text-text-soft">
                    <Spinner size="sm" />
                    {t('liveExperience.loading')}
                  </div>
                ) : (
                  <div className="rounded-scholar border border-dashed border-border bg-surface-alt px-3 py-4 text-sm text-text-soft">
                    {t('liveExperience.empty')}
                  </div>
                )}

                {liveExperienceError ? (
                  <div className="text-sm text-error">{liveExperienceError}</div>
                ) : null}
              </CardContent>
            </Card>

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
              summaryRenderer === 'contract' ? (
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
              ) : summaryRenderer === 'renewal' ? (
                <RenewalSummaryTab
                  title={templateTitle}
                  subtitle={t('summary.renewalSubtitle')}
                  metrics={renewalSummaryMetrics}
                  sections={summarySections}
                  nextAction={renewalNextAction}
                  onCreatePinnedContext={createPinnedContextSetFromThisDocument}
                  onGenerateKnowledgePack={generateKnowledgePackForThisDocument}
                  onRunCompliance={runComplianceChecks}
                  isGeneratingKnowledgePack={isGeneratingKnowledgePack}
                  isRunningCompliance={isRunningCompliance}
                />
              ) : summaryRenderer === 'invoice' ? (
                <InvoiceSummaryTab
                  title={templateTitle}
                  subtitle={t('summary.invoiceSubtitle')}
                  metrics={invoiceSummaryMetrics}
                  sections={summarySections}
                  onCreatePinnedContext={createPinnedContextSetFromThisDocument}
                  onGenerateKnowledgePack={generateKnowledgePackForThisDocument}
                  onRunCompliance={runComplianceChecks}
                  isGeneratingKnowledgePack={isGeneratingKnowledgePack}
                  isRunningCompliance={isRunningCompliance}
                />
              ) : (
                <GenericSummaryTab
                  title={templateTitle}
                  subtitle={t('summary.genericSubtitle')}
                  metrics={genericSummaryMetrics}
                  sections={summarySections}
                  onCreatePinnedContext={createPinnedContextSetFromThisDocument}
                  onGenerateKnowledgePack={generateKnowledgePackForThisDocument}
                  onRunCompliance={runComplianceChecks}
                  isGeneratingKnowledgePack={isGeneratingKnowledgePack}
                  isRunningCompliance={isRunningCompliance}
                />
              )
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
                          v.verifier.status === 'green' ? 'bg-success' : v.verifier.status === 'red' ? 'bg-error' : 'bg-accent'
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
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-text-soft">{t('empty.noClausesDescription')}</p>
                  <Button size="sm" onClick={addManualClause} disabled={isPatchReadOnly || isPatchingSnapshot}>
                    {t('v3.addClause')}
                  </Button>
                </div>
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
                          iconColor: c.risk_level === 'high' ? 'text-error' : c.risk_level === 'medium' ? 'text-accent' : c.risk_level === 'low' ? 'text-success' : 'text-text-soft',
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
                          iconColor: c.risk_level === 'high' ? 'text-error' : c.risk_level === 'medium' ? 'text-accent' : c.risk_level === 'low' ? 'text-success' : 'text-text-soft',
                        }));
                    return allClauses.filter((c) => !rejectedSets.clauses.has(c.id)) as GenericModuleItem[];
                  })()}
                />
              </div>
            )}

            {tab === 'obligations' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-text-soft">{t('empty.noObligationsDescription')}</p>
                  <Button size="sm" onClick={addManualObligation} disabled={isPatchReadOnly || isPatchingSnapshot}>
                    {t('v3.addObligation')}
                  </Button>
                </div>
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
              </div>
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
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-text-soft">{t('empty.noRisksDescription')}</p>
                  <Button size="sm" onClick={addManualRisk} disabled={isPatchReadOnly || isPatchingSnapshot}>
                    {t('v3.addRisk')}
                  </Button>
                </div>
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
                        iconColor: r.severity === 'critical' || r.severity === 'high' ? 'text-error' : r.severity === 'medium' ? 'text-accent' : r.severity === 'low' ? 'text-success' : 'text-text-soft',
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
                        iconColor: r.severity === 'critical' || r.severity === 'high' ? 'text-error' : r.severity === 'medium' ? 'text-accent' : r.severity === 'low' ? 'text-success' : 'text-text-soft',
                      }));
                  return allRisks.filter((r) => !rejectedSets.risks.has(r.id)) as GenericModuleItem[];
                  })()}
                />
              </div>
            )}

            {tab === 'records' && (
              <GenericModuleTab
                moduleId="records"
                moduleTitle={t('tabs.records')}
                emptyTitle={t('v3.noRecordsTitle')}
                emptyDescription={t('v3.noRecordsDescription')}
                workspaceId={workspaceId}
                documentId={documentId}
                groupBy="groupKey"
                onReject={(id) => rejectItem('record', id)}
                isPatchingSnapshot={isPatchReadOnly}
                items={recordItems}
              />
            )}

            {tab === 'verdicts' && (
              <div className="space-y-3">
                {visibleVerdicts.length === 0 ? (
                  <EmptyState title={t('v3.noVerdictsTitle')} description={t('v3.noVerdictsDescription')} />
                ) : (
                  visibleVerdicts.map((v, idx) => {
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
                {visibleExceptions.length === 0 ? (
                  <EmptyState title={t('v3.noExceptionsTitle')} description={t('v3.noExceptionsDescription')} />
                ) : (
                  visibleExceptions.map((ex, idx) => {
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

            {tab.startsWith('module:') && (() => {
              const moduleId = tab.slice('module:'.length);
              const descriptor = moduleDescriptorById.get(moduleId);
              const items = moduleItemsById.get(moduleId) || [];
              const handleReject = (itemId: string) => {
                const item = items.find((candidate) => candidate.id === itemId);
                if (!item) {
                  void rejectItem('module', itemId);
                  return;
                }
                void rejectModuleItem(item);
              };
              const emptyTitle = t('summary.moduleEmptyTitle', { module: descriptor?.title || moduleId });
              const emptyDescription = descriptor?.hasOutput
                ? t('summary.moduleEmptyDescription', { module: descriptor?.title || moduleId })
                : t('summary.moduleMissingDescription', { module: descriptor?.title || moduleId });

              if (!descriptor) {
                return (
                  <EmptyState title={t('summary.missingModuleTitle')} description={t('summary.missingModuleDescription')} />
                );
              }

              switch (descriptor.renderer) {
                case 'renewal_actions':
                  return (
                    <RenewalActionsTab
                      items={items}
                      emptyTitle={emptyTitle}
                      emptyDescription={emptyDescription}
                      workspaceId={workspaceId}
                      documentId={documentId}
                      onReject={handleReject}
                      isPatchingSnapshot={isPatchReadOnly}
                    />
                  );
                case 'amendment_conflicts':
                  return (
                    <AmendmentConflictTab
                      items={items}
                      emptyTitle={emptyTitle}
                      emptyDescription={emptyDescription}
                      workspaceId={workspaceId}
                      documentId={documentId}
                      onReject={handleReject}
                      isPatchingSnapshot={isPatchReadOnly}
                    />
                  );
                case 'compliance_deviations':
                  return (
                    <ComplianceDeviationsTab
                      items={items}
                      emptyTitle={emptyTitle}
                      emptyDescription={emptyDescription}
                      workspaceId={workspaceId}
                      documentId={documentId}
                      onReject={handleReject}
                      isPatchingSnapshot={isPatchReadOnly}
                      verdictCount={visibleVerdicts.length}
                      exceptionCount={visibleExceptions.length}
                    />
                  );
                case 'invoice_exceptions':
                  return (
                    <InvoiceExceptionsTab
                      items={items}
                      emptyTitle={emptyTitle}
                      emptyDescription={emptyDescription}
                      workspaceId={workspaceId}
                      documentId={documentId}
                      onReject={handleReject}
                      isPatchingSnapshot={isPatchReadOnly}
                    />
                  );
                case 'obligation_dependencies':
                  return (
                    <ObligationDependenciesTab
                      items={items}
                      emptyTitle={emptyTitle}
                      emptyDescription={emptyDescription}
                      workspaceId={workspaceId}
                      documentId={documentId}
                      onReject={handleReject}
                      isPatchingSnapshot={isPatchReadOnly}
                    />
                  );
                case 'vendor_onboarding_checks':
                  return (
                    <VendorOnboardingChecksTab
                      items={items}
                      emptyTitle={emptyTitle}
                      emptyDescription={emptyDescription}
                      workspaceId={workspaceId}
                      documentId={documentId}
                      onReject={handleReject}
                      isPatchingSnapshot={isPatchReadOnly}
                    />
                  );
                case 'lease_conflicts':
                  return (
                    <LeaseConflictsTab
                      items={items}
                      emptyTitle={emptyTitle}
                      emptyDescription={emptyDescription}
                      workspaceId={workspaceId}
                      documentId={documentId}
                      onReject={handleReject}
                      isPatchingSnapshot={isPatchReadOnly}
                    />
                  );
                case 'coverage_gaps':
                  return (
                    <CoverageGapsTab
                      items={items}
                      emptyTitle={emptyTitle}
                      emptyDescription={emptyDescription}
                      workspaceId={workspaceId}
                      documentId={documentId}
                      onReject={handleReject}
                      isPatchingSnapshot={isPatchReadOnly}
                    />
                  );
                case 'policy_conformance':
                  return (
                    <PolicyConformanceTab
                      items={items}
                      emptyTitle={emptyTitle}
                      emptyDescription={emptyDescription}
                      workspaceId={workspaceId}
                      documentId={documentId}
                      onReject={handleReject}
                      isPatchingSnapshot={isPatchReadOnly}
                    />
                  );
                default:
                  return (
                    <GenericModuleTab
                      moduleId={moduleId}
                      moduleTitle={descriptor.title}
                      workspaceId={workspaceId}
                      documentId={documentId}
                      onReject={handleReject}
                      isModuleRejected={rejectedSets.modules.has(moduleId)}
                      onRestoreModule={() => restoreItem('module', moduleId)}
                      isPatchingSnapshot={isPatchReadOnly}
                      emptyTitle={emptyTitle}
                      emptyDescription={emptyDescription}
                      items={items}
                      groupBy="groupKey"
                    />
                  );
              }
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
                if (stage.includes('reduce')) return 93;
                if (stage.includes('module')) return 96;
                if (stage.includes('verify')) return 97;
                if (stage.includes('save') || stage.includes('final')) return 99;
                // Default: batch progress (0..90)
                return Math.round(frac * 90);
              })()}
              statusMessage={(() => {
                const explicitMessage = progressDetail?.message?.trim();
                if (explicitMessage) return explicitMessage;
                const stage = progressDetail?.stage || '';
                const total = progressDetail?.total || 0;
                const completed = progressDetail?.completed || 0;
                const percent = (() => {
                  const st = String(stage || 'starting').toLowerCase();
                  const t0 = Number(total || 0);
                  const c0 = Number(completed || 0);
                  const frac = t0 > 0 ? Math.max(0, Math.min(1, c0 / t0)) : 0;
                  if (st.includes('queue') || st === 'starting' || st === 'queued') return 3;
                  if (st.includes('reduce')) return 93;
                  if (st.includes('module')) return 96;
                  if (st.includes('verify')) return 97;
                  if (st.includes('save') || st.includes('final')) return 99;
                  return Math.round(frac * 90);
                })();

                const st = String(stage).toLowerCase();
                if (st.includes('queue') || st === 'starting' || st === 'queued') {
                  return t('progress.status.queued', { percent });
                }
                if (st.includes('verify')) {
                  return t('progress.status.verifying', { percent });
                }
                if (st.includes('module')) {
                  return t('progress.status.reducing', { percent });
                }
                if (st.includes('reduce')) {
                  return t('progress.status.reducing', { percent });
                }
                if (st.includes('save') || st.includes('final')) {
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
    </div>
  );
}
