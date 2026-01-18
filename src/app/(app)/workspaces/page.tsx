'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, FolderOpen, MoreVertical, Archive, Trash2, Edit2 } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, EmptyState, Spinner, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Workspace, WorkspaceType } from '@/types/database';
import { cn, formatRelativeTime } from '@/lib/utils';
import { resolveIcon } from '@/lib/icon-mapping';
import Link from 'next/link';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';

// Workspace type icons (fallback emojis)
const workspaceIcons: Record<WorkspaceType, string> = {
  project: '📁',
  case: '⚖️',
  course: '📚',
  personal: '👤',
  archive: '🗄️',
  research: '🔬',
  client: '🏢',
  other: '📂',
};

// Workspace type colors
const workspaceColors: Record<WorkspaceType, string> = {
  project: 'bg-blue-500/10 border-blue-500/20',
  case: 'bg-purple-500/10 border-purple-500/20',
  course: 'bg-green-500/10 border-green-500/20',
  personal: 'bg-amber-500/10 border-amber-500/20',
  archive: 'bg-gray-500/10 border-gray-500/20',
  research: 'bg-cyan-500/10 border-cyan-500/20',
  client: 'bg-rose-500/10 border-rose-500/20',
  other: 'bg-slate-500/10 border-slate-500/20',
};

export default function WorkspacesPage() {
  const t = useTranslations('workspaces');
  const supabase = createClient();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    
    // Debug: Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    console.log('[Workspaces] Current user ID:', user?.id);
    console.log('[Workspaces] Current user email:', user?.email);
    
    if (!user) {
      console.error('[Workspaces] No authenticated user!');
      setLoading(false);
      return;
    }

    // Query workspaces - RLS will filter by owner_id = auth.uid()
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .is('deleted_at', null) // Use soft delete filter instead of archived
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[Workspaces] Error fetching:', error.message, error.details, error.hint);
    } else {
      console.log('[Workspaces] Fetched:', data?.length, 'workspaces');
      if (data && data.length > 0) {
        console.log('[Workspaces] First workspace owner_id:', data[0].owner_id);
      }
      setWorkspaces(data || []);
    }
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((workspace) => (
              <WorkspaceCard
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

// Component to render workspace icon - handles SF Symbol to emoji/icon conversion
function WorkspaceIcon({ icon, fallback }: { icon: string | null | undefined; fallback: string }) {
  const resolved = resolveIcon(icon, false);
  
  if (resolved.type === 'emoji') {
    return <span>{resolved.emoji}</span>;
  }
  
  // If we have a Lucide icon, render it
  const IconComponent = resolved.icon;
  return <IconComponent className="w-6 h-6" />;
}

interface WorkspaceCardProps {
  workspace: Workspace;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function WorkspaceCard({ workspace, onEdit, onArchive, onDelete }: WorkspaceCardProps) {
  const t = useTranslations('workspaces.types');
  const tCard = useTranslations('workspaceCard');
  const tCommon = useTranslations('common');
  const [showMenu, setShowMenu] = useState(false);

  return (
    <Card
      className="relative group hover:-translate-y-0.5 hover:shadow-scholar transition-all duration-200"
      padding="none"
    >
      <Link href={`/workspaces/${workspace.id}`} className="block p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className={cn(
              'w-12 h-12 rounded-scholar-lg border flex items-center justify-center text-2xl flex-shrink-0',
              workspaceColors[workspace.workspace_type]
            )}
          >
            <WorkspaceIcon
              icon={workspace.icon}
              fallback={workspaceIcons[workspace.workspace_type]}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text truncate">{workspace.name}</h3>
            <Badge size="sm" className="mt-1">
              {t(workspace.workspace_type)}
            </Badge>
            {workspace.description && (
              <p className="text-sm text-text-soft mt-2 line-clamp-2">
                {workspace.description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs text-text-soft">
            {tCard('updated')} {formatRelativeTime(workspace.updated_at)}
          </p>
        </div>
      </Link>

      {/* Menu Button */}
      <div className="absolute top-3 right-3">
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
    </Card>
  );
}

