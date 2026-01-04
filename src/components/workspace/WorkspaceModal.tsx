'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Workspace, WorkspaceType } from '@/types/database';
import { cn } from '@/lib/utils';

interface WorkspaceModalProps {
  workspace?: Workspace | null;
  onClose: () => void;
  onSaved: () => void;
}

const workspaceTypes: { value: WorkspaceType; icon: string }[] = [
  { value: 'project', icon: '📁' },
  { value: 'case', icon: '⚖️' },
  { value: 'course', icon: '📚' },
  { value: 'personal', icon: '👤' },
  { value: 'research', icon: '🔬' },
  { value: 'client', icon: '🏢' },
  { value: 'other', icon: '📂' },
];

export function WorkspaceModal({ workspace, onClose, onSaved }: WorkspaceModalProps) {
  const t = useTranslations('workspaces');
  const supabase = createClient();

  const [name, setName] = useState(workspace?.name || '');
  const [description, setDescription] = useState(workspace?.description || '');
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>(
    workspace?.workspace_type || 'project'
  );
  const [iconEmoji, setIconEmoji] = useState(workspace?.icon_emoji || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!workspace;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);

    try {
      if (isEditing) {
        const { error } = await supabase
          .from('workspaces')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            workspace_type: workspaceType,
            icon_emoji: iconEmoji.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', workspace.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('workspaces').insert({
          name: name.trim(),
          description: description.trim() || null,
          workspace_type: workspaceType,
          icon_emoji: iconEmoji.trim() || null,
        });

        if (error) throw error;
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <Card className="relative w-full max-w-lg z-10 animate-slide-up" padding="none">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-text">
            {isEditing ? 'Edit Workspace' : t('create')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <Input
            label="Name"
            placeholder="My Workspace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div>
            <label className="block text-sm font-medium text-text mb-2">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {workspaceTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setWorkspaceType(type.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-scholar border transition-all',
                    workspaceType === type.value
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50'
                  )}
                >
                  <span className="text-xl">{type.icon}</span>
                  <span className="text-xs text-text-soft capitalize">{type.value}</span>
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Custom Icon (optional)"
            placeholder="📚"
            value={iconEmoji}
            onChange={(e) => setIconEmoji(e.target.value)}
            hint="Enter an emoji to use as custom icon"
          />

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              Description (optional)
            </label>
            <textarea
              className="w-full px-4 py-3 bg-surface border border-border rounded-scholar text-text placeholder:text-text-soft transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-background resize-none"
              rows={3}
              placeholder="What is this workspace for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-scholar text-sm text-error">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" isLoading={loading}>
              {isEditing ? 'Save Changes' : 'Create Workspace'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

