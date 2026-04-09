'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link2, CheckCircle, MessageCircle, Database, Globe, Loader2, Pencil, Play, Trash2, Plus } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { ApiConnectionAuthMode, ApiConnectionSourceMode, WorkspaceApiConnection } from '@/types/database';

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
};

type ApiSourceDraft = {
  id?: string;
  name: string;
  description: string;
  endpoint_url: string;
  http_method: 'GET' | 'POST';
  auth_mode: ApiConnectionAuthMode;
  source_mode: ApiConnectionSourceMode;
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
};

const AUTH_MODE_LABELS: Record<ApiConnectionAuthMode, string> = {
  none: 'None',
  api_key: 'API key',
  bearer: 'Bearer token',
  basic: 'Basic auth',
  oauth2_client_credentials: 'OAuth2 client credentials',
  oauth2_refresh_token: 'OAuth2 refresh token',
};

const SOURCE_MODE_LABELS: Record<ApiConnectionSourceMode, string> = {
  hybrid: 'Hybrid',
  api_only: 'API-only',
  either: 'Either',
};

function normalizeWhatsappPhoneInput(value: string): string | null | '' {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length < 8) return null;
  return `+${digits}`;
}

function emptyDraft(): ApiSourceDraft {
  return {
    name: '',
    description: '',
    endpoint_url: '',
    http_method: 'GET',
    auth_mode: 'none',
    source_mode: 'either',
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
  };
}

function draftFromConnection(connection: WorkspaceApiConnection): ApiSourceDraft {
  const authConfig = (connection.auth_config_json || {}) as Record<string, string | number | undefined>;
  const normalization = (connection.normalization_config_json || {}) as Record<string, unknown>;
  const includePaths = Array.isArray(normalization.include_paths) ? normalization.include_paths as string[] : [];
  const excludePaths = Array.isArray(normalization.exclude_paths) ? normalization.exclude_paths as string[] : [];
  const preferredFields = Array.isArray(normalization.preferred_fields) ? normalization.preferred_fields as string[] : [];

  return {
    id: connection.id,
    name: connection.name,
    description: connection.description || '',
    endpoint_url: connection.endpoint_url,
    http_method: connection.http_method,
    auth_mode: connection.auth_mode,
    source_mode: connection.source_mode || 'either',
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
  };
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

function ApiStatusBadge({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : status === 'error'
        ? 'bg-red-500/10 text-red-700 dark:text-red-400'
        : 'bg-surface-alt text-text-soft';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>;
}

function ApiSourceModal({
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
  labels: Record<string, string>;
}) {
  const setField = <K extends keyof ApiSourceDraft>(key: K, value: ApiSourceDraft[K]) =>
    onDraftChange({ ...draft, [key]: value });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-scholar border border-border bg-surface shadow-[var(--shadowLg)]" onClick={(event) => event.stopPropagation()}>
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text">
            {draft.id ? labels.editSource : labels.addSource}
          </h2>
          <p className="mt-1 text-sm text-text-soft">{labels.modalDescription}</p>
        </div>

        <div className="grid gap-4 px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Input label={labels.name} value={draft.name} onChange={(event) => setField('name', event.target.value)} />
            <Input label={labels.description} value={draft.description} onChange={(event) => setField('description', event.target.value)} />
          </div>

          <Input label={labels.endpointUrl} value={draft.endpoint_url} onChange={(event) => setField('endpoint_url', event.target.value)} />

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1.5 text-sm text-text">
              <span className="font-medium text-text-soft">{labels.method}</span>
              <select
                value={draft.http_method}
                onChange={(event) => setField('http_method', event.target.value as 'GET' | 'POST')}
                className="min-h-[42px] rounded-scholar border border-border bg-surface px-3 text-sm text-text"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm text-text">
              <span className="font-medium text-text-soft">{labels.authMode}</span>
              <select
                value={draft.auth_mode}
                onChange={(event) => setField('auth_mode', event.target.value as ApiConnectionAuthMode)}
                className="min-h-[42px] rounded-scholar border border-border bg-surface px-3 text-sm text-text"
              >
                {Object.entries(AUTH_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm text-text">
              <span className="font-medium text-text-soft">{labels.sourceMode}</span>
              <select
                value={draft.source_mode}
                onChange={(event) => setField('source_mode', event.target.value as ApiConnectionSourceMode)}
                className="min-h-[42px] rounded-scholar border border-border bg-surface px-3 text-sm text-text"
              >
                {Object.entries(SOURCE_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          {(draft.auth_mode === 'api_key' || draft.auth_mode === 'bearer' || draft.auth_mode === 'basic') && (
            <div className="grid gap-4 md:grid-cols-2">
              {draft.auth_mode === 'api_key' && (
                <>
                  <Input label={labels.apiKeyHeaderName} value={draft.api_key_header_name} onChange={(event) => setField('api_key_header_name', event.target.value)} />
                  <Input label={labels.apiKey} type="password" value={draft.api_key} onChange={(event) => setField('api_key', event.target.value)} />
                </>
              )}
              {draft.auth_mode === 'bearer' && (
                <Input label={labels.bearerToken} type="password" value={draft.bearer_token} onChange={(event) => setField('bearer_token', event.target.value)} />
              )}
              {draft.auth_mode === 'basic' && (
                <Input label={labels.basicSecret} type="password" value={draft.basic_token_raw} onChange={(event) => setField('basic_token_raw', event.target.value)} />
              )}
            </div>
          )}

          {(draft.auth_mode === 'oauth2_client_credentials' || draft.auth_mode === 'oauth2_refresh_token') && (
            <div className="grid gap-4 md:grid-cols-2">
              <Input label={labels.tokenUrl} value={draft.token_url} onChange={(event) => setField('token_url', event.target.value)} />
              <Input label={labels.scope} value={draft.scope} onChange={(event) => setField('scope', event.target.value)} />
              <Input label={labels.audience} value={draft.audience} onChange={(event) => setField('audience', event.target.value)} />
              <Input label={labels.clientId} value={draft.client_id} onChange={(event) => setField('client_id', event.target.value)} />
              <Input label={labels.clientSecret} type="password" value={draft.client_secret} onChange={(event) => setField('client_secret', event.target.value)} />
              {draft.auth_mode === 'oauth2_refresh_token' && (
                <>
                  <Input label={labels.accessToken} type="password" value={draft.access_token} onChange={(event) => setField('access_token', event.target.value)} />
                  <Input label={labels.refreshToken} type="password" value={draft.refresh_token} onChange={(event) => setField('refresh_token', event.target.value)} />
                </>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Input label={labels.responseRootPath} value={draft.response_root_path} onChange={(event) => setField('response_root_path', event.target.value)} />
            <Input label={labels.preferredFields} value={draft.preferred_fields_raw} onChange={(event) => setField('preferred_fields_raw', event.target.value)} />
            <label className="grid gap-1.5 text-sm text-text">
              <span className="font-medium text-text-soft">{labels.includePaths}</span>
              <textarea
                value={draft.include_paths_raw}
                onChange={(event) => setField('include_paths_raw', event.target.value)}
                className="min-h-[110px] rounded-scholar border border-border bg-surface px-3 py-2 text-sm text-text"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-text">
              <span className="font-medium text-text-soft">{labels.excludePaths}</span>
              <textarea
                value={draft.exclude_paths_raw}
                onChange={(event) => setField('exclude_paths_raw', event.target.value)}
                className="min-h-[110px] rounded-scholar border border-border bg-surface px-3 py-2 text-sm text-text"
              />
            </label>
          </div>

          {testResult && (
            <div className={`rounded-scholar border px-4 py-3 text-sm ${testResult.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400' : 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400'}`}>
              {testResult.ok ? labels.connectionSucceeded : testResult.error || `${labels.connectionFailed} (HTTP ${testResult.status})`}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <Button variant="secondary" size="sm" onClick={onTest} isLoading={testing} disabled={!draft.endpoint_url.trim()}>
            <Play className="h-4 w-4" />
            {labels.testConnection}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {labels.cancel}
            </Button>
            <Button size="sm" onClick={onSave} isLoading={saving} disabled={!draft.name.trim() || !draft.endpoint_url.trim()}>
              {draft.id ? labels.saveChanges : labels.createSource}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const t = useTranslations('integrationsPage');
  const tNav = useTranslations('nav');
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

  const saveApiSource = async () => {
    setSavingApiSource(true);
    try {
      const payload: Record<string, unknown> = {
        action: apiDraft.id ? 'update' : 'create',
        connection_id: apiDraft.id,
        name: apiDraft.name.trim(),
        description: apiDraft.description.trim() || undefined,
        endpoint_url: apiDraft.endpoint_url.trim(),
        http_method: apiDraft.http_method,
        auth_mode: apiDraft.auth_mode,
        source_mode: apiDraft.source_mode,
        auth_config_json: buildAuthConfig(apiDraft),
        normalization_config_json: buildNormalizationConfig(apiDraft),
      };
      const secretBundle = buildSecretBundle(apiDraft);
      if (secretBundle) payload.secret_bundle = secretBundle;

      const { error } = await supabase.functions.invoke('workspace-api-connections', { body: payload });
      if (error) throw error;
      setShowApiModal(false);
      await loadApiSources();
    } finally {
      setSavingApiSource(false);
    }
  };

  const testApiSource = async () => {
    setTestingApiSource(true);
    setApiTestResult(null);
    try {
      const payload: Record<string, unknown> = {
        action: 'test-connection',
        connection_id: apiDraft.id,
        endpoint_url: apiDraft.endpoint_url.trim(),
        http_method: apiDraft.http_method,
        auth_mode: apiDraft.auth_mode,
        auth_config_json: buildAuthConfig(apiDraft),
        normalization_config_json: buildNormalizationConfig(apiDraft),
      };
      const secretBundle = buildSecretBundle(apiDraft);
      if (secretBundle) payload.secret_bundle = secretBundle;

      const { data, error } = await supabase.functions.invoke('workspace-api-connections', { body: payload });
      if (error) throw error;
      setApiTestResult(data?.data?.test_result || data?.test_result || { ok: false, status: 0, error: 'No result' });
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
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={tNav('integrations')} />

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
              <div className="p-4 bg-surface-alt rounded-scholar border border-border space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center rounded-scholar bg-[#25D366]/10 border border-[#25D366]/20">
                    <MessageCircle className="w-5 h-5 text-[#25D366]" />
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
                  <div className="rounded-scholar border border-success/30 bg-success/5 p-3 text-sm text-success">
                    {whatsappPhoneSuccess}
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button size="sm" onClick={saveWhatsappPhone} isLoading={savingWhatsappPhone}>
                    {t('whatsappPhoneSave')}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-surface-alt rounded-scholar border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center rounded-scholar bg-white border border-border">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
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
                      <CheckCircle className="w-4 h-4 text-success" />
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

              <div className="flex items-center justify-between p-4 bg-surface-alt rounded-scholar border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center rounded-scholar bg-white border border-border">
                    <svg className="w-5 h-5" viewBox="0 0 23 23">
                      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
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
                      <CheckCircle className="w-4 h-4 text-success" />
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
              <div className="rounded-scholar border border-border bg-surface-alt px-4 py-3 text-sm text-text-soft">
                {t('apiSources.reuseHint')}
              </div>

              {loadingApiSources ? (
                <div className="flex items-center gap-2 py-8 text-text-soft">
                  <Spinner size="sm" />
                  {t('apiSources.loading')}
                </div>
              ) : apiSources.length === 0 ? (
                <div className="rounded-scholar border border-dashed border-border bg-surface-alt px-4 py-10 text-center">
                  <p className="text-sm font-medium text-text">{t('apiSources.emptyTitle')}</p>
                  <p className="mt-1 text-sm text-text-soft">{t('apiSources.emptyBody')}</p>
                  <Button className="mt-4" size="sm" onClick={openCreateApiSource}>
                    {t('apiSources.addSource')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {apiSources.map((connection) => (
                    <div key={connection.id} className="rounded-scholar border border-border bg-surface-alt p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-scholar bg-accent/10 text-accent">
                            <Globe className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-text">{connection.name}</p>
                              <ApiStatusBadge status={connection.status} />
                              <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-soft">
                                {SOURCE_MODE_LABELS[connection.source_mode || 'either']}
                              </span>
                            </div>
                            <p className="mt-1 truncate font-mono text-xs text-text-muted">{connection.endpoint_url}</p>
                            {connection.description ? (
                              <p className="mt-1 text-sm text-text-soft">{connection.description}</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
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
                        <span>{t('apiSources.authLabel', { mode: AUTH_MODE_LABELS[connection.auth_mode] })}</span>
                        {connection.last_successful_fetch_at ? (
                          <span>{t('apiSources.lastFetched', { date: new Date(connection.last_successful_fetch_at).toLocaleString() })}</span>
                        ) : null}
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
        <ApiSourceModal
          draft={apiDraft}
          onDraftChange={setApiDraft}
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
            name: t('apiSources.fields.name'),
            description: t('apiSources.fields.description'),
            endpointUrl: t('apiSources.fields.endpointUrl'),
            method: t('apiSources.fields.method'),
            authMode: t('apiSources.fields.authMode'),
            sourceMode: t('apiSources.fields.sourceMode'),
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
            responseRootPath: t('apiSources.fields.responseRootPath'),
            preferredFields: t('apiSources.fields.preferredFields'),
            includePaths: t('apiSources.fields.includePaths'),
            excludePaths: t('apiSources.fields.excludePaths'),
            testConnection: t('apiSources.testConnection'),
            cancel: t('apiSources.cancel'),
            saveChanges: t('apiSources.saveChanges'),
            createSource: t('apiSources.createSource'),
            connectionSucceeded: t('apiSources.connectionSucceeded'),
            connectionFailed: t('apiSources.connectionFailed'),
          }}
        />
      ) : null}
    </div>
  );
}
