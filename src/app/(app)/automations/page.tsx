'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AppHeader } from '@/components/layout/AppHeader';
import { EmptyState, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceAutomationEditor } from '@/components/workspace/WorkspaceAutomationEditor';

type WorkspaceOption = {
  id: string;
  name: string;
};

export default function AutomationsPage() {
  const t = useTranslations('automations');
  const supabase = useMemo(() => createClient(), []);
  const { showError } = useToast();

  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    const { data, error } = await supabase.rpc('list_accessible_workspaces');
    if (error) {
      showError(error, 'list_accessible_workspaces');
      setLoadingWorkspaces(false);
      return;
    }
    const items = Array.isArray(data)
      ? (data as Array<{ id: string; name?: string | null }>)
          .map((workspace) => ({
            id: String(workspace.id || '').toLowerCase(),
            name: workspace.name || 'Workspace',
          }))
          .filter((workspace) => workspace.id)
      : [];
    setWorkspaces(items);
    setSelectedWorkspaceId((current) => current || items[0]?.id || '');
    setLoadingWorkspaces(false);
  }, [showError, supabase]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  return (
    <div className="flex h-full min-h-screen flex-col bg-surface">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6">
        {loadingWorkspaces ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : workspaces.length === 0 ? (
          <EmptyState icon={<Bot className="h-8 w-8" />} title={t('noWorkspaces')} variant="card" />
        ) : (
          <>
            <section className="rounded-scholar border border-border bg-surface p-4 shadow-[var(--shadowSm)]">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text">
                <Sparkles className="h-4 w-4 text-accent" />
                {t('workspaceLabel')}
              </div>
              <select
                value={selectedWorkspaceId}
                onChange={(event) => setSelectedWorkspaceId(event.target.value)}
                className="w-full rounded-scholar border border-border bg-surface-alt px-3 py-2.5 text-sm text-text"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </section>

            {selectedWorkspaceId ? (
              <WorkspaceAutomationEditor key={selectedWorkspaceId} workspaceId={selectedWorkspaceId} />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
