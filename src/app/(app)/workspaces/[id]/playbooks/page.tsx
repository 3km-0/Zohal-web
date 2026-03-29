'use client';

// NOTE: This page remains a compatibility/operator editing surface while Zohal
// converges on template-first, agent-compiled authoring. The long-term default
// user flow should be "choose a Zohal template or Custom -> describe the
// desired analysis/portal -> let the agent compile the template intent", not
// manual editing of modules/variables/rules.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronDown, ChevronRight, Plus, UploadCloud, Shield, ShieldCheck, Globe, Layers, Variable, Lock, Copy, Pencil } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import {
  Badge,
  Button,
  Card,
  Input,
  Spinner,
  ScholarNotebookCard,
  ScholarToggle,
  EmptyState,
} from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import type { PlaybookRecord as TemplateRecord, TemplateSpecV1 as PlaybookSpecV1 } from '@/types/templates';
import { cn } from '@/lib/utils';

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

type PlaybookRow = TemplateRecord;

function deriveTemplateSourceText(spec: Partial<PlaybookSpecV1> | Record<string, unknown>, fallbackName: string): string {
  const meta = spec && typeof spec === 'object' && spec.meta && typeof spec.meta === 'object' ? spec.meta : {};
  const source = spec && typeof spec === 'object' && spec.template_source && typeof spec.template_source === 'object'
    ? spec.template_source as { text?: string }
    : null;
  if (source && typeof source.text === 'string' && source.text.trim()) {
    return source.text;
  }

  const lines: string[] = [];
  const metaName = typeof (meta as { name?: unknown }).name === 'string' ? String((meta as { name?: string }).name).trim() : fallbackName;
  const metaKind = typeof (meta as { kind?: unknown }).kind === 'string' ? String((meta as { kind?: string }).kind).trim() : 'document';
  const metaDescription = typeof (meta as { description?: unknown }).description === 'string'
    ? String((meta as { description?: string }).description).trim()
    : '';
  lines.push(`Template: ${metaName}`);
  lines.push(`Kind: ${metaKind}`);
  if (metaDescription) lines.push(`Goal: ${metaDescription}`);
  lines.push(`Scope: ${String((spec as { scope?: string }).scope || 'either')}`);

  const roles = Array.isArray((spec as { bundle_schema?: { roles?: BundleRoleRow[] } }).bundle_schema?.roles)
    ? (spec as { bundle_schema?: { roles?: BundleRoleRow[] } }).bundle_schema?.roles || []
    : [];
  if (roles.length > 0) {
    lines.push('Roles:');
    roles.forEach((role) => lines.push(`- ${role.role} (${role.required ? 'required' : 'optional'}${role.multiple ? ', multiple' : ''})`));
  }

  const variables = Array.isArray((spec as { variables?: Array<{ key?: string; type?: string; required?: boolean }> }).variables)
    ? (spec as { variables?: Array<{ key?: string; type?: string; required?: boolean }> }).variables || []
    : [];
  if (variables.length > 0) {
    lines.push('Variables:');
    variables.forEach((variable) => {
      if (!variable?.key) return;
      lines.push(`- ${variable.key}: ${variable.type || 'text'}${variable.required ? ' required' : ''}`);
    });
  }

  const modules = Array.isArray((spec as { modules_v2?: Array<{ title?: string; prompt?: string }> }).modules_v2)
    ? (spec as { modules_v2?: Array<{ title?: string; prompt?: string }> }).modules_v2 || []
    : [];
  if (modules.length > 0) {
    lines.push('Modules:');
    modules.forEach((module) => {
      lines.push(`- ${module.title || 'Module'}: ${module.prompt || ''}`.trim());
    });
  }

  return lines.join('\n').trim();
}

function summarizeCompiledSpec(spec: PlaybookSpecV1) {
  const enabledModules = (spec.modules_v2 || []).filter((module) => module.enabled !== false);
  return {
    variableCount: spec.variables.length,
    moduleCount: enabledModules.length,
    scope: spec.scope || 'either',
    moduleTitles: enabledModules.map((module) => module.title || module.id).slice(0, 6),
  };
}

function summarizeIntentSpec(spec: PlaybookSpecV1) {
  const intent = spec.intent || {};
  const extractionTargets = Array.isArray(intent.extraction_targets) ? intent.extraction_targets : [];
  const derivationIntents = Array.isArray(intent.derivation_intents) ? intent.derivation_intents : [];
  const projectionIntents = Array.isArray(intent.projection_intents) ? intent.projection_intents : [];
  const version = spec.template_source?.version || spec.current_version_id || null;
  return {
    extractionCount: extractionTargets.length,
    derivationCount: derivationIntents.length,
    projectionCount: projectionIntents.length,
    extractionLabels: extractionTargets.map((target) => target.label || target.id).filter(Boolean).slice(0, 8),
    derivationLabels: derivationIntents.map((target) => target.label || target.id).filter(Boolean).slice(0, 8),
    projectionLabels: projectionIntents.map((projection) => projection.title || projection.route_id).filter(Boolean).slice(0, 8),
    version,
  };
}

function normalizeSpec(input: any, fallbackName: string): PlaybookSpecV1 {
  const base = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};
  const baseMeta = input?.meta && typeof input.meta === 'object' && !Array.isArray(input.meta) ? { ...input.meta } : {};
  const metaName = typeof input?.meta?.name === 'string' ? input.meta.name : fallbackName;
  const metaKind = typeof input?.meta?.kind === 'string' ? input.meta.kind : 'document';
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
    const legacy = Array.isArray(modules) && modules.length ? modules : [];
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

  const rawIntent = input?.intent && typeof input.intent === 'object' && !Array.isArray(input.intent)
    ? input.intent
    : {};
  const intent: PlaybookSpecV1['intent'] = {
    source_scope_rules:
      rawIntent.source_scope_rules && typeof rawIntent.source_scope_rules === 'object' && !Array.isArray(rawIntent.source_scope_rules)
        ? {
            mode:
              rawIntent.source_scope_rules.mode === 'single_document'
                ? 'single_document'
                : rawIntent.source_scope_rules.mode === 'bundle'
                ? 'bundle'
                : 'workspace',
            allowed_roles: Array.isArray(rawIntent.source_scope_rules.allowed_roles)
              ? rawIntent.source_scope_rules.allowed_roles.map((x: any) => String(x).trim()).filter(Boolean)
              : undefined,
            required_document_ids: Array.isArray(rawIntent.source_scope_rules.required_document_ids)
              ? rawIntent.source_scope_rules.required_document_ids.map((x: any) => String(x).trim()).filter(Boolean)
              : undefined,
          }
        : undefined,
    extraction_targets: Array.isArray(rawIntent.extraction_targets)
      ? rawIntent.extraction_targets
          .map((target: any, index: number) => ({
            id: String(target?.id || `target_${index + 1}`).trim(),
            label: String(target?.label || target?.id || `Target ${index + 1}`).trim(),
            description: typeof target?.description === 'string' ? target.description : undefined,
            structural_facet: typeof target?.structural_facet === 'string' ? target.structural_facet : undefined,
            required: target?.required === true,
            source_scope: typeof target?.source_scope === 'string' ? target.source_scope : undefined,
            source_scopes: Array.isArray(target?.source_scopes) ? target.source_scopes.map((x: any) => String(x).trim()).filter(Boolean) : undefined,
            examples: Array.isArray(target?.examples) ? target.examples.map((x: any) => String(x).trim()).filter(Boolean) : undefined,
          }))
          .filter((target: any) => !!target.id && !!target.label)
      : [],
    derivation_intents: Array.isArray(rawIntent.derivation_intents)
      ? rawIntent.derivation_intents
          .map((intentRow: any, index: number) => ({
            id: String(intentRow?.id || `derived_${index + 1}`).trim(),
            label: String(intentRow?.label || intentRow?.id || `Derived ${index + 1}`).trim(),
            description: String(intentRow?.description || '').trim(),
            structural_facet: typeof intentRow?.structural_facet === 'string' ? intentRow.structural_facet : undefined,
            required: intentRow?.required === true,
            input_target_ids: Array.isArray(intentRow?.input_target_ids) ? intentRow.input_target_ids.map((x: any) => String(x).trim()).filter(Boolean) : undefined,
            method: typeof intentRow?.method === 'string' ? intentRow.method : undefined,
          }))
          .filter((intentRow: any) => !!intentRow.id && !!intentRow.label && !!intentRow.description)
      : [],
    projection_intents: Array.isArray(rawIntent.projection_intents)
      ? rawIntent.projection_intents
          .map((projection: any, index: number) => ({
            route_id: String(projection?.route_id || `route_${index + 1}`).trim(),
            title: String(projection?.title || projection?.route_id || `Route ${index + 1}`).trim(),
            description: typeof projection?.description === 'string' ? projection.description : undefined,
            view_kind: typeof projection?.view_kind === 'string' ? projection.view_kind : undefined,
            structural_facets: Array.isArray(projection?.structural_facets) ? projection.structural_facets.map((x: any) => String(x).trim()).filter(Boolean) : undefined,
            provenance_classes: Array.isArray(projection?.provenance_classes) ? projection.provenance_classes.filter((x: any) => x === 'extracted' || x === 'derived') : undefined,
          }))
          .filter((projection: any) => !!projection.route_id && !!projection.title)
      : [],
    review_policy:
      rawIntent.review_policy && typeof rawIntent.review_policy === 'object' && !Array.isArray(rawIntent.review_policy)
        ? {
            enable_verifier: rawIntent.review_policy.enable_verifier === true,
            selective: rawIntent.review_policy.selective !== false,
            high_impact_only: rawIntent.review_policy.high_impact_only === true,
            require_anchor_verification: rawIntent.review_policy.require_anchor_verification !== false,
          }
        : undefined,
    presentation_hints:
      rawIntent.presentation_hints && typeof rawIntent.presentation_hints === 'object' && !Array.isArray(rawIntent.presentation_hints)
        ? {
            default_title: typeof rawIntent.presentation_hints.default_title === 'string' ? rawIntent.presentation_hints.default_title : undefined,
            default_summary: typeof rawIntent.presentation_hints.default_summary === 'string' ? rawIntent.presentation_hints.default_summary : undefined,
            preferred_locale: typeof rawIntent.presentation_hints.preferred_locale === 'string' ? rawIntent.presentation_hints.preferred_locale : undefined,
          }
        : undefined,
  };

  return syncLegacyFromModulesV2({
    ...base,
    meta: { ...baseMeta, name: metaName, kind: metaKind },
    intent,
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
  const operatorMode = searchParams.get('operator') === '1';
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
  const [customBrief, setCustomBrief] = useState('');
  const [spec, setSpec] = useState<PlaybookSpecV1>({
    meta: { name: '', kind: 'document' },
    options: { strictness: 'default', enable_verifier: false, language: 'en' },
    scope: 'either',
    modules: ['variables', 'clauses', 'obligations', 'risks', 'deadlines'],
    outputs: ['overview', 'variables', 'clauses', 'obligations', 'risks', 'deadlines'],
    intent: {
      extraction_targets: [],
      derivation_intents: [],
      projection_intents: [],
      review_policy: {
        enable_verifier: false,
        selective: true,
        high_impact_only: false,
        require_anchor_verification: true,
      },
    },
    modules_v2: [],
    variables: [],
    checks: [],
  });

  const [customSchemaTextById, setCustomSchemaTextById] = useState<Record<string, string>>({});
  const [customSchemaErrorById, setCustomSchemaErrorById] = useState<Record<string, string>>({});
  const [ruleTextById, setRuleTextById] = useState<Record<string, string>>({});
  const [ruleErrorById, setRuleErrorById] = useState<Record<string, string>>({});
  const [expandedSchemaIds, setExpandedSchemaIds] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<'modules' | 'variables' | 'rules' | 'scope'>('modules');
  const isConfigurationSection = activeSection === 'scope';
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
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [templateSourceText, setTemplateSourceText] = useState('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const compileAndSave = useCallback(async (publish = false) => {
    if (!selected || isSystemPreset) return;
    setIsSaving(true);
    setIsCompiling(true);
    try {
      const { data, error } = await supabase.functions.invoke('playbooks-save-draft', {
        body: {
          playbook_id: selected.id,
          template_name: (spec.meta.name || selected.name || '').trim(),
          template_source_text: templateSourceText,
          language: spec.options?.language === 'ar' ? 'ar' : 'en',
          document_type: spec.meta.kind || 'document',
          publish,
          changelog: publish ? 'Published from template source' : 'Saved from template source',
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to save');
      const savedSpec = normalizeSpec(data.spec_json, spec.meta.name || selected.name);
      setSpec(savedSpec);
      setLastSaved(new Date());
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
                  name: savedSpec.meta.name || pb.name,
                  status: publish ? 'published' : 'draft',
                  current_version_id: versionId,
                  current_version: {
                    id: versionId,
                    version_number: versionNumber,
                    spec_json: savedSpec,
                    published_at: publishedAt ?? pb.current_version?.published_at ?? null,
                  },
                }
              : pb
          )
        );
      }
      setTemplateSourceText(deriveTemplateSourceText(savedSpec, savedSpec.meta.name || selected.name));
    } catch (e) {
      showError(e, 'playbooks');
    } finally {
      setIsSaving(false);
      setIsCompiling(false);
    }
  }, [isSystemPreset, selected, showError, spec, supabase, templateSourceText]);

  async function loadPlaybooks() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('playbooks-list', {
        body: { workspace_id: workspaceId, kind: 'document' }, // no status filter
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
          setTemplateSourceText(deriveTemplateSourceText(initial, first.name));
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
    if (pb) {
      const next = normalizeSpec(pb.current_version?.spec_json, pb.name);
      setSpec(next);
      setTemplateSourceText(deriveTemplateSourceText(next, pb.name));
    }
  }

  async function createCustomTemplate() {
    if (!newName.trim() || !customBrief.trim()) return;
    setCreatingCustom(true);
    try {
      const { data, error } = await supabase.functions.invoke('playbooks-save-draft', {
        body: {
          workspace_id: workspaceId,
          template_name: newName.trim(),
          template_source_text: customBrief.trim(),
          language: 'en',
          document_type: 'document',
          publish: false,
          changelog: 'Initial custom template draft',
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to create custom template');
      showSuccess('Custom template created');
      setNewName('');
      setCustomBrief('');
      const rows = await loadPlaybooks();
      const createdId = String(data.playbook?.id || '').trim();
      if (createdId) {
        const created = rows.find((row) => row.id === createdId);
        if (created) {
          const next = normalizeSpec(created.current_version?.spec_json, created.name);
          setSelectedId(created.id);
          setSpec(next);
          setTemplateSourceText(deriveTemplateSourceText(next, created.name));
        }
      }
    } catch (e) {
      showError(e, 'playbooks');
    } finally {
      setCreatingCustom(false);
    }
  }

  async function publish() {
    if (!selected || isSystemPreset) return;
    setPublishing(true);
    try {
      await compileAndSave(true);
      showSuccess('Published');
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
      const sourceSpec = (selected.current_version?.spec_json &&
        typeof selected.current_version.spec_json === 'object'
        ? selected.current_version.spec_json
        : spec) as PlaybookSpecV1;
      const duplicatedSpec = {
        ...sourceSpec,
        meta: { ...(sourceSpec.meta || { kind: 'document' }), name: `${selected.name} (Copy)` },
      };
      const { data, error } = await supabase.functions.invoke('playbooks-create', {
        body: {
          workspace_id: workspaceId,
          name: `${selected.name} (Copy)`,
          kind: 'document',
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
        const next = normalizeSpec(specSource, row?.name || `${selected.name} (Copy)`);
        setSpec(next);
        setTemplateSourceText(deriveTemplateSourceText(next, row?.name || `${selected.name} (Copy)`));
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

        <Card className="p-4 border-dashed">
          <div className="text-sm font-semibold text-text">Template-first authoring</div>
          <p className="mt-1 text-sm text-text-soft">
            Normal users should choose a Zohal template or describe a custom experience in natural language. The agent compiles that into versioned
            extraction, derivation, and projection intent behind the scenes.
          </p>
          {operatorMode && (
            <p className="mt-2 text-xs text-text-soft">
              Operator mode is enabled, so the deprecated low-level recipe editor is available below for compatibility work only.
            </p>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: unified templates panel */}
          <div className="lg:col-span-1">
            <ScholarNotebookCard header={t('list.title')}>
              {/* Create custom */}
              <div className="p-3 border-b border-border bg-surface-alt/50">
                <div className="space-y-2">
                  <Input
                    placeholder="Custom template name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={creatingCustom}
                    className="text-sm"
                  />
                  <textarea
                    className="w-full min-h-[120px] rounded-scholar border border-border bg-surface px-3 py-2 text-sm text-text"
                    placeholder="Describe the analysis and portal you want. Example: Build a vendor onboarding workspace that extracts supplier identity, bank details, compliance documents, expiry dates, and then derives onboarding blockers and a route-based portal with overview, extracted evidence, and blockers."
                    value={customBrief}
                    onChange={(e) => setCustomBrief(e.target.value)}
                    disabled={creatingCustom}
                  />
                  <Button onClick={createCustomTemplate} disabled={creatingCustom || !newName.trim() || !customBrief.trim()} size="sm">
                    {creatingCustom ? <Spinner size="sm" /> : <Plus className="w-4 h-4" />}
                    Create Custom
                  </Button>
                </div>
              </div>

              {/* Templates list */}
              {playbooks.length === 0 ? (
                <div className="p-4 text-sm text-text-soft">{t('list.empty')}</div>
              ) : (
                <div>
                  {[
                    { title: 'Zohal templates', rows: playbooks.filter((pb) => pb.is_system_preset) },
                    { title: 'Workspace custom', rows: playbooks.filter((pb) => !pb.is_system_preset) },
                  ].map((group) =>
                    group.rows.length > 0 ? (
                      <div key={group.title} className="border-t border-border first:border-t-0">
                        <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-text-soft bg-surface-alt/30">
                          {group.title}
                        </div>
                        <div className="divide-y divide-border">
                          {group.rows.map((pb) => (
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
                                  <span className={cn('font-semibold truncate', pb.id === selectedId ? 'text-accent' : 'text-text')}>
                                    {pb.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {pb.is_system_preset ? (
                                    <span className="px-2 py-0.5 rounded-scholar text-xs font-medium bg-surface-alt text-text-soft">
                                      Zohal
                                    </span>
                                  ) : (
                                    statusBadge(pb.status || 'draft')
                                  )}
                                </div>
                              </div>
                              <div className="text-xs text-text-soft mt-1 pl-5">
                                {pb.is_system_preset ? `Version ${pb.current_version?.version_number ?? '—'} • Duplicate to customize` : `Version ${pb.current_version?.version_number ?? '—'}`}
                              </div>
                              {pb.id === selectedId && (
                                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent rtl-flip" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
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
                <div className="bg-surface border-b border-border">
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
                      {!isSystemPreset && statusBadge(selected.status || 'draft')}
                      <span className="text-xs text-text-soft">
                        Version {selected.current_version?.version_number ?? '—'}
                        {!isSystemPreset && (isSaving ? ` • ${t('builder.saving')}` : lastSaved ? ` • ${t('builder.saved')} ${lastSaved.toLocaleTimeString()}` : '')}
                      </span>
                    </div>
                    {isSystemPreset ? (
                      <Button onClick={duplicateTemplate} disabled={duplicating} variant="primary" size="sm">
                        <Copy className="w-4 h-4" />
                        {t('builder.duplicateToEdit')}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button onClick={() => void compileAndSave(false)} disabled={publishing || isSaving || isCompiling} variant="secondary" size="sm">
                          {isCompiling ? <Spinner size="sm" /> : null}
                          Save Draft
                        </Button>
                        <Button onClick={publish} disabled={publishing || isSaving || isCompiling} variant="primary" size="sm">
                          <UploadCloud className="w-4 h-4" />
                          {t('builder.publish')}
                        </Button>
                      </div>
                    )}
                  </div>

                    <div className="p-4 space-y-4 border-t border-border">
                    <div className="rounded-scholar border border-border bg-surface-alt/40 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-text">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Template source</span>
                      </div>
                      <p className="text-sm text-text-soft">
                        Describe what the template should do in natural language. Zohal compiles this source into the internal analysis template that runs behind the scenes.
                      </p>
                      <textarea
                        className="w-full min-h-[260px] rounded-scholar border border-border bg-surface px-3 py-3 text-sm text-text"
                        value={templateSourceText}
                        disabled={isReadOnly}
                        onChange={(e) => setTemplateSourceText(e.target.value)}
                        placeholder="Example: Review employment agreements for compensation, probation, notice periods, termination rights, restrictive covenants, and employer obligations. Extract the effective date, salary, governing law, probation period, notice period, and termination triggers."
                      />
                    </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {(() => {
                        const summary = summarizeIntentSpec(spec);
                        return (
                          <>
                            <div className="rounded-scholar border border-border bg-surface-alt/30 p-4">
                              <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">Extraction</div>
                              <div className="mt-2 text-2xl font-semibold text-text">{summary.extractionCount}</div>
                            </div>
                            <div className="rounded-scholar border border-border bg-surface-alt/30 p-4">
                              <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">Derived insights</div>
                              <div className="mt-2 text-2xl font-semibold text-text">{summary.derivationCount}</div>
                            </div>
                            <div className="rounded-scholar border border-border bg-surface-alt/30 p-4">
                              <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">Views</div>
                              <div className="mt-2 text-2xl font-semibold text-text">{summary.projectionCount}</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div className="rounded-scholar border border-border bg-surface-alt/30 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-text">
                        <Layers className="w-4 h-4" />
                        <span>Latest compiled intent</span>
                      </div>
                      {(() => {
                        const summary = summarizeIntentSpec(spec);
                        const hasIntent = summary.extractionCount > 0 || summary.derivationCount > 0 || summary.projectionCount > 0;
                        if (!hasIntent) {
                          return (
                            <p className="text-sm text-text-soft">
                              Save the draft to compile this source into extraction, derivation, and projection intent.
                            </p>
                          );
                        }
                        return (
                          <div className="space-y-3">
                            {summary.extractionLabels.length > 0 && (
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">Extraction targets</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {summary.extractionLabels.map((label) => (
                                    <Badge key={label} variant="accent">{label}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {summary.derivationLabels.length > 0 && (
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">Derived insights</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {summary.derivationLabels.map((label) => (
                                    <Badge key={label} variant="warning">{label}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {summary.projectionLabels.length > 0 && (
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">Views</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {summary.projectionLabels.map((label) => (
                                    <Badge key={label}>{label}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {operatorMode && (
                      <div className="rounded-scholar border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                        <div className="text-sm font-semibold text-text">Deprecated operator recipe editor</div>
                        <p className="text-sm text-text-soft">
                          This low-level editor is kept for compatibility and migration work only. The recommended product path is template selection or a
                          custom natural-language brief compiled by the agent.
                        </p>
                      </div>
                    )}
                  </div>

                {operatorMode ? (
                  <div className="border-t border-border bg-surface-alt/20 p-4">
                    <div className="rounded-scholar border border-border bg-surface-alt/40 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-text">
                        <Shield className="w-4 h-4" />
                        <span>Operator compatibility surface</span>
                      </div>
                      <p className="text-sm text-text-soft">
                        Low-level template fields are deprecated. They remain persisted for compatibility, but normal authoring should happen through the
                        natural-language template source above. This operator view is intentionally read-only and shows the raw compiled template contract
                        that still ships with the current record.
                      </p>
                      <textarea
                        className="w-full min-h-[320px] rounded-scholar border border-border bg-surface px-3 py-3 font-mono text-xs text-text"
                        value={JSON.stringify(spec, null, 2)}
                        readOnly
                      />
                    </div>
                  </div>
                ) : null}
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
