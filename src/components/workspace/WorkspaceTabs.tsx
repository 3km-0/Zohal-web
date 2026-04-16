'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LayoutDashboard, FolderOpen, Bot, Megaphone, MoreHorizontal } from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';

/** Primary property shell tabs (presentation). Routes stay under `/workspaces`. */
export type WorkspaceTabKey = 'dashboard' | 'sources' | 'operator' | 'marketing';

interface WorkspaceTabsProps {
  workspaceId: string;
  active: WorkspaceTabKey;
  className?: string;
  showMembersLink?: boolean;
}

export function resolveWorkspaceTabFromPath(pathname: string): WorkspaceTabKey {
  if (pathname.includes('/operations')) return 'dashboard';
  if (pathname.includes('/operator')) return 'operator';
  if (pathname.includes('/experiences')) return 'marketing';
  if (pathname.includes('/playbooks')) return 'operator';
  if (pathname.includes('/documents/')) return 'sources';
  return 'sources';
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
      key: 'dashboard',
      label: t('dashboard'),
      href: withFolderContext(`/workspaces/${workspaceId}/operations`),
      icon: LayoutDashboard,
    },
    {
      key: 'sources',
      label: t('sources'),
      href: withFolderContext(`/workspaces/${workspaceId}`),
      icon: FolderOpen,
    },
    {
      key: 'operator',
      label: t('operator'),
      href: withFolderContext(`/workspaces/${workspaceId}/operator`),
      icon: Bot,
    },
    {
      key: 'marketing',
      label: t('marketing'),
      href: withFolderContext(`/workspaces/${workspaceId}/experiences`),
      icon: Megaphone,
    },
  ];

  const secondaryLinks: { href: string; label: string }[] = [
    { href: withFolderContext(`/workspaces/${workspaceId}/notes`), label: t('notes') },
    { href: withFolderContext(`/workspaces/${workspaceId}/data-sources`), label: t('dataSources') },
    { href: withFolderContext(`/workspaces/${workspaceId}/packs`), label: t('packs') },
    { href: withFolderContext(`/workspaces/${workspaceId}/playbooks`), label: t('templates') },
    ...(showMembersLink
      ? [{ href: withFolderContext(`/workspaces/${workspaceId}/members`), label: t('members') }]
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
                  isActive ? 'border-accent' : 'border-transparent hover:border-border'
                )}
              >
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

          <div className="relative py-2 ps-1" ref={moreRef}>
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                setMoreOpen((o) => !o);
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-text-soft transition-colors hover:bg-surface-alt hover:text-text'
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
              {t('more')}
            </button>
            {moreOpen ? (
              <div
                role="menu"
                className="absolute end-0 top-full z-40 mt-1 min-w-[12rem] rounded-xl border border-border bg-surface py-1 shadow-[var(--shadowMd)]"
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
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" aria-hidden="true" />
      </div>
    </div>
  );
}
