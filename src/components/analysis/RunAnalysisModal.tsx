'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { X, Play, Layers, FileText, CheckCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Spinner, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { resolveRecommendedPlaybook, supportsStructuredAnalysis } from '@/lib/document-analysis';
import { selectRememberedRelatedDocuments, toAnalysisRunSummary } from '@/lib/analysis/runs';
import { getTemplateDescription, getTemplateEmoji, getTemplateGroup, getTemplateGroupLabel, groupSystemPlaybooks } from '@/lib/template-library';
import type { BundleSchemaRole, PlaybookRecord, PlaybookScope, TemplateFilter, TemplateSpecV1 } from '@/types/templates';

type Scope = 'single' | 'bundle';

type RelatedDocument = {
  id: string;
  title: string;
};

type RelatedDocsetMember = {
  document_id: string;
  role: string;
  sort_order: number;
};

export function RunAnalysisModal(props: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  documentId: string;
  documentType: string | null;
  onOpenAITools?: () => void;
}) {
  const { open, onClose, workspaceId, documentId, documentType, onOpenAITools } = props;
  const t = useTranslations('runAnalysis');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isArabic = locale === 'ar';

  const supportsTemplateRun = supportsStructuredAnalysis(documentType);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>('');
  const [selectedPlaybookVersionId, setSelectedPlaybookVersionId] = useState<string>('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  const [didInitializeRecommendedPlaybook, setDidInitializeRecommendedPlaybook] = useState(false);
  const [documentMetadata, setDocumentMetadata] = useState<{ title: string | null; original_filename: string | null; document_type: string | null; source_metadata?: any } | null>(null);

  const [scope, setScope] = useState<Scope>('single');
  const [workspaceDocuments, setWorkspaceDocuments] = useState<RelatedDocument[]>([]);
  const [docsetSearch, setDocsetSearch] = useState('');
  const [docsetMembers, setDocsetMembers] = useState<RelatedDocsetMember[]>([{ document_id: documentId, role: 'primary', sort_order: 0 }]);
  const [docsetPrimaryDocumentId, setDocsetPrimaryDocumentId] = useState(documentId);
  const [docsetPrecedencePolicy, setDocsetPrecedencePolicy] = useState<'manual' | 'primary_first' | 'latest_wins'>('manual');
  const [relatedDocumentIssues, setRelatedDocumentIssues] = useState<string[]>([]);
  const [rememberedSourceRunId, setRememberedSourceRunId] = useState<string | null>(null);

  const loadPlaybooks = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('playbooks-list', {
        body: { workspace_id: workspaceId, kind: 'contract' },
      });
      if (error) return;
      if (data?.ok && Array.isArray(data.playbooks)) {
        setPlaybooks(data.playbooks as PlaybookRecord[]);
      }
    } catch {
      // Best-effort: ignore and fall back to default analysis
    }
  }, [supabase, workspaceId]);

  const loadWorkspaceDocuments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id,title,storage_path')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .neq('storage_path', 'local')
        .order('updated_at', { ascending: false });
      if (error) return;

      const docs = ((data || []) as any[]).map((doc) => ({
        id: String(doc.id),
        title: String(doc.title || doc.id),
      }));
      if (!docs.some((doc) => doc.id === documentId)) {
        docs.unshift({ id: documentId, title: documentMetadata?.title || 'Current document' });
      }
      setWorkspaceDocuments(docs);
    } catch {
      // Best-effort
    }
  }, [documentId, documentMetadata?.title, supabase, workspaceId]);

  const loadRememberedRelatedDocuments = useCallback(async () => {
    try {
      const { data: runs, error } = await supabase
        .from('extraction_runs')
        .select('id,status,created_at,updated_at,input_config,output_summary,extraction_type,document_id,workspace_id,user_id,completed_at,error,model,prompt_version,started_at')
        .eq('workspace_id', workspaceId)
        .eq('document_id', documentId)
        .in('extraction_type', ['contract_analysis', 'document_analysis'])
        .order('created_at', { ascending: false })
        .limit(20);
      if (error || !runs) return;

      const summaries = (runs as any[]).map((run) => toAnalysisRunSummary(run));
      const remembered = selectRememberedRelatedDocuments(summaries, documentId);
      if (!remembered) return;

      setScope('bundle');
      setRememberedSourceRunId(remembered.sourceRunId);
      setDocsetPrimaryDocumentId(remembered.primaryDocumentId || documentId);
      setDocsetPrecedencePolicy(remembered.precedencePolicy);
      setDocsetMembers(
        remembered.memberRoles.map((role, idx) => ({
          document_id: role.documentId,
          role: role.role,
          sort_order: idx,
        }))
      );
    } catch {
      // Best-effort
    }
  }, [documentId, supabase, workspaceId]);

  useEffect(() => {
    if (!open) return;

    setLoading(false);
    setError(null);
    setScope('single');
    setRememberedSourceRunId(null);
    setDocsetSearch('');
    setDocsetPrimaryDocumentId(documentId);
    setDocsetPrecedencePolicy('manual');
    setDocsetMembers([{ document_id: documentId, role: 'primary', sort_order: 0 }]);
    setTemplateSearch('');
    setTemplateFilter('all');
    setSelectedPlaybookId('');
    setSelectedPlaybookVersionId('');
    setDidInitializeRecommendedPlaybook(false);

    void loadPlaybooks();
    void (async () => {
      try {
        const { data } = await supabase
          .from('documents')
          .select('title, original_filename, document_type, source_metadata')
          .eq('id', documentId)
          .maybeSingle();
        setDocumentMetadata((data || null) as typeof documentMetadata);
      } catch {
        setDocumentMetadata(null);
      }
    })();
  }, [documentId, loadPlaybooks, open, supabase]);

  useEffect(() => {
    if (!open) return;
    void loadWorkspaceDocuments();
    void loadRememberedRelatedDocuments();
  }, [loadRememberedRelatedDocuments, loadWorkspaceDocuments, open]);

  const recommendedTemplateIds = useMemo(() => {
    const raw = (documentMetadata as any)?.source_metadata?.recommended_template_ids;
    if (!Array.isArray(raw)) return [] as string[];
    return raw.map((v: any) => String(v || '').trim().toLowerCase()).filter(Boolean);
  }, [documentMetadata]);

  const resolvedRecommendedPlaybook = useMemo(() => {
    if (playbooks.length === 0) return null;
    return resolveRecommendedPlaybook(playbooks, {
      documentType: documentMetadata?.document_type || documentType,
      title: documentMetadata?.title,
      originalFilename: documentMetadata?.original_filename,
      recommendedTemplateIds,
    });
  }, [documentMetadata, documentType, playbooks, recommendedTemplateIds]);

  useEffect(() => {
    if (!open || didInitializeRecommendedPlaybook || selectedPlaybookId || playbooks.length === 0) return;

    if (resolvedRecommendedPlaybook) {
      setSelectedPlaybookId(resolvedRecommendedPlaybook.id);
      setSelectedPlaybookVersionId(resolvedRecommendedPlaybook.current_version?.id || resolvedRecommendedPlaybook.current_version_id || '');
    }
    setDidInitializeRecommendedPlaybook(true);
  }, [didInitializeRecommendedPlaybook, open, playbooks, resolvedRecommendedPlaybook, selectedPlaybookId]);

  const selectedPlaybook = useMemo(() => {
    if (!selectedPlaybookId) return null;
    return playbooks.find((playbook) => playbook.id === selectedPlaybookId) || null;
  }, [playbooks, selectedPlaybookId]);

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
        zohal_templates: 'قوالب زحل',
        specializations: 'التخصصات',
        custom: 'مخصص',
        systemLabel: 'من زحل',
        search: 'ابحث في القوالب…',
        autoDescription: 'يختار زحل القالب الأنسب لمستندك.',
        customTemplate: version ? `قالب مخصص • v${version}` : 'قالب مخصص',
      } as const;
      const en = {
        all: 'All',
        zohal_templates: 'Zohal Templates',
        specializations: 'Specializations',
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

  const normalizedTemplateSearch = templateSearch.trim().toLowerCase();

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
    return filteredSystemPlaybooks.find((playbook) => playbook.id === resolvedRecommendedPlaybook.id) || null;
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

  const enforcedScope = useMemo<PlaybookScope>(() => {
    const value = String(selectedPlaybookSpec?.scope || '').trim();
    if (value === 'single' || value === 'bundle' || value === 'either') return value;
    return 'either';
  }, [selectedPlaybookSpec]);

  const bundleSchemaRoles = useMemo<BundleSchemaRole[]>(() => {
    const roles = selectedPlaybookSpec?.bundle_schema?.roles;
    if (!Array.isArray(roles)) return [];
    return roles
      .map((role: any) => ({
        role: String(role?.role || '').trim(),
        required: role?.required === true,
        multiple: role?.multiple === true,
      }))
      .filter((role: BundleSchemaRole) => !!role.role);
  }, [selectedPlaybookSpec]);

  const effectiveScope: Scope = useMemo(() => {
    if (enforcedScope === 'bundle') return 'bundle';
    if (enforcedScope === 'single') return 'single';
    return scope;
  }, [enforcedScope, scope]);

  useEffect(() => {
    if (!selectedPlaybook) {
      setSelectedPlaybookVersionId('');
      return;
    }
    const versionId = selectedPlaybook.current_version?.id || selectedPlaybook.current_version_id || '';
    setSelectedPlaybookVersionId(versionId || '');
  }, [selectedPlaybook]);

  useEffect(() => {
    if (enforcedScope === 'bundle') setScope('bundle');
    if (enforcedScope === 'single') setScope('single');
  }, [enforcedScope]);

  const roleOptions = useMemo(() => {
    const options = bundleSchemaRoles
      .map((role) => role.role.trim().toLowerCase())
      .filter(Boolean);
    if (options.length === 0) options.push('primary', 'other');

    for (const member of docsetMembers) {
      const role = member.role.trim().toLowerCase();
      if (role && !options.includes(role)) options.push(role);
    }

    return options;
  }, [bundleSchemaRoles, docsetMembers]);

  const sortedDocsetMembers = useMemo(
    () => [...docsetMembers].sort((a, b) => a.sort_order - b.sort_order),
    [docsetMembers]
  );

  const filteredWorkspaceDocuments = useMemo(() => {
    const query = docsetSearch.trim().toLowerCase();
    if (!query) return workspaceDocuments;
    return workspaceDocuments.filter((doc) => doc.title.toLowerCase().includes(query));
  }, [docsetSearch, workspaceDocuments]);

  useEffect(() => {
    if (!open || !supportsTemplateRun) return;
    if (effectiveScope !== 'bundle') {
      setRelatedDocumentIssues([]);
      return;
    }

    const issues: string[] = [];
    if (sortedDocsetMembers.length < 2) {
      issues.push(t('related.validation.minTwoDocuments'));
    }
    if (!sortedDocsetMembers.some((member) => member.document_id === documentId)) {
      issues.push(t('related.validation.currentDocumentRequired'));
    }
    if (!sortedDocsetMembers.some((member) => member.document_id === docsetPrimaryDocumentId)) {
      issues.push(t('related.validation.primaryDocumentRequired'));
    }

    const counts: Record<string, number> = {};
    for (const member of sortedDocsetMembers) {
      const role = member.role.trim().toLowerCase();
      if (!role) continue;
      counts[role] = (counts[role] || 0) + 1;
    }

    for (const role of bundleSchemaRoles) {
      const key = role.role.trim().toLowerCase();
      const count = counts[key] || 0;
      if (role.required && count === 0) issues.push(t('related.validation.missingRequiredRole', { role: role.role }));
      if (!role.multiple && count > 1) issues.push(t('related.validation.roleMustBeUnique', { role: role.role }));
    }

    setRelatedDocumentIssues(issues);
  }, [bundleSchemaRoles, docsetPrimaryDocumentId, documentId, effectiveScope, open, sortedDocsetMembers, supportsTemplateRun, t]);

  const clearRememberedRelatedDocuments = useCallback(() => {
    setRememberedSourceRunId(null);
  }, []);

  const addDocumentToDocset = useCallback((nextDocumentId: string) => {
    clearRememberedRelatedDocuments();
    setDocsetMembers((prev) => {
      if (prev.some((member) => member.document_id === nextDocumentId)) return prev;
      return [
        ...prev,
        {
          document_id: nextDocumentId,
          role: nextDocumentId === docsetPrimaryDocumentId ? 'primary' : 'other',
          sort_order: prev.length,
        },
      ];
    });
  }, [clearRememberedRelatedDocuments, docsetPrimaryDocumentId]);

  const removeDocumentFromDocset = useCallback((targetDocumentId: string) => {
    clearRememberedRelatedDocuments();
    setDocsetMembers((prev) => {
      const next = prev
        .filter((member) => member.document_id !== targetDocumentId)
        .map((member, idx) => ({ ...member, sort_order: idx }));
      if (!next.some((member) => member.document_id === docsetPrimaryDocumentId)) {
        setDocsetPrimaryDocumentId(next[0]?.document_id || documentId);
      }
      return next;
    });
  }, [clearRememberedRelatedDocuments, docsetPrimaryDocumentId, documentId]);

  const updateDocsetMemberRole = useCallback((targetDocumentId: string, role: string) => {
    clearRememberedRelatedDocuments();
    setDocsetMembers((prev) =>
      prev.map((member) =>
        member.document_id === targetDocumentId
          ? { ...member, role: role.trim().toLowerCase() || 'other' }
          : member
      )
    );
  }, [clearRememberedRelatedDocuments]);

  const moveDocsetMember = useCallback((targetDocumentId: string, direction: 'up' | 'down') => {
    clearRememberedRelatedDocuments();
    setDocsetMembers((prev) => {
      const next = [...prev].sort((a, b) => a.sort_order - b.sort_order);
      const index = next.findIndex((member) => member.document_id === targetDocumentId);
      if (index < 0) return prev;
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      const current = next[index];
      next[index] = next[swapIndex];
      next[swapIndex] = current;
      return next.map((member, idx) => ({ ...member, sort_order: idx }));
    });
  }, [clearRememberedRelatedDocuments]);

  const resetToCurrentDocument = useCallback(() => {
    clearRememberedRelatedDocuments();
    setScope('single');
    setDocsetPrimaryDocumentId(documentId);
    setDocsetPrecedencePolicy('manual');
    setDocsetMembers([{ document_id: documentId, role: 'primary', sort_order: 0 }]);
  }, [clearRememberedRelatedDocuments, documentId]);

  const run = useCallback(async () => {
    if (!supportsTemplateRun) {
      onOpenAITools?.();
      onClose();
      return;
    }

    if (effectiveScope === 'bundle' && relatedDocumentIssues.length > 0) return;

    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const normalizedMembers = effectiveScope === 'bundle'
        ? sortedDocsetMembers.map((member, idx) => ({
            document_id: member.document_id,
            role: member.role.trim().toLowerCase() || 'other',
            sort_order: idx,
          }))
        : [];

      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          document_id: documentId,
          workspace_id: workspaceId,
          user_id: userId,
          ...(selectedPlaybookId
            ? {
                playbook_id: selectedPlaybookId,
                playbook_version_id: selectedPlaybookVersionId || undefined,
              }
            : {}),
          ...(effectiveScope === 'bundle'
            ? {
                document_ids: normalizedMembers.map((member) => member.document_id),
                member_roles: normalizedMembers,
                primary_document_id: docsetPrimaryDocumentId,
                precedence_policy: docsetPrecedencePolicy,
                docset_mode: 'ephemeral',
              }
            : {}),
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok && response.status !== 202) {
        throw new Error(json?.message || t('runFailed'));
      }

      onClose();
      router.push(`/workspaces/${workspaceId}/documents/${documentId}/contract-analysis`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('runFailed'));
    } finally {
      setLoading(false);
    }
  }, [
    docsetPrecedencePolicy,
    docsetPrimaryDocumentId,
    documentId,
    effectiveScope,
    onClose,
    onOpenAITools,
    relatedDocumentIssues.length,
    router,
    selectedPlaybookId,
    selectedPlaybookVersionId,
    sortedDocsetMembers,
    supabase,
    supportsTemplateRun,
    t,
    workspaceId,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Card className="w-full max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-text-soft" />
            <CardTitle>{t('title')}</CardTitle>
            {documentType ? <Badge size="sm">{documentType}</Badge> : null}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-alt transition-colors"
            aria-label={tCommon('close')}
          >
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </CardHeader>

        <CardContent className="space-y-5">
          {!supportsTemplateRun ? (
            <div className="space-y-3">
              <p className="text-sm text-text-soft">{t('templatesComingSoon')}</p>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    onOpenAITools?.();
                    onClose();
                  }}
                >
                  {t('openAiTools')}
                </Button>
                <Button variant="secondary" onClick={onClose}>
                  {t('close')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-text">{t('playbook.label')}</div>
                  <div className="rounded-xl border border-border bg-surface p-3 space-y-3">
                    <Input
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder={localizedTemplateText('search')}
                    />
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {(['all', 'zohal_templates', 'specializations', 'custom'] as TemplateFilter[]).map((filter) => (
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
                      ))}
                    </div>
                    <div className="space-y-2 max-h-72 overflow-auto pr-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPlaybookId('');
                          setSelectedPlaybookVersionId('');
                        }}
                        className={cn(
                          'w-full rounded-xl border p-3 text-left transition-colors',
                          selectedPlaybookId === ''
                            ? 'border-accent bg-accent/5'
                            : 'border-border bg-surface-alt hover:border-accent/40'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-xl leading-none">✨</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-text">{t('playbook.default')}</span>
                              <Badge size="sm">{localizedTemplateText('systemLabel')}</Badge>
                            </div>
                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
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
                            className="w-full rounded-xl border border-accent bg-accent/5 p-3 text-left transition-colors hover:border-accent/40"
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
                                <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
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

                      {displayGroupedSystemPlaybooks.map(({ group, playbooks }) => (
                        <div key={group} className="space-y-2">
                          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                            {getTemplateGroupLabel(group, isArabic ? 'ar' : 'en')}
                          </div>
                          {playbooks.map((playbook) => (
                            <button
                              key={playbook.id}
                              type="button"
                              onClick={() => {
                                setSelectedPlaybookId(playbook.id);
                                setSelectedPlaybookVersionId(playbook.current_version?.id || playbook.current_version_id || '');
                              }}
                              className={cn(
                                'w-full rounded-xl border p-3 text-left transition-colors',
                                selectedPlaybookId === playbook.id
                                  ? 'border-accent bg-accent/5'
                                  : 'border-border bg-surface-alt hover:border-accent/40'
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <div className="text-xl leading-none">{templateEmoji(playbook)}</div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-text">{playbook.name}</span>
                                    <Badge size="sm">{localizedTemplateText('systemLabel')}</Badge>
                                  </div>
                                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
                                    {getTemplateGroupLabel(getTemplateGroup(playbook), isArabic ? 'ar' : 'en')}
                                  </div>
                                  <p className="mt-1 text-sm text-text-soft">{templateDescription(playbook)}</p>
                                </div>
                                {selectedPlaybookId === playbook.id ? <CheckCircle className="mt-0.5 h-4 w-4 text-accent" /> : null}
                              </div>
                            </button>
                          ))}
                        </div>
                      ))}

                      {filteredCustomPlaybooks.length > 0 && (
                        <div className="space-y-2">
                          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                            {getTemplateGroupLabel('custom', isArabic ? 'ar' : 'en')}
                          </div>
                          {filteredCustomPlaybooks.map((playbook) => (
                            <button
                              key={playbook.id}
                              type="button"
                              onClick={() => {
                                setSelectedPlaybookId(playbook.id);
                                setSelectedPlaybookVersionId(playbook.current_version?.id || playbook.current_version_id || '');
                              }}
                              className={cn(
                                'w-full rounded-xl border p-3 text-left transition-colors',
                                selectedPlaybookId === playbook.id
                                  ? 'border-accent bg-accent/5'
                                  : 'border-border bg-surface-alt hover:border-accent/40'
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <div className="text-xl leading-none">📝</div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-text">{playbook.name}</div>
                                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
                                    {localizedTemplateText('custom')}
                                  </div>
                                  <p className="mt-1 text-sm text-text-soft">{templateDescription(playbook)}</p>
                                </div>
                                {selectedPlaybookId === playbook.id && <CheckCircle className="mt-0.5 h-4 w-4 text-accent" />}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {recommendedSystemPlaybook === null &&
                      displayGroupedSystemPlaybooks.length === 0 &&
                      filteredCustomPlaybooks.length === 0 &&
                      normalizedTemplateSearch ? (
                        <div className="rounded-xl border border-dashed border-border bg-surface-alt px-3 py-5 text-sm text-text-soft">
                          {noTemplateMatchText(templateSearch)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-xs text-text-soft">
                    {selectedPlaybookId ? t('playbook.helperSelected') : t('playbook.helperDefault')}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-text">{t('scope.label')}</div>
                    <div className="flex gap-2">
                      <Button
                        variant={effectiveScope === 'single' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setScope('single')}
                        disabled={enforcedScope === 'bundle'}
                      >
                        {t('scope.single')}
                      </Button>
                      <Button
                        variant={effectiveScope === 'bundle' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setScope('bundle')}
                        disabled={enforcedScope === 'single'}
                      >
                        <Layers className="w-4 h-4" />
                        {t('scope.related')}
                      </Button>
                    </div>
                    <div className="text-xs text-text-soft">{t('scope.help')}</div>
                  </div>

                  {effectiveScope === 'bundle' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-text">{t('related.label')}</div>
                        <Button variant="secondary" size="sm" onClick={resetToCurrentDocument}>
                          <RotateCcw className="w-4 h-4" />
                          {t('related.reset')}
                        </Button>
                      </div>

                      {rememberedSourceRunId ? (
                        <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-text">
                          {t('related.prefill')}
                        </div>
                      ) : null}

                      <Input
                        value={docsetSearch}
                        onChange={(e) => setDocsetSearch(e.target.value)}
                        placeholder={t('related.searchPlaceholder')}
                      />

                      <div className="max-h-40 space-y-2 overflow-auto rounded-xl border border-border bg-surface p-3">
                        {filteredWorkspaceDocuments.map((doc) => {
                          const inSelection = sortedDocsetMembers.some((member) => member.document_id === doc.id);
                          return (
                            <div key={doc.id} className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-text">{doc.title}</div>
                              </div>
                              <Button
                                variant={inSelection ? 'secondary' : 'primary'}
                                size="sm"
                                onClick={() => (inSelection ? removeDocumentFromDocset(doc.id) : addDocumentToDocset(doc.id))}
                              >
                                {inSelection ? t('related.remove') : t('related.add')}
                              </Button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-text">
                          {t('related.selectedCount', { count: sortedDocsetMembers.length })}
                        </div>
                        <div className="space-y-2">
                          {sortedDocsetMembers.map((member, index) => {
                            const doc = workspaceDocuments.find((item) => item.id === member.document_id);
                            return (
                              <div key={member.document_id} className="rounded-xl border border-border bg-surface-alt p-3 space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-text">{doc?.title || member.document_id}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeDocumentFromDocset(member.document_id)}
                                    className="text-xs font-semibold text-error"
                                  >
                                    {t('related.remove')}
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={member.role}
                                    onChange={(e) => updateDocsetMemberRole(member.document_id, e.target.value)}
                                    className="min-w-[8rem] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
                                  >
                                    {roleOptions.map((role) => (
                                      <option key={role} value={role}>
                                        {role}
                                      </option>
                                    ))}
                                  </select>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={index === 0}
                                    onClick={() => moveDocsetMember(member.document_id, 'up')}
                                  >
                                    ↑
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={index === sortedDocsetMembers.length - 1}
                                    onClick={() => moveDocsetMember(member.document_id, 'down')}
                                  >
                                    ↓
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-text">{t('related.primaryDocument')}</div>
                          <select
                            value={docsetPrimaryDocumentId}
                            onChange={(e) => {
                              clearRememberedRelatedDocuments();
                              setDocsetPrimaryDocumentId(e.target.value);
                            }}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
                          >
                            {sortedDocsetMembers.map((member) => {
                              const doc = workspaceDocuments.find((item) => item.id === member.document_id);
                              return (
                                <option key={member.document_id} value={member.document_id}>
                                  {doc?.title || member.document_id}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-text">{t('related.precedencePolicy')}</div>
                          <select
                            value={docsetPrecedencePolicy}
                            onChange={(e) => {
                              clearRememberedRelatedDocuments();
                              setDocsetPrecedencePolicy(e.target.value as 'manual' | 'primary_first' | 'latest_wins');
                            }}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
                          >
                            <option value="manual">{t('related.precedence.manual')}</option>
                            <option value="primary_first">{t('related.precedence.primaryFirst')}</option>
                            <option value="latest_wins">{t('related.precedence.latestWins')}</option>
                          </select>
                        </div>
                      </div>

                      {bundleSchemaRoles.length > 0 ? (
                        <div className="rounded-xl border border-border bg-surface-alt p-4 space-y-2">
                          <div className="text-sm font-semibold text-text">{t('related.requirementsTitle')}</div>
                          <div className="flex flex-wrap gap-2">
                            {bundleSchemaRoles.map((role) => (
                              <Badge key={role.role} size="sm" variant={role.required ? 'warning' : 'default'}>
                                {role.role}
                                {role.required ? ' *' : ''}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {relatedDocumentIssues.length > 0 ? (
                        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-2">
                          <div className="flex items-center gap-2 text-sm font-semibold text-text">
                            <AlertTriangle className="h-4 w-4 text-accent" />
                            {t('related.validationTitle')}
                          </div>
                          <div className="space-y-1 text-sm text-text-soft">
                            {relatedDocumentIssues.map((issue) => (
                              <div key={issue}>{issue}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {enforcedScope !== 'either' ? (
                <div className="text-xs text-text-soft">
                  {t('scope.enforced')}: <span className="font-semibold">{enforcedScope}</span>.
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
                  {error}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={onClose}>
                  {t('cancel')}
                </Button>
                <Button onClick={run} disabled={loading || (effectiveScope === 'bundle' && relatedDocumentIssues.length > 0)}>
                  {loading ? <Spinner size="sm" /> : <Play className="w-4 h-4" />}
                  {t('run')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
