'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Plus, Save, UploadCloud } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type PlaybookSpecV1 = {
  meta: { name: string; kind: string };
  options?: { strictness?: 'default' | 'strict'; enable_verifier?: boolean; language?: 'en' | 'ar' };
  modules?: string[];
  outputs?: string[];
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
    modules,
    outputs,
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
    modules: ['variables', 'clauses', 'obligations', 'risks', 'deadlines'],
    outputs: ['overview', 'variables', 'clauses', 'obligations', 'risks', 'deadlines'],
    variables: [],
    checks: [],
  });

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
                    <div className="font-semibold text-text">{t('outputsModules')}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(
                        [
                          { key: 'variables', label: t('modules.variables') },
                          { key: 'clauses', label: t('modules.clauses') },
                          { key: 'obligations', label: t('modules.obligations') },
                          { key: 'risks', label: t('modules.risks') },
                          { key: 'deadlines', label: t('modules.deadlines') },
                        ] as const
                      ).map((m) => (
                        <label key={m.key} className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                          <input
                            type="checkbox"
                            checked={(spec.modules || []).includes(m.key)}
                            onChange={(e) =>
                              setSpec((p) => {
                                const set = new Set(p.modules || []);
                                if (e.target.checked) set.add(m.key);
                                else set.delete(m.key);
                                // deadlines implies variables
                                if (set.has('deadlines')) set.add('variables');
                                return { ...p, modules: Array.from(set) };
                              })
                            }
                          />
                          {m.label}
                        </label>
                      ))}
                    </div>
                    <div className="text-sm text-text-soft">
                      {t('modulesHelp')}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="font-semibold text-text">{t('reportSections')}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(
                        [
                          { key: 'overview', label: t('outputs.overview') },
                          { key: 'variables', label: t('outputs.variables') },
                          { key: 'clauses', label: t('outputs.clauses') },
                          { key: 'obligations', label: t('outputs.obligations') },
                          { key: 'risks', label: t('outputs.risks') },
                          { key: 'deadlines', label: t('outputs.deadlines') },
                        ] as const
                      ).map((o) => (
                        <label key={o.key} className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                          <input
                            type="checkbox"
                            checked={(spec.outputs || []).includes(o.key)}
                            onChange={(e) =>
                              setSpec((p) => {
                                const set = new Set(p.outputs || []);
                                if (e.target.checked) set.add(o.key);
                                else set.delete(o.key);
                                return { ...p, outputs: Array.from(set) };
                              })
                            }
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
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
                                <label className="inline-flex items-center gap-2 text-sm font-semibold text-text">
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
                                  Required
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

