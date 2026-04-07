'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { cn } from '@/lib/utils';
import type { WorkspaceApiConnection, ApiConnectionAuthMode } from '@/types/database';
import {
  Database,
  Plus,
  Trash2,
  Pencil,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Globe,
  Zap,
} from 'lucide-react';

type TestResult = {
  ok: boolean;
  status: number;
  error?: string;
  response_preview?: unknown;
};

const AUTH_MODE_LABELS: Record<ApiConnectionAuthMode, string> = {
  none: 'None',
  api_key: 'API Key',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  oauth2_client_credentials: 'OAuth2 Client Credentials',
};

function StatusBadge({ status }: { status: string }) {
  const colors = {
    active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    disabled: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
    error: 'bg-red-500/15 text-red-600 dark:text-red-400',
  };
  const icons = {
    active: CheckCircle2,
    disabled: AlertTriangle,
    error: XCircle,
  };
  const Icon = icons[status as keyof typeof icons] || AlertTriangle;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', colors[status as keyof typeof colors] || colors.disabled)}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function AddConnectionModal({
  workspaceId,
  existing,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  existing?: WorkspaceApiConnection | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [endpointUrl, setEndpointUrl] = useState(existing?.endpoint_url || '');
  const [httpMethod, setHttpMethod] = useState<'GET' | 'POST'>(existing?.http_method || 'GET');
  const [authMode, setAuthMode] = useState<ApiConnectionAuthMode>(existing?.auth_mode || 'none');
  const [secretValue, setSecretValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload: Record<string, unknown> = { action: 'test-connection' };
      if (existing?.id) {
        payload.connection_id = existing.id;
      } else {
        payload.endpoint_url = endpointUrl;
        payload.http_method = httpMethod;
        payload.auth_mode = authMode;
      }
      if (secretValue) payload.secret_value = secretValue;

      const { data, error } = await supabase.functions.invoke('workspace-api-connections', { body: payload });
      if (error) throw error;
      setTestResult(data?.data?.test_result || data?.test_result || { ok: false, error: 'No result' });
    } catch (err) {
      setTestResult({ ok: false, status: 0, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !endpointUrl.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        action: existing ? 'update' : 'create',
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim() || undefined,
        endpoint_url: endpointUrl.trim(),
        http_method: httpMethod,
        auth_mode: authMode,
      };
      if (existing) payload.connection_id = existing.id;
      if (secretValue) payload.secret_value = secretValue;

      const { error } = await supabase.functions.invoke('workspace-api-connections', { body: payload });
      if (error) throw error;
      onSaved();
    } catch {
      // error handled silently for now
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-surface border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text">{existing ? 'Edit' : 'Add'} API Data Source</h2>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="block text-sm font-medium text-text-soft mb-1">Name</label>
            <input
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="e.g., Market Data API"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-soft mb-1">Description</label>
            <input
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-soft mb-1">Endpoint URL</label>
            <input
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="https://api.example.com/data"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-soft mb-1">Method</label>
              <select
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
                value={httpMethod}
                onChange={(e) => setHttpMethod(e.target.value as 'GET' | 'POST')}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-soft mb-1">Authentication</label>
              <select
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
                value={authMode}
                onChange={(e) => setAuthMode(e.target.value as ApiConnectionAuthMode)}
              >
                {Object.entries(AUTH_MODE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          {authMode !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-text-soft mb-1">
                {authMode === 'api_key' ? 'API Key' : authMode === 'bearer' ? 'Bearer Token' : 'Credentials'}
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder={existing ? '(unchanged — enter new value to update)' : 'Enter secret'}
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
              />
            </div>
          )}

          {testResult && (
            <div className={cn('rounded-lg p-3 text-sm', testResult.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400')}>
              {testResult.ok ? (
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Connected (HTTP {testResult.status})</span>
              ) : (
                <span className="flex items-center gap-1.5"><XCircle className="h-4 w-4" /> {testResult.error || `HTTP ${testResult.status}`}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-between border-t border-border px-6 py-4">
          <button
            onClick={handleTest}
            disabled={!endpointUrl.trim() || testing}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-soft hover:text-text hover:bg-surface-raised transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Test Connection
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-1.5 text-sm font-medium text-text-soft hover:text-text transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || !endpointUrl.trim() || saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {existing ? 'Save' : 'Add Source'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DataSourcesPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [connections, setConnections] = useState<WorkspaceApiConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingConn, setEditingConn] = useState<WorkspaceApiConnection | null>(null);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('workspace-api-connections', {
        body: { action: 'list', workspace_id: workspaceId },
      });
      if (!error && data?.data?.connections) {
        setConnections(data.data.connections);
      } else if (!error && data?.connections) {
        setConnections(data.connections);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [supabase, workspaceId]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const handleDelete = async (connId: string) => {
    try {
      await supabase.functions.invoke('workspace-api-connections', {
        body: { action: 'delete', connection_id: connId },
      });
      setConnections((prev) => prev.filter((c) => c.id !== connId));
    } catch {
      // silently handle
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <WorkspaceTabs workspaceId={workspaceId} active="data-sources" />
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text">Data Sources</h1>
            <p className="mt-1 text-sm text-text-soft">
              Connect external APIs to include live data in your analysis runs.
            </p>
          </div>
          <button
            onClick={() => { setEditingConn(null); setShowModal(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add API Source
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
          </div>
        ) : connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
            <Database className="mb-3 h-10 w-10 text-text-muted" />
            <p className="text-sm font-medium text-text-soft">No API data sources yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Add an API to enrich your document analysis with live data.
            </p>
            <button
              onClick={() => { setEditingConn(null); setShowModal(true); }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add API Source
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => (
              <div key={conn.id} className="group rounded-xl border border-border bg-surface p-4 hover:border-accent/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <Globe className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-text">{conn.name}</h3>
                      <p className="mt-0.5 text-xs text-text-muted font-mono truncate max-w-md">{conn.endpoint_url}</p>
                      {conn.description && <p className="mt-1 text-xs text-text-soft">{conn.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={conn.status} />
                    <span className="text-xs text-text-muted px-1.5 py-0.5 rounded bg-surface-raised font-mono">
                      {conn.http_method}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span>Auth: {AUTH_MODE_LABELS[conn.auth_mode]}</span>
                    {conn.last_fetched_at && (
                      <span>Last fetched: {new Date(conn.last_fetched_at).toLocaleString()}</span>
                    )}
                    {conn.last_error && (
                      <span className="text-red-500">Error: {conn.last_error}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingConn(conn); setShowModal(true); }}
                      className="rounded-md p-1.5 text-text-muted hover:text-text hover:bg-surface-raised transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(conn.id)}
                      className="rounded-md p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AddConnectionModal
          workspaceId={workspaceId}
          existing={editingConn}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadConnections(); }}
        />
      )}
    </div>
  );
}
