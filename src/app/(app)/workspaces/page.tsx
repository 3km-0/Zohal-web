'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, FolderOpen, MoreVertical, Trash2, Edit2, Search } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, EmptyState, ScholarActionMenu, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Folder, Workspace, WorkspaceType } from '@/types/database';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { FolderModal } from '@/components/workspace/FolderModal';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';

type WorkspaceTimeFilter = 'all' | 'today' | 'lastWeek' | 'lastMonth';

export default function WorkspacesPage() {
  const t = useTranslations('workspaces');
  const supabase = createClient();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [createInFolderId, setCreateInFolderId] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<{ kind: 'workspace' | 'folder'; id: string } | null>(null);
  const [activeDropFolderId, setActiveDropFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<WorkspaceType | null>(null);
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<WorkspaceTimeFilter>('all');

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
    } else {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[Workspaces] Error fetching:', error.message);
      }
      setWorkspaces(data || []);
    }

    const { data: folderData } = await supabase
      .from('folders')
      .select('*')
      .is('deleted_at', null)
      .order('name');
    setFolders((folderData as Folder[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const tCard = useTranslations('workspaceCard');
  const topLevelFolders = folders.filter((folder) => !folder.parent_id);
  const availableTypes = useMemo(
    () => Array.from(new Set(workspaces.map((workspace) => workspace.workspace_type))) as WorkspaceType[],
    [workspaces]
  );
  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((workspace) => {
      const matchesSearch =
        !searchQuery ||
        workspace.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (workspace.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !selectedType || workspace.workspace_type === selectedType;
      if (!matchesSearch || !matchesType) return false;

      if (selectedTimeFilter === 'all') return true;

      const updatedAt = new Date(workspace.updated_at).getTime();
      const now = Date.now();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      if (selectedTimeFilter === 'today') return updatedAt >= startOfToday.getTime();
      if (selectedTimeFilter === 'lastWeek') return updatedAt >= now - 7 * 24 * 60 * 60 * 1000;
      return updatedAt >= now - 30 * 24 * 60 * 60 * 1000;
    });
  }, [searchQuery, selectedTimeFilter, selectedType, workspaces]);
  const ungroupedWorkspaces = filteredWorkspaces.filter((workspace) => !workspace.parent_folder_id);
  
  const handleDelete = async (workspace: Workspace) => {
    if (!confirm(tCard('confirmDelete', { name: workspace.name }))) return;

    const { error } = await supabase
      .from('workspaces')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', workspace.id);

    if (!error) {
      setWorkspaces((prev) => prev.filter((w) => w.id !== workspace.id));
    }
  };

  const moveWorkspaceToFolder = useCallback(async (workspaceId: string, parentFolderId: string | null) => {
    const { error } = await supabase
      .from('workspaces')
      .update({ parent_folder_id: parentFolderId, updated_at: new Date().toISOString() })
      .eq('id', workspaceId);

    if (!error) {
      setWorkspaces((prev) =>
        prev.map((workspace) =>
          workspace.id === workspaceId ? { ...workspace, parent_folder_id: parentFolderId } : workspace
        )
      );
    }
  }, [supabase]);

  const moveFolderToFolder = useCallback(async (folderId: string, parentId: string | null) => {
    const { error } = await supabase
      .from('folders')
      .update({ parent_id: parentId, updated_at: new Date().toISOString() })
      .eq('id', folderId);

    if (!error) {
      setFolders((prev) =>
        prev.map((folder) => (folder.id === folderId ? { ...folder, parent_id: parentId } : folder))
      );
    }
  }, [supabase]);

  const handleDropOnFolder = useCallback(async (folderId: string) => {
    if (!draggedItem) return;
    if (draggedItem.kind === 'workspace') {
      await moveWorkspaceToFolder(draggedItem.id, folderId);
    } else if (draggedItem.id !== folderId) {
      await moveFolderToFolder(draggedItem.id, folderId);
    }
    setDraggedItem(null);
    setActiveDropFolderId(null);
  }, [draggedItem, moveFolderToFolder, moveWorkspaceToFolder]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title={t('title')}
        actions={
          <ScholarActionMenu
            compact
            ariaLabel="Create"
            icon={<Plus className="w-4 h-4" />}
            label="Create"
            items={[
              {
                label: 'New Workspace',
                icon: <Plus className="w-4 h-4" />,
                onClick: () => {
                  setCreateInFolderId(null);
                  setShowCreateModal(true);
                },
              },
              {
                label: 'New Folder',
                icon: <FolderOpen className="w-4 h-4" />,
                onClick: () => setShowCreateFolderModal(true),
              },
            ]}
          />
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : workspaces.length === 0 && topLevelFolders.length === 0 ? (
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
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-soft" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search workspaces"
                  className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-4 text-sm text-text outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <FilterChip label="All Types" selected={selectedType === null} onClick={() => setSelectedType(null)} />
                {availableTypes.map((type) => (
                  <FilterChip
                    key={type}
                    label={type}
                    selected={selectedType === type}
                    onClick={() => setSelectedType(type)}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <FilterChip label="All Time" selected={selectedTimeFilter === 'all'} onClick={() => setSelectedTimeFilter('all')} />
                <FilterChip label="Today" selected={selectedTimeFilter === 'today'} onClick={() => setSelectedTimeFilter('today')} />
                <FilterChip label="Last Week" selected={selectedTimeFilter === 'lastWeek'} onClick={() => setSelectedTimeFilter('lastWeek')} />
                <FilterChip label="Last Month" selected={selectedTimeFilter === 'lastMonth'} onClick={() => setSelectedTimeFilter('lastMonth')} />
              </div>
            </section>

            {topLevelFolders.length > 0 && (
              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">
                  Folders
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {topLevelFolders.map((folder) => (
                    <FolderTile
                      key={folder.id}
                      folder={folder}
                      draggable
                      isDropTarget={activeDropFolderId === folder.id}
                      onDragStart={() => setDraggedItem({ kind: 'folder', id: folder.id })}
                      onDragEnd={() => {
                        setDraggedItem(null);
                        setActiveDropFolderId(null);
                      }}
                      onDragEnter={() => setActiveDropFolderId(folder.id)}
                      onDragLeave={() => setActiveDropFolderId((current) => (current === folder.id ? null : current))}
                      onDrop={() => void handleDropOnFolder(folder.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {ungroupedWorkspaces.length > 0 ? (
              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">
                  Workspaces
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {ungroupedWorkspaces.map((workspace) => (
                    <WorkspaceIcon
                      key={workspace.id}
                      workspace={workspace}
                      draggable
                      onDragStart={() => setDraggedItem({ kind: 'workspace', id: workspace.id })}
                      onDragEnd={() => setDraggedItem(null)}
                      onEdit={() => setEditingWorkspace(workspace)}
                      onDelete={() => handleDelete(workspace)}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <EmptyState
                icon={<Search className="w-8 h-8" />}
                title="No matching workspaces"
                description="Try changing the search or filters."
              />
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingWorkspace) && (
        <WorkspaceModal
          workspace={editingWorkspace}
          initialParentFolderId={editingWorkspace ? null : createInFolderId}
          onClose={() => {
            setShowCreateModal(false);
            setEditingWorkspace(null);
            setCreateInFolderId(null);
          }}
          onSaved={() => {
            setShowCreateModal(false);
            setEditingWorkspace(null);
            setCreateInFolderId(null);
            fetchWorkspaces();
          }}
        />
      )}

      {showCreateFolderModal && (
        <FolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onSaved={() => {
            setShowCreateFolderModal(false);
            fetchWorkspaces();
          }}
        />
      )}
    </div>
  );
}

interface FolderTileProps {
  folder: Folder;
  draggable?: boolean;
  isDropTarget?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
}

function FolderTile({
  folder,
  draggable = false,
  isDropTarget = false,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDrop,
}: FolderTileProps) {
  return (
    <Link
      href={`/workspaces/folders/${folder.id}`}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={() => onDragEnter?.()}
      onDragLeave={() => onDragLeave?.()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop?.();
      }}
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl p-3 transition-all duration-200',
        'hover:bg-surface-alt/60 hover:shadow-md active:scale-95',
        isDropTarget && 'bg-accent/10 ring-2 ring-accent/40',
        'focus:outline-none focus:ring-2 focus:ring-accent/50',
        'mx-auto w-[160px]'
      )}
    >
      <FolderOpen className="h-12 w-12 text-accent" />
      <span className="line-clamp-2 max-w-full px-1 text-center text-sm font-semibold text-text">
        {folder.name}
      </span>
    </Link>
  );
}

interface WorkspaceCardProps {
  workspace: Workspace;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function WorkspaceIcon({
  workspace,
  draggable = false,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
}: WorkspaceCardProps) {
  const t = useTranslations('workspaces.types');
  const tCard = useTranslations('workspaceCard');
  const tCommon = useTranslations('common');
  const [showMenu, setShowMenu] = useState(false);
  const hasCustomColor = Boolean(workspace.color);

  return (
    <div className="relative group">
      <Link
        href={`/workspaces/${workspace.id}`}
        draggable={draggable}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          onDragStart?.();
        }}
        onDragEnd={() => onDragEnd?.()}
        className={cn(
          'relative block overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-surface to-surface-alt/40 p-4 transition-all duration-200',
          'hover:border-accent/20 hover:shadow-lg hover:shadow-accent/5 active:scale-[0.99]',
          'focus:outline-none focus:ring-2 focus:ring-accent/50',
          'min-h-[132px] mx-auto w-full max-w-[228px]'
        )}
      >
        <div
          className={cn('absolute inset-y-0 right-0 w-2.5', hasCustomColor ? '' : 'bg-accent')}
          style={hasCustomColor ? { backgroundColor: String(workspace.color) } : undefined}
          aria-hidden="true"
        />

        <div className="pt-1">
          <div className="min-w-0">
            <div className="line-clamp-2 text-sm font-semibold leading-5 text-text">{workspace.name}</div>
            <div className="mt-2 inline-flex rounded-full border border-border bg-surface px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-soft">
              {t(workspace.workspace_type)}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between text-[11px] text-text-soft">
          <span className="truncate">Open workspace</span>
          <span className="font-medium">
            {new Date(workspace.updated_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
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

function FilterChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors',
        selected
          ? 'border-accent bg-accent text-white'
          : 'border-border bg-surface text-text-soft hover:border-accent/30 hover:text-text'
      )}
    >
      {label}
    </button>
  );
}
