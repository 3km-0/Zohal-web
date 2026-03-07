'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { FileText, Layers, Package, ScrollText, StickyNote, Users } from 'lucide-react';
import type { ComponentType } from 'react';

type WorkspaceTabKey = 'documents' | 'notes' | 'reports' | 'pipelines' | 'packs' | 'members';

interface WorkspaceTabsProps {
  workspaceId: string;
  active?: WorkspaceTabKey;
  className?: string;
  showMembersTab?: boolean;
}

export function WorkspaceTabs({ workspaceId, active, className, showMembersTab = false }: WorkspaceTabsProps) {
  const pathname = usePathname();
  const t = useTranslations('workspaceTabs');

  const resolved: WorkspaceTabKey =
    active ||
    (pathname.includes('/notes')
      ? 'notes'
      : pathname.includes('/members')
        ? 'members'
      : pathname.includes('/reports')
        ? 'reports'
        : pathname.includes('/pipelines')
          ? 'pipelines'
        : pathname.includes('/packs')
          ? 'packs'
        : 'documents');

  const tabs: {
    key: WorkspaceTabKey;
    label: string;
    href: string;
    icon: ComponentType<{ className?: string }>;
  }[] = [
    { key: 'documents', label: t('documents'), href: `/workspaces/${workspaceId}`, icon: FileText },
    { key: 'notes', label: t('notes'), href: `/workspaces/${workspaceId}/notes`, icon: StickyNote },
    { key: 'reports', label: t('reports'), href: `/workspaces/${workspaceId}/reports`, icon: ScrollText },
    { key: 'pipelines', label: t('pipelines'), href: `/workspaces/${workspaceId}/pipelines`, icon: Layers },
    { key: 'packs', label: t('packs'), href: `/workspaces/${workspaceId}/packs`, icon: Package },
    ...(showMembersTab
      ? [{ key: 'members' as const, label: t('members'), href: `/workspaces/${workspaceId}/members`, icon: Users }]
      : []),
  ];

  return (
    <div className={cn('border-b border-border bg-surface px-4 py-3 md:px-6', className)} data-tour="workspace-tabs">
      <div className="max-w-full overflow-x-auto">
        <div className="inline-flex min-w-max items-center gap-1 rounded-[20px] border border-border bg-surface-alt p-1 shadow-[var(--shadowSm)]">
        {tabs.map((tab) => {
          const isActive = resolved === tab.key;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 whitespace-nowrap rounded-[16px] px-3.5 py-2 text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-accent text-white shadow-[var(--shadowSm)]'
                  : 'text-text-soft hover:bg-surface hover:text-text'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
        </div>
      </div>
    </div>
  );
}
