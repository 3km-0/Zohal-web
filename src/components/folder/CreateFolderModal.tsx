'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Folder } from 'lucide-react';
import { Button, Input } from '@/components/ui';

interface CreateFolderModalProps {
  workspaceId: string;
  parentId?: string | null;
  existingFolder?: { id: string; name: string } | null;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export function CreateFolderModal({
  workspaceId,
  parentId,
  existingFolder,
  onClose,
  onSave,
}: CreateFolderModalProps) {
  const t = useTranslations('folders');
  const tCommon = useTranslations('common');
  
  const [name, setName] = useState(existingFolder?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!existingFolder;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a folder name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onSave(trimmedName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save folder');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-auto md:left-1/2 md:-translate-x-1/2 md:w-[400px] bg-surface rounded-2xl shadow-xl z-50 animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">
            {isEditing ? t('renameFolder') : t('createFolder')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Folder icon preview */}
          <div className="flex justify-center">
            <div className="relative">
              <Folder
                className="w-20 h-20 text-accent"
                fill="currentColor"
                fillOpacity={0.15}
              />
            </div>
          </div>

          {/* Name input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text">
              {t('folderName')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('newFolder')}
              autoFocus
              disabled={isLoading}
            />
            {error && (
              <p className="text-sm text-error">{error}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="flex-1"
            >
              {isLoading ? tCommon('loading') : (isEditing ? tCommon('save') : tCommon('create'))}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

export default CreateFolderModal;
