'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ChevronDown, FolderOpen, LayoutDashboard, ShieldCheck, Bolt } from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';

/** Primary acquisition workspace shell tabs. Routes stay under `/workspaces`. */
export type WorkspaceTabKey = 'workspace' | 'sources' | 'automations' | 'publish';

interface WorkspaceTabsProps {
  workspaceId: string;
  active?: WorkspaceTabKey;
  className?: string;
  showMembersLink?: boolean;
  showAcquisitionDrawerActions?: boolean;
}

export function resolveWorkspaceTabFromPath(pathname: string): WorkspaceTabKey {
  if (pathname.includes('/publish') || pathname.includes('/experiences')) return 'automations';
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
  showAcquisitionDrawerActions = false,
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
  ];

  const secondaryLinks: { href: string; label: string }[] = showMembersLink
    ? [{ href: withFolderContext(`/workspaces/${workspaceId}/members`), label: t('members') }]
    : [];
  const drawerActions: { tab: 'evidence' | 'consent'; label: string; icon: ComponentType<{ className?: string }> }[] = showAcquisitionDrawerActions
    ? [
        { tab: 'evidence', label: t('evidenceTrail'), icon: ShieldCheck },
        { tab: 'consent', label: t('consentApprovals'), icon: ShieldCheck },
      ]
    : [];

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
        className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] border border-[rgba(var(--accent-rgb),0.22)] bg-surface px-3 text-sm font-semibold text-text shadow-[0_8px_26px_rgba(0,0,0,.24)] transition hover:bg-surface-alt"
      >
        <ActiveIcon className="h-4 w-4 text-accent" />
        <span>{t('workspaceMenu')}</span>
        <ChevronDown className={cn('h-4 w-4 text-text-muted transition', moreOpen && 'rotate-180')} />
      </button>
      {moreOpen ? (
        <div
          role="menu"
          className="absolute end-0 top-[calc(100%+8px)] z-[250] min-w-72 overflow-hidden rounded-[18px] border border-[rgba(var(--accent-rgb),0.22)] bg-[image:var(--panel-bg)] text-text shadow-[0_28px_80px_rgba(0,0,0,.72)]"
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
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium transition hover:bg-accent/10',
                  isActive ? 'bg-accent/14 text-accent' : 'text-text-soft'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
          {secondaryLinks.length > 0 ? (
            <div className="border-t border-[rgba(var(--accent-rgb),0.16)] py-1">
              {secondaryLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text-soft transition hover:bg-accent/10 hover:text-text"
                  onClick={() => setMoreOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
          {drawerActions.length > 0 ? (
            <div className="border-t border-[rgba(var(--accent-rgb),0.16)] py-1">
              {drawerActions.map(({ tab, label, icon: Icon }) => (
                <button
                  key={tab}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-text-soft transition hover:bg-accent/10 hover:text-text"
                  onClick={() => {
                    setMoreOpen(false);
                    window.dispatchEvent(new CustomEvent('workspace:open-command-drawer', { detail: { tab } }));
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
