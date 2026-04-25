'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

interface FolderModalProps {
  title?: string;
  initialParentId?: string | null;
  initialOrgId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function FolderModal({
  title = 'New Folder',
  initialParentId = null,
  initialOrgId = null,
  onClose,
  onSaved,
}: FolderModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Folder name is required');
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let resolvedOrgId = initialOrgId;
      if (!resolvedOrgId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('default_org_id')
          .eq('id', user.id)
          .maybeSingle();
        resolvedOrgId = profile?.default_org_id || null;
      }

      const { error: insertError } = await supabase.from('folders').insert({
        owner_id: user.id,
        org_id: resolvedOrgId,
        parent_id: initialParentId,
        name: name.trim(),
      });

      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <Card className="relative z-10 w-full max-w-md animate-slide-up" padding="none">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-surface-alt">
            <X className="h-5 w-5 text-text-soft" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          <Input
            label="Name"
            placeholder="Folder name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />

          {error && (
            <div className="rounded-zohal border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" isLoading={loading}>
              Create Folder
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
