'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, Package, Plus, Trash2 } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, EmptyState, Input, Spinner } from '@/components/ui';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { createClient } from '@/lib/supabase/client';

type PackRow = {
  id: string;
  workspace_id: string;
  name: string | null;
  precedence_policy?: string | null;
  created_at?: string | null;
  pack_type?: string | null;
};

export default function WorkspaceBundlesPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('packs');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [bundles, setBundles] = useState<PackRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const fetchBundles = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('packs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('pack_type', 'bundle')
      .order('created_at', { ascending: false });

    setBundles((data as any[]) || []);
    setLoading(false);
  }, [supabase, workspaceId]);

  useEffect(() => {
    fetchBundles();
  }, [fetchBundles]);

  const createBundle = async () => {
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await supabase.from('packs').insert({
        workspace_id: workspaceId,
        name: newName.trim() ? newName.trim() : null,
        created_by: user.id,
        pack_type: 'bundle',
        precedence_policy: 'manual',
      });
      setNewName('');
      await fetchBundles();
    } finally {
      setCreating(false);
    }
  };

  const deleteBundle = async (id: string) => {
    if (!confirm(t('bundlesManager.confirmDelete'))) return;
    await supabase.from('packs').delete().eq('id', id);
    setBundles((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title={t('bundlesManager.title')}
        actions={
          <Link href={`/workspaces/${workspaceId}/packs`}>
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4" />
              {t('backToPacks')}
            </Button>
          </Link>
        }
      />

      <WorkspaceTabs workspaceId={workspaceId} active="packs" />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Card className="p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-text">{t('bundlesManager.aboutTitle')}</div>
              <div className="text-sm text-text-soft">{t('bundlesManager.aboutBody')}</div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('bundlesManager.newNamePlaceholder')}
              />
              <Button onClick={createBundle} disabled={creating}>
                {creating ? <Spinner size="sm" /> : <Plus className="w-4 h-4" />}
                {tCommon('create')}
              </Button>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : bundles.length === 0 ? (
          <EmptyState
            icon={<Package className="w-8 h-8" />}
            title={t('bundlesManager.emptyTitle')}
            description={t('bundlesManager.emptyDescription')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bundles.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text truncate">
                      {b.name || t('bundlesManager.unnamed')}
                    </div>
                    <div className="text-xs text-text-soft truncate">
                      {t('bundlesManager.precedence', { value: b.precedence_policy || 'primary_first' })}
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => deleteBundle(b.id)} aria-label={tCommon('delete')}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="mt-3 text-xs text-text-soft">
                  {t('bundlesManager.manageMembersHint')}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

