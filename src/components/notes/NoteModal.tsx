'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Note } from '@/types/database';

interface NoteModalProps {
  workspaceId: string;
  note?: Note | null;
  onClose: () => void;
  onSaved: () => void;
}

export function NoteModal({ workspaceId, note, onClose, onSaved }: NoteModalProps) {
  const supabase = createClient();

  // Note: DB uses note_text, not content_text, and has no title column
  const [content, setContent] = useState(note?.note_text || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!note;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError('Content is required');
      return;
    }

    setLoading(true);

    try {
      if (isEditing) {
        const { error } = await supabase
          .from('notes')
          .update({
            note_text: content.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', note.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('notes').insert({
          workspace_id: workspaceId,
          note_text: content.trim(),
          note_type: 'text',  // Use correct enum: 'text' not 'user_written'
        });

        if (error) throw error;
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
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
      <Card className="relative w-full max-w-2xl z-10 animate-slide-up" padding="none">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-text">
            {isEditing ? 'Edit Note' : 'Create Note'}
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
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              Content
            </label>
            <textarea
              className="w-full px-4 py-3 bg-surface border border-border rounded-scholar text-text placeholder:text-text-soft transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-background resize-none min-h-[200px]"
              placeholder="Write your note..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
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
              {isEditing ? 'Save Changes' : 'Create Note'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

