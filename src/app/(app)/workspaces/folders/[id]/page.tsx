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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                        'rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-alt',
                        activeDropFolderId === child.id && 'bg-accent/10 ring-2 ring-accent/40'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-alt">
                          <FolderOpen className="h-5 w-5 text-text-soft" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-text">{child.name}</div>
                          <div className="text-xs text-text-soft">Open folder</div>
                        </div>
                      </div>
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
                  {workspaces.map((workspace) => (
                    <Link
                      key={workspace.id}
                      href={`/workspaces/${workspace.id}`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggedItem({ kind: 'workspace', id: workspace.id });
                      }}
                      onDragEnd={() => setDraggedItem(null)}
                      className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-alt"
                    >
                      <div className="truncate text-sm font-semibold text-text">{workspace.name}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                        {workspace.workspace_type}
                      </div>
                    </Link>
                  ))}
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
