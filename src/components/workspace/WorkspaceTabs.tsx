'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { FileText, Layers, MessageSquare, Rocket, ScrollText, StickyNote, Users } from 'lucide-react';
import type { ComponentType } from 'react';

type WorkspaceTabKey = 'documents' | 'ask' | 'notes' | 'reports' | 'pipelines' | 'packs' | 'experiences' | 'members';

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
      : pathname.includes('/ask')
        ? 'ask'
      : pathname.includes('/experiences')
        ? 'experiences'
      : pathname.includes('/members')
        ? 'members'
      : pathname.includes('/reports')
        ? 'reports'
        : pathname.includes('/pipelines')
          ? 'pipelines'
        : 'documents');

  const tabs: {
    key: WorkspaceTabKey;
    label: string;
    href: string;
    icon: ComponentType<{ className?: string }>;
  }[] = [
    { key: 'documents', label: t('documents'), href: `/workspaces/${workspaceId}`, icon: FileText },
    { key: 'ask', label: t('ask'), href: `/workspaces/${workspaceId}/ask`, icon: MessageSquare },
    { key: 'notes', label: t('notes'), href: `/workspaces/${workspaceId}/notes`, icon: StickyNote },
    { key: 'reports', label: t('reports'), href: `/workspaces/${workspaceId}/reports`, icon: ScrollText },
    { key: 'pipelines', label: t('pipelines'), href: `/workspaces/${workspaceId}/pipelines`, icon: Layers },
    { key: 'experiences', label: t('experiences'), href: `/workspaces/${workspaceId}/experiences`, icon: Rocket },
    ...(showMembersTab
      ? [{ key: 'members' as const, label: t('members'), href: `/workspaces/${workspaceId}/members`, icon: Users }]
      : []),
  ];

  return (
    <div className={cn('relative border-b border-border bg-surface', className)} data-tour="workspace-tabs">
      <div className="relative overflow-x-auto">
        <div className="flex items-end px-4 md:px-6 min-w-max">
          {tabs.map((tab) => {
            const isActive = resolved === tab.key;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-3 text-sm font-medium transition-all duration-150 border-b-2 -mb-px',
                  isActive
                    ? 'border-accent text-text'
                    : 'border-transparent text-text-soft hover:text-text hover:border-border'
                )}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                {tab.label}
              </Link>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" aria-hidden="true" />
      </div>
    </div>
  );
}
