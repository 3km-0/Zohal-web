'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type WorkspaceTabKey = 'documents' | 'notes' | 'reports' | 'bundles' | 'packs';

interface WorkspaceTabsProps {
  workspaceId: string;
  active?: WorkspaceTabKey;
  className?: string;
}

export function WorkspaceTabs({ workspaceId, active, className }: WorkspaceTabsProps) {
  const pathname = usePathname();
  const t = useTranslations('workspaceTabs');

  const resolved: WorkspaceTabKey =
    active ||
    (pathname.includes('/notes')
      ? 'notes'
      : pathname.includes('/reports')
        ? 'reports'
        : pathname.includes('/packs/bundles')
          ? 'bundles'
        : pathname.includes('/packs')
          ? 'packs'
        : 'documents');

  const tabs: { key: WorkspaceTabKey; label: string; href: string }[] = [
    { key: 'documents', label: t('documents'), href: `/workspaces/${workspaceId}` },
    { key: 'notes', label: t('notes'), href: `/workspaces/${workspaceId}/notes` },
    { key: 'reports', label: t('reports'), href: `/workspaces/${workspaceId}/reports` },
    { key: 'bundles', label: t('bundles'), href: `/workspaces/${workspaceId}/packs/bundles` },
    { key: 'packs', label: t('packs'), href: `/workspaces/${workspaceId}/packs` },
  ];

  return (
    <div className={cn('px-6 py-3 border-b border-border bg-surface', className)}>
      <div className="max-w-full overflow-x-auto">
        <div className="inline-flex items-center bg-surface-alt border border-border rounded-scholar min-w-max">
        {tabs.map((t) => {
          const isActive = resolved === t.key;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={cn(
                'px-3 sm:px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap',
                isActive ? 'bg-accent text-white' : 'text-text-soft hover:text-text hover:bg-surface'
              )}
            >
              {t.label}
            </Link>
          );
        })}
        </div>
      </div>
    </div>
  );
}

