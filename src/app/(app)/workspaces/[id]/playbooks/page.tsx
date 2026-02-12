'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronDown, ChevronRight, Plus, UploadCloud, Shield, ShieldCheck, Globe, Layers, Variable, Pencil, Lock, Copy } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import {
  Badge,
  Button,
  Input,
  Spinner,
  ScholarNotebookCard,
  ScholarToggle,
  EmptyState,
} from '@/components/ui';
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
  modules_v2?: Array<{
    id: string;
    title: string;
    prompt: string;
    json_schema: Record<string, unknown>;
    enabled?: boolean;
    show_in_report?: boolean;
  }>;
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
    source_scope?: string;
    source_scopes?: string[];
    constraints?: { min?: number; max?: number; allowed_values?: string[] };
  }>;
  record_types?: Array<{
    id: string;
    title: string;
    json_schema?: Record<string, unknown>;
    show_in_report?: boolean;
    source_scope?: string;
    source_scopes?: string[];
  }>;
  rules?: Array<Record<string, unknown>>;
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

const CORE_MODULE_ORDER = ['variables', 'clauses', 'obligations', 'risks', 'deadlines'] as const;

function defaultModuleTitle(id: string) {
  if (id === 'variables') return 'Variables';
  if (id === 'clauses') return 'Clauses';
  if (id === 'obligations') return 'Obligations';
  if (id === 'risks') return 'Risks';
  if (id === 'deadlines') return 'Deadlines';
  return id;
}

function defaultModulePrompt(id: string) {
  if (id === 'variables') return 'Extract key fields as structured variables. Prefer exact dates/numbers; be conservative.';
  if (id === 'clauses') return 'Summarize important clauses. Cite evidence. Avoid speculation.';
  if (id === 'obligations') return 'Extract obligations (who must do what, by when). Capture due dates when explicit.';
  if (id === 'risks') return 'Identify risk flags with severity (low|medium|high|critical). Cite evidence.';
  if (id === 'deadlines') return 'Extract actionable deadlines/events with ISO due dates when explicit. Cite evidence.';
  return 'Extract structured findings as JSON that matches the schema. Be conservative and cite evidence.';
}

function defaultModuleSchema(id: string): Record<string, unknown> {
  if (id === 'variables') return { type: 'object', properties: { variables: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, value: {}, unit: { type: ['string', 'null'] }, display_name: { type: ['string', 'null'] }, document_id: { type: ['string', 'null'] }, page_number: { type: ['number', 'null'] }, source_quote: { type: ['string', 'null'] }, ai_confidence: { type: ['string', 'null'] } }, required: ['name', 'type'] } } }, required: ['variables'] };
  if (id === 'clauses') return { type: 'object', properties: { clauses: { type: 'array', items: { type: 'object', properties: { clause_type: { type: 'string' }, clause_title: { type: ['string', 'null'] }, clause_number: { type: ['string', 'null'] }, text: { type: 'string' }, risk_level: { type: ['string', 'null'] }, is_missing_standard_protection: { type: ['boolean', 'null'] }, document_id: { type: ['string', 'null'] }, page_number: { type: ['number', 'null'] }, source_quote: { type: ['string', 'null'] } }, required: ['clause_type', 'text'] } } }, required: ['clauses'] };
  if (id === 'obligations') return { type: 'object', properties: { obligations: { type: 'array', items: { type: 'object', properties: { obligation_type: { type: ['string', 'null'] }, summary: { type: ['string', 'null'] }, action: { type: ['string', 'null'] }, responsible_party: { type: ['string', 'null'] }, due_at: { type: ['string', 'null'] }, recurrence: { type: ['string', 'null'] }, condition: { type: ['string', 'null'] }, document_id: { type: ['string', 'null'] }, page_number: { type: ['number', 'null'] }, source_quote: { type: ['string', 'null'] }, ai_confidence: { type: ['string', 'null'] } } } } }, required: ['obligations'] };
  if (id === 'risks') return { type: 'object', properties: { risks: { type: 'array', items: { type: 'object', properties: { severity: { type: ['string', 'null'] }, description: { type: 'string' }, explanation: { type: ['string', 'null'] }, document_id: { type: ['string', 'null'] }, page_number: { type: ['number', 'null'] }, source_quote: { type: ['string', 'null'] } }, required: ['description'] } } }, required: ['risks'] };
  if (id === 'deadlines') return { type: 'object', properties: { deadlines: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, due_at: { type: 'string' }, related_variable: { type: ['string', 'null'] }, document_id: { type: ['string', 'null'] }, page_number: { type: ['number', 'null'] }, source_quote: { type: ['string', 'null'] }, ai_confidence: { type: ['string', 'null'] } }, required: ['title', 'due_at'] } } }, required: ['deadlines'] };
  return { type: 'object', properties: {}, required: [] };
}

function syncLegacyFromModulesV2(p: PlaybookSpecV1): PlaybookSpecV1 {
  const mods = Array.isArray(p.modules_v2) ? p.modules_v2 : [];
  const enabled = new Set(mods.filter((m) => m.enabled !== false).map((m) => m.id));
  // Dependency rules: deadlines implies variables; variables off => deadlines off
  if (!enabled.has('variables')) enabled.delete('deadlines');
  if (enabled.has('deadlines')) enabled.add('variables');
  const modules = Array.from(enabled);
  const outputs = ['overview', ...CORE_MODULE_ORDER].filter((k) => k === 'overview' || enabled.has(k));
  return { ...p, modules, outputs, custom_modules: undefined };
}

type BundleRoleRow = { role: string; required: boolean; multiple: boolean };

type PlaybookRow = {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'deprecated';
  is_system_preset?: boolean;
  workspace_id?: string | null;
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

  let modules_v2 = Array.isArray(input?.modules_v2)
    ? input.modules_v2
        .map((m: any) => ({
          id: String(m?.id || '').trim(),
          title: String(m?.title || '').trim(),
          prompt: String(m?.prompt || ''),
          json_schema: (m?.json_schema && typeof m.json_schema === 'object' && !Array.isArray(m.json_schema) ? m.json_schema : {}) as Record<
            string,
            unknown
          >,
          enabled: m?.enabled === false ? false : true,
          show_in_report: m?.show_in_report === true,
        }))
        .filter((m: any) => !!m.id)
    : undefined;

  // Migration path: if modules_v2 is absent, derive it from legacy modules + custom_modules.
  if (!modules_v2 || modules_v2.length === 0) {
    const legacy = Array.isArray(modules) && modules.length ? modules : Array.from(CORE_MODULE_ORDER);
    const derived: NonNullable<PlaybookSpecV1['modules_v2']> = [];
    const seen = new Set<string>();
    for (const id of legacy) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      derived.push({
        id,
        title: defaultModuleTitle(id),
        prompt: defaultModulePrompt(id),
        json_schema: defaultModuleSchema(id),
        enabled: true,
        show_in_report: true,
      });
    }
    for (const cm of custom_modules || []) {
      if (!cm?.id || seen.has(cm.id)) continue;
      seen.add(cm.id);
      derived.push({
        id: cm.id,
        title: cm.title || cm.id,
        prompt: cm.prompt || '',
        json_schema: cm.json_schema || { type: 'object', properties: {}, required: [] },
        enabled: cm.enabled !== false,
        show_in_report: cm.show_in_report === true,
      });
    }
    modules_v2 = derived;
  }
  const variables = Array.isArray(input?.variables) ? input.variables : [];
  const normalizedVars = variables
    .map((v: any) => ({
      key: String(v?.key || '').trim(),
      type: String(v?.type || '').trim(),
      required: v?.required === true,
      source_scope: typeof v?.source_scope === 'string' ? String(v.source_scope).trim() : undefined,
      source_scopes: Array.isArray(v?.source_scopes) ? v.source_scopes.map((x: any) => String(x).trim()).filter(Boolean) : undefined,
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

  const record_types = Array.isArray(input?.record_types)
    ? input.record_types
        .map((r: any) => ({
          id: String(r?.id || '').trim(),
          title: String(r?.title || '').trim(),
          json_schema: (r?.json_schema && typeof r.json_schema === 'object' && !Array.isArray(r.json_schema) ? r.json_schema : {}) as Record<
            string,
            unknown
          >,
          show_in_report: r?.show_in_report === true,
          source_scope: typeof r?.source_scope === 'string' ? String(r.source_scope).trim() : undefined,
          source_scopes: Array.isArray(r?.source_scopes) ? r.source_scopes.map((x: any) => String(x).trim()).filter(Boolean) : undefined,
        }))
        .filter((r: any) => !!r.id && !!r.title)
    : undefined;

  const rules = Array.isArray(input?.rules)
    ? input.rules
        .map((r: any) => (r && typeof r === 'object' ? r : null))
        .filter(Boolean) as Array<Record<string, unknown>>
    : undefined;

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

  return syncLegacyFromModulesV2({
    meta: { name: metaName, kind: metaKind },
    options,
    scope,
    bundle_schema,
    modules,
    outputs,
    modules_v2,
    variables: normalizedVars,
    record_types,
    rules,
    checks: normalizedChecks,
  });
}

export default function WorkspacePlaybooksPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const requestedReturnTo = searchParams.get('returnTo');
  const backHref =
    requestedReturnTo && requestedReturnTo.startsWith('/')
      ? requestedReturnTo
      : `/workspaces/${workspaceId}`;
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
    modules_v2: Array.from(CORE_MODULE_ORDER).map((id) => ({
      id,
      title: defaultModuleTitle(id),
      prompt: defaultModulePrompt(id),
      json_schema: defaultModuleSchema(id),
      enabled: true,
      show_in_report: true,
    })),
    variables: [],
    checks: [],
  });

  const [customSchemaTextById, setCustomSchemaTextById] = useState<Record<string, string>>({});
  const [customSchemaErrorById, setCustomSchemaErrorById] = useState<Record<string, string>>({});
  const [recordSchemaTextById, setRecordSchemaTextById] = useState<Record<string, string>>({});
  const [recordSchemaErrorById, setRecordSchemaErrorById] = useState<Record<string, string>>({});
  const [ruleTextById, setRuleTextById] = useState<Record<string, string>>({});
  const [ruleErrorById, setRuleErrorById] = useState<Record<string, string>>({});
  const [expandedSchemaIds, setExpandedSchemaIds] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<'modules' | 'variables' | 'records' | 'rules' | 'scope'>('modules');
  const isConfigurationSection =
    activeSection === 'rules' || activeSection === 'scope' || activeSection === 'records';
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  useEffect(() => {
    const mods = spec.modules_v2 || [];
    if (mods.length === 0) return;
    setCustomSchemaTextById((prev) => {
      const next = { ...prev };
      for (const m of mods) {
        if (!m?.id) continue;
        if (next[m.id] == null) {
          next[m.id] = JSON.stringify(m.json_schema || {}, null, 2);
        }
      }
      return next;
    });
  }, [spec.modules_v2]);

  useEffect(() => {
    const rows = spec.record_types || [];
    if (rows.length === 0) return;
    setRecordSchemaTextById((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (!r?.id) continue;
        if (next[r.id] == null) next[r.id] = JSON.stringify(r.json_schema || {}, null, 2);
      }
      return next;
    });
  }, [spec.record_types]);

  useEffect(() => {
    const rows = Array.isArray(spec.rules) ? spec.rules : [];
    if (rows.length === 0) return;
    setRuleTextById((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        const id = String((row as any)?.id || '').trim();
        if (!id) continue;
        if (next[id] == null) next[id] = JSON.stringify(row || {}, null, 2);
      }
      return next;
    });
  }, [spec.rules]);

  const selected = useMemo(() => playbooks.find((p) => p.id === selectedId) || null, [playbooks, selectedId]);
  const isSystemPreset = selected?.is_system_preset === true;
  const isReadOnly = isSystemPreset;
  const [duplicating, setDuplicating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Save draft version (debounced auto-save)
  const saveDraft = useCallback(async (specToSave: PlaybookSpecV1) => {
    if (!selected || isSystemPreset) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('playbooks-create-version', {
        body: {
          playbook_id: selected.id,
          spec_json: specToSave,
          changelog: 'Auto-save',
          make_current: true,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to save');
      setLastSaved(new Date());

      // Keep local list in sync so switching templates doesn't "lose" edits.
      const v = data?.version as { id?: string; version_number?: number; published_at?: string | null } | undefined;
      if (v?.id && typeof v.version_number === 'number') {
        const versionId = v.id;
        const versionNumber = v.version_number;
        const publishedAt = v.published_at ?? null;
        setPlaybooks((prev) =>
          prev.map((pb) =>
            pb.id === selected.id
              ? {
                  ...pb,
                  current_version_id: versionId,
                  current_version: {
                    id: versionId,
                    version_number: versionNumber,
                    spec_json: specToSave,
                    published_at: publishedAt ?? pb.current_version?.published_at ?? null,
                  },
                }
              : pb
          )
        );
      }

      // Also update the playbook name if changed
      if (specToSave.meta.name !== selected.name) {
        // Best-effort: version is already saved. Avoid treating name update failures as save failures.
        await supabase.from('playbooks').update({ name: specToSave.meta.name }).eq('id', selected.id);
      }
    } catch (e) {
      showError(e, 'playbooks');
    } finally {
      setIsSaving(false);
    }
  }, [selected, isSystemPreset, supabase, showError]);

  // Debounced auto-save when spec changes (only for non-system templates)
  useEffect(() => {
    if (!selected || isSystemPreset) return;
    
    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout for debounced save (2 seconds after last change)
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft(spec);
    }, 2000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [spec, selected, isSystemPreset, saveDraft]);

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
        return rows;
      }
    } catch (e) {
      showError(e, 'playbooks');
    } finally {
      setLoading(false);
    }
    return [] as PlaybookRow[];
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
        modules_v2: Array.from(CORE_MODULE_ORDER).map((id) => ({
          id,
          title: defaultModuleTitle(id),
          prompt: defaultModulePrompt(id),
          json_schema: defaultModuleSchema(id),
          enabled: true,
          show_in_report: true,
        })),
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

  async function publish() {
    if (!selected || isSystemPreset) return;
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

  async function duplicateTemplate() {
    if (!selected) return;
    setDuplicating(true);
    try {
      const sourceSpec = selected.current_version?.spec_json || spec;
      const duplicatedSpec = {
        ...sourceSpec,
        meta: { ...sourceSpec.meta, name: `${selected.name} (Copy)` },
      };
      const { data, error } = await supabase.functions.invoke('playbooks-create', {
        body: {
          workspace_id: workspaceId,
          name: `${selected.name} (Copy)`,
          kind: 'contract',
          initial_spec_json: duplicatedSpec,
          changelog: `Duplicated from "${selected.name}"`,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to duplicate');
      showSuccess('Template duplicated! You can now edit your copy.');
      setNewName('');
      const createdId = String(data.playbook?.id || '').trim();
      const rows = await loadPlaybooks();

      // Ensure the new template is selectable immediately (even if list is eventually-consistent).
      if (createdId) {
        const row = rows.find((p) => p.id === createdId) || null;
        if (!row) {
          setPlaybooks((prev) => [
            {
              id: createdId,
              name: `${selected.name} (Copy)`,
              status: 'draft',
              is_system_preset: false,
              workspace_id: workspaceId,
              current_version_id: null,
              current_version: { id: '', version_number: 1, spec_json: duplicatedSpec, published_at: null },
            },
            ...prev,
          ]);
        }

        setSelectedId(createdId);
        const specSource = row?.current_version?.spec_json || duplicatedSpec;
        setSpec(normalizeSpec(specSource, row?.name || `${selected.name} (Copy)`));
      }
    } catch (e) {
      showError(e, 'playbooks');
    } finally {
      setDuplicating(false);
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
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader />
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader />
      <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
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
          {/* Left: unified templates panel */}
          <div className="lg:col-span-1">
            <ScholarNotebookCard header={t('list.title')}>
              {/* Create new - inline at top */}
              <div className="p-3 border-b border-border bg-surface-alt/50">
                <div className="flex gap-2">
                  <Input
                    placeholder={t('list.newNamePlaceholder')}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={saving}
                    className="text-sm"
                  />
                  <Button onClick={createPlaybook} disabled={saving || !newName.trim()} size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Templates list */}
              {playbooks.length === 0 ? (
                <div className="p-4 text-sm text-text-soft">{t('list.empty')}</div>
              ) : (
                <div className="divide-y divide-border">
                  {playbooks.map((pb) => (
                    <button
                      key={pb.id}
                      onClick={() => selectPlaybook(pb.id)}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors relative',
                        pb.id === selectedId
                          ? 'bg-accent/10 border-l-2 border-l-accent'
                          : 'hover:bg-surface-alt border-l-2 border-l-transparent'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {pb.is_system_preset && (
                            <Lock className="w-3.5 h-3.5 text-text-soft flex-shrink-0" />
                          )}
                          <span className={cn(
                            'font-semibold truncate',
                            pb.id === selectedId ? 'text-accent' : 'text-text'
                          )}>{pb.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {pb.is_system_preset ? (
                            <span className="px-2 py-0.5 rounded-scholar text-xs font-medium bg-surface-alt text-text-soft">
                              System
                            </span>
                          ) : (
                            statusBadge(pb.status)
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-text-soft mt-1 pl-5">
                        {pb.is_system_preset ? 'Read-only • Duplicate to customize' : `v${pb.current_version?.version_number ?? '—'}`}
                      </div>
                      {pb.id === selectedId && (
                        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent rtl-flip" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScholarNotebookCard>
          </div>

          {/* Right: editor */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="rounded-scholar border border-border bg-surface p-8">
                <EmptyState
                  title={t('builder.selectToEdit')}
                  description="Choose a template from the list or create a new one."
                  variant="inline"
                />
              </div>
            ) : (
              <div className="rounded-scholar border border-border bg-surface overflow-hidden">
                {/* Sticky header with template name */}
                <div className="sticky top-0 z-10 bg-surface border-b border-border">
                  {/* System preset banner */}
                  {isSystemPreset && (
                    <div className="px-4 py-2 bg-surface-alt/50 border-b border-border flex items-center gap-2 text-sm text-text-soft">
                      <Lock className="w-4 h-4" />
                      <span>{t('builder.systemTemplateBanner')}</span>
                    </div>
                  )}
                  <div className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isSystemPreset ? (
                        /* System preset: read-only name */
                        <div className="flex items-center gap-2 min-w-0">
                          <Lock className="w-4 h-4 text-text-soft flex-shrink-0" />
                          <h2 className="text-lg font-semibold text-text truncate">
                            {spec.meta.name || selected.name}
                          </h2>
                        </div>
                      ) : editingName ? (
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          onBlur={() => {
                            if (tempName.trim()) {
                              setSpec((p) => ({ ...p, meta: { ...p.meta, name: tempName.trim() } }));
                            }
                            setEditingName(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (tempName.trim()) {
                                setSpec((p) => ({ ...p, meta: { ...p.meta, name: tempName.trim() } }));
                              }
                              setEditingName(false);
                            } else if (e.key === 'Escape') {
                              setEditingName(false);
                            }
                          }}
                          autoFocus
                          className="text-lg font-semibold text-text bg-transparent border-b-2 border-accent outline-none px-1 py-0.5 min-w-0 flex-1"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setTempName(spec.meta.name || selected.name);
                            setEditingName(true);
                          }}
                          className="group flex items-center gap-2 min-w-0"
                        >
                          <h2 className="text-lg font-semibold text-text truncate">
                            {spec.meta.name || selected.name}
                          </h2>
                          <Pencil className="w-4 h-4 text-text-soft opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                      {!isSystemPreset && statusBadge(selected.status)}
                      {!isSystemPreset && (
                        <span className="text-xs text-text-soft">
                          {isSaving ? t('builder.saving') : lastSaved ? `${t('builder.saved')} ${lastSaved.toLocaleTimeString()}` : ''}
                        </span>
                      )}
                    </div>
                    {isSystemPreset ? (
                      <Button onClick={duplicateTemplate} disabled={duplicating} variant="primary" size="sm">
                        <Copy className="w-4 h-4" />
                        {t('builder.duplicateToEdit')}
                      </Button>
                    ) : (
                      <Button onClick={publish} disabled={publishing || isSaving} variant="primary" size="sm">
                        <UploadCloud className="w-4 h-4" />
                        {t('builder.publish')}
                      </Button>
                    )}
                  </div>

                {/* Section navigation tabs */}
                <div className="flex border-t border-border bg-surface-alt/30">
                  {[
                      { id: 'modules' as const, label: t('builder.sections.modules'), icon: Layers, count: (spec.modules_v2 || []).length, active: activeSection === 'modules' },
                      { id: 'variables' as const, label: t('builder.sections.variables'), icon: Variable, count: spec.variables.length, active: activeSection === 'variables' },
                      { id: 'configuration' as const, label: t('builder.sections.configuration'), icon: Shield, count: (spec.rules || []).length + (spec.record_types || []).length + ((spec.bundle_schema?.roles || []).length > 0 ? 1 : 0), active: isConfigurationSection },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveSection(tab.id === 'configuration' ? 'rules' : tab.id)}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors border-b-2',
                          tab.active
                            ? 'text-accent border-accent bg-accent/5'
                            : 'text-text-soft border-transparent hover:text-text hover:bg-surface-alt/50'
                        )}
                      >
                        <tab.icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                        {tab.count !== undefined && tab.count > 0 && (
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded-full',
                            tab.active ? 'bg-accent/20 text-accent' : 'bg-surface-alt text-text-soft'
                          )}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section content */}
                <div className="p-4 space-y-4">
                  {isConfigurationSection && (
                    <div className="rounded-scholar border border-border bg-surface-alt/40 p-3 space-y-3">
                      <p className="text-xs text-text-soft">{t('builder.configuration.description')}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[
                          { id: 'rules' as const, icon: ShieldCheck, label: t('builder.sections.rules'), subtitle: t('builder.configuration.rulesHint') },
                          { id: 'scope' as const, icon: Globe, label: t('builder.sections.scopeRoles'), subtitle: t('builder.configuration.scopeHint') },
                          { id: 'records' as const, icon: Pencil, label: t('builder.sections.records'), subtitle: t('builder.configuration.recordsHint') },
                        ].map((section) => (
                          <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            className={cn(
                              'rounded-scholar border px-3 py-2 text-left transition-colors',
                              activeSection === section.id
                                ? 'border-accent bg-accent/10'
                                : 'border-border hover:border-accent/40 hover:bg-surface'
                            )}
                          >
                            <div className="flex items-center gap-2 text-sm font-medium text-text">
                              <section.icon className="w-4 h-4" />
                              <span>{section.label}</span>
                            </div>
                            <p className="mt-1 text-xs text-text-soft">{section.subtitle}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Modules section */}
                  {activeSection === 'modules' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-text-soft">
                          {isSystemPreset 
                            ? 'View the extraction modules defined in this system template.'
                            : 'Define extraction modules. Each module extracts specific data from documents.'}
                        </p>
                        {!isSystemPreset && (
                          <Button
                            size="sm"
                            onClick={() =>
                              setSpec((p) => {
                                const id = `module_${crypto.randomUUID().replace(/-/g, '')}`;
                                const mod = {
                                  id,
                                  title: 'New Module',
                                  prompt: defaultModulePrompt(id),
                                  json_schema: { type: 'object', properties: {}, required: [] } as Record<string, unknown>,
                                  enabled: true,
                                  show_in_report: true,
                                };
                                return syncLegacyFromModulesV2({ ...p, modules_v2: [...(p.modules_v2 || []), mod] });
                              })
                            }
                          >
                            <Plus className="w-4 h-4" />
                            Add Module
                          </Button>
                        )}
                      </div>

                      {(spec.modules_v2 || []).length === 0 ? (
                        <div className="text-sm text-text-soft py-8 text-center border border-dashed border-border rounded-scholar">
                          No modules yet. Click &ldquo;Add Module&rdquo; to create one.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(spec.modules_v2 || []).map((m, idx) => (
                            <div key={`${m.id}-${idx}`} className="rounded-scholar border border-border bg-surface-alt p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 space-y-1">
                                  <Input
                                    value={m.title}
                                    disabled={isReadOnly}
                                    onChange={(e) =>
                                      setSpec((p) => {
                                        const mods = (p.modules_v2 || []).slice();
                                        mods[idx] = { ...mods[idx], title: e.target.value };
                                        return syncLegacyFromModulesV2({ ...p, modules_v2: mods });
                                      })
                                    }
                                    placeholder="Module title"
                                    className="font-semibold"
                                  />
                                  <div className="text-xs text-text-soft">{m.id}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <ScholarToggle
                                    label="Enabled"
                                    checked={m.enabled !== false}
                                    disabled={isReadOnly}
                                    onCheckedChange={(checked) =>
                                      setSpec((p) => {
                                        const mods = (p.modules_v2 || []).slice();
                                        mods[idx] = { ...mods[idx], enabled: checked };
                                        return syncLegacyFromModulesV2({ ...p, modules_v2: mods });
                                      })
                                    }
                                  />
                                  {!isSystemPreset && (
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => {
                                        if (!window.confirm(t('builder.confirmRemoveModule'))) return;
                                        setSpec((p) => {
                                          const mods = (p.modules_v2 || []).filter((_, i) => i !== idx);
                                          return syncLegacyFromModulesV2({ ...p, modules_v2: mods });
                                        });
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-sm font-semibold text-text-soft">Prompt</label>
                                <textarea
                                  className="w-full min-h-[80px] px-3 py-2 rounded-scholar border border-border bg-surface text-text text-sm"
                                  value={m.prompt}
                                  disabled={isReadOnly}
                                  onChange={(e) =>
                                    setSpec((p) => {
                                      const mods = (p.modules_v2 || []).slice();
                                      mods[idx] = { ...mods[idx], prompt: e.target.value };
                                      return syncLegacyFromModulesV2({ ...p, modules_v2: mods });
                                    })
                                  }
                                  placeholder="Extraction instructions for this module..."
                                />
                              </div>

                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedSchemaIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(m.id)) next.delete(m.id);
                                      else next.add(m.id);
                                      return next;
                                    })
                                  }
                                  className="flex items-center gap-2 text-sm text-text-soft hover:text-text transition-colors"
                                >
                                  {expandedSchemaIds.has(m.id) ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 rtl-flip" />
                                  )}
                                  <span className="font-semibold">JSON Schema</span>
                                </button>

                                {expandedSchemaIds.has(m.id) && (
                                  <div className="pl-6 space-y-2">
                                    <textarea
                                      className="w-full min-h-[120px] font-mono text-xs px-3 py-2 rounded-scholar border border-border bg-surface text-text"
                                      value={customSchemaTextById[m.id] ?? JSON.stringify(m.json_schema || {}, null, 2)}
                                      disabled={isReadOnly}
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
                                            const mods = (p.modules_v2 || []).slice();
                                            mods[idx] = { ...mods[idx], json_schema: parsed };
                                            return syncLegacyFromModulesV2({ ...p, modules_v2: mods });
                                          });
                                        } catch {
                                          setCustomSchemaErrorById((prev) => ({ ...prev, [m.id]: 'Invalid JSON' }));
                                        }
                                      }}
                                    />
                                    {customSchemaErrorById[m.id] && (
                                      <div className="text-xs text-error">{customSchemaErrorById[m.id]}</div>
                                    )}
                                  </div>
                                )}
                              </div>

                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Variables section */}
                  {activeSection === 'variables' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-text-soft">
                          {isSystemPreset 
                            ? 'View the variables defined in this system template.'
                            : 'Define variables to extract from documents.'}
                        </p>
                        {!isSystemPreset && (
                          <Button
                            size="sm"
                            onClick={() =>
                              setSpec((p) => ({
                                ...p,
                                variables: [...p.variables, { key: `var_${p.variables.length + 1}`, type: 'text', required: false }],
                              }))
                            }
                          >
                            <Plus className="w-4 h-4" />
                            Add Variable
                          </Button>
                        )}
                      </div>

                      {spec.variables.length === 0 ? (
                        <div className="text-sm text-text-soft py-8 text-center border border-dashed border-border rounded-scholar">
                          No variables yet. Click &ldquo;Add Variable&rdquo; to create one.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {spec.variables.map((v, idx) => (
                            <div key={`${v.key}-${idx}`} className="rounded-scholar border border-border bg-surface-alt p-4 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-text-soft">Key</label>
                                  <Input
                                    value={v.key}
                                    disabled={isReadOnly}
                                    onChange={(e) =>
                                      setSpec((p) => {
                                        const vars = p.variables.slice();
                                        vars[idx] = { ...vars[idx], key: e.target.value };
                                        return { ...p, variables: vars };
                                      })
                                    }
                                    placeholder="e.g. effective_date"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-text-soft">Type</label>
                                  <Input
                                    value={v.type}
                                    disabled={isReadOnly}
                                    onChange={(e) =>
                                      setSpec((p) => {
                                        const vars = p.variables.slice();
                                        vars[idx] = { ...vars[idx], type: e.target.value };
                                        return { ...p, variables: vars };
                                      })
                                    }
                                    placeholder="text|date|number|..."
                                  />
                                </div>
                                <div className="flex items-end justify-between gap-2">
                                  <ScholarToggle
                                    label="Required"
                                    caption="Flag if missing"
                                    checked={v.required === true}
                                    disabled={isReadOnly}
                                    onCheckedChange={(checked) =>
                                      setSpec((p) => {
                                        const vars = p.variables.slice();
                                        vars[idx] = { ...vars[idx], required: checked };
                                        return { ...p, variables: vars };
                                      })
                                    }
                                  />
                                  {!isSystemPreset && (
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => {
                                        if (!window.confirm(t('builder.confirmRemoveVariable'))) return;
                                        setSpec((p) => ({ ...p, variables: p.variables.filter((_, i) => i !== idx) }));
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <Input
                                  placeholder="min (number)"
                                  value={v.constraints?.min ?? ''}
                                  disabled={isReadOnly}
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
                                  disabled={isReadOnly}
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
                                  disabled={isReadOnly}
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

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <Input
                                  placeholder={t('builder.scope.singleSourceScopePlaceholder')}
                                  value={v.source_scope || ''}
                                  disabled={isReadOnly}
                                  onChange={(e) => {
                                    const val = e.target.value.trim();
                                    setSpec((p) => {
                                      const vars = p.variables.slice();
                                      vars[idx] = { ...vars[idx], source_scope: val || undefined };
                                      return { ...p, variables: vars };
                                    });
                                  }}
                                />
                                <Input
                                  placeholder={t('builder.scope.multiSourceScopesPlaceholder')}
                                  value={(v.source_scopes || []).join(', ')}
                                  disabled={isReadOnly}
                                  onChange={(e) => {
                                    const scopes = e.target.value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                                    setSpec((p) => {
                                      const vars = p.variables.slice();
                                      vars[idx] = { ...vars[idx], source_scopes: scopes.length ? scopes : undefined };
                                      return { ...p, variables: vars };
                                    });
                                  }}
                                />
                              </div>

                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Records section (Analysis V3 additive) */}
                  {activeSection === 'records' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-text-soft">{t('builder.records.description')}</p>
                        {!isSystemPreset && (
                          <Button
                            size="sm"
                            onClick={() =>
                              setSpec((p) => ({
                                ...p,
                                record_types: [
                                  ...(p.record_types || []),
                                  {
                                    id: `record_${(p.record_types || []).length + 1}`,
                                    title: t('builder.records.defaultTitle'),
                                    json_schema: { type: 'object', properties: {}, required: [] },
                                    show_in_report: true,
                                  },
                                ],
                              }))
                            }
                          >
                            <Plus className="w-4 h-4" />
                            {t('builder.records.add')}
                          </Button>
                        )}
                      </div>

                      {(spec.record_types || []).length === 0 ? (
                        <div className="text-sm text-text-soft py-8 text-center border border-dashed border-border rounded-scholar">
                          {t('builder.records.empty')}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(spec.record_types || []).map((r, idx) => (
                            <div key={`${r.id}-${idx}`} className="rounded-scholar border border-border bg-surface-alt p-4 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-text-soft">ID</label>
                                  <Input
                                    value={r.id}
                                    disabled={isReadOnly}
                                    onChange={(e) =>
                                      setSpec((p) => {
                                        const rows = (p.record_types || []).slice();
                                        rows[idx] = { ...rows[idx], id: e.target.value };
                                        return { ...p, record_types: rows };
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-text-soft">{t('builder.records.titleField')}</label>
                                  <Input
                                    value={r.title}
                                    disabled={isReadOnly}
                                    onChange={(e) =>
                                      setSpec((p) => {
                                        const rows = (p.record_types || []).slice();
                                        rows[idx] = { ...rows[idx], title: e.target.value };
                                        return { ...p, record_types: rows };
                                      })
                                    }
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <Input
                                  placeholder={t('builder.scope.singleSourceScopePlaceholder')}
                                  value={r.source_scope || ''}
                                  disabled={isReadOnly}
                                  onChange={(e) => {
                                    const val = e.target.value.trim();
                                    setSpec((p) => {
                                      const rows = (p.record_types || []).slice();
                                      rows[idx] = { ...rows[idx], source_scope: val || undefined };
                                      return { ...p, record_types: rows };
                                    });
                                  }}
                                />
                                <Input
                                  placeholder={t('builder.scope.multiSourceScopesPlaceholder')}
                                  value={(r.source_scopes || []).join(', ')}
                                  disabled={isReadOnly}
                                  onChange={(e) => {
                                    const scopes = e.target.value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                                    setSpec((p) => {
                                      const rows = (p.record_types || []).slice();
                                      rows[idx] = { ...rows[idx], source_scopes: scopes.length ? scopes : undefined };
                                      return { ...p, record_types: rows };
                                    });
                                  }}
                                />
                              </div>

                              <ScholarToggle
                                label={t('builder.records.showInReport')}
                                checked={r.show_in_report !== false}
                                disabled={isReadOnly}
                                onCheckedChange={(checked) =>
                                  setSpec((p) => {
                                    const rows = (p.record_types || []).slice();
                                    rows[idx] = { ...rows[idx], show_in_report: checked };
                                    return { ...p, record_types: rows };
                                  })
                                }
                              />

                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-text-soft">JSON Schema</label>
                                <textarea
                                  className="w-full min-h-[120px] font-mono text-xs px-3 py-2 rounded-scholar border border-border bg-surface text-text"
                                  value={recordSchemaTextById[r.id] ?? JSON.stringify(r.json_schema || {}, null, 2)}
                                  disabled={isReadOnly}
                                  onChange={(e) => {
                                    const text = e.target.value;
                                    setRecordSchemaTextById((prev) => ({ ...prev, [r.id]: text }));
                                    try {
                                      const parsed = JSON.parse(text);
                                      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('schema_must_be_object');
                                      setRecordSchemaErrorById((prev) => ({ ...prev, [r.id]: '' }));
                                      setSpec((p) => {
                                        const rows = (p.record_types || []).slice();
                                        rows[idx] = { ...rows[idx], json_schema: parsed as Record<string, unknown> };
                                        return { ...p, record_types: rows };
                                      });
                                    } catch {
                                      setRecordSchemaErrorById((prev) => ({ ...prev, [r.id]: t('builder.records.invalidJson') }));
                                    }
                                  }}
                                />
                                {recordSchemaErrorById[r.id] && (
                                  <div className="text-xs text-error">{recordSchemaErrorById[r.id]}</div>
                                )}
                              </div>

                              {!isSystemPreset && (
                                <div className="flex justify-end pt-2 border-t border-border">
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() =>
                                      setSpec((p) => ({
                                        ...p,
                                        record_types: (p.record_types || []).filter((_, i) => i !== idx),
                                      }))
                                    }
                                  >
                                    Remove
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rules section (Analysis V3 additive) */}
                  {activeSection === 'rules' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-text-soft">{t('builder.rules.description')}</p>
                        {!isSystemPreset && (
                          <Button
                            size="sm"
                            onClick={() =>
                              setSpec((p) => ({
                                ...p,
                                rules: [
                                  ...(p.rules || []),
                                  {
                                    id: `rule_${(p.rules || []).length + 1}`,
                                    type: 'required',
                                    severity: 'warning',
                                  },
                                ],
                              }))
                            }
                          >
                            <Plus className="w-4 h-4" />
                            {t('builder.rules.add')}
                          </Button>
                        )}
                      </div>

                      {(spec.rules || []).length === 0 ? (
                        <div className="text-sm text-text-soft py-8 text-center border border-dashed border-border rounded-scholar">
                          {t('builder.rules.empty')}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(spec.rules || []).map((rule, idx) => {
                            const r = (rule || {}) as Record<string, unknown>;
                            const ruleId = String(r.id || `rule_${idx + 1}`);
                            return (
                              <div key={`${ruleId}-${idx}`} className="rounded-scholar border border-border bg-surface-alt p-4 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <Input
                                    placeholder="rule id"
                                    value={String(r.id || '')}
                                    disabled={isReadOnly}
                                    onChange={(e) => {
                                      const val = e.target.value.trim();
                                      setSpec((p) => {
                                        const rows = (p.rules || []).slice();
                                        rows[idx] = { ...(rows[idx] as any), id: val };
                                        return { ...p, rules: rows };
                                      });
                                    }}
                                  />
                                  <Input
                                    placeholder="rule type"
                                    value={String(r.type || '')}
                                    disabled={isReadOnly}
                                    onChange={(e) => {
                                      const val = e.target.value.trim();
                                      setSpec((p) => {
                                        const rows = (p.rules || []).slice();
                                        rows[idx] = { ...(rows[idx] as any), type: val };
                                        return { ...p, rules: rows };
                                      });
                                    }}
                                  />
                                  <Input
                                    placeholder="severity (warning|blocker)"
                                    value={String(r.severity || '')}
                                    disabled={isReadOnly}
                                    onChange={(e) => {
                                      const val = e.target.value.trim();
                                      setSpec((p) => {
                                        const rows = (p.rules || []).slice();
                                        rows[idx] = { ...(rows[idx] as any), severity: val || undefined };
                                        return { ...p, rules: rows };
                                      });
                                    }}
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <Input
                                    placeholder={t('builder.scope.singleSourceScopePlaceholder')}
                                    value={String((r as any).source_scope || '')}
                                    disabled={isReadOnly}
                                    onChange={(e) => {
                                      const val = e.target.value.trim();
                                      setSpec((p) => {
                                        const rows = (p.rules || []).slice();
                                        rows[idx] = { ...(rows[idx] as any), source_scope: val || undefined };
                                        return { ...p, rules: rows };
                                      });
                                    }}
                                  />
                                  <Input
                                    placeholder={t('builder.scope.multiSourceScopesPlaceholder')}
                                    value={Array.isArray((r as any).source_scopes) ? ((r as any).source_scopes as any[]).join(', ') : ''}
                                    disabled={isReadOnly}
                                    onChange={(e) => {
                                      const scopes = e.target.value
                                        .split(',')
                                        .map((s) => s.trim())
                                        .filter(Boolean);
                                      setSpec((p) => {
                                        const rows = (p.rules || []).slice();
                                        rows[idx] = { ...(rows[idx] as any), source_scopes: scopes.length ? scopes : undefined };
                                        return { ...p, rules: rows };
                                      });
                                    }}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-text-soft">{t('builder.rules.jsonLabel')}</label>
                                  <textarea
                                    className="w-full min-h-[120px] font-mono text-xs px-3 py-2 rounded-scholar border border-border bg-surface text-text"
                                    value={ruleTextById[ruleId] ?? JSON.stringify(r, null, 2)}
                                    disabled={isReadOnly}
                                    onChange={(e) => {
                                      const text = e.target.value;
                                      setRuleTextById((prev) => ({ ...prev, [ruleId]: text }));
                                      try {
                                        const parsed = JSON.parse(text);
                                        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_rule_json');
                                        const pid = String((parsed as any).id || '').trim();
                                        const ptype = String((parsed as any).type || '').trim();
                                        if (!pid || !ptype) throw new Error('missing_id_or_type');
                                        setRuleErrorById((prev) => ({ ...prev, [ruleId]: '' }));
                                        setSpec((p) => {
                                          const rows = (p.rules || []).slice();
                                          rows[idx] = parsed as Record<string, unknown>;
                                          return { ...p, rules: rows };
                                        });
                                      } catch {
                                        setRuleErrorById((prev) => ({ ...prev, [ruleId]: t('builder.rules.invalidJson') }));
                                      }
                                    }}
                                  />
                                  {ruleErrorById[ruleId] && <div className="text-xs text-error">{ruleErrorById[ruleId]}</div>}
                                </div>

                                {!isSystemPreset && (
                                  <div className="flex justify-end pt-2 border-t border-border">
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() =>
                                        setSpec((p) => ({
                                          ...p,
                                          rules: (p.rules || []).filter((_, i) => i !== idx),
                                        }))
                                      }
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scope & roles section */}
                  {activeSection === 'scope' && (
                    <div className="space-y-4">
                      <p className="text-sm text-text-soft">{t('builder.scope.description')}</p>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-text-soft">{t('builder.scope.scopeLabel')}</label>
                        <select
                          className="w-full px-3 py-2 rounded-scholar border border-border bg-surface text-text text-sm"
                          disabled={isReadOnly}
                          value={spec.scope || 'either'}
                          onChange={(e) => setSpec((p) => ({ ...p, scope: e.target.value as PlaybookSpecV1['scope'] }))}
                        >
                          <option value="single">{t('builder.scope.single')}</option>
                          <option value="bundle">{t('builder.scope.bundle')}</option>
                          <option value="either">{t('builder.scope.either')}</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-text-soft">{t('builder.scope.rolesTitle')}</label>
                          {!isSystemPreset && (
                            <Button
                              size="sm"
                              onClick={() =>
                                setSpec((p) => {
                                  const roles = (p.bundle_schema?.roles || []).slice();
                                  roles.push({ role: `role_${roles.length + 1}`, required: true, multiple: false });
                                  return { ...p, bundle_schema: { ...(p.bundle_schema || {}), roles } };
                                })
                              }
                            >
                              <Plus className="w-4 h-4" />
                              {t('builder.scope.addRole')}
                            </Button>
                          )}
                        </div>

                        {(spec.bundle_schema?.roles || []).length === 0 ? (
                          <div className="text-sm text-text-soft py-6 text-center border border-dashed border-border rounded-scholar">
                            {t('builder.scope.emptyRoles')}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {(spec.bundle_schema?.roles || []).map((role, idx) => (
                              <div key={`${role.role}-${idx}`} className="rounded-scholar border border-border bg-surface-alt p-3 space-y-3">
                                <Input
                                  value={role.role}
                                  disabled={isReadOnly}
                                  placeholder="vendor_contract"
                                  onChange={(e) => {
                                    const val = e.target.value.trim();
                                    setSpec((p) => {
                                      const roles = (p.bundle_schema?.roles || []).slice();
                                      roles[idx] = { ...roles[idx], role: val };
                                      return { ...p, bundle_schema: { ...(p.bundle_schema || {}), roles } };
                                    });
                                  }}
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <ScholarToggle
                                    label={t('builder.scope.required')}
                                    checked={role.required === true}
                                    disabled={isReadOnly}
                                    onCheckedChange={(checked) =>
                                      setSpec((p) => {
                                        const roles = (p.bundle_schema?.roles || []).slice();
                                        roles[idx] = { ...roles[idx], required: checked };
                                        return { ...p, bundle_schema: { ...(p.bundle_schema || {}), roles } };
                                      })
                                    }
                                  />
                                  <ScholarToggle
                                    label={t('builder.scope.multiple')}
                                    checked={role.multiple === true}
                                    disabled={isReadOnly}
                                    onCheckedChange={(checked) =>
                                      setSpec((p) => {
                                        const roles = (p.bundle_schema?.roles || []).slice();
                                        roles[idx] = { ...roles[idx], multiple: checked };
                                        return { ...p, bundle_schema: { ...(p.bundle_schema || {}), roles } };
                                      })
                                    }
                                  />
                                </div>
                                {!isSystemPreset && (
                                  <div className="flex justify-end">
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() =>
                                        setSpec((p) => {
                                          const roles = (p.bundle_schema?.roles || []).filter((_, i) => i !== idx);
                                          return { ...p, bundle_schema: { ...(p.bundle_schema || {}), roles } };
                                        })
                                      }
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-text-soft">{t('builder.scope.allowedTypes')}</label>
                        <Input
                          value={(spec.bundle_schema?.allowed_document_types || []).join(', ')}
                          disabled={isReadOnly}
                          placeholder={t('builder.scope.allowedTypesPlaceholder')}
                          onChange={(e) => {
                            const parts = e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean);
                            setSpec((p) => ({
                              ...p,
                              bundle_schema: {
                                ...(p.bundle_schema || {}),
                                allowed_document_types: parts.length ? parts : undefined,
                              },
                            }));
                          }}
                        />
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
