'use client';

import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';

export default function WorkspaceRouteLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = params.id;

  const primarySurface =
    pathname === `/workspaces/${workspaceId}` ||
    pathname === `/workspaces/${workspaceId}/sources` ||
    pathname === `/workspaces/${workspaceId}/automations` ||
    pathname === `/workspaces/${workspaceId}/publish`;

  if (!workspaceId || !primarySurface) {
    return children;
  }

  const fromFolderId = searchParams.get('fromFolder');
  const backHref = fromFolderId ? `/workspaces/folders/${encodeURIComponent(fromFolderId)}` : '/workspaces';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-text dark:bg-[image:var(--console-bg)]">
      <div className="border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6 dark:bg-[#030509]/90">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={backHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-sm font-semibold text-text-soft transition hover:bg-surface-alt hover:text-text"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <div className="hidden rounded-[10px] border border-border bg-surface-alt px-3 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-text-soft lg:block">
              Active workspace surface
            </div>
          </div>

          <WorkspaceTabs workspaceId={workspaceId} className="border-0 bg-transparent p-0 md:p-0" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
