'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CircleHelp, Menu, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button, Spinner, Badge, Card, CardContent, ZohalActionMenu } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { PDFViewer } from '@/components/pdf-viewer';
import { SpreadsheetViewer } from '@/components/document/SpreadsheetViewer';
import { DocumentRightPane } from '@/components/document/DocumentRightPane';
import { createClient } from '@/lib/supabase/client';
import { invokeZohalBackendJson } from '@/lib/zohal-backend';
import type { Document, Workspace } from '@/types/database';
import type { RightPaneMode } from '@/types/analysis-runs';
import { cn } from '@/lib/utils';
import { mapHttpError, notFound } from '@/lib/errors';
import { useTranslations } from 'next-intl';
import { useAppShell } from '@/components/layout/AppShellContext';
import { MoreVertical } from 'lucide-react';

interface DocumentViewerShellProps {
  initialMode?: RightPaneMode;
  initialPaneOpen?: boolean;
}

export default function DocumentViewerShell({
  initialMode = 'chat',
  initialPaneOpen = false,
}: DocumentViewerShellProps = {}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const documentId = params.docId as string;
  const supabase = useMemo(() => createClient(), []);
  const { show, showSuccess, showError } = useToast();
  const tTypes = useTranslations('documents.types');
  const tSidebar = useTranslations('sidebar');
  const tAI = useTranslations('aiPane');
  const tDocViewer = useTranslations('documentViewer');
  const { openMobileSidebar } = useAppShell();

  const [document, setDocument] = useState<Document | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [tabularManifestUrl, setTabularManifestUrl] = useState<string | null>(null);
  const [showRightPane, setShowRightPane] = useState(initialPaneOpen);
  const [rightPaneMode, setRightPaneMode] = useState<RightPaneMode>(initialMode);
  const [selectedText, setSelectedText] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [retrying, setRetrying] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [paneWidth, setPaneWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 512;
    const stored = window.localStorage.getItem('zohal.aiPane.width');
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed) && parsed >= 280 ? parsed : 512;
  });

  const handlePaneWidthChange = useCallback((w: number) => {
    setPaneWidth(w);
    try {
      window.localStorage.setItem('zohal.aiPane.width', String(Math.round(w)));
    } catch {
      // ignore
    }
  }, []);

  const getDocumentTypeLabel = useCallback((documentType?: string | null) => {
    switch (documentType) {
      case 'textbook':
      case 'contract':
      case 'financial_report':
      case 'problem_set':
      case 'lecture_notes':
      case 'paper':
      case 'meeting_notes':
      case 'invoice':
      case 'legal_filing':
      case 'other':
        return tTypes(documentType);
      default:
        return 'Document';
    }
  }, [tTypes]);

  const tapToProof = useMemo(() => {
    const pageStr = searchParams.get('page');
    const page = pageStr ? parseInt(pageStr, 10) : NaN;
    const quote = searchParams.get('quote') || undefined;
    if (!pageStr || Number.isNaN(page) || page < 1) return undefined;
    
    const bboxStr = searchParams.get('bbox');
    let bbox:
      | {
          x: number;
          y: number;
          width: number;
          height: number;
        }
      | undefined;
    if (bboxStr) {
      const parts = bboxStr.split(',').map((p) => parseFloat(p.trim()));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const [x, y, width, height] = parts;
        // Evidence bboxes are expected to be normalized (0..1) in pdf_normalized_v1.
        // Defensive: if we get non-normalized coords (e.g. PDF points), ignore bbox and fall back to quote highlight.
        if (
          x >= 0 && y >= 0 && width > 0 && height > 0 &&
          x <= 1 && y <= 1 && width <= 1 && height <= 1
        ) {
          bbox = { x, y, width, height };
        }
      }
    }
    
    return { page, quote, bbox };
  }, [searchParams]);

  const sourceFormat = useMemo(() => {
    const sourceMetadata = (document?.source_metadata || {}) as Record<string, unknown>;
    const raw = typeof sourceMetadata.source_format === 'string'
      ? sourceMetadata.source_format
      : typeof sourceMetadata.original_extension === 'string'
        ? sourceMetadata.original_extension
        : null;
    const normalized = String(raw || '').trim().toLowerCase();
    if (normalized === 'xlsx' || normalized === 'csv') return normalized;
    return 'pdf';
  }, [document]);

  const tabularProof = useMemo(() => {
    const sheetName = searchParams.get('sheet') || undefined;
    const rangeRef = searchParams.get('range') || undefined;
    const cellRef = searchParams.get('cell') || undefined;
    if (!sheetName && !rangeRef && !cellRef) return undefined;
    return { sheetName, rangeRef, cellRef };
  }, [searchParams]);

  useEffect(() => {
    const pane = searchParams.get('pane');
    if (pane === 'chat' || pane === 'analysis') {
      setRightPaneMode(pane);
      setShowRightPane(true);
    }
  }, [searchParams]);

  const setPaneState = useCallback(
    (open: boolean, mode?: RightPaneMode) => {
      const nextMode = mode ?? rightPaneMode;
      setShowRightPane(open);
      setRightPaneMode(nextMode);

      const params = new URLSearchParams(searchParams.toString());
      if (open) {
        params.set('pane', nextMode);
      } else {
        params.delete('pane');
      }
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, rightPaneMode, router, searchParams]
  );

  // Auto-poll while document is converting/processing
  useEffect(() => {
    const isProcessing =
      document?.processing_status === 'processing' ||
      document?.processing_status === 'pending';
    if (!isProcessing) return;
    const timer = setTimeout(() => setPollCount((c) => c + 1), 5000);
    return () => clearTimeout(timer);
  }, [document?.processing_status, pollCount]);

  // Fetch document and workspace
  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // Fetch document
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError) {
        showError(docError, 'documents');
        setLoading(false);
        return;
      }

      if (docData) {
        setDocument(docData);

        // Privacy Mode: original PDF is device-only; web cannot fetch it.
        if (docData.privacy_mode) {
          setPdfUrl(null);
          setTabularManifestUrl(null);
        }
        // Failed conversion — PDF doesn't exist, don't even try to fetch
        else if (docData.processing_status === 'failed') {
          setPdfUrl(null);
          setTabularManifestUrl(null);
        }
        // Still processing — PDF not ready yet
        else if (docData.processing_status === 'processing' || docData.processing_status === 'pending') {
          setPdfUrl(null);
          setTabularManifestUrl(
            ((docData.source_metadata as Record<string, unknown> | null)?.source_format === 'xlsx' ||
              (docData.source_metadata as Record<string, unknown> | null)?.source_format === 'csv')
              ? `/api/documents/${documentId}/tabular`
              : null
          );
        }
        // Proxy through same-origin to avoid browser CORS failures on signed GCS URLs.
        else if (docData.storage_path && docData.storage_path !== 'local') {
          const sourceMeta = (docData.source_metadata as Record<string, unknown> | null) || {};
          const format = typeof sourceMeta.source_format === 'string'
            ? String(sourceMeta.source_format).toLowerCase()
            : typeof sourceMeta.original_extension === 'string'
              ? String(sourceMeta.original_extension).toLowerCase()
              : 'pdf';
          if (format === 'xlsx' || format === 'csv') {
            setPdfUrl(null);
            setTabularManifestUrl(`/api/documents/${documentId}/tabular`);
          } else {
            setPdfUrl(`/api/documents/${documentId}/file`);
            setTabularManifestUrl(null);
          }
        } else {
          // Document only exists locally on iOS device - show friendly error
          show(notFound('document file'));
          setPdfUrl(null);
          setTabularManifestUrl(null);
        }
      }

      // Fetch workspace
      const { data: wsData, error: wsError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .single();

      if (wsError) {
        showError(wsError, 'workspaces');
      } else if (wsData) {
        setWorkspace(wsData);
      }

      setLoading(false);
    }

    fetchData();
  }, [supabase, documentId, workspaceId, show, showError, pollCount]);

  // Subscribe to document updates so type/status reflects background processing
  // (e.g. classify-document updating document_type from 'other' to 'legal_filing').
  useEffect(() => {
    if (!documentId) return;

    const channel = supabase
      .channel(`document-${documentId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'documents', filter: `id=eq.${documentId}` },
        (payload) => {
          setDocument(payload.new as unknown as Document);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, documentId]);

  // Handle text selection for AI features
  const handleTextSelect = useCallback((text: string, pageNumber: number) => {
    if (text.length > 10) {
      // Minimum selection length
      setSelectedText(text);
      setCurrentPage(pageNumber);
      setPaneState(true, 'chat');
    }
  }, [setPaneState]);

  const retryIndexing = useCallback(async () => {
    if (!document) return;
    setRetrying(true);
    try {
      const sourceMeta = (document as any)?.source_metadata as Record<string, unknown> | undefined;
      const isDocxConversion = typeof sourceMeta?.conversion_method === 'string' &&
        (sourceMeta.conversion_method as string).includes('cloudconvert');

      if (isDocxConversion) {
        try {
          await invokeZohalBackendJson(supabase, '/convert-to-pdf', {
            document_id: documentId,
          });
        } catch (error) {
          show(mapHttpError(500, { message: error instanceof Error ? error.message : String(error) }, 'convert-to-pdf'));
          return;
        }
        showSuccess('Conversion started', 'Your document is being converted. This usually takes under a minute.');
      } else {
        try {
          await invokeZohalBackendJson(supabase, '/ingestion/start', {
            document_id: documentId,
            workspace_id: document.workspace_id,
            user_id: document.user_id,
            source: 'manual_retry',
          });
        } catch (error) {
          show(mapHttpError(500, { message: error instanceof Error ? error.message : String(error) }, 'ingestion/start'));
          return;
        }
        showSuccess('Queued for indexing', 'We’ll retry processing in the background.');
      }

      const { data: docData } = await supabase.from('documents').select('*').eq('id', documentId).single();
      if (docData) setDocument(docData);
    } catch (e) {
      showError(e, 'retry');
    } finally {
      setRetrying(false);
    }
  }, [supabase, documentId, document, show, showSuccess, showError]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-text-soft">{tDocViewer('documentNotFound')}</p>
        <Link href={`/workspaces/${workspaceId}`}>
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4" />
            {tDocViewer('backToProperty')}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border bg-surface px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={openMobileSidebar}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border text-text-soft transition-colors hover:bg-surface-alt md:hidden"
            aria-label={tSidebar('openMenu')}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link
            href={`/workspaces/${workspaceId}`}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:bg-surface-alt"
          >
            <ArrowLeft className="w-5 h-5 text-text-soft" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="max-w-full truncate text-xl font-semibold leading-none text-text sm:max-w-md">{document.title}</h1>
            <div className="mt-1 hidden flex-wrap items-center gap-2 md:flex">
              {document.document_type && (
                <Badge size="sm">{getDocumentTypeLabel(document.document_type)}</Badge>
              )}
              {document.privacy_mode && (
                <Badge size="sm">
                  Privacy Mode
                </Badge>
              )}
              {workspace && (
                <span className="text-xs text-text-soft">{workspace.name}</span>
              )}
            </div>
          </div>

          <div className="hidden shrink-0 items-center justify-end gap-2 md:flex">
            <Button
              variant={showRightPane ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                if (showRightPane) {
                  setPaneState(false);
                  return;
                }
                setPaneState(true, 'chat');
              }}
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden lg:inline">{tAI('title')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('zohal:start-tour', {
                    detail: { tourId: 'viewer', force: true },
                  })
                );
              }}
              aria-label="Take a tour"
              title="Take a tour"
            >
              <CircleHelp className="w-4 h-4" />
              Tour
            </Button>
          </div>
        </div>

      </header>

      {/* Main Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Document Viewer */}
        <div
          className={cn('min-w-0 flex-1 overflow-hidden', showRightPane && 'md:border-r md:border-border')}
          data-tour="viewer-pdf"
        >
          {tabularManifestUrl ? (
            <SpreadsheetViewer
              manifestUrl={tabularManifestUrl}
              highlight={tabularProof}
            />
          ) : pdfUrl ? (
            <PDFViewer
              url={pdfUrl}
              onTextSelect={handleTextSelect}
              onPageChange={setCurrentPage}
              tapToProof={tapToProof}
              mobileToolbarActions={
                <>
                  <Button
                    variant={showRightPane ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      if (showRightPane) {
                        setPaneState(false);
                        return;
                      }
                      setPaneState(true, 'chat');
                    }}
                    className="min-h-[44px]"
                  >
                    <Sparkles className="w-4 h-4" />
                    {tAI('title')}
                  </Button>
                  <ZohalActionMenu
                    compact
                    ariaLabel={tSidebar('openMenu')}
                    icon={<MoreVertical className="w-4 h-4" />}
                    label={tSidebar('openMenu')}
                    items={[
                      {
                        label: 'Tour',
                        icon: <CircleHelp className="w-4 h-4" />,
                        onClick: () => {
                          window.dispatchEvent(
                            new CustomEvent('zohal:start-tour', {
                              detail: { tourId: 'viewer', force: true },
                            })
                          );
                        },
                      },
                    ]}
                  />
                </>
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              {document.privacy_mode ? (
                <Card className="max-w-xl w-full">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-9 w-9 rounded-lg bg-surface-alt flex items-center justify-center">
                        <span className="text-lg">🔒</span>
                      </div>
                      <div className="flex-1">
                        <h2 className="text-lg font-semibold text-text">Privacy Mode document</h2>
                        <p className="mt-1 text-sm text-text-soft">
                          The original PDF stays on the iOS device. This web view can show sanitized analysis and proof
                          links, but cannot display the unredacted PDF.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => setPaneState(true, 'chat')}
                          >
                            <Sparkles className="w-4 h-4" />
                            {tAI('title')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="max-w-xl w-full mx-4">
                  <CardContent className="p-6">
                    {document.processing_status === 'failed' ? (
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 h-9 w-9 rounded-lg bg-error/10 flex items-center justify-center shrink-0">
                          <span className="text-lg">⚠️</span>
                        </div>
                        <div className="flex-1">
                          <h2 className="text-lg font-semibold text-text">Conversion failed</h2>
                          <p className="mt-1 text-sm text-text-soft">
                            {(() => {
                              const meta = (document as any)?.source_metadata as Record<string, unknown> | undefined;
                              const convErr = meta?.conversion_error as string | undefined;
                              if (convErr === 'conversion_timed_out') return 'The conversion timed out. Please try again.';
                              if (convErr) return convErr;
                              return 'We could not convert your document. Please try again or upload it as a PDF.';
                            })()}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button onClick={retryIndexing} disabled={retrying}>
                              {retrying ? <Spinner size="sm" /> : null}
                              Retry conversion
                            </Button>
                            <Button variant="secondary" onClick={() => router.push(`/workspaces/${workspaceId}`)}>
                              {tDocViewer('backToProperty')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : document.processing_status === 'processing' || document.processing_status === 'pending' ? (
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 h-9 w-9 rounded-lg bg-surface-alt flex items-center justify-center shrink-0">
                          <Spinner size="sm" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-text">
                            {sourceFormat === 'pdf' ? 'Converting document…' : 'Processing spreadsheet…'}
                          </h2>
                          <p className="mt-1 text-sm text-text-soft">
                            {sourceFormat === 'pdf'
                              ? 'Your document is being converted to PDF. This usually takes under a minute. Checking automatically…'
                              : 'Your spreadsheet is being parsed into a tabular analysis model. Checking automatically…'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 h-9 w-9 rounded-lg bg-surface-alt flex items-center justify-center shrink-0">
                          <span className="text-lg">📄</span>
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-text">
                            {sourceFormat === 'pdf' ? 'PDF not available' : 'Spreadsheet preview unavailable'}
                          </h2>
                          <p className="mt-1 text-sm text-text-soft">
                            {document.storage_path === 'local'
                              ? 'This document only exists on the iOS device that imported it.'
                              : sourceFormat === 'pdf'
                                ? 'The PDF for this document is not available on the web.'
                                : 'The spreadsheet preview for this document is not available on the web yet.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Right Pane */}
        {showRightPane && (
          <DocumentRightPane
            documentId={documentId}
            workspaceId={workspaceId}
            selectedText={selectedText}
            currentPage={currentPage}
            documentType={document.document_type || undefined}
            mode={rightPaneMode}
            onModeChange={(mode) => setPaneState(true, mode)}
            onClose={() => setPaneState(false)}
            width={paneWidth}
            onWidthChange={handlePaneWidthChange}
          />
        )}
      </div>
    </div>
  );
}
