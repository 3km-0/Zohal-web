'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ChevronDown, LayoutDashboard, FolderOpen, PanelsTopLeft, MoreHorizontal, Bolt } from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';

/** Primary acquisition workspace shell tabs. Routes stay under `/workspaces`. */
export type WorkspaceTabKey = 'workspace' | 'sources' | 'automations' | 'publish';

interface WorkspaceTabsProps {
  workspaceId: string;
  active?: WorkspaceTabKey;
  className?: string;
  showMembersLink?: boolean;
}

export function resolveWorkspaceTabFromPath(pathname: string): WorkspaceTabKey {
  if (pathname.includes('/publish') || pathname.includes('/experiences')) return 'publish';
  if (pathname.includes('/automations')) return 'automations';
  if (pathname.includes('/sources') || pathname.includes('/documents/')) return 'sources';
  if (pathname.includes('/operations') || pathname.includes('/operator')) return 'automations';
  if (pathname.includes('/overview')) return 'workspace';
  if (pathname.includes('/playbooks')) return 'workspace';
  if (pathname.includes('/documents/')) return 'sources';
  return 'workspace';
}

export function WorkspaceTabs({
  workspaceId,
  active,
  className,
  showMembersLink = false,
}: WorkspaceTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('workspaceTabs');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const fromFolderId = searchParams.get('fromFolder');

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const withFolderContext = (href: string) => {
    if (!fromFolderId) return href;
    const separator = href.includes('?') ? '&' : '?';
    return `${href}${separator}fromFolder=${encodeURIComponent(fromFolderId)}`;
  };

  const resolved: WorkspaceTabKey = active || resolveWorkspaceTabFromPath(pathname);

  const tabs: {
    key: WorkspaceTabKey;
    label: string;
    href: string;
    icon: ComponentType<{ className?: string }>;
  }[] = [
    {
      key: 'workspace',
      label: t('workspace'),
      href: withFolderContext(`/workspaces/${workspaceId}`),
      icon: LayoutDashboard,
    },
    {
      key: 'sources',
      label: t('sources'),
      href: withFolderContext(`/workspaces/${workspaceId}/sources`),
      icon: FolderOpen,
    },
    {
      key: 'automations',
      label: t('automations'),
      href: withFolderContext(`/workspaces/${workspaceId}/automations`),
      icon: Bolt,
    },
    {
      key: 'publish',
      label: t('publish'),
      href: withFolderContext(`/workspaces/${workspaceId}/publish`),
      icon: PanelsTopLeft,
    },
  ];

  const secondaryLinks: { href: string; label: string }[] = [
    { href: withFolderContext(`/workspaces/${workspaceId}/notes`), label: t('notes') },
    { href: withFolderContext(`/workspaces/${workspaceId}/data-sources`), label: t('dataSources') },
    { href: withFolderContext(`/workspaces/${workspaceId}/sources`), label: t('corpus') },
    { href: withFolderContext(`/workspaces/${workspaceId}/playbooks`), label: t('templates') },
    ...(showMembersLink
      ? [{ href: withFolderContext(`/workspaces/${workspaceId}/members`), label: t('members') }]
      : []),
  ];

  const activeTab = tabs.find((tab) => tab.key === resolved) ?? tabs[0];
  const ActiveIcon = activeTab.icon;

  return (
    <div className={cn('relative border-b border-border bg-background/80 px-4 py-3 md:px-6', className)} data-tour="workspace-tabs" ref={moreRef}>
      <button
        type="button"
        aria-expanded={moreOpen}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setMoreOpen((open) => !open);
        }}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] border border-border bg-surface px-3 text-sm font-semibold text-text shadow-[var(--shadowSm)] transition hover:bg-surface-alt"
      >
        <ActiveIcon className="h-4 w-4 text-accent" />
        <span>{t('workspaceMenu')}</span>
        <ChevronDown className={cn('h-4 w-4 text-text-muted transition', moreOpen && 'rotate-180')} />
      </button>
      {moreOpen ? (
        <div
          role="menu"
          className="absolute end-0 top-[calc(100%+8px)] z-50 min-w-64 overflow-hidden rounded-[14px] border border-border bg-surface shadow-2xl shadow-black/20"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = resolved === tab.key;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                role="menuitem"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium transition hover:bg-surface-alt hover:text-text',
                  isActive ? 'bg-accent/10 text-accent' : 'text-text-soft'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
          <div className="border-t border-border py-1">
            {secondaryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text-soft transition hover:bg-surface-alt hover:text-text"
                onClick={() => setMoreOpen(false)}
              >
                <MoreHorizontal className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
