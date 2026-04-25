'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FolderOpen, Plus } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, EmptyState, ZohalActionMenu, Spinner } from '@/components/ui';
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
          <ZohalActionMenu
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
                        'group flex flex-col items-center gap-2 rounded-xl p-3 transition-all duration-200',
                        'hover:bg-surface-alt focus:outline-none focus:ring-2 focus:ring-accent/50',
                        activeDropFolderId === child.id && 'ring-2 ring-accent/40 scale-[1.03]'
                      )}
                    >
                      <svg
                        viewBox="0 0 120 90"
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-[80px] h-[60px] sm:w-[96px] sm:h-[72px] transition-transform duration-200 group-hover:scale-[1.08]"
                        style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.35))' }}
                        aria-hidden="true"
                      >
                        <defs>
                          <linearGradient id={`fg-${child.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#e8c46a" />
                            <stop offset="100%" stopColor="#b8922a" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M 7 0 L 42 0 Q 47 0 50 5 L 55 13 L 113 13 Q 120 13 120 20 L 120 83 Q 120 90 113 90 L 7 90 Q 0 90 0 83 L 0 7 Q 0 0 7 0 Z"
                          fill={`url(#fg-${child.id})`}
                        />
                        <path
                          d="M 7 0 L 42 0 Q 47 0 50 5 L 55 13 L 0 13 L 0 7 Q 0 0 7 0 Z"
                          fill="rgba(255,255,255,0.18)"
                        />
                        <rect x="5" y="18" width="110" height="20" rx="3" fill="rgba(255,255,255,0.1)" />
                        <rect x="0" y="74" width="120" height="16" rx="9" fill="rgba(0,0,0,0.12)" />
                      </svg>
                      <span className="w-full text-center text-[12px] font-semibold text-text leading-tight line-clamp-2 px-1">
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
                    const cm = (pct: number) => `color-mix(in srgb, ${accentColor} ${pct}%, transparent)`;
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
                        className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_36px_rgba(0,0,0,0.15)] active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-accent/40"
                      >
                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{ background: `radial-gradient(ellipse at 80% 0%, ${cm(14)} 0%, transparent 60%)` }}
                          aria-hidden="true"
                        />
                        <div className="relative z-10 flex flex-col p-5">
                          <div
                            className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold"
                            style={{
                              background: cm(18),
                              color: accentColor,
                              border: `1.5px solid ${cm(40)}`,
                            }}
                          >
                            {initial}
                          </div>
                          <span
                            className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em]"
                            style={{ color: accentColor }}
                          >
                            {workspace.workspace_type}
                          </span>
                          <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-text">
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
