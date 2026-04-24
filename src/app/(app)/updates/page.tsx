'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, FolderOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeTime } from '@/lib/utils';

type WorkspaceUpdate = {
  id: string;
  name: string;
  description?: string | null;
  updated_at?: string | null;
};

export default function UpdatesPage() {
  const t = useTranslations('updatesPage');
  const supabase = useMemo(() => createClient(), []);
  const { showError } = useToast();
  const [items, setItems] = useState<WorkspaceUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_accessible_workspaces');
    if (error) {
      showError(error, 'list_accessible_workspaces');
      setLoading(false);
      return;
    }
    const rows = Array.isArray(data) ? (data as WorkspaceUpdate[]) : [];
    setItems(rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))));
    setLoading(false);
  }, [showError, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full min-h-screen flex-col bg-surface">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 md:p-6">
        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Clock3 className="h-8 w-8" />} title={t('empty')} variant="card" />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t('latest')}</CardTitle>
              <CardDescription>{t('latestDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.slice(0, 20).map((item) => (
                <Link
                  key={item.id}
                  href={`/workspaces/${item.id}`}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface-alt p-3 transition-colors hover:bg-surface"
                >
                  <FolderOpen className="mt-0.5 h-4 w-4 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{item.name || t('workspace')}</p>
                    <p className="mt-1 text-sm text-text-soft">{item.description || t('workspaceUpdated')}</p>
                  </div>
                  {item.updated_at ? (
                    <span className="shrink-0 text-xs text-text-muted">{formatRelativeTime(item.updated_at)}</span>
                  ) : null}
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
