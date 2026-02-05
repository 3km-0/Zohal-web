'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, FolderOpen, MoreVertical, Archive, Trash2, Edit2 } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Workspace, WorkspaceType } from '@/types/database';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';

// Workspace type colors (folder palette)
const workspacePalette: Record<WorkspaceType, { main: string; light: string }> = {
  project: { main: '#2563eb', light: '#3b82f6' },
  case: { main: '#7c3aed', light: '#8b5cf6' },
  course: { main: '#16a34a', light: '#22c55e' },
  personal: { main: '#d97706', light: '#f59e0b' },
  archive: { main: '#64748b', light: '#94a3b8' },
  research: { main: '#0891b2', light: '#22d3ee' },
  client: { main: '#e11d48', light: '#fb7185' },
  other: { main: '#475569', light: '#94a3b8' },
};

function getWorkspacePalette(workspace: Workspace) {
  if (workspace.color) {
    return { main: workspace.color, light: workspace.color };
  }
  return workspacePalette[workspace.workspace_type] || workspacePalette.other;
}

function StyledFolder({ color, lightColor, className }: { color: string; lightColor: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M4 8C4 5.79086 5.79086 4 8 4H24L28 10H56C58.2091 10 60 11.7909 60 14V44C60 46.2091 58.2091 48 56 48H8C5.79086 48 4 46.2091 4 44V8Z"
        fill={color}
        fillOpacity="0.9"
      />
      <path
        d="M4 16C4 13.7909 5.79086 12 8 12H56C58.2091 12 60 13.7909 60 16V44C60 46.2091 58.2091 48 56 48H8C5.79086 48 4 46.2091 4 44V16Z"
        fill={lightColor}
        fillOpacity="0.95"
      />
      <path
        d="M8 12H56C58.2091 12 60 13.7909 60 16V18H4V16C4 13.7909 5.79086 12 8 12Z"
        fill="white"
        fillOpacity="0.15"
      />
      <path
        d="M24 4H8C5.79086 4 4 5.79086 4 8V10H26L24 4Z"
        fill={color}
        fillOpacity="0.7"
      />
    </svg>
  );
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
  const palette = getWorkspacePalette(workspace);

  return (
    <div className="relative group flex justify-center">
      <Link
        href={`/workspaces/${workspace.id}`}
        className={cn(
          'flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200',
          'hover:bg-surface-alt/60 hover:shadow-md active:scale-95',
          'w-[120px] focus:outline-none focus:ring-2 focus:ring-accent/50'
        )}
      >
        <div className="relative drop-shadow-sm">
          <StyledFolder
            color={palette.main}
            lightColor={palette.light}
            className="w-16 h-14 transition-transform group-hover:scale-105"
          />
        </div>

        <span className="text-xs font-medium text-text text-center line-clamp-2 leading-tight max-w-full px-1">
          {workspace.name}
        </span>
        <span className="text-[10px] text-text-soft">
          {t(workspace.workspace_type)}
        </span>
      </Link>

      {/* Menu Button */}
      <div className="absolute top-1 right-1">
        <button
          onClick={(e) => {
            e.preventDefault();
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
