'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { X, Play, Layers, FileText } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Spinner, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

type PlaybookScope = 'single' | 'bundle' | 'either';
type BundleSchemaRole = { role: string; required: boolean; multiple: boolean };

type PlaybookRecord = {
  id: string;
  name: string;
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
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const isContract = documentType === 'contract';

  const [loading, setLoading] = useState(false);
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>('');
  const [selectedPlaybookVersionId, setSelectedPlaybookVersionId] = useState<string>('');

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
    void loadPlaybooks();
    void loadBundles();
  }, [open, loadPlaybooks, loadBundles]);

  const selectedPlaybook = useMemo(() => {
    if (!selectedPlaybookId) return null;
    return playbooks.find((p) => p.id === selectedPlaybookId) || null;
  }, [playbooks, selectedPlaybookId]);

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
      if (!isContract) return;
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
  }, [open, supabase, isContract, effectiveScope, selectedBundleId, documentId, bundleSchemaRoles, t]);

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
    if (!isContract) {
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
    isContract,
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
          {!isContract ? (
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
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-surface-alt border border-border text-sm"
                    value={selectedPlaybookId}
                    onChange={(e) => setSelectedPlaybookId(e.target.value)}
                  >
                    <option value="">{t('playbook.default')}</option>
                    {playbooks.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
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

