'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Database, FileText, Rocket, StickyNote, Users } from 'lucide-react';
import type { ComponentType } from 'react';

type WorkspaceTabKey = 'documents' | 'notes' | 'data-sources' | 'experiences' | 'members' | 'packs';
type VisibleWorkspaceTabKey = Exclude<WorkspaceTabKey, 'packs'>;

interface WorkspaceTabsProps {
  workspaceId: string;
  active?: WorkspaceTabKey;
  className?: string;
  showMembersTab?: boolean;
}

export function WorkspaceTabs({ workspaceId, active, className, showMembersTab = false }: WorkspaceTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('workspaceTabs');
  const fromFolderId = searchParams.get('fromFolder');

  const withFolderContext = (href: string) => {
    if (!fromFolderId) return href;
    const separator = href.includes('?') ? '&' : '?';
    return `${href}${separator}fromFolder=${encodeURIComponent(fromFolderId)}`;
  };

  const resolved: VisibleWorkspaceTabKey =
    (active === 'packs' ? 'documents' : active) ||
    (pathname.includes('/notes')
      ? 'notes'
      : pathname.includes('/data-sources')
        ? 'data-sources'
      : pathname.includes('/experiences')
        ? 'experiences'
      : pathname.includes('/members')
        ? 'members'
      : 'documents');

  const tabs: {
    key: VisibleWorkspaceTabKey;
    label: string;
    href: string;
    icon: ComponentType<{ className?: string }>;
  }[] = [
    { key: 'documents', label: t('documents'), href: withFolderContext(`/workspaces/${workspaceId}`), icon: FileText },
    { key: 'notes', label: t('notes'), href: withFolderContext(`/workspaces/${workspaceId}/notes`), icon: StickyNote },
    { key: 'data-sources' as const, label: t('dataSources'), href: withFolderContext(`/workspaces/${workspaceId}/data-sources`), icon: Database },
    { key: 'experiences', label: t('experiences'), href: withFolderContext(`/workspaces/${workspaceId}/experiences`), icon: Rocket },
    ...(showMembersTab
      ? [{ key: 'members' as const, label: t('members'), href: withFolderContext(`/workspaces/${workspaceId}/members`), icon: Users }]
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
                  'inline-flex items-center whitespace-nowrap py-2 px-1 transition-all duration-150 border-b-2 -mb-px',
                  isActive
                    ? 'border-accent'
                    : 'border-transparent hover:border-border'
                )}
              >
                {/* Pill wrapping icon + label */}
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150',
                    isActive
                      ? 'font-semibold text-text'
                      : 'font-medium text-text-soft hover:text-text'
                  )}
                  style={isActive ? { backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)' } : undefined}
                >
                  <Icon
                    className={cn(
                      'flex-shrink-0 transition-colors duration-150',
                      isActive ? 'h-4 w-4 text-accent' : 'h-3.5 w-3.5 text-text-muted'
                    )}
                  />
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" aria-hidden="true" />
      </div>
    </div>
  );
}
