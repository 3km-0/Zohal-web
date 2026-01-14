'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, PanelRight, Scale, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Spinner, Badge, Card, CardContent } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { PDFViewer } from '@/components/pdf-viewer';
import { AIPanel } from '@/components/ai/AIPanel';
import { createClient } from '@/lib/supabase/client';
import type { Document, Workspace } from '@/types/database';
import { cn } from '@/lib/utils';
import { notFound } from '@/lib/errors';

export default function DocumentViewerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const documentId = params.docId as string;
  const supabase = createClient();
  const { show, showError } = useToast();

  const [document, setDocument] = useState<Document | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [selectedText, setSelectedText] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  
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

  // Handle text selection for AI features
  const handleTextSelect = useCallback((text: string, pageNumber: number) => {
    if (text.length > 10) {
      // Minimum selection length
      setSelectedText(text);
      setCurrentPage(pageNumber);
      setShowAIPanel(true);
    }
  }, []);

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
                <Badge size="sm">{document.document_type}</Badge>
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
          {document.document_type === 'contract' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                router.push(
                  `/workspaces/${workspaceId}/documents/${documentId}/contract-analysis`
                )
              }
            >
              <Scale className="w-4 h-4" />
              Contract Analysis
            </Button>
          )}
          <Button
            variant={showAIPanel ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowAIPanel(!showAIPanel)}
          >
            <Sparkles className="w-4 h-4" />
            AI Tools
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer */}
        <div className={cn('flex-1 overflow-hidden', showAIPanel && 'border-r border-border')}>
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
                          {document.document_type === 'contract' && (
                            <Button
                              variant="secondary"
                              onClick={() =>
                                router.push(`/workspaces/${workspaceId}/documents/${documentId}/contract-analysis`)
                              }
                            >
                              <Scale className="w-4 h-4" />
                              View contract analysis
                            </Button>
                          )}
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
                    <Badge variant="warning">Processing: {document.processing_status}</Badge>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Panel */}
        {showAIPanel && (
          <AIPanel
            documentId={documentId}
            workspaceId={workspaceId}
            selectedText={selectedText}
            currentPage={currentPage}
            onClose={() => setShowAIPanel(false)}
            documentType={document.document_type || undefined}
          />
        )}
      </div>
    </div>
  );
}

