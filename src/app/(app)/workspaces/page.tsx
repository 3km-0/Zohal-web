'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, FolderOpen, MoreVertical, Trash2, Edit2, Search, ArrowRight } from 'lucide-react';
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
            <section className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search workspaces…"
                  className="w-full rounded-lg border border-border/60 bg-surface-alt py-2.5 pl-10 pr-4 text-sm text-text outline-none transition placeholder:text-text-muted focus:border-accent/40 focus:ring-2 focus:ring-accent/10"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <FilterChip label="All types" selected={selectedType === null} onClick={() => setSelectedType(null)} />
                {availableTypes.map((type) => (
                  <FilterChip
                    key={type}
                    label={type}
                    selected={selectedType === type}
                    onClick={() => setSelectedType(type)}
                  />
                ))}
                {availableTypes.length > 0 && (
                  <span className="mx-1.5 inline-block h-3.5 w-px bg-border" aria-hidden="true" />
                )}
                <FilterChip label="All time" selected={selectedTimeFilter === 'all'} onClick={() => setSelectedTimeFilter('all')} />
                <FilterChip label="Today" selected={selectedTimeFilter === 'today'} onClick={() => setSelectedTimeFilter('today')} />
                <FilterChip label="Last week" selected={selectedTimeFilter === 'lastWeek'} onClick={() => setSelectedTimeFilter('lastWeek')} />
                <FilterChip label="Last month" selected={selectedTimeFilter === 'lastMonth'} onClick={() => setSelectedTimeFilter('lastMonth')} />
              </div>
            </section>

            {topLevelFolders.length > 0 && (
              <section className="space-y-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
                  Folders
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1">
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
                <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
                  Workspaces
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
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
        'group flex flex-col items-center gap-2.5 rounded-xl p-3 transition-all duration-200',
        'hover:bg-surface-alt focus:outline-none focus:ring-2 focus:ring-accent/50',
        isDropTarget && 'bg-accent/8 ring-2 ring-accent/40 scale-[1.03]',
      )}
    >
      {/* Big folder icon SVG */}
      <div className="relative flex items-center justify-center w-full">
        <svg
          viewBox="0 0 120 92"
          className="w-[84px] h-[64px] sm:w-[96px] sm:h-[74px] drop-shadow-md transition-transform duration-200 group-hover:scale-[1.06] group-hover:drop-shadow-lg"
          aria-hidden="true"
        >
          {/* Back panel - slightly darker tab */}
          <rect x="0" y="0" width="54" height="20" rx="6" fill="rgba(196,164,90,0.55)" />
          {/* Main folder body */}
          <rect x="0" y="12" width="120" height="80" rx="9" fill="rgba(196,164,90,0.82)" />
          {/* Subtle inner shine */}
          <rect x="6" y="24" width="108" height="42" rx="5" fill="rgba(255,255,255,0.07)" />
          {/* Bottom depth strip */}
          <rect x="0" y="76" width="120" height="16" rx="9" fill="rgba(0,0,0,0.08)" />
        </svg>
      </div>

      <span className="w-full text-center text-[13px] font-semibold text-text leading-tight line-clamp-2 px-1">
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
  const accentColor = workspace.color ? String(workspace.color) : 'var(--accent)';
  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <div className="group relative">
      <Link
        href={`/workspaces/${workspace.id}`}
        draggable={draggable}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          onDragStart?.();
        }}
        onDragEnd={() => onDragEnd?.()}
        className={cn(
          'relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-surface transition-all duration-200',
          'hover:border-accent/30 hover:shadow-[0_2px_16px_rgba(0,0,0,0.18),0_0_0_1px_rgba(196,164,90,0.1)] active:scale-[0.985]',
          'focus:outline-none focus:ring-2 focus:ring-accent/50',
        )}
      >
        {/* Header accent area */}
        <div
          className="relative flex h-[72px] items-end px-4 pb-3 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${accentColor}26 0%, ${accentColor}0a 100%)`,
          }}
        >
          {/* Decorative background circle */}
          <div
            className="absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-20"
            style={{ background: `radial-gradient(circle, ${accentColor} 0%, transparent 70%)` }}
            aria-hidden="true"
          />
          {/* Initial avatar */}
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg text-base font-bold tracking-tight shrink-0"
            style={{
              backgroundColor: `${accentColor}22`,
              color: accentColor,
              border: `1.5px solid ${accentColor}35`,
              boxShadow: `0 1px 6px ${accentColor}20`,
            }}
          >
            {initial}
          </div>
        </div>

        {/* Content body */}
        <div className="flex flex-1 flex-col gap-1 px-4 pt-3 pb-4">
          <span
            className="self-start rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]"
            style={{
              backgroundColor: `${accentColor}14`,
              color: accentColor,
            }}
          >
            {t(workspace.workspace_type)}
          </span>
          <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-text mt-0.5">
            {workspace.name}
          </div>

          <div className="mt-auto pt-3 flex items-center justify-between">
            <span className="text-[11px] text-text-muted">
              {new Date(workspace.updated_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <ArrowRight className="h-3 w-3 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          </div>
        </div>
      </Link>

      {/* Context menu */}
      <div className="absolute right-2.5 top-2.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 z-10">
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowMenu(!showMenu);
          }}
          className="rounded-md p-1 bg-surface/70 backdrop-blur-sm hover:bg-surface-alt transition-colors"
        >
          <MoreVertical className="h-3.5 w-3.5 text-text-muted" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadowMd)] z-50 animate-fade-in">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowMenu(false);
                  onEdit();
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-text hover:bg-surface-alt transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5" />
                {tCard('edit')}
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowMenu(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-error hover:bg-error/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
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
        'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150',
        selected
          ? 'bg-accent/10 text-accent'
          : 'text-text-soft hover:bg-surface-alt hover:text-text'
      )}
    >
      {label}
    </button>
  );
}
