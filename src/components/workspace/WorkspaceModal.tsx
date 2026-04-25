'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Folder, Workspace, WorkspaceType } from '@/types/database';
import { cn } from '@/lib/utils';
import { resolveIcon, isSFSymbol } from '@/lib/icon-mapping';
import { isHiddenSystemPlaybook, getTemplateEmoji, getTemplateDescription } from '@/lib/template-library';

interface PlaybookRecord {
  id: string;
  name: string;
  is_system_preset: boolean | null;
  current_version?: {
    spec_json?: Record<string, unknown> | null;
  } | null;
}

interface WorkspaceModalProps {
  workspace?: Workspace | null;
  initialParentFolderId?: string | null;
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

export function WorkspaceModal({ workspace, initialParentFolderId, onClose, onSaved }: WorkspaceModalProps) {
  const t = useTranslations('workspaces');
  const tModal = useTranslations('workspaceModal');
  const tCommon = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState(workspace?.name || '');
  const [description, setDescription] = useState(workspace?.description || '');
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>(
    workspace?.workspace_type || 'project'
  );
  // Convert SF Symbol to emoji if needed when editing existing workspace
  const getInitialIcon = () => {
    if (!workspace?.icon) return '';
    if (isSFSymbol(workspace.icon)) {
      const resolved = resolveIcon(workspace.icon);
      return resolved.type === 'emoji' ? resolved.emoji : '';
    }
    return workspace.icon;
  };
  const [iconEmoji, setIconEmoji] = useState(getInitialIcon());
  const [folders, setFolders] = useState<Folder[]>([]);
  const [parentFolderId, setParentFolderId] = useState<string>(workspace?.parent_folder_id || initialParentFolderId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    workspace?.default_playbook_id || null
  );
  const [availableTemplates, setAvailableTemplates] = useState<PlaybookRecord[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const isEditing = !!workspace;

  useEffect(() => {
    const loadFolders = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      if (!error && data) {
        setFolders((data as Folder[]).filter((folder) => folder.owner_id === user.id || folder.org_id != null));
      }
    };

    void loadFolders();
  }, [supabase]);

  useEffect(() => {
    const loadTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const { data, error } = await supabase.functions.invoke('templates-list', {
          body: {
            workspace_id: '00000000-0000-0000-0000-000000000000',
            kind: 'document',
            status: 'published',
          },
        });
        if (!error && data?.templates) {
          const visible = (data.templates as PlaybookRecord[]).filter(
            (p) => !p.is_system_preset || !isHiddenSystemPlaybook(p as Parameters<typeof isHiddenSystemPlaybook>[0])
          );
          setAvailableTemplates(visible);
        }
      } catch {
        // Non-fatal — template picker is optional
      } finally {
        setLoadingTemplates(false);
      }
    };

    void loadTemplates();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(tModal('nameRequired'));
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
            icon: iconEmoji.trim() || null,
            parent_folder_id: parentFolderId || null,
            default_playbook_id: selectedTemplateId || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', workspace.id);

        if (error) throw error;
      } else {
        // Get current user for owner_id
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase.from('workspaces').insert({
          name: name.trim(),
          description: description.trim() || null,
          workspace_type: workspaceType,
          icon: iconEmoji.trim() || null,
          parent_folder_id: parentFolderId || null,
          owner_id: user.id,
          status: 'active',
          default_playbook_id: selectedTemplateId || null,
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
            {isEditing ? tModal('editWorkspace') : t('create')}
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
            label={tModal('name')}
            placeholder={tModal('namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div>
            <label className="block text-sm font-medium text-text mb-2">{tModal('type')}</label>
            <div className="grid grid-cols-4 gap-2">
              {workspaceTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setWorkspaceType(type.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-zohal border transition-all',
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
            label={tModal('customIcon')}
            placeholder={tModal('iconPlaceholder')}
            value={iconEmoji}
            onChange={(e) => setIconEmoji(e.target.value)}
            hint={tModal('iconHint')}
          />

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Folder</label>
            <select
              className="w-full px-4 py-3 bg-surface border border-border rounded-zohal text-text transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-background"
              value={parentFolderId}
              onChange={(e) => setParentFolderId(e.target.value)}
            >
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              {tModal('description')}
            </label>
            <textarea
              className="w-full px-4 py-3 bg-surface border border-border rounded-zohal text-text placeholder:text-text-soft transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-background resize-none"
              rows={3}
              placeholder={tModal('descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Template picker */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              Template <span className="text-text-soft font-normal">(optional)</span>
            </label>
            <p className="text-xs text-text-soft mb-2">
              Choose a starting template. You can change it anytime.
            </p>
            {loadingTemplates ? (
              <div className="text-xs text-text-soft">Loading templates…</div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {/* None option */}
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId(null)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-zohal border transition-all flex-shrink-0 w-16',
                    selectedTemplateId === null
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50'
                  )}
                >
                  <span className="text-lg">✕</span>
                  <span className="text-[10px] text-text-soft text-center leading-tight">None</span>
                </button>

                {availableTemplates.map((tpl) => {
                  const tplAny = tpl as Parameters<typeof getTemplateEmoji>[0];
                  const emoji = getTemplateEmoji(tplAny);
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      title={getTemplateDescription(tplAny, 'en')}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded-zohal border transition-all flex-shrink-0 w-16',
                        isSelected
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:border-accent/50'
                      )}
                    >
                      <span className="text-lg">{emoji}</span>
                      <span className="text-[10px] text-text-soft text-center leading-tight line-clamp-2">
                        {tpl.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedTemplateId && availableTemplates.length > 0 && (() => {
              const sel = availableTemplates.find((t) => t.id === selectedTemplateId);
              if (!sel) return null;
              const desc = getTemplateDescription(sel as Parameters<typeof getTemplateDescription>[0], 'en');
              return desc ? (
                <p className="mt-2 text-xs text-text-soft">{desc}</p>
              ) : null;
            })()}
          </div>

          {error && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-zohal text-sm text-error">
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
              {tCommon('cancel')}
            </Button>
            <Button type="submit" className="flex-1" isLoading={loading}>
              {isEditing ? tModal('saveChanges') : tModal('createWorkspace')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
