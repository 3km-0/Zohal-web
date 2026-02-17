'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Scale, CircleHelp } from 'lucide-react';
import Link from 'next/link';
import { Button, Spinner, Badge, Card, CardContent } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { PDFViewer } from '@/components/pdf-viewer';
import { DocumentRightPane } from '@/components/document/DocumentRightPane';
import { createClient } from '@/lib/supabase/client';
import type { Document, Workspace } from '@/types/database';
import type { RightPaneMode } from '@/types/analysis-runs';
import { cn } from '@/lib/utils';
import { mapHttpError, notFound } from '@/lib/errors';
import { useTranslations } from 'next-intl';

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

  const [document, setDocument] = useState<Document | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showRightPane, setShowRightPane] = useState(initialPaneOpen);
  const [rightPaneMode, setRightPaneMode] = useState<RightPaneMode>(initialMode);
  const [selectedText, setSelectedText] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [retrying, setRetrying] = useState(false);

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

  const getAnalysisLabel = useCallback((documentType?: string | null) => {
    switch (documentType) {
      case 'contract':
        return 'Contract Analysis';
      case 'legal_filing':
        return 'Legal Filing Analysis';
      case 'financial_report':
        return 'Financial Report Analysis';
      case 'invoice':
        return 'Invoice Analysis';
      case 'meeting_notes':
        return 'Meeting Notes Analysis';
      default:
        return 'Document Analysis';
    }
  }, []);
  
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
        }
        // Get signed URL for PDF from GCS gateway
        else if (docData.storage_path && docData.storage_path !== 'local') {
          const { data: urlData, error: urlError } = await supabase.functions.invoke(
            'document-download-url',
            {
              body: { document_id: documentId },
            }
          );

          if (urlError) {
            show(notFound('document file'));
          } else if (urlData?.download_url) {
            setPdfUrl(urlData.download_url);
          }
        } else {
          // Document only exists locally on iOS device - show friendly error
          show(notFound('document file'));
          setPdfUrl(null);
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
  }, [supabase, documentId, workspaceId, show, showError]);

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
    setRetrying(true);
    try {
      const { error, response } = await supabase.functions.invoke('enqueue-document-ingestion', {
        body: { document_id: documentId },
      });
      if (error) {
        const json = response ? await response.json().catch(() => null) : null;
        const uiErr = mapHttpError(response?.status ?? 500, json, 'enqueue-document-ingestion');
        show(uiErr);
        return;
      }
      showSuccess('Queued for indexing', 'We’ll retry processing in the background.');
      // Re-fetch doc to update status quickly
      const { data: docData } = await supabase.from('documents').select('*').eq('id', documentId).single();
      if (docData) setDocument(docData);
    } catch (e) {
      showError(e, 'enqueue-document-ingestion');
    } finally {
      setRetrying(false);
    }
  }, [supabase, documentId, show, showSuccess, showError]);

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
        <p className="text-text-soft">Document not found</p>
        <Link href={`/workspaces/${workspaceId}`}>
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4" />
            Back to Workspace
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-3">
          <Link
            href={`/workspaces/${workspaceId}`}
            className="p-2 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-text-soft" />
          </Link>
          <div>
            <h1 className="font-semibold text-text truncate max-w-md">{document.title}</h1>
            <div className="flex items-center gap-2">
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
        </div>

        <div className="flex items-center gap-2">
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
          <Button
            variant={showRightPane && rightPaneMode === 'analysis' ? 'primary' : 'secondary'}
            size="sm"
            data-tour="viewer-contract-analysis"
            onClick={() => {
              if (showRightPane && rightPaneMode === 'analysis') {
                setPaneState(false);
                return;
              }
              setPaneState(true, 'analysis');
            }}
          >
            <Scale className="w-4 h-4" />
            {getAnalysisLabel(document.document_type)}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer */}
        <div
          className={cn('flex-1 overflow-hidden', showRightPane && 'border-r border-border')}
          data-tour="viewer-pdf"
        >
          {pdfUrl ? (
            <PDFViewer
              url={pdfUrl}
              onTextSelect={handleTextSelect}
              onPageChange={setCurrentPage}
              tapToProof={tapToProof}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
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
                            onClick={() => setPaneState(true, 'analysis')}
                          >
                            <Scale className="w-4 h-4" />
                            {getAnalysisLabel(document.document_type)}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center">
                  <p className="text-text-soft mb-2">
                    {document.storage_path === 'local'
                      ? 'This document exists only on the device that imported it (not uploaded to cloud).'
                      : 'PDF not available'}
                  </p>
                  {document.processing_status !== 'completed' && (
                    <div className="space-y-3">
                      <Badge variant="warning">Processing: {document.processing_status}</Badge>
                      {(document.processing_status === 'failed' || document.processing_status === 'pending') && (
                        <div>
                          <Button
                            variant="secondary"
                            onClick={retryIndexing}
                            disabled={retrying}
                          >
                            {retrying ? <Spinner size="sm" /> : null}
                            Retry indexing
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
          />
        )}
      </div>
    </div>
  );
}
