'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  CircleHelp,
  Eye,
  FileText,
  MoreVertical,
  RefreshCcw,
  Save,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import Image from 'next/image';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Badge, Button, Card, EmptyState, ScholarActionMenu, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { DocumentUploadModal } from '@/components/document/DocumentUploadModal';
import { ShareDocumentModal } from '@/components/document/ShareDocumentModal';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { createClient } from '@/lib/supabase/client';
import { cn, formatFileSize, formatRelativeTime } from '@/lib/utils';
import type { Document, ProcessingStatus, Workspace, WorkspaceSavedView } from '@/types/database';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const documentThumbnailCache = new Map<string, string>();

const STATUS_COLORS: Record<ProcessingStatus, { bg: string; color: string }> = {
  pending:    { bg: 'color-mix(in srgb, var(--text-muted) 10%, transparent)', color: 'var(--text-muted)' },
  uploading:  { bg: 'color-mix(in srgb, var(--accent) 12%, transparent)',     color: 'var(--accent)' },
  processing: { bg: 'color-mix(in srgb, var(--warning) 12%, transparent)',    color: 'var(--warning)' },
  chunked:    { bg: 'color-mix(in srgb, var(--accent) 8%, transparent)',      color: 'var(--accent-alt)' },
  embedding:  { bg: 'color-mix(in srgb, var(--accent) 12%, transparent)',     color: 'var(--accent)' },
  completed:  { bg: 'color-mix(in srgb, var(--success) 12%, transparent)',    color: 'var(--success)' },
  failed:     { bg: 'color-mix(in srgb, var(--error) 12%, transparent)',      color: 'var(--error)' },
};

type SavedViewFilters = {
  search?: string | null;
  documentType?: string | null;
  tag?: string | null;
};

export default function WorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const fromFolderId = searchParams.get('fromFolder');
  const backHref = fromFolderId ? `/workspaces/folders/${encodeURIComponent(fromFolderId)}` : '/workspaces';
  const t = useTranslations('documents');
  const tCommon = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);
  const { showError, showSuccess } = useToast();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [savedViews, setSavedViews] = useState<WorkspaceSavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgMultiUserEnabled, setOrgMultiUserEnabled] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocumentType, setSelectedDocumentType] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (!error && data) {
      setWorkspace(data);
      if (data.org_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('multi_user_enabled')
          .eq('id', data.org_id)
          .maybeSingle();
        setOrgMultiUserEnabled(org?.multi_user_enabled === true);
      } else {
        setOrgMultiUserEnabled(false);
      }
      return;
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc('list_accessible_workspaces');
    if (rpcErr || !rpcData) {
      showError(error || rpcErr, 'workspaces');
      return;
    }

    const found = (rpcData as Array<Workspace & { access_role?: string; access_source?: string }>).find(
      (item) => item.id === workspaceId
    );
    if (!found) {
      showError(error || rpcErr, 'workspaces');
      return;
    }

    setWorkspace(found);
    if (found.org_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('multi_user_enabled')
        .eq('id', found.org_id)
        .maybeSingle();
      setOrgMultiUserEnabled(org?.multi_user_enabled === true);
    } else {
      setOrgMultiUserEnabled(false);
    }
  }, [showError, supabase, workspaceId]);

  const fetchDocuments = useCallback(async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .neq('storage_path', 'local')
      .order('created_at', { ascending: false });

    if (error) {
      showError(error, 'documents');
      return;
    }
    setDocuments((data as Document[]) || []);
  }, [showError, supabase, workspaceId]);

  const fetchSavedViews = useCallback(async () => {
    const { data, error } = await supabase
      .from('workspace_saved_views')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('sort_index')
      .order('name');

    if (!error && data) {
      setSavedViews(data as WorkspaceSavedView[]);
    }
  }, [supabase, workspaceId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchWorkspace(), fetchDocuments(), fetchSavedViews()]);
    setLoading(false);
  }, [fetchDocuments, fetchSavedViews, fetchWorkspace]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`documents-workspace-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'documents', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const updated = payload.new as unknown as Document;
          setDocuments((prev) => {
            const index = prev.findIndex((doc) => doc.id === updated.id);
            if (updated.deleted_at != null || updated.storage_path === 'local') {
              return index >= 0 ? prev.filter((doc) => doc.id !== updated.id) : prev;
            }
            if (index >= 0) {
              const next = [...prev];
              next[index] = updated;
              return next;
            }
            return [updated, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, workspaceId]);

  const applySavedView = (view: WorkspaceSavedView) => {
    const filters = (view.filter_json || {}) as SavedViewFilters;
    setActiveSavedViewId(view.id);
    setSearchQuery(filters.search || '');
    setSelectedDocumentType(filters.documentType || null);
    setSelectedTag(filters.tag || null);
  };

  const clearFilters = () => {
    setActiveSavedViewId(null);
    setSearchQuery('');
    setSelectedDocumentType(null);
    setSelectedTag(null);
  };

  const saveCurrentView = async () => {
    const name = window.prompt('Name this saved view');
    if (!name?.trim()) return;

    const { error } = await supabase.from('workspace_saved_views').insert({
      workspace_id: workspaceId,
      name: name.trim(),
      filter_json: {
        search: searchQuery || null,
        documentType: selectedDocumentType,
        tag: selectedTag,
      },
    });

    if (error) {
      showError(error, 'workspace_saved_views');
      return;
    }

    showSuccess('Saved view created');
    await fetchSavedViews();
  };

  const handleDeleteDocument = async (doc: Document) => {
    if (!confirm(`Are you sure you want to delete "${doc.title}"?`)) return;

    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', doc.id);

    if (error) {
      showError(error, 'documents');
      return;
    }

    setDocuments((prev) => prev.filter((item) => item.id !== doc.id));
  };

  const visibleDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      const tags = doc.document_tags || [];
      const matchesType = selectedDocumentType ? doc.document_type === selectedDocumentType : true;
      const matchesTag = selectedTag ? tags.includes(selectedTag) : true;
      const matchesSearch = !query
        ? true
        : doc.title.toLowerCase().includes(query) ||
          (doc.original_filename || '').toLowerCase().includes(query) ||
          tags.some((tag) => tag.toLowerCase().includes(query));
      return matchesType && matchesTag && matchesSearch;
    });
  }, [documents, searchQuery, selectedDocumentType, selectedTag]);

  const documentTypes = useMemo(
    () => Array.from(new Set(documents.map((doc) => doc.document_type).filter(Boolean))).sort(),
    [documents]
  );
  const documentTags = useMemo(
    () => Array.from(new Set(documents.flatMap((doc) => doc.document_tags || []).filter(Boolean))).sort(),
    [documents]
  );

  if (!workspace && !loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
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

  const isEmpty = documents.length === 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <AppHeader
        title={workspace?.name || 'Loading...'}
        subtitle={workspace?.description || 'Workspace-first documents, views, and analysis'}
        leading={
          <Link href={backHref}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              {tCommon('back')}
            </Button>
          </Link>
        }
        actions={
          <>
            <div className="hidden items-center gap-2 md:flex">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('zohal:start-tour', {
                      detail: { tourId: 'workspace', force: true },
                    })
                  );
                }}
                aria-label="Take a tour"
                title="Take a tour"
              >
                <CircleHelp className="h-4 w-4" />
                Tour
              </Button>
              <div className="flex items-center gap-2 rounded-[18px] border border-border bg-surface-alt/80 p-1">
                <Button variant="ghost" size="sm" onClick={saveCurrentView}>
                  <Save className="h-4 w-4" />
                  Save view
                </Button>
                <Button size="sm" onClick={() => setShowUploadModal(true)} data-tour="workspace-upload">
                  <Upload className="h-4 w-4" />
                  {t('upload')}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <Button
                size="sm"
                onClick={() => setShowUploadModal(true)}
                data-tour="workspace-upload"
                aria-label={t('upload')}
                title={t('upload')}
                className="min-w-[44px] px-3"
              >
                <Upload className="h-4 w-4" />
              </Button>
              <ScholarActionMenu
                compact
                ariaLabel={tCommon('moreActions')}
                icon={<MoreVertical className="h-4 w-4" />}
                label={tCommon('moreActions')}
                items={[
                  {
                    label: 'Tour',
                    icon: <CircleHelp className="h-4 w-4" />,
                    onClick: () => {
                      window.dispatchEvent(
                        new CustomEvent('zohal:start-tour', {
                          detail: { tourId: 'workspace', force: true },
                        })
                      );
                    },
                  },
                  {
                    label: 'Save view',
                    icon: <Save className="h-4 w-4" />,
                    onClick: saveCurrentView,
                  },
                ]}
              />
            </div>
          </>
        }
      />

      <WorkspaceTabs workspaceId={workspaceId} active="documents" showMembersTab={orgMultiUserEnabled} />

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title={t('empty')}
            description={t('emptyDescription')}
            action={{
              label: t('upload'),
              onClick: () => setShowUploadModal(true),
            }}
          />
        ) : (
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative max-w-xl flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-soft" />
                  <input
                    value={searchQuery}
                    onChange={(e) => {
                      setActiveSavedViewId(null);
                      setSearchQuery(e.target.value);
                    }}
                    placeholder="Search workspace documents"
                    className="w-full rounded-scholar border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-text outline-none transition-colors focus:border-accent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={saveCurrentView}>
                    <Save className="h-4 w-4" />
                    Save view
                  </Button>
                  {(searchQuery || selectedDocumentType || selectedTag || activeSavedViewId) && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-4 w-4" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {savedViews.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Saved views</div>
                  <div className="flex flex-wrap gap-2">
                    {savedViews.map((view) => {
                      const isSelected = activeSavedViewId === view.id;
                      return (
                        <button
                          key={view.id}
                          onClick={() => applySavedView(view)}
                          className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
                          style={isSelected ? {
                            backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                            borderColor: 'var(--accent)',
                            color: 'var(--accent)',
                          } : undefined}
                          data-inactive={!isSelected || undefined}
                        >
                          {view.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {documentTypes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Types</div>
                  <div className="flex flex-wrap gap-2">
                    {documentTypes.map((type) => {
                      const isSelected = selectedDocumentType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            setActiveSavedViewId(null);
                            setSelectedDocumentType((current) => (current === type ? null : type));
                          }}
                          className={cn(
                            'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                            !isSelected && 'border-border bg-surface text-text-soft hover:text-text'
                          )}
                          style={isSelected ? {
                            backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                            borderColor: 'var(--accent)',
                            color: 'var(--accent)',
                          } : undefined}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {documentTags.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {documentTags.map((tag) => {
                      const isSelected = selectedTag === tag;
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            setActiveSavedViewId(null);
                            setSelectedTag((current) => (current === tag ? null : tag));
                          }}
                          className={cn(
                            'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                            !isSelected && 'border-border bg-surface text-text-soft hover:text-text'
                          )}
                          style={isSelected ? {
                            backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                            borderColor: 'var(--accent)',
                            color: 'var(--accent)',
                          } : undefined}
                        >
                          #{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {visibleDocuments.length > 0 ? (
              <section>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-soft">
                  Workspace documents
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {visibleDocuments.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      workspaceId={workspaceId}
                      onDelete={() => handleDeleteDocument(doc)}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <EmptyState
                icon={<FileText className="h-8 w-8" />}
                title="No documents match this view"
                description="Try a different saved view or clear the current filters."
                action={{
                  label: 'Clear filters',
                  onClick: clearFilters,
                }}
              />
            )}
          </div>
        )}
      </div>

      {showUploadModal && (
        <DocumentUploadModal
          workspaceId={workspaceId}
          onClose={() => setShowUploadModal(false)}
          onUploaded={(documentId) => {
            setShowUploadModal(false);
            if (documentId) {
              router.push(`/workspaces/${workspaceId}/documents/${documentId}`);
            } else {
              void fetchData();
            }
          }}
        />
      )}
    </div>
  );
}

interface DocumentCardProps {
  document: Document;
  workspaceId: string;
  onDelete: () => void;
}

function DocumentThumbnail({ document: doc }: { document: Document }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(() => documentThumbnailCache.get(doc.id) || null);
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjs.PDFDocumentLoadingTask | null = null;

    async function loadThumbnail() {
      if (!isVisible) return;
      if (doc.privacy_mode || !doc.storage_path || doc.storage_path === 'local') {
        setThumbnail(null);
        return;
      }

      const cached = documentThumbnailCache.get(doc.id);
      if (cached) {
        setThumbnail(cached);
        return;
      }

      setLoading(true);
      try {
        loadingTask = pdfjs.getDocument({
          url: `/api/documents/${doc.id}/file`,
          disableRange: true,
          disableStream: true,
        });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = (containerRef.current?.clientWidth ?? 320) * (window.devicePixelRatio || 1);
        const scale = Math.min(2.0, Math.max(0.6, targetWidth / baseViewport.width));
        const viewport = page.getViewport({ scale });

        const canvas = window.document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        documentThumbnailCache.set(doc.id, dataUrl);
        if (!cancelled) setThumbnail(dataUrl);
        pdf.destroy();
      } catch {
        if (!cancelled) setThumbnail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadThumbnail();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [doc.id, doc.privacy_mode, doc.storage_path, isVisible]);

  return (
    <div
      ref={containerRef}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-scholar-lg border border-border bg-surface-alt"
    >
      {thumbnail ? (
        <Image
          src={thumbnail}
          alt={doc.title}
          width={400}
          height={300}
          unoptimized
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-text-soft">
          {loading ? <Spinner size="sm" /> : <FileText className="h-6 w-6" />}
        </div>
      )}
    </div>
  );
}

function DocumentCard({ document: doc, workspaceId, onDelete }: DocumentCardProps) {
  const t = useTranslations('documents.types');
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
      showSuccess('Queued for indexing', 'We will retry processing in the background.');
    } catch (error) {
      console.warn('enqueue-document-ingestion failed:', error);
    } finally {
      setShowMenu(false);
    }
  };

  return (
    <Card
      className="relative group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-scholar"
      padding="none"
    >
      <Link href={`/workspaces/${workspaceId}/documents/${doc.id}`} className="block" data-tour="workspace-document-card">
        <DocumentThumbnail document={doc} />

        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {doc.document_type && <Badge size="sm">{t(doc.document_type)}</Badge>}
            <Badge
              size="sm"
              variant="default"
              style={{
                backgroundColor: STATUS_COLORS[doc.processing_status].bg,
                color: STATUS_COLORS[doc.processing_status].color,
              }}
            >
              {isProcessing && <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
              {doc.processing_status}
            </Badge>
          </div>

          <h3 className="line-clamp-2 font-semibold text-text">{doc.title}</h3>

          {doc.document_tags && doc.document_tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {doc.document_tags.slice(0, 3).map((tag) => (
                <Badge key={tag} size="sm" variant="default">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-2">
            <p className="text-xs text-text-soft">
              {doc.page_count ? `${doc.page_count} pages • ` : ''}
              {doc.file_size_bytes ? formatFileSize(doc.file_size_bytes) : ''}
            </p>
            <p className="text-xs text-text-soft">{formatRelativeTime(doc.updated_at)}</p>
          </div>
        </div>
      </Link>

      <div className={cn('absolute right-3 top-3', showMenu && 'z-[100]')}>
        <button
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="rounded-lg bg-black/50 p-2 shadow-sm transition-all hover:bg-black/70"
        >
          <MoreVertical className="h-5 w-5 text-white" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-[99]" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 z-[100] mt-1 w-48 overflow-hidden rounded-scholar border border-border bg-surface shadow-scholar-lg animate-fade-in">
              <Link
                href={`/workspaces/${workspaceId}/documents/${doc.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-text transition-colors hover:bg-surface-alt"
                onClick={() => setShowMenu(false)}
              >
                <Eye className="h-4 w-4" />
                {tCommon('open')}
              </Link>

              <button
                onClick={(event) => {
                  event.preventDefault();
                  setShowMenu(false);
                  setShowShareModal(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text transition-colors hover:bg-surface-alt"
              >
                <Share2 className="h-4 w-4" />
                {tCommon('share')}
              </button>

              {canRetryIndexing && (
                <button
                  onClick={(event) => {
                    event.preventDefault();
                    void handleRetryIndexing();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text transition-colors hover:bg-surface-alt"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Retry indexing
                </button>
              )}

              <hr className="border-border" />
              <button
                onClick={(event) => {
                  event.preventDefault();
                  setShowMenu(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-error transition-colors hover:bg-error/10"
              >
                <Trash2 className="h-4 w-4" />
                {tCommon('delete')}
              </button>
            </div>
          </>
        )}
      </div>

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
