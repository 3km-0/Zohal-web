'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle,
  Database,
  ExternalLink,
  Globe,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, ZohalToggle, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  ApiConnectionAuthMode,
  ApiConnectionMappingStatus,
  ApiConnectionSourceKind,
  Workspace,
  WorkspaceApiConnection,
} from '@/types/database';
import { cn } from '@/lib/utils';

interface IntegrationAccount {
  provider: string;
  status: string;
  connected_at: string;
}

type TestResult = {
  ok: boolean;
  status: number;
  error?: string;
  response_preview?: unknown;
  response_body?: unknown;
  request_url?: string;
  content_type?: string;
  root_candidates?: string[];
  resolved_source_kind?: 'http' | 'mcp';
};

type ApiSourcePreset = 'public_json' | 'api_key' | 'oauth_service' | 'internal_rest';
type SourceTypeChoice = 'http' | 'mcp' | 'finance_builtin';
type FinanceConnectorKey =
  | 'market_company_facts'
  | 'market_overview'
  | 'filings_fundamentals'
  | 'credit_rates_benchmarks';
type WizardStep = 'basics' | 'auth';

type MappingProposal = {
  normalization_config_json?: Record<string, unknown>;
  mapping_summary_json?: {
    overview?: string | null;
    what_zohal_will_use?: string[] | null;
    why_it_matches_template?: string | null;
    what_was_ignored?: string[] | null;
    excerpt_strategy?: string | null;
  } | null;
  mapping_generated_at?: string | null;
  mapping_generated_from_prompt?: string | null;
  mapping_status?: ApiConnectionMappingStatus | null;
};

type ApiSourceDraft = {
  id?: string;
  source_kind: SourceTypeChoice;
  name: string;
  description: string;
  endpoint_url: string;
  http_method: 'GET' | 'POST';
  mcp_server_url: string;
  mcp_tool_name: string;
  mcp_input_template_raw: string;
  finance_connector_key: FinanceConnectorKey;
  auth_mode: ApiConnectionAuthMode;
  token_url: string;
  scope: string;
  audience: string;
  api_key_header_name: string;
  response_root_path: string;
  include_paths_raw: string;
  exclude_paths_raw: string;
  preferred_fields_raw: string;
  api_key: string;
  bearer_token: string;
  basic_token_raw: string;
  client_id: string;
  client_secret: string;
  access_token: string;
  refresh_token: string;
  preset?: ApiSourcePreset;
  mapping_proposal?: MappingProposal | null;
};

type AttachSelection = {
  workspaceId: string;
  enabledByDefault: boolean;
};

type ApiSourceWizardLabels = {
  addSource: string;
  editSource: string;
  modalDescription: string;
  stepLabel: string;
  next: string;
  back: string;
  show: string;
  hide: string;
  name: string;
  descriptionLabel: string;
  endpointUrl: string;
  method: string;
  apiKeyHeaderName: string;
  apiKey: string;
  bearerToken: string;
  basicSecret: string;
  tokenUrl: string;
  scope: string;
  audience: string;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  responseRootPath: string;
  responseRootHint: string;
  preferredFields: string;
  includePaths: string;
  excludePaths: string;
  advancedAuth: string;
  advancedMapping: string;
  testConnection: string;
  cancel: string;
  saveChanges: string;
  saveDraft: string;
  saveAndContinue: string;
  connectionSucceeded: string;
  connectionFailed: string;
  presetsTitle: string;
  presetsDescription: string;
  suggestedPaths: string;
  previewTitle: string;
  previewDescription: string;
  previewPrompt: string;
  previewEmpty: string;
  sourceTypesTitle: string;
  mappingSummaryTitle: string;
  mappingSummaryEmpty: string;
  steps: Record<WizardStep, { title: string; description: string }>;
  presets: Record<ApiSourcePreset, { title: string; description: string }>;
  authModes: Record<ApiConnectionAuthMode, string>;
  authHints: Record<ApiConnectionAuthMode, string>;
};

type ApiSourceAttachLabels = {
  title: string;
  description: string;
  loading: string;
  empty: string;
  defaultLabel: string;
  defaultCaption: string;
  skip: string;
  confirm: string;
};

const WIZARD_STEPS: Array<{ id: WizardStep }> = [
  { id: 'basics' },
  { id: 'auth' },
];

const PRESETS: Array<{
  id: ApiSourcePreset;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'public_json', icon: Globe },
  { id: 'api_key', icon: KeyRound },
  { id: 'oauth_service', icon: ShieldCheck },
  { id: 'internal_rest', icon: Workflow },
];

const SOURCE_TYPE_CHOICES: Array<{
  id: SourceTypeChoice;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}> = [
  {
    id: 'http',
    icon: Globe,
    title: 'Connect via API',
    description: 'Bring in a REST or JSON endpoint with reusable auth and evidence-grade excerpts.',
  },
  {
    id: 'mcp',
    icon: Database,
    title: 'Connect via MCP',
    description: 'Use an MCP server and tool as a first-class source for Zohal runs.',
  },
  {
    id: 'finance_builtin',
    icon: ShieldCheck,
    title: 'Use Finance Connector',
    description: 'Start from a curated finance-friendly connector and let Zohal map it for you.',
  },
];

const FINANCE_CONNECTOR_OPTIONS: Array<{
  id: FinanceConnectorKey;
  title: string;
  description: string;
  endpointUrl?: string;
}> = [
  {
    id: 'market_company_facts',
    title: 'Market / Company Facts',
    description: 'Structured company facts and filing-backed market context.',
  },
  {
    id: 'market_overview',
    title: 'Prices / Market Overview',
    description: 'Top-line market indicators and public market snapshots.',
  },
  {
    id: 'filings_fundamentals',
    title: 'Filings / Fundamentals',
    description: 'Filing-derived statements, ratios, and issuer metrics.',
  },
  {
    id: 'credit_rates_benchmarks',
    title: 'Credit / Rates / Benchmarks',
    description: 'Ready immediately with a public Treasury rates source.',
    endpointUrl:
      'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/avg_interest_rates?sort=-record_date&page[number]=1&page[size]=10',
  },
];

function normalizeWhatsappPhoneInput(value: string): string | null | '' {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length < 8) return null;
  return `+${digits}`;
}

function emptyDraft(): ApiSourceDraft {
  return {
    source_kind: 'http',
    name: '',
    description: '',
    endpoint_url: '',
    http_method: 'GET',
    mcp_server_url: '',
    mcp_tool_name: '',
    mcp_input_template_raw: '{}',
    finance_connector_key: 'credit_rates_benchmarks',
    auth_mode: 'none',
    token_url: '',
    scope: '',
    audience: '',
    api_key_header_name: '',
    response_root_path: '',
    include_paths_raw: '',
    exclude_paths_raw: '',
    preferred_fields_raw: '',
    api_key: '',
    bearer_token: '',
    basic_token_raw: '',
    client_id: '',
    client_secret: '',
    access_token: '',
    refresh_token: '',
    mapping_proposal: null,
  };
}

function draftFromConnection(connection: WorkspaceApiConnection): ApiSourceDraft {
  const authConfig = (connection.auth_config_json || {}) as Record<string, string | number | undefined>;
  const normalization = (connection.normalization_config_json || {}) as Record<string, unknown>;
  const includePaths = Array.isArray(normalization.include_paths) ? (normalization.include_paths as string[]) : [];
  const excludePaths = Array.isArray(normalization.exclude_paths) ? (normalization.exclude_paths as string[]) : [];
  const preferredFields = Array.isArray(normalization.preferred_fields) ? (normalization.preferred_fields as string[]) : [];

  return {
    id: connection.id,
    source_kind: connection.source_kind || 'http',
    name: connection.name,
    description: connection.description || '',
    endpoint_url: connection.endpoint_url,
    http_method: connection.http_method,
    mcp_server_url: String((connection.mcp_config_json as Record<string, unknown> | null)?.server_url || ''),
    mcp_tool_name: String((connection.mcp_config_json as Record<string, unknown> | null)?.tool_name || ''),
    mcp_input_template_raw: JSON.stringify((connection.mcp_config_json as Record<string, unknown> | null)?.input_template || {}, null, 2),
    finance_connector_key: String((connection.mcp_config_json as Record<string, unknown> | null)?.connector_key || 'credit_rates_benchmarks') as FinanceConnectorKey,
    auth_mode: connection.auth_mode,
    token_url: String(authConfig.token_url || ''),
    scope: String(authConfig.scope || ''),
    audience: String(authConfig.audience || ''),
    api_key_header_name: String(authConfig.api_key_header_name || ''),
    response_root_path: String(normalization.response_root_path || ''),
    include_paths_raw: includePaths.join('\n'),
    exclude_paths_raw: excludePaths.join('\n'),
    preferred_fields_raw: preferredFields.join(', '),
    api_key: '',
    bearer_token: '',
    basic_token_raw: '',
    client_id: '',
    client_secret: '',
    access_token: '',
    refresh_token: '',
    mapping_proposal: connection.mapping_summary_json
      ? {
          normalization_config_json: connection.normalization_config_json || undefined,
          mapping_summary_json: connection.mapping_summary_json as MappingProposal['mapping_summary_json'],
          mapping_generated_at: connection.mapping_generated_at,
          mapping_generated_from_prompt: connection.mapping_generated_from_prompt,
          mapping_status: connection.mapping_status || 'ready',
        }
      : null,
  };
}

function applyPreset(draft: ApiSourceDraft, preset: ApiSourcePreset): ApiSourceDraft {
  const next = { ...draft, preset, source_kind: 'http' as const };
  switch (preset) {
    case 'public_json':
      return {
        ...next,
        auth_mode: 'none',
        http_method: 'GET',
        api_key_header_name: '',
      };
    case 'api_key':
      return {
        ...next,
        auth_mode: 'api_key',
        http_method: 'GET',
        api_key_header_name: draft.api_key_header_name || 'x-api-key',
      };
    case 'oauth_service':
      return {
        ...next,
        auth_mode: 'oauth2_client_credentials',
        http_method: 'GET',
      };
    case 'internal_rest':
      return {
        ...next,
        auth_mode: 'bearer',
        http_method: 'GET',
      };
  }
}

function buildMcpConfig(draft: ApiSourceDraft): Record<string, unknown> | undefined {
  if (draft.source_kind === 'mcp') {
    let inputTemplate: Record<string, unknown> = {};
    try {
      inputTemplate = JSON.parse(draft.mcp_input_template_raw || '{}') as Record<string, unknown>;
    } catch {
      inputTemplate = {};
    }
    return {
      server_url: draft.mcp_server_url.trim() || undefined,
      tool_name: draft.mcp_tool_name.trim() || undefined,
      input_template: inputTemplate,
      transport: 'streamable_http',
      resolved_source_kind: 'mcp',
    };
  }
  if (draft.source_kind === 'finance_builtin') {
    return {
      connector_key: draft.finance_connector_key,
      resolved_source_kind: 'http',
    };
  }
  return undefined;
}

function buildSecretBundle(draft: ApiSourceDraft): Record<string, string> | null {
  switch (draft.auth_mode) {
    case 'api_key':
      return draft.api_key.trim() ? { api_key: draft.api_key.trim() } : null;
    case 'bearer':
      return draft.bearer_token.trim() ? { bearer_token: draft.bearer_token.trim() } : null;
    case 'basic':
      return draft.basic_token_raw.trim() ? { basic_token_raw: draft.basic_token_raw.trim() } : null;
    case 'oauth2_client_credentials': {
      const bundle: Record<string, string> = {};
      if (draft.client_id.trim()) bundle.client_id = draft.client_id.trim();
      if (draft.client_secret.trim()) bundle.client_secret = draft.client_secret.trim();
      return Object.keys(bundle).length ? bundle : null;
    }
    case 'oauth2_refresh_token': {
      const bundle: Record<string, string> = {};
      if (draft.client_id.trim()) bundle.client_id = draft.client_id.trim();
      if (draft.client_secret.trim()) bundle.client_secret = draft.client_secret.trim();
      if (draft.access_token.trim()) bundle.access_token = draft.access_token.trim();
      if (draft.refresh_token.trim()) bundle.refresh_token = draft.refresh_token.trim();
      return Object.keys(bundle).length ? bundle : null;
    }
    case 'none':
      return null;
  }
}

function buildAuthConfig(draft: ApiSourceDraft): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {};
  if (draft.token_url.trim()) next.token_url = draft.token_url.trim();
  if (draft.scope.trim()) next.scope = draft.scope.trim();
  if (draft.audience.trim()) next.audience = draft.audience.trim();
  if (draft.api_key_header_name.trim()) next.api_key_header_name = draft.api_key_header_name.trim();
  return Object.keys(next).length ? next : undefined;
}

function buildNormalizationConfig(draft: ApiSourceDraft): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {};
  if (draft.response_root_path.trim()) next.response_root_path = draft.response_root_path.trim();
  const includePaths = draft.include_paths_raw.split('\n').map((value) => value.trim()).filter(Boolean);
  const excludePaths = draft.exclude_paths_raw.split('\n').map((value) => value.trim()).filter(Boolean);
  const preferredFields = draft.preferred_fields_raw.split(',').map((value) => value.trim()).filter(Boolean);
  if (includePaths.length) next.include_paths = includePaths;
  if (excludePaths.length) next.exclude_paths = excludePaths;
  if (preferredFields.length) next.preferred_fields = preferredFields;
  return Object.keys(next).length ? next : undefined;
}

function authModeLabel(mode: ApiConnectionAuthMode, t: ReturnType<typeof useTranslations>) {
  return t(`apiSources.authModes.${mode}` as const);
}

function formatPreview(preview: unknown): string {
  if (preview === undefined || preview === null) return '';
  if (typeof preview === 'string') return preview;
  try {
    return JSON.stringify(preview, null, 2);
  } catch {
    return String(preview);
  }
}

function rootCandidates(preview: unknown): string[] {
  if (!preview) return [];
  if (Array.isArray(preview)) {
    if (preview.length === 0) return ['$'];
    const first = preview[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return ['$'].concat(Object.keys(first as Record<string, unknown>).sort().map((key) => `$[0].${key}`));
    }
    return ['$'];
  }
  if (typeof preview === 'object') {
    return Object.keys(preview as Record<string, unknown>).sort().map((key) => `$.${key}`);
  }
  return [];
}

function ApiStatusBadge({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : status === 'error'
        ? 'bg-red-500/10 text-red-700 dark:text-red-400'
        : 'bg-surface-alt text-text-soft';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>;
}

function ApiToken({
  text,
  accent = false,
}: {
  text: string;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        accent ? 'bg-accent/10 text-accent' : 'bg-surface text-text-soft'
      )}
    >
      {text}
    </span>
  );
}

function WizardStepButton({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-zohal border px-3 py-3 text-left transition-colors',
        active ? 'border-accent/30 bg-accent/5' : 'border-border bg-surface-alt hover:border-accent/20'
      )}
    >
      <div className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', active ? 'text-accent' : 'text-text-soft')}>
        {subtitle}
      </div>
      <div className="mt-1 text-sm font-semibold text-text">{title}</div>
    </button>
  );
}

function ApiSourceWizardModal({
  draft,
  onDraftChange,
  onClose,
  onSave,
  onTest,
  saving,
  testing,
  testResult,
  labels,
}: {
  draft: ApiSourceDraft;
  onDraftChange: (draft: ApiSourceDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onTest: () => void;
  saving: boolean;
  testing: boolean;
  testResult: TestResult | null;
  labels: ApiSourceWizardLabels;
}) {
  const [step, setStep] = useState<WizardStep>('basics');
  const [showAdvancedAuth, setShowAdvancedAuth] = useState(false);
  const [showAdvancedMapping, setShowAdvancedMapping] = useState(false);

  const setField = <K extends keyof ApiSourceDraft>(key: K, value: ApiSourceDraft[K]) =>
    onDraftChange({ ...draft, [key]: value });

  const hasAddress = draft.source_kind === 'mcp'
    ? draft.mcp_server_url.trim().length > 0 && draft.mcp_tool_name.trim().length > 0
    : draft.source_kind === 'finance_builtin'
      ? true
      : draft.endpoint_url.trim().length > 0;
  const canSave = draft.name.trim().length > 0 && hasAddress;
  const canAdvance = step !== 'basics' || canSave;
  const previewText = formatPreview(testResult?.response_preview);
  const suggestions = testResult?.root_candidates || rootCandidates(testResult?.response_preview);
  const saveLabel = draft.id
    ? labels.saveChanges
    : testResult?.ok
      ? labels.saveAndContinue
      : labels.saveDraft;

  const authHelp = (() => {
    switch (draft.auth_mode) {
      case 'none':
        return labels.authHints.none;
      case 'api_key':
        return labels.authHints.api_key;
      case 'bearer':
        return labels.authHints.bearer;
      case 'basic':
        return labels.authHints.basic;
      case 'oauth2_client_credentials':
        return labels.authHints.oauth2_client_credentials;
      case 'oauth2_refresh_token':
        return labels.authHints.oauth2_refresh_token;
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-zohal border border-border bg-surface shadow-[var(--shadowLg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text">
            {draft.id ? labels.editSource : labels.addSource}
          </h2>
          <p className="mt-1 text-sm text-text-soft">{labels.modalDescription}</p>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-3 md:grid-cols-3">
            {WIZARD_STEPS.map((item, index) => (
              <WizardStepButton
                key={item.id}
                active={step === item.id}
                title={labels.steps[item.id].title}
                subtitle={`${labels.stepLabel} ${index + 1}`}
                onClick={() => {
                  if (item.id === 'basics' || canSave) setStep(item.id);
                }}
              />
            ))}
          </div>

          {step === 'basics' ? (
            <div className="space-y-4">
              <Card className="border border-border bg-surface-alt">
                <CardHeader>
                  <CardTitle className="text-base">{labels.presetsTitle}</CardTitle>
                  <CardDescription>{labels.presetsDescription}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{labels.sourceTypesTitle}</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {SOURCE_TYPE_CHOICES.map((choice) => {
                        const Icon = choice.icon;
                        const selected = draft.source_kind === choice.id;
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            onClick={() =>
                              onDraftChange({
                                ...draft,
                                source_kind: choice.id,
                                mapping_proposal: null,
                                preset: choice.id === 'http' ? draft.preset : undefined,
                              })
                            }
                            className={cn(
                              'rounded-zohal border p-4 text-left transition-colors',
                              selected ? 'border-accent/30 bg-accent/5' : 'border-border bg-surface hover:border-accent/20'
                            )}
                          >
                            <Icon className="h-5 w-5 text-accent" />
                            <div className="mt-3 text-sm font-semibold text-text">{choice.title}</div>
                            <div className="mt-1 text-sm text-text-soft">{choice.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
                {draft.source_kind === 'http' ? (
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    const selected = draft.preset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onDraftChange(applyPreset(draft, preset.id))}
                        className={cn(
                          'rounded-zohal border p-4 text-left transition-colors',
                          selected ? 'border-accent/30 bg-accent/5' : 'border-border bg-surface hover:border-accent/20'
                        )}
                      >
                        <Icon className="h-5 w-5 text-accent" />
                        <div className="mt-3 text-sm font-semibold text-text">{labels.presets[preset.id].title}</div>
                        <div className="mt-1 text-sm text-text-soft">{labels.presets[preset.id].description}</div>
                      </button>
                    );
                  })}
                </CardContent>
                ) : null}
              </Card>

              <Card className="border border-border bg-surface-alt">
                <CardHeader>
                  <CardTitle className="text-base">{labels.steps.basics.title}</CardTitle>
                  <CardDescription>{labels.steps.basics.description}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <Input label={labels.name} value={draft.name} onChange={(event) => setField('name', event.target.value)} />
                  <Input label={labels.descriptionLabel} value={draft.description} onChange={(event) => setField('description', event.target.value)} />
                  {draft.source_kind === 'http' ? (
                    <div className="md:col-span-2">
                      <Input label={labels.endpointUrl} value={draft.endpoint_url} onChange={(event) => setField('endpoint_url', event.target.value)} />
                    </div>
                  ) : null}
                  {draft.source_kind === 'mcp' ? (
                    <>
                      <Input label="MCP server URL" value={draft.mcp_server_url} onChange={(event) => setField('mcp_server_url', event.target.value)} />
                      <Input label="Tool name" value={draft.mcp_tool_name} onChange={(event) => setField('mcp_tool_name', event.target.value)} />
                      <label className="grid gap-1.5 text-sm text-text md:col-span-2">
                        <span className="font-medium text-text-soft">Tool input (JSON)</span>
                        <textarea
                          value={draft.mcp_input_template_raw}
                          onChange={(event) => setField('mcp_input_template_raw', event.target.value)}
                          className="min-h-[120px] rounded-zohal border border-border bg-surface px-3 py-2 text-sm text-text"
                        />
                      </label>
                    </>
                  ) : null}
                  {draft.source_kind === 'finance_builtin' ? (
                    <label className="grid gap-1.5 text-sm text-text md:col-span-2">
                      <span className="font-medium text-text-soft">Finance connector</span>
                      <select
                        value={draft.finance_connector_key}
                        onChange={(event) => {
                          const connector = FINANCE_CONNECTOR_OPTIONS.find((item) => item.id === event.target.value);
                          onDraftChange({
                            ...draft,
                            finance_connector_key: event.target.value as FinanceConnectorKey,
                            endpoint_url: connector?.endpointUrl || draft.endpoint_url,
                            mapping_proposal: null,
                          });
                        }}
                        className="min-h-[42px] rounded-zohal border border-border bg-surface px-3 text-sm text-text"
                      >
                        {FINANCE_CONNECTOR_OPTIONS.map((connector) => (
                          <option key={connector.id} value={connector.id}>{connector.title}</option>
                        ))}
                      </select>
                      <span className="text-xs text-text-soft">
                        {FINANCE_CONNECTOR_OPTIONS.find((item) => item.id === draft.finance_connector_key)?.description}
                      </span>
                    </label>
                  ) : null}
                  <label className="grid gap-1.5 text-sm text-text">
                    <span className="font-medium text-text-soft">{labels.method}</span>
                    <select
                      value={draft.http_method}
                      onChange={(event) => setField('http_method', event.target.value as 'GET' | 'POST')}
                      className="min-h-[42px] rounded-zohal border border-border bg-surface px-3 text-sm text-text"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </label>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {step === 'auth' ? (
            <div className="space-y-4">
              <Card className="border border-border bg-surface-alt">
                <CardHeader>
                  <CardTitle className="text-base">{labels.steps.auth.title}</CardTitle>
                  <CardDescription>{labels.steps.auth.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {draft.source_kind === 'finance_builtin' ? (
                    <div className="rounded-zohal border border-border bg-surface px-4 py-3 text-sm text-text-soft">
                      This connector uses curated provider defaults. You can add auth later if you switch it to a private endpoint.
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {(['none', 'api_key', 'bearer', 'basic', 'oauth2_client_credentials', 'oauth2_refresh_token'] as ApiConnectionAuthMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setField('auth_mode', mode)}
                          className={cn(
                            'rounded-zohal border p-4 text-left transition-colors',
                            draft.auth_mode === mode ? 'border-accent/30 bg-accent/5' : 'border-border bg-surface hover:border-accent/20'
                          )}
                        >
                          <div className="text-sm font-semibold text-text">{labels.authModes[mode]}</div>
                          <div className="mt-1 text-sm text-text-soft">{labels.authHints[mode]}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="rounded-zohal border border-border bg-surface px-4 py-3 text-sm text-text-soft">
                    {authHelp}
                  </div>

                  {draft.source_kind !== 'finance_builtin' && (draft.auth_mode === 'api_key' || draft.auth_mode === 'bearer' || draft.auth_mode === 'basic') && (
                    <div className="grid gap-4 md:grid-cols-2">
                      {draft.auth_mode === 'api_key' ? (
                        <Input label={labels.apiKey} type="password" value={draft.api_key} onChange={(event) => setField('api_key', event.target.value)} />
                      ) : null}
                      {draft.auth_mode === 'bearer' ? (
                        <Input label={labels.bearerToken} type="password" value={draft.bearer_token} onChange={(event) => setField('bearer_token', event.target.value)} />
                      ) : null}
                      {draft.auth_mode === 'basic' ? (
                        <Input label={labels.basicSecret} type="password" value={draft.basic_token_raw} onChange={(event) => setField('basic_token_raw', event.target.value)} />
                      ) : null}
                    </div>
                  )}

                  {draft.source_kind !== 'finance_builtin' && (draft.auth_mode === 'oauth2_client_credentials' || draft.auth_mode === 'oauth2_refresh_token') && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input label={labels.tokenUrl} value={draft.token_url} onChange={(event) => setField('token_url', event.target.value)} />
                      <Input label={labels.clientId} value={draft.client_id} onChange={(event) => setField('client_id', event.target.value)} />
                      <Input label={labels.clientSecret} type="password" value={draft.client_secret} onChange={(event) => setField('client_secret', event.target.value)} />
                    </div>
                  )}

                  {draft.source_kind !== 'finance_builtin' && (draft.auth_mode === 'api_key' || draft.auth_mode === 'oauth2_client_credentials' || draft.auth_mode === 'oauth2_refresh_token') ? (
                    <div className="rounded-zohal border border-border bg-surface px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedAuth((current) => !current)}
                        className="flex w-full items-center justify-between text-left"
                      >
                        <span className="text-sm font-semibold text-text">{labels.advancedAuth}</span>
                        <span className="text-xs text-text-soft">{showAdvancedAuth ? labels.hide : labels.show}</span>
                      </button>
                      {showAdvancedAuth ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          {draft.auth_mode === 'api_key' ? (
                            <Input label={labels.apiKeyHeaderName} value={draft.api_key_header_name} onChange={(event) => setField('api_key_header_name', event.target.value)} />
                          ) : null}
                          {(draft.auth_mode === 'oauth2_client_credentials' || draft.auth_mode === 'oauth2_refresh_token') ? (
                            <>
                              <Input label={labels.scope} value={draft.scope} onChange={(event) => setField('scope', event.target.value)} />
                              <Input label={labels.audience} value={draft.audience} onChange={(event) => setField('audience', event.target.value)} />
                            </>
                          ) : null}
                          {draft.auth_mode === 'oauth2_refresh_token' ? (
                            <>
                              <Input label={labels.accessToken} type="password" value={draft.access_token} onChange={(event) => setField('access_token', event.target.value)} />
                              <Input label={labels.refreshToken} type="password" value={draft.refresh_token} onChange={(event) => setField('refresh_token', event.target.value)} />
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border border-border bg-surface-alt">
                <CardHeader>
                  <CardTitle className="text-base">Review sample</CardTitle>
                  <CardDescription>Zohal will test the source, propose the mapping, and save it when you continue.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-zohal border border-border bg-surface px-4 py-3 text-sm text-text-soft">
                    Zohal will propose and save the data mapping after the sample fetch. You can refine it later without recreating the source.
                  </div>

                  {suggestions.length > 0 ? (
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{labels.suggestedPaths}</div>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setField('response_root_path', suggestion)}
                            className={cn(
                              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                              draft.response_root_path === suggestion ? 'bg-accent/10 text-accent' : 'bg-surface text-text-soft'
                            )}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-zohal border border-border bg-surface px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedMapping((current) => !current)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <span className="text-sm font-semibold text-text">{labels.advancedMapping}</span>
                      <span className="text-xs text-text-soft">{showAdvancedMapping ? labels.hide : labels.show}</span>
                    </button>
                      {showAdvancedMapping ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <Input label={labels.preferredFields} value={draft.preferred_fields_raw} onChange={(event) => setField('preferred_fields_raw', event.target.value)} />
                        <label className="grid gap-1.5 text-sm text-text md:col-span-2">
                          <span className="font-medium text-text-soft">{labels.includePaths}</span>
                          <textarea
                            value={draft.include_paths_raw}
                            onChange={(event) => setField('include_paths_raw', event.target.value)}
                            className="min-h-[100px] rounded-zohal border border-border bg-surface px-3 py-2 text-sm text-text"
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm text-text md:col-span-2">
                          <span className="font-medium text-text-soft">{labels.excludePaths}</span>
                          <textarea
                            value={draft.exclude_paths_raw}
                            onChange={(event) => setField('exclude_paths_raw', event.target.value)}
                            className="min-h-[100px] rounded-zohal border border-border bg-surface px-3 py-2 text-sm text-text"
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border bg-surface-alt">
                <CardHeader>
                  <CardTitle className="text-base">{labels.previewTitle}</CardTitle>
                  <CardDescription>{labels.previewDescription}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {testResult ? (
                    <>
                      <div className={cn(
                        'rounded-zohal border px-4 py-3 text-sm',
                        testResult.ok
                          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                          : 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400'
                      )}>
                        {testResult.ok ? labels.connectionSucceeded : testResult.error || `${labels.connectionFailed} (HTTP ${testResult.status})`}
                      </div>
                      {testResult.request_url ? (
                        <div className="text-xs text-text-soft">{testResult.request_url}</div>
                      ) : null}
                      <pre className="max-h-72 overflow-auto rounded-zohal border border-border bg-surface px-4 py-3 text-xs text-text-soft whitespace-pre-wrap">
                        {previewText || labels.previewEmpty}
                      </pre>
                      <div className="rounded-zohal border border-border bg-surface px-4 py-3">
                        <div className="text-sm font-semibold text-text">{labels.mappingSummaryTitle}</div>
                        {draft.mapping_proposal?.mapping_summary_json ? (
                          <div className="mt-3 space-y-2 text-sm text-text-soft">
                            {draft.mapping_proposal.mapping_summary_json.overview ? (
                              <p>{draft.mapping_proposal.mapping_summary_json.overview}</p>
                            ) : null}
                            {draft.mapping_proposal.mapping_summary_json.what_zohal_will_use?.length ? (
                              <div>
                                <div className="font-medium text-text">What Zohal will use</div>
                                <ul className="mt-1 list-disc pl-5">
                                  {draft.mapping_proposal.mapping_summary_json.what_zohal_will_use.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {draft.mapping_proposal.mapping_summary_json.why_it_matches_template ? (
                              <div>
                                <div className="font-medium text-text">Why it matches this Template</div>
                                <p className="mt-1">{draft.mapping_proposal.mapping_summary_json.why_it_matches_template}</p>
                              </div>
                            ) : null}
                            {draft.mapping_proposal.mapping_summary_json.what_was_ignored?.length ? (
                              <div>
                                <div className="font-medium text-text">What was ignored</div>
                                <ul className="mt-1 list-disc pl-5">
                                  {draft.mapping_proposal.mapping_summary_json.what_was_ignored.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-text-soft">{labels.mappingSummaryEmpty}</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-zohal border border-dashed border-border bg-surface px-4 py-6 text-sm text-text-soft">
                      {labels.previewPrompt}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <div className="flex items-center gap-2">
            {step !== 'basics' ? (
              <Button variant="ghost" size="sm" onClick={() => setStep('basics')}>
                {labels.back}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onClose}>
                {labels.cancel}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step !== 'auth' ? (
              <Button size="sm" onClick={() => setStep('auth')} disabled={!canAdvance}>
                {labels.next}
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={onTest} isLoading={testing} disabled={!hasAddress}>
                  <Play className="h-4 w-4" />
                  {labels.testConnection}
                </Button>
                <Button size="sm" onClick={onSave} isLoading={saving} disabled={!canSave}>
                  {saveLabel}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiSourceAttachModal({
  source,
  workspaces,
  loading,
  saving,
  onClose,
  onConfirm,
  labels,
}: {
  source: WorkspaceApiConnection;
  workspaces: Pick<Workspace, 'id' | 'name'>[];
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: (selections: AttachSelection[]) => void;
  labels: ApiSourceAttachLabels;
}) {
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);
  const [enabledByDefault, setEnabledByDefault] = useState<Record<string, boolean>>({});

  const toggleWorkspace = (workspaceId: string) => {
    setSelectedWorkspaceIds((current) =>
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId]
    );
    setEnabledByDefault((current) => ({
      ...current,
      [workspaceId]: current[workspaceId] ?? true,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-zohal border border-border bg-surface shadow-[var(--shadowLg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text">{labels.title}</h2>
          <p className="mt-1 text-sm text-text-soft">{labels.description}</p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-zohal border border-border bg-surface-alt px-4 py-3">
            <div className="text-sm font-semibold text-text">{source.name}</div>
            <div className="mt-1 text-xs text-text-soft">{source.endpoint_url}</div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-text-soft">
              <Loader2 className="h-4 w-4 animate-spin" />
              {labels.loading}
            </div>
          ) : workspaces.length === 0 ? (
            <div className="rounded-zohal border border-dashed border-border bg-surface-alt px-4 py-8 text-sm text-text-soft">
              {labels.empty}
            </div>
          ) : (
            <div className="space-y-3">
              {workspaces.map((workspace) => {
                const selected = selectedWorkspaceIds.includes(workspace.id);
                return (
                  <div key={workspace.id} className="rounded-zohal border border-border bg-surface-alt p-4">
                    <button
                      type="button"
                      onClick={() => toggleWorkspace(workspace.id)}
                      className="flex w-full items-center gap-3 text-left"
                    >
                      <div className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full border',
                        selected ? 'border-accent bg-accent text-white' : 'border-border text-transparent'
                      )}>
                        <CheckCircle className="h-3.5 w-3.5" />
                      </div>
                      <div className="text-sm font-medium text-text">{workspace.name}</div>
                    </button>

                    {selected ? (
                      <div className="mt-4 border-t border-border pt-4">
                        <ZohalToggle
                          label={labels.defaultLabel}
                          caption={labels.defaultCaption}
                          checked={enabledByDefault[workspace.id] ?? true}
                          onCheckedChange={(next) =>
                            setEnabledByDefault((current) => ({
                              ...current,
                              [workspace.id]: next,
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {labels.skip}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onConfirm(
                selectedWorkspaceIds.map((workspaceId) => ({
                  workspaceId,
                  enabledByDefault: enabledByDefault[workspaceId] ?? true,
                }))
              )
            }
            isLoading={saving}
            disabled={selectedWorkspaceIds.length === 0}
          >
            {labels.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const t = useTranslations('integrationsPage');
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [integrations, setIntegrations] = useState<IntegrationAccount[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [savingWhatsappPhone, setSavingWhatsappPhone] = useState(false);
  const [whatsappPhoneError, setWhatsappPhoneError] = useState('');
  const [whatsappPhoneSuccess, setWhatsappPhoneSuccess] = useState('');

  const [apiSources, setApiSources] = useState<WorkspaceApiConnection[]>([]);
  const [loadingApiSources, setLoadingApiSources] = useState(true);
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiDraft, setApiDraft] = useState<ApiSourceDraft>(emptyDraft());
  const [savingApiSource, setSavingApiSource] = useState(false);
  const [testingApiSource, setTestingApiSource] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<TestResult | null>(null);

  const [showAttachModal, setShowAttachModal] = useState(false);
  const [attachSource, setAttachSource] = useState<WorkspaceApiConnection | null>(null);
  const [workspaceOptions, setWorkspaceOptions] = useState<Pick<Workspace, 'id' | 'name'>[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [savingAttachments, setSavingAttachments] = useState(false);

  useEffect(() => {
    async function fetchIntegrations() {
      if (!user) return;

      const [integrationsResult, profileResult] = await Promise.all([
        supabase
          .from('integration_accounts')
          .select('provider, status, connected_at')
          .eq('user_id', user.id)
          .eq('status', 'active'),
        supabase
          .from('profiles')
          .select('whatsapp_phone_number')
          .eq('id', user.id)
          .single(),
      ]);

      if (integrationsResult.data) setIntegrations(integrationsResult.data);
      if (profileResult.data?.whatsapp_phone_number) {
        setWhatsappPhone(profileResult.data.whatsapp_phone_number);
      }
      setLoading(false);
    }

    fetchIntegrations();
  }, [supabase, user]);

  async function loadApiSources() {
    setLoadingApiSources(true);
    try {
      const { data, error } = await supabase.functions.invoke('workspace-api-connections', {
        body: { action: 'list-library' },
      });
      if (!error) {
        setApiSources(data?.data?.connections || data?.connections || []);
      }
    } finally {
      setLoadingApiSources(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void loadApiSources();
  }, [user]);

  const isConnected = (provider: string) =>
    integrations.some((integration) => integration.provider === provider);

  const saveWhatsappPhone = async () => {
    if (!user) return;

    setSavingWhatsappPhone(true);
    setWhatsappPhoneError('');
    setWhatsappPhoneSuccess('');

    const normalizedPhone = normalizeWhatsappPhoneInput(whatsappPhone);
    if (normalizedPhone === null) {
      setSavingWhatsappPhone(false);
      setWhatsappPhoneError(t('whatsappPhoneInvalid'));
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        whatsapp_phone_number: normalizedPhone || null,
      })
      .eq('id', user.id);

    if (error) {
      setSavingWhatsappPhone(false);
      setWhatsappPhoneError(t('whatsappPhoneSaveError'));
      return;
    }

    setWhatsappPhone(normalizedPhone || '');
    setSavingWhatsappPhone(false);
    setWhatsappPhoneSuccess(t('whatsappPhoneSaveSuccess'));
  };

  const connectIntegration = async (provider: 'google_drive' | 'onedrive') => {
    setConnectingProvider(provider);

    const oauthProvider = provider === 'google_drive' ? 'google' : 'azure';

    const { error } = await supabase.auth.signInWithOAuth({
      provider: oauthProvider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?integration=${provider}`,
        scopes:
          provider === 'google_drive'
            ? 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events'
            : 'Files.Read Files.Read.All Calendars.Read Calendars.ReadWrite offline_access User.Read',
        queryParams:
          provider === 'google_drive'
            ? { access_type: 'offline', prompt: 'consent' }
            : undefined,
      },
    });

    if (error) {
      console.error('OAuth error:', error);
      setConnectingProvider(null);
    }
  };

  const disconnectIntegration = async (provider: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('integration_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', provider);

    if (!error) {
      setIntegrations((prev) => prev.filter((integration) => integration.provider !== provider));
    }
  };

  const updateDraft = (nextDraft: ApiSourceDraft) => {
    setApiDraft(nextDraft);
    setApiTestResult(null);
  };

  const openCreateApiSource = () => {
    setApiDraft(emptyDraft());
    setApiTestResult(null);
    setShowApiModal(true);
  };

  const openEditApiSource = (connection: WorkspaceApiConnection) => {
    setApiDraft(draftFromConnection(connection));
    setApiTestResult(null);
    setShowApiModal(true);
  };

  const loadWorkspaceOptions = async () => {
    setLoadingWorkspaces(true);
    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name')
        .eq('status', 'active')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (!error) {
        setWorkspaceOptions((data || []) as Pick<Workspace, 'id' | 'name'>[]);
      }
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const openAttachModal = async (connection: WorkspaceApiConnection) => {
    setAttachSource(connection);
    setShowAttachModal(true);
    await loadWorkspaceOptions();
  };

  const closeAttachModal = () => {
    setShowAttachModal(false);
    setAttachSource(null);
  };

  const saveApiSource = async () => {
    setSavingApiSource(true);
    try {
      const payload: Record<string, unknown> = {
        action: apiDraft.id ? 'update' : 'create',
        connection_id: apiDraft.id,
        name: apiDraft.name.trim(),
        description: apiDraft.description.trim() || undefined,
        source_kind: apiDraft.source_kind,
        endpoint_url:
          apiDraft.source_kind === 'mcp'
            ? apiDraft.mcp_server_url.trim()
            : apiDraft.endpoint_url.trim(),
        http_method: apiDraft.http_method,
        auth_mode: apiDraft.auth_mode,
        source_mode: 'either',
        auth_config_json: buildAuthConfig(apiDraft),
        normalization_config_json: buildNormalizationConfig(apiDraft),
        mcp_config_json: buildMcpConfig(apiDraft),
      };
      if (apiDraft.mapping_proposal?.mapping_summary_json) {
        payload.mapping_summary_json = apiDraft.mapping_proposal.mapping_summary_json;
        payload.mapping_generated_at = apiDraft.mapping_proposal.mapping_generated_at || new Date().toISOString();
        payload.mapping_generated_from_prompt = apiDraft.mapping_proposal.mapping_generated_from_prompt || undefined;
        payload.mapping_status = apiDraft.mapping_proposal.mapping_status || 'ready';
        payload.normalization_config_json =
          apiDraft.mapping_proposal.normalization_config_json || payload.normalization_config_json;
      }
      const secretBundle = buildSecretBundle(apiDraft);
      if (secretBundle) payload.secret_bundle = secretBundle;

      const wasCreate = !apiDraft.id;
      const { data, error } = await supabase.functions.invoke('workspace-api-connections', { body: payload });
      if (error) throw error;

      const connection = (data?.data?.connection || data?.connection || null) as WorkspaceApiConnection | null;
      setShowApiModal(false);
      setApiDraft(emptyDraft());
      setApiTestResult(null);
      await loadApiSources();

      if (wasCreate && apiTestResult?.ok && connection) {
        await openAttachModal(connection);
      }
    } finally {
      setSavingApiSource(false);
    }
  };

  const testApiSource = async () => {
    setTestingApiSource(true);
    setApiTestResult(null);
    try {
      const payload: Record<string, unknown> = {
        action: 'test-source',
        connection_id: apiDraft.id,
        source_kind: apiDraft.source_kind,
        endpoint_url:
          apiDraft.source_kind === 'mcp'
            ? apiDraft.mcp_server_url.trim()
            : apiDraft.endpoint_url.trim(),
        http_method: apiDraft.http_method,
        auth_mode: apiDraft.auth_mode,
        auth_config_json: buildAuthConfig(apiDraft),
        normalization_config_json: buildNormalizationConfig(apiDraft),
        mcp_config_json: buildMcpConfig(apiDraft),
        name: apiDraft.name.trim() || 'Source',
      };
      const secretBundle = buildSecretBundle(apiDraft);
      if (secretBundle) payload.secret_bundle = secretBundle;

      const { data, error } = await supabase.functions.invoke('workspace-api-connections', { body: payload });
      if (error) throw error;
      const result = data?.data?.test_result || data?.test_result || { ok: false, status: 0, error: 'No result' };
      setApiTestResult(result);
      if (result?.response_body !== undefined || result?.response_preview !== undefined) {
        const generated = await supabase.functions.invoke('workspace-api-connections', {
          body: {
            action: 'generate-mapping',
            source_kind: apiDraft.source_kind,
            sample_payload: result.response_body ?? result.response_preview,
          },
        });
        const proposal = generated.data?.data?.proposal || generated.data?.proposal || null;
        if (proposal) {
          setApiDraft((current) => ({
            ...current,
            response_root_path: String(proposal.normalization_config_json?.response_root_path || current.response_root_path || ''),
            preferred_fields_raw: Array.isArray(proposal.normalization_config_json?.preferred_fields)
              ? (proposal.normalization_config_json.preferred_fields as string[]).join(', ')
              : current.preferred_fields_raw,
            include_paths_raw: Array.isArray(proposal.normalization_config_json?.include_paths)
              ? (proposal.normalization_config_json.include_paths as string[]).join('\n')
              : current.include_paths_raw,
            mapping_proposal: proposal,
          }));
        }
      }
    } catch (error) {
      setApiTestResult({
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : t('apiSources.connectionFailed'),
      });
    } finally {
      setTestingApiSource(false);
    }
  };

  const attachApiSource = async (selections: AttachSelection[]) => {
    if (!attachSource) return;
    setSavingAttachments(true);
    try {
      for (const selection of selections) {
        await supabase.functions.invoke('workspace-api-connections', {
          body: {
            action: 'attach',
            workspace_id: selection.workspaceId,
            connection_id: attachSource.id,
            enabled_by_default: selection.enabledByDefault,
          },
        });
      }
      closeAttachModal();
    } finally {
      setSavingAttachments(false);
    }
  };

  const deleteApiSource = async (connectionId: string) => {
    const { error } = await supabase.functions.invoke('workspace-api-connections', {
      body: { action: 'delete', connection_id: connectionId },
    });
    if (!error) {
      setApiSources((prev) => prev.filter((connection) => connection.id !== connectionId));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <AppHeader title={t('title')} />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <Card padding="lg">
            <CardHeader className="mb-0">
              <div className="flex items-center gap-3">
                <Link2 className="h-5 w-5 text-accent" />
                <div>
                  <CardTitle>{t('accountsTitle')}</CardTitle>
                  <CardDescription>{t('description')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-4 rounded-zohal border border-border bg-surface-alt p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-zohal border border-[#25D366]/20 bg-[#25D366]/10">
                    <MessageCircle className="h-5 w-5 text-[#25D366]" />
                  </div>
                  <div>
                    <p className="font-medium text-text">{t('whatsapp')}</p>
                    <p className="text-xs text-text-soft">{t('whatsappDesc')}</p>
                  </div>
                </div>

                <Input
                  label={t('whatsappPhoneLabel')}
                  value={whatsappPhone}
                  onChange={(event) => {
                    setWhatsappPhone(event.target.value);
                    setWhatsappPhoneError('');
                    setWhatsappPhoneSuccess('');
                  }}
                  placeholder={t('whatsappPhonePlaceholder')}
                  hint={t('whatsappPhoneHint')}
                  error={whatsappPhoneError || undefined}
                  inputMode="tel"
                  autoComplete="tel"
                />

                {whatsappPhoneSuccess ? (
                  <div className="text-sm text-success">{whatsappPhoneSuccess}</div>
                ) : null}

                <Button size="sm" onClick={() => void saveWhatsappPhone()} isLoading={savingWhatsappPhone}>
                  {t('whatsappPhoneSave')}
                </Button>
              </div>

              <div className="flex items-center justify-between rounded-zohal border border-border bg-surface-alt p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-zohal bg-white">
                    <svg viewBox="0 0 48 48" className="h-5 w-5">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.73 1.22 9.24 3.6l6.87-6.87C35.8 2.4 30.3 0 24 0 14.64 0 6.55 5.38 2.56 13.22l7.98 6.2C12.36 13.14 17.66 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.5 24.55c0-1.74-.16-3.41-.45-5.05H24v9.56h12.68c-.55 2.96-2.22 5.47-4.72 7.16l7.64 5.93C44.16 37.98 46.5 31.73 46.5 24.55z"/>
                      <path fill="#FBBC05" d="M10.54 28.58A14.5 14.5 0 0 1 9.5 24c0-1.6.28-3.15.77-4.58l-7.98-6.2A24.01 24.01 0 0 0 0 24c0 3.87.93 7.52 2.58 10.78l7.96-6.2z"/>
                      <path fill="#34A853" d="M24 48c6.3 0 11.6-2.08 15.47-5.65l-7.64-5.93c-2.12 1.42-4.83 2.26-7.83 2.26-6.34 0-11.64-3.64-13.46-8.92l-7.96 6.2C6.55 42.62 14.64 48 24 48z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-text">{t('google')}</p>
                    <p className="text-xs text-text-soft">{t('googleDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected('google_drive') ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span className="text-sm text-success">{t('connected')}</span>
                      <Button variant="secondary" size="sm" onClick={() => disconnectIntegration('google_drive')}>
                        {t('disconnect')}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => connectIntegration('google_drive')} isLoading={connectingProvider === 'google_drive'}>
                      {t('connect')}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-zohal border border-border bg-surface-alt p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-zohal bg-[#2563eb]/10">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#2563eb]">
                      <path d="M2 4.75 9.5 3v8.25H2V4.75Zm8.5-1.95L22 1v10.25H10.5V2.8ZM2 12.75h7.5V21L2 19.25v-6.5Zm8.5 0H22V23l-11.5-1.8v-8.45Z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-text">{t('microsoft')}</p>
                    <p className="text-xs text-text-soft">{t('microsoftDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected('onedrive') ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span className="text-sm text-success">{t('connected')}</span>
                      <Button variant="secondary" size="sm" onClick={() => disconnectIntegration('onedrive')}>
                        {t('disconnect')}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => connectIntegration('onedrive')} isLoading={connectingProvider === 'onedrive'}>
                      {t('connect')}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card padding="lg">
            <CardHeader className="mb-0">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-accent" />
                  <div>
                    <CardTitle>{t('apiSources.title')}</CardTitle>
                    <CardDescription>{t('apiSources.description')}</CardDescription>
                  </div>
                </div>
                <Button size="sm" onClick={openCreateApiSource}>
                  <Plus className="h-4 w-4" />
                  {t('apiSources.addSource')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-zohal border border-border bg-surface-alt px-4 py-3 text-sm text-text-soft">
                {t('apiSources.reuseHint')}
              </div>

              {loadingApiSources ? (
                <div className="flex items-center gap-2 py-8 text-text-soft">
                  <Spinner size="sm" />
                  {t('apiSources.loading')}
                </div>
              ) : apiSources.length === 0 ? (
                <div className="rounded-zohal border border-dashed border-border bg-surface-alt px-4 py-10 text-center">
                  <p className="text-sm font-medium text-text">{t('apiSources.emptyTitle')}</p>
                  <p className="mt-1 text-sm text-text-soft">{t('apiSources.emptyBody')}</p>
                  <Button className="mt-4" size="sm" onClick={openCreateApiSource}>
                    {t('apiSources.addSource')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {apiSources.map((connection) => (
                    <div key={connection.id} className="rounded-zohal border border-border bg-surface-alt p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-zohal bg-accent/10 text-accent">
                            <Globe className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-text">{connection.name}</p>
                              <ApiStatusBadge status={connection.status} />
                              <ApiToken text={authModeLabel(connection.auth_mode, t)} />
                            </div>
                            <p className="mt-1 truncate font-mono text-xs text-text-muted">{connection.endpoint_url}</p>
                            {connection.description ? (
                              <p className="mt-1 text-sm text-text-soft">{connection.description}</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="secondary" size="sm" onClick={() => void openAttachModal(connection)}>
                            <ExternalLink className="h-4 w-4" />
                            {t('apiSources.attachNow')}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => openEditApiSource(connection)}>
                            <Pencil className="h-4 w-4" />
                            {t('apiSources.edit')}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void deleteApiSource(connection.id)}>
                            <Trash2 className="h-4 w-4" />
                            {t('apiSources.delete')}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-soft">
                        {connection.last_successful_fetch_at ? (
                          <span>{t('apiSources.lastFetched', { date: new Date(connection.last_successful_fetch_at).toLocaleString() })}</span>
                        ) : (
                          <span>{t('apiSources.notTested')}</span>
                        )}
                        {connection.last_error ? (
                          <span className="text-red-600 dark:text-red-400">{connection.last_error}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showApiModal ? (
        <ApiSourceWizardModal
          draft={apiDraft}
          onDraftChange={updateDraft}
          onClose={() => setShowApiModal(false)}
          onSave={() => void saveApiSource()}
          onTest={() => void testApiSource()}
          saving={savingApiSource}
          testing={testingApiSource}
          testResult={apiTestResult}
          labels={{
            addSource: t('apiSources.addSource'),
            editSource: t('apiSources.editSource'),
            modalDescription: t('apiSources.modalDescription'),
            stepLabel: t('apiSources.stepLabel'),
            next: t('apiSources.next'),
            back: t('apiSources.back'),
            show: t('apiSources.show'),
            hide: t('apiSources.hide'),
            name: t('apiSources.fields.name'),
            descriptionLabel: t('apiSources.fields.description'),
            endpointUrl: t('apiSources.fields.endpointUrl'),
            method: t('apiSources.fields.method'),
            apiKeyHeaderName: t('apiSources.fields.apiKeyHeaderName'),
            apiKey: t('apiSources.fields.apiKey'),
            bearerToken: t('apiSources.fields.bearerToken'),
            basicSecret: t('apiSources.fields.basicSecret'),
            tokenUrl: t('apiSources.fields.tokenUrl'),
            scope: t('apiSources.fields.scope'),
            audience: t('apiSources.fields.audience'),
            clientId: t('apiSources.fields.clientId'),
            clientSecret: t('apiSources.fields.clientSecret'),
            accessToken: t('apiSources.fields.accessToken'),
            refreshToken: t('apiSources.fields.refreshToken'),
            responseRootPath: t('apiSources.mapping.rootLabel'),
            responseRootHint: t('apiSources.mapping.rootHint'),
            preferredFields: t('apiSources.mapping.preferredFields'),
            includePaths: t('apiSources.mapping.includePaths'),
            excludePaths: t('apiSources.mapping.excludePaths'),
            advancedAuth: t('apiSources.advancedAuth'),
            advancedMapping: t('apiSources.advancedMapping'),
            testConnection: t('apiSources.testConnection'),
            cancel: t('apiSources.cancel'),
            saveChanges: t('apiSources.saveChanges'),
            saveDraft: t('apiSources.saveDraft'),
            saveAndContinue: t('apiSources.saveAndContinue'),
            connectionSucceeded: t('apiSources.connectionSucceeded'),
            connectionFailed: t('apiSources.connectionFailed'),
            presetsTitle: t('apiSources.presetsTitle'),
            presetsDescription: t('apiSources.presetsDescription'),
            suggestedPaths: t('apiSources.suggestedPaths'),
            previewTitle: t('apiSources.previewTitle'),
            previewDescription: t('apiSources.previewDescription'),
            previewPrompt: t('apiSources.previewPrompt'),
            previewEmpty: t('apiSources.previewEmpty'),
            sourceTypesTitle: 'Source type',
            mappingSummaryTitle: 'What Zohal will use',
            mappingSummaryEmpty: 'Run a sample fetch and Zohal will propose a saved deterministic mapping.',
            steps: {
              basics: {
                title: t('apiSources.steps.basics.title'),
                description: t('apiSources.steps.basics.description'),
              },
              auth: {
                title: t('apiSources.steps.auth.title'),
                description: t('apiSources.steps.auth.description'),
              },
            },
            presets: {
              public_json: {
                title: t('apiSources.presets.public_json.title'),
                description: t('apiSources.presets.public_json.description'),
              },
              api_key: {
                title: t('apiSources.presets.api_key.title'),
                description: t('apiSources.presets.api_key.description'),
              },
              oauth_service: {
                title: t('apiSources.presets.oauth_service.title'),
                description: t('apiSources.presets.oauth_service.description'),
              },
              internal_rest: {
                title: t('apiSources.presets.internal_rest.title'),
                description: t('apiSources.presets.internal_rest.description'),
              },
            },
            authModes: {
              none: t('apiSources.authModes.none'),
              api_key: t('apiSources.authModes.api_key'),
              bearer: t('apiSources.authModes.bearer'),
              basic: t('apiSources.authModes.basic'),
              oauth2_client_credentials: t('apiSources.authModes.oauth2_client_credentials'),
              oauth2_refresh_token: t('apiSources.authModes.oauth2_refresh_token'),
            },
            authHints: {
              none: t('apiSources.authHints.none'),
              api_key: t('apiSources.authHints.api_key'),
              bearer: t('apiSources.authHints.bearer'),
              basic: t('apiSources.authHints.basic'),
              oauth2_client_credentials: t('apiSources.authHints.oauth2_client_credentials'),
              oauth2_refresh_token: t('apiSources.authHints.oauth2_refresh_token'),
            },
          }}
        />
      ) : null}

      {showAttachModal && attachSource ? (
        <ApiSourceAttachModal
          source={attachSource}
          workspaces={workspaceOptions}
          loading={loadingWorkspaces}
          saving={savingAttachments}
          onClose={closeAttachModal}
          onConfirm={(selections) => void attachApiSource(selections)}
          labels={{
            title: t('apiSources.attach.title'),
            description: t('apiSources.attach.description'),
            loading: t('apiSources.attach.loading'),
            empty: t('apiSources.attach.empty'),
            defaultLabel: t('apiSources.attach.defaultLabel'),
            defaultCaption: t('apiSources.attach.defaultCaption'),
            skip: t('apiSources.attach.skip'),
            confirm: t('apiSources.attach.confirm'),
          }}
        />
      ) : null}
    </div>
  );
}
