'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, Layers, Plus, Pin, PinOff, Trash2 } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, EmptyState, Input, Spinner } from '@/components/ui';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { createClient } from '@/lib/supabase/client';

type ContextSet = {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  created_at?: string | null;
};

export default function WorkspaceContextSetsPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('packs');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [sets, setSets] = useState<ContextSet[]>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: setsData }, { data: pinnedData }] = await Promise.all([
      supabase
        .from('context_sets')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('workspace_default_context_sets')
        .select('context_set_id')
        .eq('workspace_id', workspaceId),
    ]);

    setSets((setsData as any[]) || []);
    setPinnedIds(
      new Set(((pinnedData as any[]) || []).map((r) => String(r?.context_set_id || '').trim()).filter(Boolean))
    );
    setLoading(false);
  }, [supabase, workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createSet = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await supabase.from('context_sets').insert({
        workspace_id: workspaceId,
        name: newName.trim(),
        kind: 'reusable',
        created_by: user.id,
      });
      setNewName('');
      await fetchData();
    } finally {
      setCreating(false);
    }
  };

  const togglePin = async (setId: string) => {
    const isPinned = pinnedIds.has(setId);
    if (isPinned) {
      await supabase
        .from('workspace_default_context_sets')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('context_set_id', setId);
      setPinnedIds((prev) => {
        const next = new Set(prev);
        next.delete(setId);
        return next;
      });
    } else {
      await supabase.from('workspace_default_context_sets').insert({
        workspace_id: workspaceId,
        context_set_id: setId,
      });
      setPinnedIds((prev) => new Set(prev).add(setId));
    }
  };

  const deleteSet = async (id: string) => {
    if (!confirm(t('contextSetsManager.confirmDelete'))) return;
    await supabase.from('context_sets').delete().eq('id', id);
    setSets((prev) => prev.filter((s) => s.id !== id));
    setPinnedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title={t('contextSetsManager.title')}
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
              <div className="text-sm font-semibold text-text">{t('contextSetsManager.aboutTitle')}</div>
              <div className="text-sm text-text-soft">{t('contextSetsManager.aboutBody')}</div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('contextSetsManager.newNamePlaceholder')}
              />
              <Button onClick={createSet} disabled={creating || !newName.trim()}>
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
        ) : sets.length === 0 ? (
          <EmptyState
            icon={<Layers className="w-8 h-8" />}
            title={t('contextSetsManager.emptyTitle')}
            description={t('contextSetsManager.emptyDescription')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sets.map((s) => {
              const isPinned = pinnedIds.has(s.id);
              return (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text truncate">{s.name}</div>
                      <div className="text-xs text-text-soft truncate">{t('contextSetsManager.kind', { value: s.kind })}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        onClick={() => togglePin(s.id)}
                        aria-label={isPinned ? t('contextSetsManager.unpin') : t('contextSetsManager.pin')}
                      >
                        {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" onClick={() => deleteSet(s.id)} aria-label={tCommon('delete')}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

