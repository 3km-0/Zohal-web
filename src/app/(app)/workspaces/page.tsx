'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, FolderOpen, MoreVertical, Archive, Trash2, Edit2, Layers, Briefcase, BookOpen, User, Search, Grid3X3 } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Workspace, WorkspaceType } from '@/types/database';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';
import { AppModeSwitch } from '@/components/ask/AppModeSwitch';

function workspaceTypeIcon(type: WorkspaceType) {
  switch (type) {
    case 'project':
      return Layers;
    case 'case':
    case 'client':
      return Briefcase;
    case 'course':
      return BookOpen;
    case 'personal':
      return User;
    case 'research':
      return Search;
    case 'archive':
      return Archive;
    case 'other':
    default:
      return Grid3X3;
  }
}

export default function WorkspacesPage() {
  const t = useTranslations('workspaces');
  const supabase = createClient();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);

  type AccessibleWorkspaceRow = Workspace & {
    access_role?: string;
    access_source?: string;
  };

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    // Prefer RPC listing (supports org multi-user without changing old client behavior).
    // If not deployed yet, fall back to owner-only workspaces table query.
    const { data: rpcData, error: rpcError } = await supabase.rpc('list_accessible_workspaces');

    if (!rpcError && rpcData) {
      setWorkspaces((rpcData as AccessibleWorkspaceRow[]).map((w) => w as Workspace));
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[Workspaces] Error fetching:', error.message);
    }
    setWorkspaces(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const tCard = useTranslations('workspaceCard');
  
  const handleDelete = async (workspace: Workspace) => {
    if (!confirm(tCard('confirmDelete', { name: workspace.name }))) return;

    const { error } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', workspace.id);

    if (!error) {
      setWorkspaces((prev) => prev.filter((w) => w.id !== workspace.id));
    }
  };

  const handleArchive = async (workspace: Workspace) => {
    const { error } = await supabase
      .from('workspaces')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', workspace.id);

    if (!error) {
      setWorkspaces((prev) => prev.filter((w) => w.id !== workspace.id));
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

      <div className="border-b border-border bg-surface px-4 py-3 md:px-6">
        <AppModeSwitch active="workspaces" />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : workspaces.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="w-8 h-8" />}
            title={t('empty')}
            description={t('emptyDescription')}
            action={{
              label: t('create'),
              onClick: () => setShowCreateModal(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {workspaces.map((workspace) => (
              <WorkspaceIcon
                key={workspace.id}
                workspace={workspace}
                onEdit={() => setEditingWorkspace(workspace)}
                onArchive={() => handleArchive(workspace)}
                onDelete={() => handleDelete(workspace)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingWorkspace) && (
        <WorkspaceModal
          workspace={editingWorkspace}
          onClose={() => {
            setShowCreateModal(false);
            setEditingWorkspace(null);
          }}
          onSaved={() => {
            setShowCreateModal(false);
            setEditingWorkspace(null);
            fetchWorkspaces();
          }}
        />
      )}
    </div>
  );
}

interface WorkspaceCardProps {
  workspace: Workspace;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function WorkspaceIcon({ workspace, onEdit, onArchive, onDelete }: WorkspaceCardProps) {
  const t = useTranslations('workspaces.types');
  const tCard = useTranslations('workspaceCard');
  const tCommon = useTranslations('common');
  const [showMenu, setShowMenu] = useState(false);
  const Icon = workspaceTypeIcon(workspace.workspace_type);
  const hasCustomColor = Boolean(workspace.color);

  return (
    <div className="relative group">
      <Link
        href={`/workspaces/${workspace.id}`}
        className={cn(
          'relative block overflow-hidden rounded-xl border border-border bg-surface p-4 transition-all duration-200',
          'hover:bg-surface-alt/60 hover:shadow-md active:scale-[0.99]',
          'focus:outline-none focus:ring-2 focus:ring-accent/50',
          'min-h-[116px] mx-auto w-full max-w-[220px]'
        )}
      >
        {/* Accent rail (workspace color if present, otherwise Scholar accent) */}
        <div
          className={cn('absolute inset-y-0 left-0 w-1', hasCustomColor ? '' : 'bg-accent')}
          style={hasCustomColor ? { backgroundColor: String(workspace.color) } : undefined}
          aria-hidden="true"
        />

        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-alt">
            <Icon className="h-5 w-5 text-text-soft" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text">{workspace.name}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
              {t(workspace.workspace_type)}
            </div>
          </div>
        </div>
      </Link>

      {/* Menu Button */}
      <div className="absolute top-2 right-2">
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowMenu(!showMenu);
          }}
          className="rounded-lg p-1.5 opacity-0 transition-all hover:bg-surface-alt group-hover:opacity-100"
        >
          <MoreVertical className="w-4 h-4 text-text-soft" />
        </button>

        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 mt-1 w-40 bg-surface border border-border rounded-scholar shadow-scholar-lg z-50 overflow-hidden animate-fade-in">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowMenu(false);
                  onEdit();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                {tCard('edit')}
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowMenu(false);
                  onArchive();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
              >
                <Archive className="w-4 h-4" />
                {tCard('archive')}
              </button>
              <hr className="border-border" />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowMenu(false);
                  onDelete();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {tCommon('delete')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
