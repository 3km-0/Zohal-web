'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Package, Plus, CheckCircle, FileText, Trash2 } from 'lucide-react';
import { Button, Input, Spinner, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type BundlePack = {
  id: string;
  name: string | null;
  member_count: number;
};

type BundleMember = {
  id: string;
  document_id: string;
  role: string;
  title: string;
};

interface BundleManagerModalProps {
  workspaceId: string;
  documentId: string;
  selectedBundleId: string;
  onSelectBundle: (bundleId: string) => void;
  onClose: () => void;
}

export function BundleManagerModal({
  workspaceId,
  documentId,
  selectedBundleId,
  onSelectBundle,
  onClose,
}: BundleManagerModalProps) {
  const supabase = useMemo(() => createClient(), []);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bundles, setBundles] = useState<BundlePack[]>([]);
  const [members, setMembers] = useState<BundleMember[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Load bundles
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Fetch bundle packs for this workspace
        const { data: packs, error: packsErr } = await supabase
          .from('packs')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .eq('pack_type', 'bundle')
          .order('created_at', { ascending: false });

        if (packsErr) throw packsErr;

        // Get member counts for each pack
        const packsWithCounts = await Promise.all(
          (packs || []).map(async (p) => {
            const { count } = await supabase
              .from('pack_members')
              .select('id', { count: 'exact', head: true })
              .eq('pack_id', p.id);
            return { id: p.id, name: p.name, member_count: count ?? 0 };
          })
        );

        setBundles(packsWithCounts);

        // If a bundle is selected, load its members
        if (selectedBundleId) {
          await loadMembers(selectedBundleId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load bundles');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspaceId, selectedBundleId, supabase]);

  async function loadMembers(bundleId: string) {
    try {
      const { data: memberData, error: memErr } = await supabase
        .from('pack_members')
        .select('id, document_id, role')
        .eq('pack_id', bundleId)
        .order('sort_order', { ascending: true });

      if (memErr) throw memErr;

      // Get document titles
      const docIds = (memberData || []).map((m: any) => m.document_id);
      const { data: docs } = await supabase
        .from('documents')
        .select('id, title')
        .in('id', docIds);

      const docsById: Record<string, string> = {};
      for (const d of docs || []) {
        docsById[d.id] = d.title;
      }

      setMembers(
        (memberData || []).map((m: any) => ({
          id: m.id,
          document_id: m.document_id,
          role: m.role || '',
          title: docsById[m.document_id] || 'Unknown',
        }))
      );
    } catch (e) {
      console.error('Failed to load members:', e);
    }
  }

  async function createBundle() {
    setSaving(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const trimmedName = newName.trim() || `Bundle ${new Date().toLocaleDateString()}`;
      
      const { data: pack, error: createErr } = await supabase
        .from('packs')
        .insert({
          workspace_id: workspaceId,
          name: trimmedName,
          pack_type: 'bundle',
          created_by: userId,
        })
        .select('id')
        .single();

      if (createErr) throw createErr;

      // Add current document to the bundle
      await supabase.from('pack_members').insert({
        pack_id: pack.id,
        document_id: documentId,
        role: 'master',
        sort_order: 0,
        added_by: userId,
      });

      setNewName('');
      onSelectBundle(pack.id);
      
      // Reload bundles
      setBundles((prev) => [
        { id: pack.id, name: trimmedName, member_count: 1 },
        ...prev,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create bundle');
    } finally {
      setSaving(false);
    }
  }

  async function selectBundle(bundleId: string) {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not authenticated');

      // Ensure current document is in the bundle
      const { data: existing } = await supabase
        .from('pack_members')
        .select('id')
        .eq('pack_id', bundleId)
        .eq('document_id', documentId)
        .maybeSingle();

      if (!existing) {
        await supabase.from('pack_members').insert({
          pack_id: bundleId,
          document_id: documentId,
          role: 'document',
          sort_order: 999,
          added_by: userId,
        });
      }

      onSelectBundle(bundleId);
      await loadMembers(bundleId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to select bundle');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-auto md:left-1/2 md:-translate-x-1/2 md:w-[500px] max-h-[80vh] bg-surface rounded-2xl shadow-xl z-50 animate-slide-up overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-text">Manage Bundle</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 rounded-scholar border border-error/30 bg-error/5 text-error text-sm">
                  {error}
                </div>
              )}

              {/* Create new bundle */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-text">Create New Bundle</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Bundle name (optional)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={saving}
                  />
                  <Button onClick={createBundle} disabled={saving}>
                    <Plus className="w-4 h-4" />
                    Create
                  </Button>
                </div>
              </div>

              {/* Existing bundles */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-text">Select Bundle</p>
                
                {/* Single document option */}
                <button
                  onClick={() => onSelectBundle('')}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-scholar border transition-colors text-left",
                    !selectedBundleId
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface-alt hover:border-accent/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <FileText className={cn("w-4 h-4", !selectedBundleId ? "text-accent" : "text-text-soft")} />
                    <span className="font-semibold text-text">Single document</span>
                  </div>
                  {!selectedBundleId && (
                    <CheckCircle className="w-4 h-4 text-accent" />
                  )}
                </button>

                {bundles.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => selectBundle(b.id)}
                    disabled={saving}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-scholar border transition-colors text-left",
                      selectedBundleId === b.id
                        ? "border-accent bg-accent/5"
                        : "border-border bg-surface-alt hover:border-accent/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Package className={cn("w-4 h-4", selectedBundleId === b.id ? "text-accent" : "text-text-soft")} />
                      <div>
                        <span className="font-semibold text-text">{b.name || 'Unnamed Bundle'}</span>
                        <span className="text-xs text-text-soft ml-2">({b.member_count} docs)</span>
                      </div>
                    </div>
                    {selectedBundleId === b.id && (
                      <CheckCircle className="w-4 h-4 text-accent" />
                    )}
                  </button>
                ))}

                {bundles.length === 0 && (
                  <p className="text-sm text-text-soft text-center py-4">
                    No bundles found. Create one above.
                  </p>
                )}
              </div>

              {/* Bundle members */}
              {selectedBundleId && members.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-border">
                  <p className="text-sm font-semibold text-text">Bundle Contents</p>
                  <div className="space-y-1">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-scholar text-sm",
                          m.document_id === documentId ? "bg-accent/5" : "bg-surface-alt"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-3 h-3 text-text-soft" />
                          <span className="text-text truncate max-w-[200px]">{m.title}</span>
                          {m.role && (
                            <Badge size="sm">{m.role}</Badge>
                          )}
                          {m.document_id === documentId && (
                            <Badge size="sm" variant="success">Current</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <Button variant="secondary" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </div>
    </>
  );
}

export default BundleManagerModal;
