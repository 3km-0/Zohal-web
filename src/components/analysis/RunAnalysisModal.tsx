'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { X, Play, Layers, FileText, CheckCircle } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Spinner, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { resolveRecommendedPlaybook, supportsStructuredAnalysis } from '@/lib/document-analysis';
import { getTemplateDescription, getTemplateEmoji, getTemplateGroup, getTemplateGroupLabel, groupSystemPlaybooks } from '@/lib/template-library';

type PlaybookScope = 'single' | 'bundle' | 'either';
type BundleSchemaRole = { role: string; required: boolean; multiple: boolean };
type TemplateFilter = 'all' | 'contract_operations' | 'finance_operations' | 'adjacent_domains' | 'variants' | 'custom';

type PlaybookRecord = {
  id: string;
  name: string;
  is_system_preset?: boolean;
  current_version_id?: string | null;
  current_version?: { id: string; version_number: number; spec_json?: any } | null;
};

type DocumentBundleRow = {
  id: string;
  name: string | null;
  precedence_policy: string;
  primary_document_id: string | null;
  updated_at: string | null;
};

type Scope = 'single' | 'bundle';

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
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>('');
  const [selectedPlaybookVersionId, setSelectedPlaybookVersionId] = useState<string>('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  const [didInitializeRecommendedPlaybook, setDidInitializeRecommendedPlaybook] = useState(false);
  const [documentMetadata, setDocumentMetadata] = useState<{ title: string | null; original_filename: string | null; document_type: string | null; source_metadata?: any } | null>(null);

  const [scope, setScope] = useState<Scope>('single');
  const [bundles, setBundles] = useState<DocumentBundleRow[]>([]);
  const [selectedBundleId, setSelectedBundleId] = useState<string>(''); // pack_id for bundle packs
  const [bundleMemberIssues, setBundleMemberIssues] = useState<string[]>([]);

  const [creatingBundle, setCreatingBundle] = useState(false);
  const [newBundleName, setNewBundleName] = useState('');

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

  const loadBundles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('packs')
        .select('id,name,precedence_policy,primary_document_id,updated_at')
        .eq('workspace_id', workspaceId)
        .eq('pack_type', 'bundle')
        .order('updated_at', { ascending: false });
      if (error) return;
      setBundles((data || []) as DocumentBundleRow[]);
    } catch {
      // Best-effort
    }
  }, [supabase, workspaceId]);

  useEffect(() => {
    if (!open) return;
    // Reset transient state each time we open.
    setScope('single');
    setSelectedBundleId('');
    setNewBundleName('');
    setCreatingBundle(false);
    setTemplateSearch('');
    setTemplateFilter('all');
    setSelectedPlaybookId('');
    setSelectedPlaybookVersionId('');
    setDidInitializeRecommendedPlaybook(false);
    void loadPlaybooks();
    void loadBundles();

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
  }, [open, loadPlaybooks, loadBundles, supabase, documentId]);

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

    const recommendedPlaybook = resolvedRecommendedPlaybook;
    if (recommendedPlaybook) {
      setSelectedPlaybookId(recommendedPlaybook.id);
      setSelectedPlaybookVersionId(recommendedPlaybook.current_version?.id || recommendedPlaybook.current_version_id || '');
    }
    setDidInitializeRecommendedPlaybook(true);
  }, [didInitializeRecommendedPlaybook, open, playbooks, resolvedRecommendedPlaybook, selectedPlaybookId]);

  const selectedPlaybook = useMemo(() => {
    if (!selectedPlaybookId) return null;
    return playbooks.find((p) => p.id === selectedPlaybookId) || null;
  }, [playbooks, selectedPlaybookId]);

  const localizedTemplateText = useCallback(
    (
      key:
        | 'all'
        | 'contract_operations'
        | 'finance_operations'
        | 'adjacent_domains'
        | 'variants'
        | 'custom'
        | 'systemLabel'
        | 'search'
        | 'autoDescription'
        | 'customTemplate',
      version?: number
    ) => {
      const ar = {
        all: 'الكل',
        contract_operations: 'عمليات العقود',
        finance_operations: 'المالية والعمليات',
        adjacent_domains: 'مجالات مجاورة',
        variants: 'النسخ المتخصصة',
        custom: 'مخصص',
        systemLabel: 'من زحل',
        search: 'ابحث في القوالب…',
        autoDescription: 'يختار زحل القالب الأنسب لمستندك.',
        customTemplate: version ? `قالب مخصص • v${version}` : 'قالب مخصص',
      } as const;
      const en = {
        all: 'All',
        contract_operations: 'Contract Ops',
        finance_operations: 'Finance Ops',
        adjacent_domains: 'Adjacent',
        variants: 'Variants',
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
        case 'contract_operations':
          return localizedTemplateText('contract_operations');
        case 'finance_operations':
          return localizedTemplateText('finance_operations');
        case 'adjacent_domains':
          return localizedTemplateText('adjacent_domains');
        case 'variants':
          return localizedTemplateText('variants');
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
    return raw && typeof raw === 'object' ? raw : null;
  }, [selectedPlaybook]);

  const enforcedScope = useMemo<PlaybookScope>(() => {
    const s = String(selectedPlaybookSpec?.scope || '').trim();
    if (s === 'single' || s === 'bundle' || s === 'either') return s;
    return 'either';
  }, [selectedPlaybookSpec]);

  const bundleSchemaRoles = useMemo<BundleSchemaRole[]>(() => {
    const roles = selectedPlaybookSpec?.bundle_schema?.roles;
    if (!Array.isArray(roles)) return [];
    return roles
      .map((r: any) => ({
        role: String(r?.role || '').trim(),
        required: r?.required === true,
        multiple: r?.multiple === true,
      }))
      .filter((r: any) => !!r.role);
  }, [selectedPlaybookSpec]);

  const effectiveScope: Scope = useMemo(() => {
    if (enforcedScope === 'bundle') return 'bundle';
    if (enforcedScope === 'single') return 'single';
    return scope;
  }, [enforcedScope, scope]);

  useEffect(() => {
    // Default to the playbook's current version if present.
    if (!selectedPlaybook) {
      setSelectedPlaybookVersionId('');
      return;
    }
    const v = selectedPlaybook.current_version?.id || selectedPlaybook.current_version_id || '';
    setSelectedPlaybookVersionId(v || '');
  }, [selectedPlaybook]);

  useEffect(() => {
    // Enforce playbook scope constraints in the UI (non-breaking; only constrains when playbook asks).
    if (enforcedScope === 'bundle') setScope('bundle');
    if (enforcedScope === 'single') setScope('single');
  }, [enforcedScope]);

  // Validate bundle membership/roles when required.
  useEffect(() => {
    let cancelled = false;
    async function validateBundle() {
      if (!open) return;
      if (!supportsTemplateRun) return;
      if (effectiveScope !== 'bundle') {
        setBundleMemberIssues([]);
        return;
      }
      if (!selectedBundleId) {
        setBundleMemberIssues([t('bundle.issues.selectBundle')]);
        return;
      }

      const issues: string[] = [];
      try {
        const { data: members, error: memErr } = await supabase
          .from('pack_members')
          .select('document_id, role')
          .eq('pack_id', selectedBundleId);
        if (memErr) throw memErr;
        const rows = Array.isArray(members) ? (members as any[]) : [];

        const docIds = new Set(rows.map((m) => String(m?.document_id || '').toLowerCase()).filter(Boolean));
        if (!docIds.has(String(documentId).toLowerCase())) {
          issues.push(t('bundle.issues.currentDocNotMember'));
        }

        const counts: Record<string, number> = {};
        for (const r of rows) {
          const role = String(r?.role || '').trim().toLowerCase();
          if (!role) continue;
          counts[role] = (counts[role] || 0) + 1;
        }

        for (const def of bundleSchemaRoles) {
          const key = def.role.trim().toLowerCase();
          const n = counts[key] || 0;
          if (def.required && n === 0) issues.push(t('bundle.issues.missingRequiredRole', { role: def.role }));
          if (!def.multiple && n > 1) issues.push(t('bundle.issues.roleMustBeUnique', { role: def.role }));
        }
      } catch {
        issues.push('Could not validate pack members. You can still run single-document analysis.');
      }

      if (!cancelled) setBundleMemberIssues(issues);
    }
    void validateBundle();
    return () => {
      cancelled = true;
    };
  }, [open, supabase, supportsTemplateRun, effectiveScope, selectedBundleId, documentId, bundleSchemaRoles, t]);

  const createBundle = useCallback(async () => {
    setCreatingBundle(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userRes.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const { data: b, error: bErr } = await supabase
        .from('packs')
        .insert({
          workspace_id: workspaceId,
          name: newBundleName.trim() || null,
          pack_type: 'bundle',
          precedence_policy: 'manual',
          primary_document_id: documentId,
          created_by: userId,
        })
        .select('id')
        .single();
      if (bErr) throw bErr;

      // Add current doc as a member (best-effort; ignore conflict).
      await supabase.from('pack_members').upsert(
        {
          pack_id: b.id,
          document_id: documentId,
          role: 'master',
          sort_order: 0,
          added_by: userId,
        },
        { onConflict: 'pack_id,document_id' }
      );

      await loadBundles();
      setSelectedBundleId(String(b.id));
      setScope('bundle');
    } catch {
      // Best-effort: keep UI usable even if bundle creation fails
    } finally {
      setCreatingBundle(false);
    }
  }, [supabase, workspaceId, documentId, newBundleName, loadBundles]);

  const run = useCallback(async () => {
    if (!supportsTemplateRun) {
      onOpenAITools?.();
      onClose();
      return;
    }

    // Navigate to contract analysis with autorun config (keeps one execution path).
    const params = new URLSearchParams();
    params.set('autorun', '1');
    if (selectedPlaybookId) params.set('playbook_id', selectedPlaybookId);
    if (selectedPlaybookVersionId) params.set('playbook_version_id', selectedPlaybookVersionId);
    if (effectiveScope === 'bundle' && selectedBundleId) params.set('pack_id', selectedBundleId);

    onClose();
    router.push(`/workspaces/${workspaceId}/documents/${documentId}/contract-analysis?${params.toString()}`);
  }, [
    supportsTemplateRun,
    onOpenAITools,
    onClose,
    router,
    workspaceId,
    documentId,
    selectedPlaybookId,
    selectedPlaybookVersionId,
    effectiveScope,
    selectedBundleId,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Card className="w-full max-w-2xl">
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
              <p className="text-sm text-text-soft">
                {t('templatesComingSoon')}
              </p>
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
                      {(['all', 'contract_operations', 'finance_operations', 'adjacent_domains', 'variants', 'custom'] as TemplateFilter[]).map(
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
                              <p className="mt-2 text-xs font-semibold text-highlight">
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
                              'w-full rounded-xl border p-3 text-left transition-colors',
                              selectedPlaybookId === recommendedSystemPlaybook.id
                                ? 'border-accent bg-accent/5'
                                : 'border-highlight bg-highlight/5 hover:border-accent/40'
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

                      {displayGroupedSystemPlaybooks.length > 0 && (
                        <div className="space-y-2">
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
                        </div>
                      )}

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
                      {t('scope.bundle')}
                    </Button>
                  </div>
                  <div className="text-xs text-text-soft">
                    {t('scope.help')}
                  </div>
                </div>
              </div>

              {enforcedScope !== 'either' ? (
                <div className="text-xs text-text-soft">
                  {t('scope.enforced')}: <span className="font-semibold">{enforcedScope}</span>.
                </div>
              ) : null}

              {effectiveScope === 'bundle' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-text">{t('bundle.label')}</div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={newBundleName}
                        onChange={(e) => setNewBundleName(e.target.value)}
                        placeholder={t('bundle.newNamePlaceholder')}
                      />
                      <Button variant="secondary" size="sm" onClick={createBundle} disabled={creatingBundle}>
                        {creatingBundle ? <Spinner size="sm" /> : t('bundle.create')}
                      </Button>
                    </div>
                  </div>

                  <select
                    className="w-full px-3 py-2 rounded-lg bg-surface-alt border border-border text-sm"
                    value={selectedBundleId}
                    onChange={(e) => setSelectedBundleId(e.target.value)}
                  >
                    <option value="">{t('bundle.select')}</option>
                    {bundles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name || `Bundle ${b.id.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-text-soft">
                    {t('bundle.fallbackHint')}
                  </div>
                </div>
              ) : null}

              {effectiveScope === 'bundle' && bundleMemberIssues.length > 0 ? (
                <div className="rounded-lg border border-border bg-surface-alt p-3">
                  <div className="text-sm font-semibold text-text">{t('bundle.requirementsTitle')}</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-text-soft">
                    {bundleMemberIssues.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={onClose}>
                  {t('cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={run}
                  disabled={loading || (effectiveScope === 'bundle' && bundleMemberIssues.length > 0)}
                >
                  <Play className="w-4 h-4" />
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
