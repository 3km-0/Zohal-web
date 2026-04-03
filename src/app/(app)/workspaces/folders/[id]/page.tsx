'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FolderOpen, Plus } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, EmptyState, ScholarActionMenu, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Folder, Workspace } from '@/types/database';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';
import { FolderModal } from '@/components/workspace/FolderModal';
import { cn } from '@/lib/utils';

export default function FolderDetailPage() {
  const params = useParams();
  const folderId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [folder, setFolder] = useState<Folder | null>(null);
  const [childFolders, setChildFolders] = useState<Folder[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ kind: 'workspace' | 'folder'; id: string } | null>(null);
  const [activeDropFolderId, setActiveDropFolderId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: folderData } = await supabase
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .is('deleted_at', null)
      .maybeSingle();
    setFolder((folderData as Folder) || null);

    const { data: children } = await supabase
      .from('folders')
      .select('*')
      .eq('parent_id', folderId)
      .is('deleted_at', null)
      .order('name');
    setChildFolders((children as Folder[]) || []);

    const { data: rpcData, error: rpcError } = await supabase.rpc('list_accessible_workspaces');
    if (!rpcError && rpcData) {
      setWorkspaces(
        (rpcData as Workspace[]).filter((workspace) => workspace.parent_folder_id === folderId)
      );
    } else {
      const { data } = await supabase
        .from('workspaces')
        .select('*')
        .eq('parent_folder_id', folderId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      setWorkspaces((data as Workspace[]) || []);
    }

    setLoading(false);
  }, [folderId, supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const moveWorkspaceToFolder = useCallback(async (workspaceId: string, parentFolderId: string | null) => {
    const { error } = await supabase
      .from('workspaces')
      .update({ parent_folder_id: parentFolderId, updated_at: new Date().toISOString() })
      .eq('id', workspaceId);
    if (!error) {
      setWorkspaces((prev) => prev.filter((workspace) => workspace.id !== workspaceId));
    }
  }, [supabase]);

  const moveFolderToFolder = useCallback(async (childId: string, parentId: string | null) => {
    const { error } = await supabase
      .from('folders')
      .update({ parent_id: parentId, updated_at: new Date().toISOString() })
      .eq('id', childId);
    if (!error) {
      setChildFolders((prev) => prev.filter((folder) => folder.id !== childId));
    }
  }, [supabase]);

  const handleDropOnFolder = useCallback(async (targetFolderId: string) => {
    if (!draggedItem) return;
    if (draggedItem.kind === 'workspace') {
      await moveWorkspaceToFolder(draggedItem.id, targetFolderId);
    } else if (draggedItem.id !== targetFolderId) {
      await moveFolderToFolder(draggedItem.id, targetFolderId);
    }
    setDraggedItem(null);
    setActiveDropFolderId(null);
  }, [draggedItem, moveFolderToFolder, moveWorkspaceToFolder]);

  if (!folder && !loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<FolderOpen className="h-8 w-8" />}
          title="Folder not found"
          description="The folder you're looking for doesn't exist or you no longer have access."
          action={{ label: 'Back to Workspaces', onClick: () => (window.location.href = '/workspaces') }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <AppHeader
        title={folder?.name || 'Folder'}
        subtitle="Workspaces in this folder"
        leading={
          <Link href="/workspaces">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
        actions={
          <ScholarActionMenu
            compact
            ariaLabel="Create"
            icon={<Plus className="h-4 w-4" />}
            label="Create"
            items={[
              {
                label: 'New Workspace',
                icon: <Plus className="h-4 w-4" />,
                onClick: () => setShowCreateWorkspace(true),
              },
              {
                label: 'New Folder',
                icon: <FolderOpen className="h-4 w-4" />,
                onClick: () => setShowCreateFolder(true),
              },
            ]}
          />
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-8">
            {childFolders.length > 0 && (
              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Folders</div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1">
                  {childFolders.map((child) => (
                    <Link
                      key={child.id}
                      href={`/workspaces/folders/${child.id}`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggedItem({ kind: 'folder', id: child.id });
                      }}
                      onDragEnd={() => {
                        setDraggedItem(null);
                        setActiveDropFolderId(null);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                      }}
                      onDragEnter={() => setActiveDropFolderId(child.id)}
                      onDragLeave={() => setActiveDropFolderId((current) => (current === child.id ? null : current))}
                      onDrop={(event) => {
                        event.preventDefault();
                        void handleDropOnFolder(child.id);
                      }}
                      className={cn(
                        'group flex flex-col items-center gap-2.5 rounded-xl p-3 transition-all duration-200',
                        'hover:bg-surface-alt focus:outline-none focus:ring-2 focus:ring-accent/50',
                        activeDropFolderId === child.id && 'bg-accent/8 ring-2 ring-accent/40 scale-[1.03]'
                      )}
                    >
                      <div className="relative flex items-center justify-center w-full">
                        <svg
                          viewBox="0 0 120 92"
                          className="w-[84px] h-[64px] sm:w-[96px] sm:h-[74px] drop-shadow-md transition-transform duration-200 group-hover:scale-[1.06] group-hover:drop-shadow-lg"
                          aria-hidden="true"
                        >
                          <rect x="0" y="0" width="54" height="20" rx="6" fill="rgba(196,164,90,0.55)" />
                          <rect x="0" y="12" width="120" height="80" rx="9" fill="rgba(196,164,90,0.82)" />
                          <rect x="6" y="24" width="108" height="42" rx="5" fill="rgba(255,255,255,0.07)" />
                          <rect x="0" y="76" width="120" height="16" rx="9" fill="rgba(0,0,0,0.08)" />
                        </svg>
                      </div>
                      <span className="w-full text-center text-[13px] font-semibold text-text leading-tight line-clamp-2 px-1">
                        {child.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Workspaces</div>
              {workspaces.length === 0 ? (
                <EmptyState
                  icon={<FolderOpen className="h-8 w-8" />}
                  title="No workspaces in this folder"
                  description="Create a workspace in this folder to get started."
                  action={{ label: 'New Workspace', onClick: () => setShowCreateWorkspace(true) }}
                />
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {workspaces.map((workspace) => {
                    const accentColor = workspace.color ? String(workspace.color) : 'var(--accent)';
                    const initial = workspace.name.charAt(0).toUpperCase();
                    return (
                      <Link
                        key={workspace.id}
                        href={`/workspaces/${workspace.id}?fromFolder=${encodeURIComponent(folderId)}`}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggedItem({ kind: 'workspace', id: workspace.id });
                        }}
                        onDragEnd={() => setDraggedItem(null)}
                        className="group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-surface transition-all duration-200 hover:border-accent/30 hover:shadow-[0_2px_16px_rgba(0,0,0,0.18),0_0_0_1px_rgba(196,164,90,0.1)] active:scale-[0.985] focus:outline-none focus:ring-2 focus:ring-accent/50"
                      >
                        <div
                          className="relative flex h-[64px] items-end px-3 pb-2.5 overflow-hidden"
                          style={{ background: `linear-gradient(135deg, ${accentColor}26 0%, ${accentColor}0a 100%)` }}
                        >
                          <div
                            className="absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-20"
                            style={{ background: `radial-gradient(circle, ${accentColor} 0%, transparent 70%)` }}
                            aria-hidden="true"
                          />
                          <div
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold tracking-tight shrink-0"
                            style={{
                              backgroundColor: `${accentColor}22`,
                              color: accentColor,
                              border: `1.5px solid ${accentColor}35`,
                            }}
                          >
                            {initial}
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col gap-1 px-3 pt-2.5 pb-3">
                          <span
                            className="self-start rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]"
                            style={{ backgroundColor: `${accentColor}14`, color: accentColor }}
                          >
                            {workspace.workspace_type}
                          </span>
                          <div className="line-clamp-2 text-[13px] font-semibold leading-snug text-text mt-0.5">
                            {workspace.name}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {showCreateWorkspace && (
        <WorkspaceModal
          initialParentFolderId={folderId}
          onClose={() => setShowCreateWorkspace(false)}
          onSaved={() => {
            setShowCreateWorkspace(false);
            void fetchData();
          }}
        />
      )}

      {showCreateFolder && (
        <FolderModal
          title="New Folder"
          initialParentId={folderId}
          initialOrgId={folder?.org_id || null}
          onClose={() => setShowCreateFolder(false)}
          onSaved={() => {
            setShowCreateFolder(false);
            void fetchData();
          }}
        />
      )}
    </div>
  );
}
