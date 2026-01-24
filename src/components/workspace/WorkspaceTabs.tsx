'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type WorkspaceTabKey = 'documents' | 'notes' | 'reports';

interface WorkspaceTabsProps {
  workspaceId: string;
  active?: WorkspaceTabKey;
  className?: string;
}

export function WorkspaceTabs({ workspaceId, active, className }: WorkspaceTabsProps) {
  const pathname = usePathname();

  const resolved: WorkspaceTabKey =
    active ||
    (pathname.includes('/notes')
      ? 'notes'
      : pathname.includes('/reports')
        ? 'reports'
        : 'documents');

  const tabs: { key: WorkspaceTabKey; label: string; href: string }[] = [
    { key: 'documents', label: 'Documents', href: `/workspaces/${workspaceId}` },
    { key: 'notes', label: 'Notes', href: `/workspaces/${workspaceId}/notes` },
    { key: 'reports', label: 'Reports', href: `/workspaces/${workspaceId}/reports` },
  ];

  return (
    <div className={cn('px-6 py-3 border-b border-border bg-surface', className)}>
      <div className="inline-flex items-center bg-surface-alt border border-border rounded-scholar overflow-hidden">
        {tabs.map((t) => {
          const isActive = resolved === t.key;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={cn(
                'px-4 py-2 text-sm font-semibold transition-colors',
                isActive ? 'bg-accent text-white' : 'text-text-soft hover:text-text hover:bg-surface'
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

