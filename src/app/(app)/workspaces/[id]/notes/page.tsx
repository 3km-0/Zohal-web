'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, StickyNote, MoreVertical, Trash2, Edit2, FileText } from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, EmptyState, Spinner, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Note, NoteType } from '@/types/database';
import { cn, formatRelativeTime, truncate } from '@/lib/utils';
import { NoteModal } from '@/components/notes/NoteModal';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';

// Note type icons and colors (matching database enum)
const noteTypeConfig: Record<NoteType, { icon: string; color: string; label: string }> = {
  text: { icon: '✏️', color: 'bg-blue-500/10 text-blue-500', label: 'Note' },
  handwritten: { icon: '🖊️', color: 'bg-indigo-500/10 text-indigo-500', label: 'Handwritten' },
  ai_saved: { icon: '🤖', color: 'bg-purple-500/10 text-purple-500', label: 'AI Response' },
  conversation: { icon: '💬', color: 'bg-green-500/10 text-green-500', label: 'Chat' },
};

export default function WorkspaceNotesPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const t = useTranslations('notes');
  const supabase = createClient();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setNotes(data);
    }
    setLoading(false);
  }, [supabase, workspaceId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleDelete = async (note: Note) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    const { error } = await supabase
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', note.id);

    if (!error) {
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title={t('title')}
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" />
            {t('create')}
          </Button>
        }
      />

      <WorkspaceTabs workspaceId={workspaceId} active="notes" />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : notes.length === 0 ? (
          <EmptyState
            icon={<StickyNote className="w-8 h-8" />}
            title={t('empty')}
            description={t('emptyDescription')}
            action={{
              label: t('create'),
              onClick: () => setShowCreateModal(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => setEditingNote(note)}
                onDelete={() => handleDelete(note)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingNote) && (
        <NoteModal
          workspaceId={workspaceId}
          note={editingNote}
          onClose={() => {
            setShowCreateModal(false);
            setEditingNote(null);
          }}
          onSaved={() => {
            setShowCreateModal(false);
            setEditingNote(null);
            fetchNotes();
          }}
        />
      )}
    </div>
  );
}

interface NoteCardProps {
  note: Note;
  onEdit: () => void;
  onDelete: () => void;
}

function NoteCard({ note, onEdit, onDelete }: NoteCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const config = noteTypeConfig[note.note_type] || noteTypeConfig.text;

  // Get display text - note_text for text notes, problem_text for handwritten
  const displayText = note.note_text || note.problem_text || 'No content';

  return (
    <Card
      className="relative group hover:-translate-y-0.5 hover:shadow-scholar transition-all duration-200 cursor-pointer"
      padding="none"
      onClick={onEdit}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <Badge size="sm" className={config.color}>
            <span className="mr-1">{config.icon}</span>
            {config.label}
          </Badge>
          {note.document_id && (
            <Badge size="sm" variant="default">
              <FileText className="w-3 h-3 mr-1" />
              Linked
            </Badge>
          )}
        </div>

        <p className="text-sm text-text-soft line-clamp-3">
          {truncate(displayText, 150)}
        </p>

        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs text-text-soft">
            Updated {formatRelativeTime(note.updated_at)}
          </p>
        </div>
      </div>

      {/* Menu Button */}
      <div className="absolute top-3 right-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-surface-alt transition-all"
        >
          <MoreVertical className="w-4 h-4 text-text-soft" />
        </button>

        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
              }}
            />
            <div className="absolute right-0 mt-1 w-32 bg-surface border border-border rounded-scholar shadow-scholar-lg z-50 overflow-hidden animate-fade-in">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onEdit();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
              <hr className="border-border" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

