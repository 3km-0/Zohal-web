'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ScholarToggle } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { WorkspaceApiConnection, ApiConnectionAuthMode } from '@/types/database';
import { CheckCircle2, Database, ExternalLink, Globe, Link2, Loader2, PlugZap, Unplug } from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  const colors = {
    active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    disabled: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
    error: 'bg-red-500/15 text-red-600 dark:text-red-400',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', colors[status as keyof typeof colors] || colors.disabled)}>
      {status}
    </span>
  );
}

export default function DataSourcesPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('workspaceDataSourcesPage');

  const [attachedSources, setAttachedSources] = useState<WorkspaceApiConnection[]>([]);
  const [librarySources, setLibrarySources] = useState<WorkspaceApiConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);

  const authModeLabel = useCallback(
    (mode: ApiConnectionAuthMode) =>
      t(`authModes.${mode}` as const),
    [t]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [attachedResult, libraryResult] = await Promise.all([
        supabase.functions.invoke('workspace-api-connections', {
          body: { action: 'list', workspace_id: workspaceId },
        }),
        supabase.functions.invoke('workspace-api-connections', {
          body: { action: 'list-library' },
        }),
      ]);

      const attached = attachedResult.data?.data?.connections || attachedResult.data?.connections || [];
      const library = libraryResult.data?.data?.connections || libraryResult.data?.connections || [];

      setAttachedSources(attached);
      setLibrarySources(library);
    } finally {
      setLoading(false);
    }
  }, [supabase, workspaceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const attachedIds = useMemo(() => new Set(attachedSources.map((source) => source.id)), [attachedSources]);
  const availableLibrarySources = useMemo(
    () => librarySources.filter((source) => !attachedIds.has(source.id)),
    [attachedIds, librarySources]
  );

  const attachSource = async (connectionId: string) => {
    setBusySourceId(connectionId);
    try {
      await supabase.functions.invoke('workspace-api-connections', {
        body: {
          action: 'attach',
          workspace_id: workspaceId,
          connection_id: connectionId,
          enabled_by_default: true,
        },
      });
      await loadData();
    } finally {
      setBusySourceId(null);
    }
  };

  const detachSource = async (connectionId: string) => {
    setBusySourceId(connectionId);
    try {
      await supabase.functions.invoke('workspace-api-connections', {
        body: {
          action: 'detach',
          workspace_id: workspaceId,
          connection_id: connectionId,
        },
      });
      await loadData();
    } finally {
      setBusySourceId(null);
    }
  };

  const updateDefault = async (connection: WorkspaceApiConnection, enabled: boolean) => {
    if (!connection.attachment_id) return;
    setBusySourceId(connection.id);
    try {
      await supabase.functions.invoke('workspace-api-connections', {
        body: {
          action: 'update-attachment',
          workspace_id: workspaceId,
          attachment_id: connection.attachment_id,
          enabled_by_default: enabled,
        },
      });
      setAttachedSources((current) =>
        current.map((source) =>
          source.id === connection.id ? { ...source, enabled_by_default: enabled } : source
        )
      );
    } finally {
      setBusySourceId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <WorkspaceTabs workspaceId={workspaceId} active="data-sources" />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>{t('title')}</CardTitle>
                <CardDescription>
                  {t('description')}
                </CardDescription>
              </div>
              <Link
                href="/integrations"
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-scholar border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-all duration-200 hover:border-[color:var(--button-primary-bg)] hover:bg-surface-alt"
              >
                {t('manageLibrary')}
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-text-soft">
            <div className="rounded-scholar border border-border bg-surface-alt p-3">
              {t('guidance.createOnce')}
            </div>
            <div className="rounded-scholar border border-border bg-surface-alt p-3">
              {t('guidance.runSelection')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('attached.title')}</CardTitle>
            <CardDescription>{t('attached.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
              </div>
            ) : attachedSources.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-scholar border border-dashed border-border bg-surface-alt px-4 py-12 text-center">
                <Database className="mb-3 h-10 w-10 text-text-muted" />
                <p className="text-sm font-medium text-text">{t('attached.emptyTitle')}</p>
                <p className="mt-1 text-sm text-text-soft">{t('attached.emptyDescription')}</p>
                <Link
                  href="/integrations"
                  className="mt-4 inline-flex min-h-[42px] items-center justify-center gap-2 rounded-scholar bg-[color:var(--button-primary-bg)] px-3 py-2 text-sm font-semibold text-[color:var(--button-primary-text)] transition-all duration-200 hover:bg-[color:var(--button-primary-bg-hover)]"
                >
                  {t('openIntegrations')}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {attachedSources.map((source) => (
                  <div key={source.id} className="rounded-scholar border border-border bg-surface-alt p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-scholar bg-accent/10 text-accent">
                          <Globe className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-text">{source.name}</p>
                            <StatusBadge status={source.status} />
                            {source.source_kind ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                                {source.source_kind === 'finance_builtin'
                                  ? 'Finance connector'
                                  : source.source_kind === 'mcp'
                                    ? 'MCP tool'
                                    : 'API'}
                              </span>
                            ) : null}
                            {source.enabled_by_default !== false ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" />
                                Default
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate font-mono text-xs text-text-muted">{source.endpoint_url}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-soft">
                            <span>{authModeLabel(source.auth_mode)}</span>
                            {source.mapping_status ? (
                              <span>Mapping: {source.mapping_status.replace('_', ' ')}</span>
                            ) : null}
                            {source.last_successful_fetch_at ? (
                              <span>{t('attached.lastSuccess', { value: new Date(source.last_successful_fetch_at).toLocaleString() })}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void detachSource(source.id)}
                        isLoading={busySourceId === source.id}
                      >
                        <Unplug className="h-4 w-4" />
                        {t('attached.detach')}
                      </Button>
                    </div>

                    <div className="mt-4 border-t border-border pt-4">
                      <ScholarToggle
                        label={t('attached.defaultLabel')}
                        caption={t('attached.defaultCaption')}
                        checked={source.enabled_by_default !== false}
                        onCheckedChange={(enabled) => void updateDefault(source, enabled)}
                        disabled={busySourceId === source.id}
                      />
                      <Link
                        href="/integrations"
                        className="mt-4 inline-flex min-h-[42px] items-center justify-center gap-2 rounded-scholar px-3 py-2 text-sm font-semibold text-text-soft transition-all duration-200 hover:bg-surface hover:text-text"
                      >
                        {t('attached.editInIntegrations')}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('library.title')}</CardTitle>
            <CardDescription>{t('library.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
              </div>
            ) : availableLibrarySources.length === 0 ? (
              <div className="rounded-scholar border border-dashed border-border bg-surface-alt px-4 py-10 text-center">
                <p className="text-sm font-medium text-text">{t('library.emptyTitle')}</p>
                <p className="mt-1 text-sm text-text-soft">{t('library.emptyDescription')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableLibrarySources.map((source) => (
                  <div key={source.id} className="rounded-scholar border border-border bg-surface-alt p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-scholar bg-accent/10 text-accent">
                          <Link2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-text">{source.name}</p>
                            <StatusBadge status={source.status} />
                          </div>
                          <p className="mt-1 truncate font-mono text-xs text-text-muted">{source.endpoint_url}</p>
                          {source.description ? <p className="mt-1 text-sm text-text-soft">{source.description}</p> : null}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => void attachSource(source.id)}
                        isLoading={busySourceId === source.id}
                      >
                        <PlugZap className="h-4 w-4" />
                        {t('library.attach')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
