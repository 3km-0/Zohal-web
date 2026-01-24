'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Upload,
  FileText,
  MoreVertical,
  Trash2,
  Eye,
  FolderPlus,
  ChevronRight,
  Home,
  FolderInput,
  RefreshCcw,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, EmptyState, Spinner, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import type { Workspace, Document, DocumentType, ProcessingStatus, WorkspaceFolder, FolderWithStats } from '@/types/database';
import { cn, formatRelativeTime, formatFileSize } from '@/lib/utils';
import { DocumentUploadModal } from '@/components/document/DocumentUploadModal';
import { ShareDocumentModal } from '@/components/document/ShareDocumentModal';
import { FolderIcon, CreateFolderModal } from '@/components/folder';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';

// Document type icons
const documentIcons: Record<DocumentType, string> = {
  textbook: '📖',
  lecture_notes: '📝',
  problem_set: '📊',
  paper: '📄',
  personal_notes: '✏️',
  contract: '📜',
  financial_report: '💰',
  meeting_notes: '🗓️',
  invoice: '🧾',
  legal_filing: '⚖️',
  research: '🔬',
  other: '📁',
};

// Processing status colors
const statusColors: Record<ProcessingStatus, string> = {
  pending: 'bg-gray-500/10 text-gray-500',
  uploading: 'bg-blue-500/10 text-blue-500',
  processing: 'bg-amber-500/10 text-amber-500',
  chunked: 'bg-cyan-500/10 text-cyan-500',
  embedding: 'bg-purple-500/10 text-purple-500',
  completed: 'bg-success/10 text-success',
  failed: 'bg-error/10 text-error',
};

// Drag and drop types
type DragItem = {
  type: 'document' | 'folder';
  id: string;
};

export default function WorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const t = useTranslations('documents');
  const tFolders = useTranslations('folders');
  const tCommon = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);
  const { showError, showSuccess } = useToast();

  // Data state
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<FolderWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  
  // UI state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<WorkspaceFolder | null>(null);
  
  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Fetch workspace data
  const fetchWorkspace = useCallback(async () => {
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (error) {
      showError(error, 'workspaces');
    } else if (data) {
      setWorkspace(data);
    }
  }, [supabase, workspaceId, showError]);

  // Fetch folders with stats
  const fetchFolders = useCallback(async () => {
    // Fetch folders at current level
    let query = supabase
      .from('workspace_folders')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('name');

    if (currentFolderId) {
      query = query.eq('parent_id', currentFolderId);
    } else {
      query = query.is('parent_id', null);
    }

    const { data: foldersData, error: foldersError } = await query;

    if (foldersError) {
      console.error('Error fetching folders:', foldersError);
      return;
    }

    // Get stats for each folder
    const foldersWithStats: FolderWithStats[] = await Promise.all(
      (foldersData || []).map(async (folder) => {
        // Count documents
        const { count: docCount } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('folder_id', folder.id)
          .is('deleted_at', null);

        // Count subfolders
        const { count: subCount } = await supabase
          .from('workspace_folders')
          .select('*', { count: 'exact', head: true })
          .eq('parent_id', folder.id)
          .is('deleted_at', null);

        return {
          ...folder,
          document_count: docCount || 0,
          subfolder_count: subCount || 0,
        };
      })
    );

    setFolders(foldersWithStats);
  }, [supabase, workspaceId, currentFolderId]);

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    let query = supabase
      .from('documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .neq('storage_path', 'local')
      .order('updated_at', { ascending: false });

    if (currentFolderId) {
      query = query.eq('folder_id', currentFolderId);
    } else {
      query = query.is('folder_id', null);
    }

    const { data, error } = await query;

    if (error) {
      showError(error, 'documents');
    } else if (data) {
      setDocuments(data);
    }
  }, [supabase, workspaceId, currentFolderId, showError]);

  // Load all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchWorkspace(), fetchFolders(), fetchDocuments()]);
    setLoading(false);
  }, [fetchWorkspace, fetchFolders, fetchDocuments]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keep document list fresh when background classification updates document_type.
  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`documents-workspace-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'documents', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const updated = payload.new as unknown as Document;

          const inCurrentFolder = currentFolderId
            ? updated.folder_id === currentFolderId
            : !updated.folder_id;

          const shouldShow =
            updated.deleted_at == null &&
            updated.storage_path !== 'local' &&
            inCurrentFolder;

          setDocuments((prev) => {
            const idx = prev.findIndex((d) => d.id === updated.id);

            if (shouldShow) {
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = updated;
                return next;
              }
              // New to this view (e.g. moved folders) — add to top.
              return [updated, ...prev];
            }

            if (idx >= 0) {
              return prev.filter((d) => d.id !== updated.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, workspaceId, currentFolderId]);

  // Navigate into folder
  const navigateToFolder = (folder: WorkspaceFolder) => {
    setCurrentFolderId(folder.id);
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
  };

  // Navigate to specific folder in path
  const navigateToPathFolder = (folderId: string | null) => {
    if (folderId === null) {
      setCurrentFolderId(null);
      setFolderPath([]);
    } else {
      const index = folderPath.findIndex((f) => f.id === folderId);
      if (index >= 0) {
        setCurrentFolderId(folderId);
        setFolderPath(folderPath.slice(0, index + 1));
      }
    }
  };

  // Create folder
  const handleCreateFolder = async (name: string) => {
    const { error } = await supabase.from('workspace_folders').insert({
      workspace_id: workspaceId,
      parent_id: currentFolderId,
      name,
    });

    if (error) {
      throw error;
    }

    showSuccess('Folder created');
    await fetchFolders();
  };

  // Rename folder
  const handleRenameFolder = async (name: string) => {
    if (!editingFolder) return;

    const { error } = await supabase
      .from('workspace_folders')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', editingFolder.id);

    if (error) {
      throw error;
    }

    showSuccess('Folder renamed');
    setEditingFolder(null);
    await fetchFolders();
  };

  // Delete folder
  const handleDeleteFolder = async (folder: WorkspaceFolder) => {
    if (!confirm(`Are you sure you want to delete "${folder.name}"?`)) return;

    const { error } = await supabase
      .from('workspace_folders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', folder.id);

    if (error) {
      showError(error, 'folders');
    } else {
      showSuccess('Folder deleted');
      await fetchFolders();
    }
  };

  // Delete document
  const handleDeleteDocument = async (doc: Document) => {
    if (!confirm(`Are you sure you want to delete "${doc.title}"?`)) return;

    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', doc.id);

    if (error) {
      showError(error, 'documents');
    } else {
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    }
  };

  // Move document to folder
  const moveDocumentToFolder = async (documentId: string, folderId: string | null) => {
    const { error } = await supabase
      .from('documents')
      .update({ folder_id: folderId, updated_at: new Date().toISOString() })
      .eq('id', documentId);

    if (error) {
      showError(error, 'documents');
    } else {
      showSuccess('Document moved');
      await fetchDocuments();
    }
  };

  // Move folder to parent
  const moveFolderToParent = async (folderId: string, parentId: string | null) => {
    // Prevent moving folder into itself
    if (folderId === parentId) return;

    const { error } = await supabase
      .from('workspace_folders')
      .update({ parent_id: parentId, updated_at: new Date().toISOString() })
      .eq('id', folderId);

    if (error) {
      showError(error, 'folders');
    } else {
      showSuccess('Folder moved');
      await fetchFolders();
    }
  };

  // Drag and drop handlers
  const handleDragStart = (item: DragItem) => {
    setDraggedItem(item);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTargetId(null);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedItem && draggedItem.id !== targetId) {
      setDropTargetId(targetId);
    }
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDropTargetId(null);

    if (!draggedItem) return;

    if (draggedItem.type === 'document') {
      await moveDocumentToFolder(draggedItem.id, targetFolderId);
    } else if (draggedItem.type === 'folder') {
      await moveFolderToParent(draggedItem.id, targetFolderId);
    }

    setDraggedItem(null);
  };

  if (!workspace && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<FileText className="w-8 h-8" />}
          title="Workspace not found"
          description="The workspace you're looking for doesn't exist or has been deleted."
          action={{
            label: 'Go to Workspaces',
            onClick: () => router.push('/workspaces'),
          }}
        />
      </div>
    );
  }

  const isEmpty = folders.length === 0 && documents.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title={workspace?.name || 'Loading...'}
        subtitle={workspace?.description || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/workspaces">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
                {tCommon('back')}
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => setShowCreateFolderModal(true)}>
              <FolderPlus className="w-4 h-4" />
              {tFolders('newFolder')}
            </Button>
            <Button onClick={() => setShowUploadModal(true)}>
              <Upload className="w-4 h-4" />
              {t('upload')}
            </Button>
          </div>
        }
      />

      <WorkspaceTabs workspaceId={workspaceId} active="documents" />

      {/* Breadcrumb */}
      {folderPath.length > 0 && (
        <div className="px-6 py-2 border-b border-border bg-surface-alt/30">
          <div className="flex items-center gap-1 text-sm">
            <button
              onClick={() => navigateToPathFolder(null)}
              className="flex items-center gap-1 text-text-soft hover:text-text transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>{workspace?.name}</span>
            </button>
            {folderPath.map((folder, index) => (
              <div key={folder.id} className="flex items-center gap-1">
                <ChevronRight className="w-4 h-4 text-text-soft" />
                <button
                  onClick={() => navigateToPathFolder(folder.id)}
                  className={cn(
                    'hover:text-text transition-colors',
                    index === folderPath.length - 1
                      ? 'text-text font-medium'
                      : 'text-text-soft'
                  )}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title={currentFolderId ? tFolders('emptyFolder') : t('empty')}
            description={currentFolderId ? tFolders('addDocumentsOrSubfolders') : t('emptyDescription')}
            action={{
              label: t('upload'),
              onClick: () => setShowUploadModal(true),
            }}
          />
        ) : (
          <div className="space-y-8">
            {/* Folders Section */}
            {folders.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-text-soft uppercase tracking-wider mb-4">
                  {tFolders('title')}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      draggable
                      onDragStart={() => handleDragStart({ type: 'folder', id: folder.id })}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, folder.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, folder.id)}
                    >
                      <FolderIcon
                        folder={folder}
                        onOpen={() => navigateToFolder(folder)}
                        onRename={() => setEditingFolder(folder)}
                        onDelete={() => handleDeleteFolder(folder)}
                        isDragOver={dropTargetId === folder.id}
                        isDragging={draggedItem?.type === 'folder' && draggedItem.id === folder.id}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Documents Section */}
            {documents.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-text-soft uppercase tracking-wider mb-4">
                  {t('title')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      draggable
                      onDragStart={() => handleDragStart({ type: 'document', id: doc.id })}
                      onDragEnd={handleDragEnd}
                    >
                      <DocumentCard
                        document={doc}
                        workspaceId={workspaceId}
                        folders={folders}
                        onDelete={() => handleDeleteDocument(doc)}
                        onMoveToFolder={(folderId) => moveDocumentToFolder(doc.id, folderId)}
                        isDragging={draggedItem?.type === 'document' && draggedItem.id === doc.id}
                        currentFolderId={currentFolderId}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <DocumentUploadModal
          workspaceId={workspaceId}
          folderId={currentFolderId}
          onClose={() => setShowUploadModal(false)}
          onUploaded={(documentId) => {
            setShowUploadModal(false);
            if (documentId) {
              // Navigate to the uploaded document
              router.push(`/workspaces/${workspaceId}/documents/${documentId}`);
            } else {
              fetchData();
            }
          }}
        />
      )}

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <CreateFolderModal
          workspaceId={workspaceId}
          parentId={currentFolderId}
          onClose={() => setShowCreateFolderModal(false)}
          onSave={handleCreateFolder}
        />
      )}

      {/* Edit Folder Modal */}
      {editingFolder && (
        <CreateFolderModal
          workspaceId={workspaceId}
          parentId={editingFolder.parent_id}
          existingFolder={editingFolder}
          onClose={() => setEditingFolder(null)}
          onSave={handleRenameFolder}
        />
      )}
    </div>
  );
}

interface DocumentCardProps {
  document: Document;
  workspaceId: string;
  folders: FolderWithStats[];
  onDelete: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  isDragging?: boolean;
  currentFolderId: string | null;
}

function DocumentCard({
  document: doc,
  workspaceId,
  folders,
  onDelete,
  onMoveToFolder,
  isDragging,
  currentFolderId,
}: DocumentCardProps) {
  const t = useTranslations('documents.types');
  const tFolders = useTranslations('folders');
  const tCommon = useTranslations('common');
  const supabase = createClient();
  const { showSuccess } = useToast();
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const isProcessing = ['pending', 'uploading', 'processing', 'chunked', 'embedding'].includes(
    doc.processing_status
  );

  const canRetryIndexing = doc.processing_status === 'failed' || doc.processing_status === 'pending';
  const handleRetryIndexing = async () => {
    try {
      await supabase.functions.invoke('enqueue-document-ingestion', {
        body: { document_id: doc.id },
      });
      showSuccess('Queued for indexing', 'We’ll retry processing in the background.');
    } catch (e) {
      console.warn('enqueue-document-ingestion failed:', e);
    } finally {
      setShowMenu(false);
    }
  };

  return (
    <Card
      className={cn(
        'relative group hover:-translate-y-0.5 hover:shadow-scholar transition-all duration-200',
        isDragging && 'opacity-50 scale-95'
      )}
      padding="none"
    >
      <Link
        href={`/workspaces/${workspaceId}/documents/${doc.id}`}
        className="block p-5"
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-12 h-12 bg-surface-alt border border-border rounded-scholar-lg flex items-center justify-center text-2xl flex-shrink-0">
            {documentIcons[doc.document_type || 'other']}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text truncate">{doc.title}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {doc.document_type && (
                <Badge size="sm">{t(doc.document_type)}</Badge>
              )}
              <Badge
                size="sm"
                variant={doc.processing_status === 'completed' ? 'success' : 'default'}
                className={cn(statusColors[doc.processing_status])}
              >
                {isProcessing && (
                  <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse mr-1" />
                )}
                {doc.processing_status}
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <p className="text-xs text-text-soft">
            {doc.page_count ? `${doc.page_count} pages • ` : ''}
            {doc.file_size_bytes ? formatFileSize(doc.file_size_bytes) : ''}
          </p>
          <p className="text-xs text-text-soft">
            {formatRelativeTime(doc.updated_at)}
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
            <div className="absolute right-0 mt-1 w-48 bg-surface border border-border rounded-scholar shadow-scholar-lg z-50 overflow-hidden animate-fade-in">
              <Link
                href={`/workspaces/${workspaceId}/documents/${doc.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                onClick={() => setShowMenu(false)}
              >
                <Eye className="w-4 h-4" />
                {tCommon('open')}
              </Link>

              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowMenu(false);
                  setShowShareModal(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
              >
                <Share2 className="w-4 h-4" />
                {tCommon('share')}
              </button>

              {canRetryIndexing && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleRetryIndexing();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Retry indexing
                </button>
              )}

              {/* Move to folder submenu */}
              {folders.length > 0 && (
                <div className="border-t border-border">
                  <div className="px-3 py-1.5 text-xs text-text-soft font-medium">
                    {tFolders('moveToFolder')}
                  </div>
                  {currentFolderId && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onMoveToFolder(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                    >
                      <Home className="w-4 h-4" />
                      {tFolders('workspaceRoot')}
                    </button>
                  )}
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        setShowMenu(false);
                        onMoveToFolder(folder.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                    >
                      <FolderInput className="w-4 h-4" />
                      {folder.name}
                    </button>
                  ))}
                </div>
              )}

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

      {/* Share Modal */}
      {showShareModal && (
        <ShareDocumentModal
          document={doc}
          workspaceId={workspaceId}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </Card>
  );
}
