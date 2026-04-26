'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LayoutDashboard, FolderOpen, PanelsTopLeft, MoreHorizontal, Bolt } from 'lucide-react';
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

  return (
    <div className={cn('relative border-b border-border bg-background/80 px-4 py-3 md:px-6', className)} data-tour="workspace-tabs">
      <div className="relative overflow-x-auto">
        <div className="flex min-w-max items-center gap-1 rounded-[14px] border border-border bg-surface/90 p-1 shadow-[var(--shadowSm)] backdrop-blur dark:bg-[image:var(--panel-bg)]">
          {tabs.map((tab) => {
            const isActive = resolved === tab.key;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center whitespace-nowrap rounded-[10px] transition-all duration-150',
                  isActive ? 'bg-accent text-[color:var(--accent-text)] shadow-[0_0_26px_var(--accent-soft)]' : 'text-text-soft hover:bg-surface-alt hover:text-text'
                )}
              >
                <span
                  className={cn(
                    'inline-flex min-h-[36px] items-center gap-1.5 px-3 py-2 text-sm transition-colors duration-150',
                    isActive ? 'font-semibold' : 'font-medium'
                  )}
                >
                  <Icon
                    className={cn(
                      'flex-shrink-0 transition-colors duration-150',
                      isActive ? 'h-4 w-4' : 'h-3.5 w-3.5 text-text-muted'
                    )}
                  />
                  {tab.label}
                </span>
              </Link>
            );
          })}

          <div className="relative ps-1" ref={moreRef}>
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                setMoreOpen((o) => !o);
              }}
              className={cn(
                'inline-flex min-h-[36px] items-center gap-1 rounded-[10px] px-3 py-2 text-sm font-medium text-text-soft transition-colors hover:bg-surface-alt hover:text-text'
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
              {t('more')}
            </button>
            {moreOpen ? (
              <div
                role="menu"
                className="absolute end-0 top-full z-40 mt-2 min-w-[12rem] rounded-xl border border-border bg-surface py-1 shadow-[var(--shadowMd)]"
              >
                {secondaryLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className="block px-3 py-2 text-sm text-text hover:bg-surface-alt"
                    onClick={() => setMoreOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" aria-hidden="true" />
      </div>
    </div>
  );
}
