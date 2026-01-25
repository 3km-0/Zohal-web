'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, EmptyState, Input, Spinner, Badge } from '@/components/ui';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { createClient } from '@/lib/supabase/client';
import { Layers, Package, Plus, Pin, PinOff } from 'lucide-react';

type PackRow = {
  id: string;
  workspace_id: string;
  name: string | null;
  pack_type: 'bundle' | 'context';
  kind?: string | null;
  updated_at?: string | null;
};

export default function WorkspacePacksPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('packsUnified');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'bundle' | 'context'>('bundle');
  const [newKind, setNewKind] = useState<'policy' | 'regulation' | 'standard' | 'other'>('policy');
  const [pinOnCreate, setPinOnCreate] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: packsData }, { data: pinnedData }] = await Promise.all([
      supabase
        .from('packs')
        .select('id,workspace_id,name,pack_type,kind,updated_at')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false }),
      supabase.from('workspace_pinned_packs').select('pack_id').eq('workspace_id', workspaceId),
    ]);

    setPacks((packsData as any[]) || []);
    setPinnedIds(new Set(((pinnedData as any[]) || []).map((r) => String(r?.pack_id || '')).filter(Boolean)));
    setLoading(false);
  }, [supabase, workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createPack = async () => {
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: created, error } = await supabase
        .from('packs')
        .insert({
          workspace_id: workspaceId,
          name: newName.trim() ? newName.trim() : null,
          pack_type: newType,
          kind: newType === 'context' ? newKind : null,
          precedence_policy: newType === 'bundle' ? 'manual' : null,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (newType === 'context' && pinOnCreate) {
        await supabase.from('workspace_pinned_packs').insert({ workspace_id: workspaceId, pack_id: created.id, created_by: user.id });
      }

      setNewName('');
      await fetchData();
    } finally {
      setCreating(false);
    }
  };

  const togglePin = async (packId: string) => {
    const isPinned = pinnedIds.has(packId);
    if (isPinned) {
      await supabase.from('workspace_pinned_packs').delete().eq('workspace_id', workspaceId).eq('pack_id', packId);
      setPinnedIds((prev) => {
        const next = new Set(prev);
        next.delete(packId);
        return next;
      });
    } else {
      await supabase.from('workspace_pinned_packs').insert({ workspace_id: workspaceId, pack_id: packId });
      setPinnedIds((prev) => new Set(prev).add(packId));
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />

      <WorkspaceTabs workspaceId={workspaceId} active="packs" />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <div className="text-sm font-semibold text-text">{t('create.name')}</div>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('create.namePlaceholder')} />
            </div>
            <div className="md:col-span-3">
              <div className="text-sm font-semibold text-text">{t('create.type')}</div>
              <select
                className="w-full px-3 py-2 rounded-lg bg-surface-alt border border-border text-sm"
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
              >
                <option value="bundle">{t('types.bundle')}</option>
                <option value="context">{t('types.context')}</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <div className="text-sm font-semibold text-text">{t('create.kind')}</div>
              <select
                className="w-full px-3 py-2 rounded-lg bg-surface-alt border border-border text-sm"
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as any)}
                disabled={newType !== 'context'}
              >
                <option value="policy">{t('kinds.policy')}</option>
                <option value="regulation">{t('kinds.regulation')}</option>
                <option value="standard">{t('kinds.standard')}</option>
                <option value="other">{t('kinds.other')}</option>
              </select>
              {newType === 'context' ? (
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-text-soft">
                  <input type="checkbox" checked={pinOnCreate} onChange={(e) => setPinOnCreate(e.target.checked)} />
                  {t('create.pin')}
                </label>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <Button onClick={createPack} disabled={creating}>
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
        ) : packs.length === 0 ? (
          <EmptyState
            icon={<Package className="w-8 h-8" />}
            title={t('empty.title')}
            description={t('empty.description')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packs.map((p) => {
              const isPinned = p.pack_type === 'context' && pinnedIds.has(p.id);
              return (
                <Link key={p.id} href={`/workspaces/${workspaceId}/packs?selected=${encodeURIComponent(p.id)}`}>
                  <Card className="p-4 hover:bg-surface-alt transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text truncate">{p.name || t('unnamed')}</div>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <Badge size="sm" variant="default">
                            {p.pack_type === 'bundle' ? t('types.bundle') : t('types.context')}
                          </Badge>
                          {p.pack_type === 'context' && p.kind ? (
                            <Badge size="sm">{t('kindBadge', { value: p.kind })}</Badge>
                          ) : null}
                        </div>
                      </div>
                      {p.pack_type === 'context' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void togglePin(p.id);
                          }}
                          className="p-2 rounded-lg hover:bg-surface transition-colors"
                          aria-label={isPinned ? t('unpin') : t('pin')}
                        >
                          {isPinned ? <PinOff className="w-4 h-4 text-text-soft" /> : <Pin className="w-4 h-4 text-text-soft" />}
                        </button>
                      ) : (
                        <Layers className="w-4 h-4 text-text-soft" />
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

