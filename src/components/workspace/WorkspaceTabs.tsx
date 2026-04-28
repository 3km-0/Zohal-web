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
    function onCloseMenu() {
      setMoreOpen(false);
    }
    document.addEventListener('click', onDocClick);
    window.addEventListener('workspace:header-menu-close', onCloseMenu);
    return () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('workspace:header-menu-close', onCloseMenu);
    };
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
          setMoreOpen((open) => {
            const nextOpen = !open;
            if (nextOpen) {
              window.dispatchEvent(new CustomEvent('workspace:header-menu-open'));
            }
            return nextOpen;
          });
        }}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-[0_8px_26px_rgba(15,23,42,.16)] transition hover:bg-slate-50 dark:border-white/15 dark:bg-[#05070B] dark:text-white dark:shadow-black/60 dark:hover:bg-[#0B1118]"
      >
        <ActiveIcon className="h-4 w-4 text-accent" />
        <span>{t('workspaceMenu')}</span>
        <ChevronDown className={cn('h-4 w-4 text-text-muted transition', moreOpen && 'rotate-180')} />
      </button>
      {moreOpen ? (
        <div
          role="menu"
          className="absolute end-0 top-[calc(100%+8px)] z-[250] min-w-64 overflow-hidden rounded-[14px] border border-slate-300 bg-white text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,.34)] ring-1 ring-slate-950/10 dark:border-white/15 dark:bg-[#05070B] dark:text-white dark:shadow-[0_28px_80px_rgba(0,0,0,.86)] dark:ring-white/12"
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
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium transition hover:bg-slate-100 dark:hover:bg-white/10',
                  isActive ? 'bg-lime-100 text-slate-950 dark:bg-lime-300/16 dark:text-lime-200' : 'text-slate-700 dark:text-slate-200'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
          <div className="border-t border-slate-200 py-1 dark:border-white/12">
            {secondaryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
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
