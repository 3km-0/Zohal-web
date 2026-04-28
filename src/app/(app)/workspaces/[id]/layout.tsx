'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft, Bell } from 'lucide-react';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { createClient } from '@/lib/supabase/client';

export default function WorkspaceRouteLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = params.id;
  const supabase = useMemo(() => createClient(), []);
  const [workspaceName, setWorkspaceName] = useState('');

  const primarySurface =
    pathname === `/workspaces/${workspaceId}` ||
    pathname === `/workspaces/${workspaceId}/sources` ||
    pathname === `/workspaces/${workspaceId}/automations` ||
    pathname === `/workspaces/${workspaceId}/publish`;

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || !primarySurface) return;
    (async () => {
      const { data } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .maybeSingle();
      if (!cancelled) setWorkspaceName((data as { name?: string } | null)?.name || '');
    })();
    return () => {
      cancelled = true;
    };
  }, [primarySurface, supabase, workspaceId]);

  if (!workspaceId || !primarySurface) {
    return children;
  }

  const fromFolderId = searchParams.get('fromFolder');
  const backHref = fromFolderId ? `/workspaces/folders/${encodeURIComponent(fromFolderId)}` : '/workspaces';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-text dark:bg-[image:var(--console-bg)]">
      <div className="border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6 dark:bg-[#030509]/90">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(260px,0.9fr)_minmax(440px,1.4fr)_auto] xl:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-sm font-semibold text-text-soft transition hover:bg-surface-alt hover:text-text"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight text-text md:text-xl">
                {workspaceName || 'Acquisition workspace'}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                Mandate {'->'} Opportunity {'->'} Decision
              </p>
            </div>
          </div>

          <div
            id={`workspace-header-progress-${workspaceId}`}
            className="hidden min-w-0 justify-center xl:flex"
            aria-label="Workspace lifecycle"
          />

          <div className="flex shrink-0 items-center gap-2 xl:justify-end">
            <WorkspaceTabs workspaceId={workspaceId} className="border-0 bg-transparent p-0 md:p-0" />
            <button
              type="button"
              aria-label="Activity"
              className="grid h-10 w-10 place-items-center rounded-[10px] border border-border bg-surface text-text-soft transition hover:bg-surface-alt hover:text-text"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
