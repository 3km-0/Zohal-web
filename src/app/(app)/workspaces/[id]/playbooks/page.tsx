'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Save, UploadCloud } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type PlaybookSpecV1 = {
  meta: { name: string; kind: string };
  options?: { strictness?: 'default' | 'strict'; enable_verifier?: boolean; language?: 'en' | 'ar' };
  scope?: 'single' | 'bundle' | 'either';
  bundle_schema?: {
    roles?: Array<{ role: string; required: boolean; multiple: boolean }>;
    allowed_document_types?: string[];
  };
  modules?: string[];
  outputs?: string[];
  custom_modules?: Array<{
    id: string;
    title: string;
    prompt: string;
    json_schema: Record<string, unknown>;
    enabled?: boolean;
    show_in_report?: boolean;
  }>;
  variables: Array<{
    key: string;
    type: string;
    required?: boolean;
    constraints?: { min?: number; max?: number; allowed_values?: string[] };
  }>;
  checks?: Array<
    | { id: string; type: 'required'; variable_key: string; severity: 'blocker' | 'warning' }
    | {
        id: string;
        type: 'range';
        variable_key: string;
        severity: 'blocker' | 'warning';
        min?: number;
        max?: number;
      }
    | {
        id: string;
        type: 'enum';
        variable_key: string;
        severity: 'blocker' | 'warning';
        allowed_values: string[];
      }
  >;
};

type BundleRoleRow = { role: string; required: boolean; multiple: boolean };

type PlaybookRow = {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'deprecated';
  current_version_id?: string | null;
  current_version?: {
    id: string;
    version_number: number;
    spec_json: any;
    published_at?: string | null;
  } | null;
};

function normalizeSpec(input: any, fallbackName: string): PlaybookSpecV1 {
  const metaName = typeof input?.meta?.name === 'string' ? input.meta.name : fallbackName;
  const metaKind = typeof input?.meta?.kind === 'string' ? input.meta.kind : 'contract';
  const optionsRaw = input?.options && typeof input.options === 'object' ? input.options : null;
  const options: PlaybookSpecV1['options'] =
    optionsRaw
      ? {
          strictness: optionsRaw.strictness === 'strict' ? 'strict' : 'default',
          enable_verifier: optionsRaw.enable_verifier === true,
          language: optionsRaw.language === 'ar' ? 'ar' : 'en',
        }
      : undefined;
  const modules = Array.isArray(input?.modules) ? input.modules.map((x: any) => String(x).trim()).filter(Boolean) : undefined;
  const outputs = Array.isArray(input?.outputs) ? input.outputs.map((x: any) => String(x).trim()).filter(Boolean) : undefined;
  const scopeRaw = String(input?.scope || '').trim();
  const scope: PlaybookSpecV1['scope'] =
    scopeRaw === 'single' ? 'single' : scopeRaw === 'bundle' ? 'bundle' : 'either';

  const bundleSchemaRaw = input?.bundle_schema && typeof input.bundle_schema === 'object' ? input.bundle_schema : null;
  const bundle_schema: PlaybookSpecV1['bundle_schema'] = bundleSchemaRaw
    ? {
        roles: Array.isArray(bundleSchemaRaw.roles)
          ? bundleSchemaRaw.roles
              .map((r: any) => ({
                role: String(r?.role || '').trim(),
                required: r?.required === true,
                multiple: r?.multiple === true,
              }))
              .filter((r: any) => !!r.role)
          : undefined,
        allowed_document_types: Array.isArray(bundleSchemaRaw.allowed_document_types)
          ? bundleSchemaRaw.allowed_document_types.map((x: any) => String(x).trim()).filter(Boolean)
          : undefined,
      }
    : undefined;
  const custom_modules = Array.isArray(input?.custom_modules)
    ? input.custom_modules
        .map((m: any) => ({
          id: String(m?.id || '').trim(),
          title: String(m?.title || '').trim(),
          prompt: String(m?.prompt || ''),
          json_schema: (m?.json_schema && typeof m.json_schema === 'object' && !Array.isArray(m.json_schema) ? m.json_schema : {}) as Record<
            string,
            unknown
          >,
          enabled: m?.enabled === true,
          show_in_report: m?.show_in_report === true,
        }))
        .filter((m: any) => !!m.id)
    : undefined;
  const variables = Array.isArray(input?.variables) ? input.variables : [];
  const normalizedVars = variables
    .map((v: any) => ({
      key: String(v?.key || '').trim(),
      type: String(v?.type || '').trim(),
      required: v?.required === true,
      constraints:
        v?.constraints && typeof v.constraints === 'object'
          ? {
              min: typeof v.constraints.min === 'number' ? v.constraints.min : undefined,
              max: typeof v.constraints.max === 'number' ? v.constraints.max : undefined,
              allowed_values: Array.isArray(v.constraints.allowed_values)
                ? v.constraints.allowed_values.map((x: any) => String(x))
                : undefined,
            }
          : undefined,
    }))
    .filter((v: any) => !!v.key);

  const checks = Array.isArray(input?.checks) ? input.checks : [];
  const normalizedChecks = checks
    .map((c: any) => {
      const type = String(c?.type || '').trim();
      const variable_key = String(c?.variable_key || c?.variable_name || '').trim();
      const id = String(c?.id || `${type}-${variable_key}` || crypto.randomUUID());
      const severity = c?.severity === 'blocker' ? 'blocker' : 'warning';
      if (!type || !variable_key) return null;
      if (type === 'required') return { id, type: 'required' as const, variable_key, severity };
      if (type === 'range')
        return {
          id,
          type: 'range' as const,
          variable_key,
          severity,
          min: typeof c?.min === 'number' ? c.min : undefined,
          max: typeof c?.max === 'number' ? c.max : undefined,
        };
      if (type === 'enum')
        return {
          id,
          type: 'enum' as const,
          variable_key,
          severity,
          allowed_values: Array.isArray(c?.allowed_values) ? c.allowed_values.map((x: any) => String(x)) : [],
        };
      return null;
    })
    .filter(Boolean) as PlaybookSpecV1['checks'];

  return {
    meta: { name: metaName, kind: metaKind },
    options,
    scope,
    bundle_schema,
    modules,
    outputs,
    custom_modules,
    variables: normalizedVars,
    checks: normalizedChecks,
  };
}

export default function WorkspacePlaybooksPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { showError, showSuccess } = useToast();
  const t = useTranslations('playbooks');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [playbooks, setPlaybooks] = useState<PlaybookRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Draft editor state
  const [newName, setNewName] = useState('');
  const [spec, setSpec] = useState<PlaybookSpecV1>({
    meta: { name: '', kind: 'contract' },
    options: { strictness: 'default', enable_verifier: false, language: 'en' },
    scope: 'either',
    modules: ['variables', 'clauses', 'obligations', 'risks', 'deadlines'],
    outputs: ['overview', 'variables', 'clauses', 'obligations', 'risks', 'deadlines'],
    custom_modules: [],
    variables: [],
    checks: [],
  });

  const [customSchemaTextById, setCustomSchemaTextById] = useState<Record<string, string>>({});
  const [customSchemaErrorById, setCustomSchemaErrorById] = useState<Record<string, string>>({});
  const [expandedSchemaIds, setExpandedSchemaIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const cms = spec.custom_modules || [];
    if (cms.length === 0) return;
    setCustomSchemaTextById((prev) => {
      const next = { ...prev };
      for (const m of cms) {
        if (!m?.id) continue;
        if (next[m.id] == null) {
          next[m.id] = JSON.stringify(m.json_schema || {}, null, 2);
        }
      }
      return next;
    });
  }, [spec.custom_modules]);

  const selected = useMemo(() => playbooks.find((p) => p.id === selectedId) || null, [playbooks, selectedId]);

  async function loadPlaybooks() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('playbooks-list', {
        body: { workspace_id: workspaceId, kind: 'contract' }, // no status filter
      });
      if (error) throw error;
      if (data?.ok && Array.isArray(data.playbooks)) {
        const rows = data.playbooks as PlaybookRow[];
        setPlaybooks(rows);
        if (!selectedId && rows.length > 0) {
          const first = rows[0];
          setSelectedId(first.id);
          const initial = normalizeSpec(first.current_version?.spec_json, first.name);
          setSpec(initial);
        }
      }
    } catch (e) {
      showError(e, 'playbooks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlaybooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  function selectPlaybook(id: string) {
    setSelectedId(id);
    const pb = playbooks.find((p) => p.id === id);
    if (pb) setSpec(normalizeSpec(pb.current_version?.spec_json, pb.name));
  }

  async function createPlaybook() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const minimal: PlaybookSpecV1 = {
        meta: { name: newName.trim(), kind: 'contract' },
        options: { strictness: 'default', enable_verifier: false, language: 'en' },
        modules: ['variables', 'clauses', 'obligations', 'risks', 'deadlines'],
        outputs: ['overview', 'variables', 'clauses', 'obligations', 'risks', 'deadlines'],
        custom_modules: [],
        variables: [],
        checks: [],
      };
      const { data, error } = await supabase.functions.invoke('playbooks-create', {
        body: {
          workspace_id: workspaceId,
          name: newName.trim(),
          kind: 'contract',
          initial_spec_json: minimal,
          changelog: 'Initial draft',
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to create playbook');
      showSuccess('Playbook created');
      setNewName('');
      await loadPlaybooks();
    } catch (e) {
      showError(e, 'playbooks');
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!selected) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('playbooks-create-version', {
        body: {
          playbook_id: selected.id,
          spec_json: spec,
          changelog: 'Draft update',
          make_current: true,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to save version');
      showSuccess('Saved draft version');
      await loadPlaybooks();
    } catch (e) {
      showError(e, 'playbooks');
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!selected) return;
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('playbooks-publish', {
        body: { playbook_id: selected.id, version_id: selected.current_version_id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to publish');
      showSuccess('Published');
      await loadPlaybooks();
    } catch (e) {
      showError(e, 'playbooks');
    } finally {
      setPublishing(false);
    }
  }

  const statusBadge = (status: string) => {
    const cls =
      status === 'published'
        ? 'bg-success/10 text-success'
        : status === 'draft'
          ? 'bg-amber-500/10 text-amber-500'
          : 'bg-gray-500/10 text-gray-500';
    return (
      <span className={cn('px-2 py-1 rounded-scholar text-xs font-semibold', cls)}>{status}</span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="p-6 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/workspaces/${workspaceId}`}
              className="p-2 rounded-scholar hover:bg-surface-alt transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-text-soft" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-text">{t('title')}</h1>
              <p className="text-sm text-text-soft">{t('subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: list + create */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>{t('list.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder={t('list.newNamePlaceholder')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Button onClick={createPlaybook} disabled={saving || !newName.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {playbooks.length === 0 ? (
                  <div className="text-sm text-text-soft">{t('list.empty')}</div>
                ) : (
                  playbooks.map((pb) => (
                    <button
                      key={pb.id}
                      onClick={() => selectPlaybook(pb.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-scholar border transition-colors',
                        pb.id === selectedId
                          ? 'border-accent bg-accent/5'
                          : 'border-border hover:bg-surface-alt'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-text">{pb.name}</div>
                        {statusBadge(pb.status)}
                      </div>
                      <div className="text-xs text-text-soft mt-1">
                        v{pb.current_version?.version_number ?? '—'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right: editor */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{t('builder.title')}</span>
                <div className="flex items-center gap-2">
                  {selected?.status ? statusBadge(selected.status) : null}
                  <Button onClick={saveDraft} disabled={!selected || saving}>
                    <Save className="w-4 h-4" />
                    {t('builder.saveDraft')}
                  </Button>
                  <Button onClick={publish} disabled={!selected || publishing} variant="primary">
                    <UploadCloud className="w-4 h-4" />
                    {t('builder.publish')}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {!selected ? (
                <div className="text-sm text-text-soft">{t('builder.selectToEdit')}</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="font-semibold text-text">{t('settingsFixed')}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                        <input
                          type="checkbox"
                          checked={(spec.options?.strictness || 'default') === 'strict'}
                          onChange={(e) =>
                            setSpec((p) => ({
                              ...p,
                              options: { ...(p.options || {}), strictness: e.target.checked ? 'strict' : 'default' },
                            }))
                          }
                        />
                        {t('strictMode')}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                        <input
                          type="checkbox"
                          checked={spec.options?.enable_verifier === true}
                          onChange={(e) =>
                            setSpec((p) => ({ ...p, options: { ...(p.options || {}), enable_verifier: e.target.checked } }))
                          }
                        />
                        {t('enableVerifier')}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                        <input
                          type="checkbox"
                          checked={(spec.options?.language || 'en') === 'ar'}
                          onChange={(e) =>
                            setSpec((p) => ({ ...p, options: { ...(p.options || {}), language: e.target.checked ? 'ar' : 'en' } }))
                          }
                        />
                        {t('arabicOutput')}
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="font-semibold text-text">Scope</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(['either', 'single', 'bundle'] as const).map((s) => (
                        <label key={s} className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                          <input
                            type="radio"
                            name="scope"
                            checked={(spec.scope || 'either') === s}
                            onChange={() => setSpec((p) => ({ ...p, scope: s }))}
                          />
                          {s === 'either' ? 'Either (single or bundle)' : s === 'single' ? 'Single only' : 'Bundle only'}
                        </label>
                      ))}
                    </div>
                    <div className="text-xs text-text-soft">
                      Use “Bundle only” for templates that require multiple documents (e.g., MSA + amendments).
                    </div>
                  </div>

                  {(spec.scope || 'either') !== 'single' ? (
                    <div className="space-y-3">
                      <div className="font-semibold text-text">Bundle schema (optional)</div>
                      <div className="text-xs text-text-soft">
                        Define required/optional roles for bundle members. When set, “Run Analysis” will enforce required roles.
                      </div>

                      {(() => {
                        const roles = (spec.bundle_schema?.roles || []) as BundleRoleRow[];
                        return (
                          <div className="space-y-2">
                            {roles.length === 0 ? (
                              <div className="text-sm text-text-soft">No roles defined.</div>
                            ) : (
                              roles.map((r, idx) => (
                                <div
                                  key={`${r.role}-${idx}`}
                                  className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-scholar border border-border bg-surface-alt p-3"
                                >
                                  <Input
                                    value={r.role}
                                    onChange={(e) => {
                                      const next = roles.slice();
                                      next[idx] = { ...r, role: e.target.value };
                                      setSpec((p) => ({
                                        ...p,
                                        bundle_schema: { ...(p.bundle_schema || {}), roles: next.filter((x) => !!x.role.trim()) },
                                      }));
                                    }}
                                    placeholder="role (e.g., master, amendment)"
                                  />
                                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                                    <input
                                      type="checkbox"
                                      checked={r.required}
                                      onChange={(e) => {
                                        const next = roles.slice();
                                        next[idx] = { ...r, required: e.target.checked };
                                        setSpec((p) => ({ ...p, bundle_schema: { ...(p.bundle_schema || {}), roles: next } }));
                                      }}
                                    />
                                    required
                                  </label>
                                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                                    <input
                                      type="checkbox"
                                      checked={r.multiple}
                                      onChange={(e) => {
                                        const next = roles.slice();
                                        next[idx] = { ...r, multiple: e.target.checked };
                                        setSpec((p) => ({ ...p, bundle_schema: { ...(p.bundle_schema || {}), roles: next } }));
                                      }}
                                    />
                                    multiple
                                  </label>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => {
                                      const next = roles.filter((_, i) => i !== idx);
                                      setSpec((p) => ({ ...p, bundle_schema: { ...(p.bundle_schema || {}), roles: next } }));
                                    }}
                                  >
                                    {tCommon('remove')}
                                  </Button>
                                </div>
                              ))
                            )}

                            <div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  const next = roles.concat([{ role: '', required: false, multiple: false }]);
                                  setSpec((p) => ({ ...p, bundle_schema: { ...(p.bundle_schema || {}), roles: next } }));
                                }}
                              >
                                + Add role
                              </Button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="font-semibold text-text">{t('outputsModules')}</div>
                    {(() => {
                      const order = ['variables', 'clauses', 'obligations', 'risks', 'deadlines'] as const;
                      const labels: Record<(typeof order)[number], string> = {
                        variables: t('modules.variables'),
                        clauses: t('modules.clauses'),
                        obligations: t('modules.obligations'),
                        risks: t('modules.risks'),
                        deadlines: t('modules.deadlines'),
                      };
                      const enabled = new Set(spec.modules || order);
                      const enabledOrdered = order.filter((k) => enabled.has(k));
                      const remaining = order.filter((k) => !enabled.has(k));

                      function apply(next: Set<string>) {
                        if (!next.has('variables')) next.delete('deadlines');
                        if (next.has('deadlines')) next.add('variables');
                        const outOrder = ['overview', ...order];
                        const outputs = outOrder.filter((k) => k === 'overview' || next.has(k));
                        setSpec((p) => ({ ...p, modules: Array.from(next), outputs }));
                      }

                      return (
                        <div className="space-y-2">
                          <div className="space-y-2">
                            {enabledOrdered.map((k) => (
                              <div
                                key={k}
                                className="flex items-center justify-between gap-3 rounded-scholar border border-border bg-surface-alt px-3 py-2"
                              >
                                <div className="text-sm font-semibold text-text">{labels[k]}</div>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => {
                                    const next = new Set(enabled);
                                    next.delete(k);
                                    apply(next);
                                  }}
                                >
                                  {tCommon('remove')}
                                </Button>
                              </div>
                            ))}
                          </div>

                          {remaining.length > 0 ? (
                            <div className="flex items-center gap-2">
                              <select
                                className="px-3 py-2 rounded-scholar border border-border bg-surface text-text text-sm"
                                value=""
                                onChange={(e) => {
                                  const value = e.target.value as (typeof order)[number];
                                  if (!value) return;
                                  const next = new Set(enabled);
                                  next.add(value);
                                  apply(next);
                                }}
                              >
                                <option value="">{t('customModules.add')}</option>
                                {remaining.map((k) => (
                                  <option key={k} value={k}>
                                    {labels[k]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                    <div className="text-sm text-text-soft">
                      {t('modulesHelp')}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="font-semibold text-text">{t('reportSections')}</div>
                    <div className="text-sm text-text-soft">
                      Report sections are derived from enabled modules.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-text">{t('customModules.title')}</div>
                      <Button
                        onClick={() =>
                          setSpec((p) => {
                            const id = `custom_${crypto.randomUUID().replace(/-/g, '')}`;
                            const mod = {
                              id,
                              title: t('customModules.defaultTitle'),
                              prompt: '',
                              json_schema: { type: 'object', properties: {}, required: [] },
                              enabled: true,
                              show_in_report: true,
                            };
                            return { ...p, custom_modules: [...(p.custom_modules || []), mod] };
                          })
                        }
                      >
                        <Plus className="w-4 h-4" />
                        {t('customModules.add')}
                      </Button>
                    </div>

                    {(spec.custom_modules || []).length === 0 ? (
                      <div className="text-sm text-text-soft">{t('customModules.empty')}</div>
                    ) : (
                      <div className="space-y-2">
                        {(spec.custom_modules || []).map((m, idx) => (
                          <Card key={`${m.id}-${idx}`}>
                            <CardContent className="p-3 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <label className="space-y-1 text-sm">
                                  <div className="text-text-soft font-semibold">{t('customModules.fields.title')}</div>
                                  <Input
                                    value={m.title}
                                    onChange={(e) =>
                                      setSpec((p) => {
                                        const cms = (p.custom_modules || []).slice();
                                        cms[idx] = { ...cms[idx], title: e.target.value };
                                        return { ...p, custom_modules: cms };
                                      })
                                    }
                                  />
                                  <div className="text-xs text-text-soft">{m.id}</div>
                                </label>
                                <div className="flex flex-col justify-end gap-2">
                                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                                    <input
                                      type="checkbox"
                                      checked={m.enabled !== false}
                                      onChange={(e) =>
                                        setSpec((p) => {
                                          const cms = (p.custom_modules || []).slice();
                                          cms[idx] = { ...cms[idx], enabled: e.target.checked };
                                          return { ...p, custom_modules: cms };
                                        })
                                      }
                                    />
                                    {t('customModules.fields.enabled')}
                                  </label>
                                </div>
                              </div>

                              <label className="space-y-1 text-sm">
                                <div className="text-text-soft font-semibold">{t('customModules.fields.prompt')}</div>
                                <textarea
                                  className="w-full min-h-[90px] px-3 py-2 rounded-scholar border border-border bg-surface text-text"
                                  value={m.prompt}
                                  onChange={(e) =>
                                    setSpec((p) => {
                                      const cms = (p.custom_modules || []).slice();
                                      cms[idx] = { ...cms[idx], prompt: e.target.value };
                                      return { ...p, custom_modules: cms };
                                    })
                                  }
                                  placeholder={t('customModules.fields.promptPlaceholder')}
                                />
                              </label>

                              {/* Advanced: JSON Schema (collapsible) */}
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => setExpandedSchemaIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(m.id)) {
                                      next.delete(m.id);
                                    } else {
                                      next.add(m.id);
                                    }
                                    return next;
                                  })}
                                  className="flex items-center gap-2 text-sm text-text-soft hover:text-text transition-colors"
                                >
                                  {expandedSchemaIds.has(m.id) ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                  <span className="font-semibold">Advanced: JSON Schema</span>
                                </button>
                                
                                {expandedSchemaIds.has(m.id) && (
                                  <div className="pl-6 space-y-2">
                                    <textarea
                                      className="w-full min-h-[140px] font-mono text-xs px-3 py-2 rounded-scholar border border-border bg-surface text-text"
                                      value={customSchemaTextById[m.id] ?? JSON.stringify(m.json_schema || {}, null, 2)}
                                      onChange={(e) => {
                                        const text = e.target.value;
                                        setCustomSchemaTextById((prev) => ({ ...prev, [m.id]: text }));
                                        try {
                                          const parsed = JSON.parse(text);
                                          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                            throw new Error('schema_must_be_object');
                                          }
                                          setCustomSchemaErrorById((prev) => ({ ...prev, [m.id]: '' }));
                                          setSpec((p) => {
                                            const cms = (p.custom_modules || []).slice();
                                            cms[idx] = { ...cms[idx], json_schema: parsed };
                                            return { ...p, custom_modules: cms };
                                          });
                                        } catch {
                                          setCustomSchemaErrorById((prev) => ({ ...prev, [m.id]: t('customModules.invalidJson') }));
                                        }
                                      }}
                                    />
                                    {customSchemaErrorById[m.id] ? (
                                      <div className="text-xs text-error">{customSchemaErrorById[m.id]}</div>
                                    ) : null}
                                    <div className="text-xs text-text-soft">ID: {m.id}</div>
                                  </div>
                                )}
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  variant="danger"
                                  onClick={() => setSpec((p) => ({ ...p, custom_modules: (p.custom_modules || []).filter((_, i) => i !== idx) }))}
                                >
                                  {tCommon('remove')}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm">
                      <div className="text-text-soft font-semibold">Name (meta)</div>
                      <Input
                        value={spec.meta.name}
                        onChange={(e) => setSpec((p) => ({ ...p, meta: { ...p.meta, name: e.target.value } }))}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <div className="text-text-soft font-semibold">Kind</div>
                      <Input value={spec.meta.kind} disabled />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-text">Inputs: Variables</div>
                      <Button
                        onClick={() =>
                          setSpec((p) => ({
                            ...p,
                            variables: [...p.variables, { key: `var_${p.variables.length + 1}`, type: 'text', required: false }],
                          }))
                        }
                      >
                        <Plus className="w-4 h-4" />
                        Add variable
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {spec.variables.length === 0 ? (
                        <div className="text-sm text-text-soft">No variables yet.</div>
                      ) : (
                        spec.variables.map((v, idx) => (
                          <Card key={`${v.key}-${idx}`}>
                            <CardContent className="p-3 space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <Input
                                  value={v.key}
                                  onChange={(e) =>
                                    setSpec((p) => {
                                      const vars = p.variables.slice();
                                      vars[idx] = { ...vars[idx], key: e.target.value };
                                      return { ...p, variables: vars };
                                    })
                                  }
                                  placeholder="key (e.g. effective_date)"
                                />
                                <Input
                                  value={v.type}
                                  onChange={(e) =>
                                    setSpec((p) => {
                                      const vars = p.variables.slice();
                                      vars[idx] = { ...vars[idx], type: e.target.value };
                                      return { ...p, variables: vars };
                                    })
                                  }
                                  placeholder="type (text|date|number|...)"
                                />
                                <label className="inline-flex items-center gap-2 text-sm text-text">
                                  <input
                                    type="checkbox"
                                    checked={v.required === true}
                                    onChange={(e) =>
                                      setSpec((p) => {
                                        const vars = p.variables.slice();
                                        vars[idx] = { ...vars[idx], required: e.target.checked };
                                        return { ...p, variables: vars };
                                      })
                                    }
                                  />
                                  <span className="flex flex-col">
                                    <span className="font-semibold">Flag if missing</span>
                                    <span className="text-xs text-text-soft">Marks as 'Needs Review' if not found</span>
                                  </span>
                                </label>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <Input
                                  placeholder="min (number)"
                                  value={v.constraints?.min ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value.trim();
                                    setSpec((p) => {
                                      const vars = p.variables.slice();
                                      const constraints = { ...(vars[idx].constraints || {}) };
                                      constraints.min = val === '' ? undefined : Number(val);
                                      vars[idx] = { ...vars[idx], constraints };
                                      return { ...p, variables: vars };
                                    });
                                  }}
                                />
                                <Input
                                  placeholder="max (number)"
                                  value={v.constraints?.max ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value.trim();
                                    setSpec((p) => {
                                      const vars = p.variables.slice();
                                      const constraints = { ...(vars[idx].constraints || {}) };
                                      constraints.max = val === '' ? undefined : Number(val);
                                      vars[idx] = { ...vars[idx], constraints };
                                      return { ...p, variables: vars };
                                    });
                                  }}
                                />
                                <Input
                                  placeholder="allowed values (comma-separated)"
                                  value={(v.constraints?.allowed_values || []).join(', ')}
                                  onChange={(e) => {
                                    const parts = e.target.value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                                    setSpec((p) => {
                                      const vars = p.variables.slice();
                                      const constraints = { ...(vars[idx].constraints || {}) };
                                      constraints.allowed_values = parts.length ? parts : undefined;
                                      vars[idx] = { ...vars[idx], constraints };
                                      return { ...p, variables: vars };
                                    });
                                  }}
                                />
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    setSpec((p) => ({ ...p, variables: p.variables.filter((_, i) => i !== idx) }))
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-text">Checks</div>
                      <Button
                        onClick={() =>
                          setSpec((p) => ({
                            ...p,
                            checks: [
                              ...(p.checks || []),
                              {
                                id: `required-${crypto.randomUUID()}`,
                                type: 'required',
                                variable_key: p.variables[0]?.key || '',
                                severity: 'warning',
                              },
                            ],
                          }))
                        }
                      >
                        <Plus className="w-4 h-4" />
                        Add check
                      </Button>
                    </div>

                    {(spec.checks || []).length === 0 ? (
                      <div className="text-sm text-text-soft">No checks yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {(spec.checks || []).map((c: any, idx: number) => (
                          <Card key={c.id || idx}>
                            <CardContent className="p-3 space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <select
                                  className="w-full px-3 py-2 rounded-scholar border border-border bg-surface text-text"
                                  value={c.type}
                                  onChange={(e) =>
                                    setSpec((p) => {
                                      const checks = (p.checks || []).slice();
                                      const type = (e.target.value === 'range' || e.target.value === 'enum' ? e.target.value : 'required') as
                                        | 'required'
                                        | 'range'
                                        | 'enum';
                                      const base = {
                                        id: String(checks[idx]?.id || crypto.randomUUID()),
                                        variable_key: String(checks[idx]?.variable_key || ''),
                                        severity: (checks[idx]?.severity === 'blocker' ? 'blocker' : 'warning') as 'warning' | 'blocker',
                                      };
                                      checks[idx] =
                                        type === 'required'
                                          ? { ...base, type: 'required' as const }
                                          : type === 'range'
                                            ? { ...base, type: 'range' as const, min: (checks[idx] as any)?.min, max: (checks[idx] as any)?.max }
                                            : {
                                                ...base,
                                                type: 'enum' as const,
                                                allowed_values: Array.isArray((checks[idx] as any)?.allowed_values)
                                                  ? (checks[idx] as any).allowed_values
                                                  : [],
                                              };
                                      return { ...p, checks };
                                    })
                                  }
                                >
                                  <option value="required">required</option>
                                  <option value="range">range</option>
                                  <option value="enum">enum</option>
                                </select>
                                <select
                                  className="w-full px-3 py-2 rounded-scholar border border-border bg-surface text-text"
                                  value={c.variable_key}
                                  onChange={(e) =>
                                    setSpec((p) => {
                                      const checks = (p.checks || []).slice();
                                      checks[idx] = { ...checks[idx], variable_key: e.target.value };
                                      return { ...p, checks };
                                    })
                                  }
                                >
                                  <option value="">Select variable</option>
                                  {spec.variables.map((v) => (
                                    <option key={v.key} value={v.key}>
                                      {v.key}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  className="w-full px-3 py-2 rounded-scholar border border-border bg-surface text-text"
                                  value={c.severity}
                                  onChange={(e) =>
                                    setSpec((p) => {
                                      const checks = (p.checks || []).slice();
                                      const severity = (e.target.value === 'blocker' ? 'blocker' : 'warning') as 'warning' | 'blocker';
                                      checks[idx] = { ...checks[idx], severity };
                                      return { ...p, checks };
                                    })
                                  }
                                >
                                  <option value="warning">warning</option>
                                  <option value="blocker">blocker</option>
                                </select>
                                <Badge size="sm">id: {String(c.id).slice(0, 8)}</Badge>
                              </div>

                              {c.type === 'range' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <Input
                                    placeholder="min"
                                    value={c.min ?? ''}
                                    onChange={(e) =>
                                      setSpec((p) => {
                                        const checks = (p.checks || []).slice();
                                        const val = e.target.value.trim();
                                        checks[idx] = { ...(checks[idx] as any), min: val === '' ? undefined : Number(val) } as any;
                                        return { ...p, checks };
                                      })
                                    }
                                  />
                                  <Input
                                    placeholder="max"
                                    value={c.max ?? ''}
                                    onChange={(e) =>
                                      setSpec((p) => {
                                        const checks = (p.checks || []).slice();
                                        const val = e.target.value.trim();
                                        checks[idx] = { ...(checks[idx] as any), max: val === '' ? undefined : Number(val) } as any;
                                        return { ...p, checks };
                                      })
                                    }
                                  />
                                </div>
                              )}

                              {c.type === 'enum' && (
                                <Input
                                  placeholder="allowed values (comma-separated)"
                                  value={(c.allowed_values || []).join(', ')}
                                  onChange={(e) =>
                                    setSpec((p) => {
                                      const checks = (p.checks || []).slice();
                                      const parts = e.target.value
                                        .split(',')
                                        .map((s) => s.trim())
                                        .filter(Boolean);
                                      checks[idx] = { ...(checks[idx] as any), allowed_values: parts } as any;
                                      return { ...p, checks };
                                    })
                                  }
                                />
                              )}

                              <div className="flex justify-end">
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    setSpec((p) => ({ ...p, checks: (p.checks || []).filter((_, i) => i !== idx) }))
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Outputs are now explicitly configured above (modules + report sections). */}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

