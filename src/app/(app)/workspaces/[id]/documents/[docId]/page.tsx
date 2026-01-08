'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, PanelRight, Scale, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Spinner, Badge } from '@/components/ui';
import { PDFViewer } from '@/components/pdf-viewer';
import { AIPanel } from '@/components/ai/AIPanel';
import { createClient } from '@/lib/supabase/client';
import type { Document, Workspace } from '@/types/database';
import { cn } from '@/lib/utils';

export default function DocumentViewerPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const documentId = params.docId as string;
  const supabase = createClient();

  const [document, setDocument] = useState<Document | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [selectedText, setSelectedText] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch document and workspace
  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // Fetch document
      const { data: docData } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docData) {
        setDocument(docData);

        // Get signed URL for PDF
        if (docData.storage_path && docData.storage_path !== 'local') {
          const { data: urlData } = await supabase.storage
            .from('documents')
            .createSignedUrl(docData.storage_path, 3600); // 1 hour expiry

          if (urlData?.signedUrl) {
            setPdfUrl(urlData.signedUrl);
          }
        } else {
          setPdfUrl(null);
        }
      }

      // Fetch workspace
      const { data: wsData } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .single();

      if (wsData) {
        setWorkspace(wsData);
      }

      setLoading(false);
    }

    fetchData();
  }, [supabase, documentId, workspaceId]);

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
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
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

