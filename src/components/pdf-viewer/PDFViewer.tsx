'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFToolbar } from './PDFToolbar';
import { PDFThumbnails } from './PDFThumbnails';
import { Spinner } from '@/components/ui';

// Set worker path for PDF.js - use unpkg which has all versions
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  onTextSelect?: (text: string, pageNumber: number) => void;
  onPageChange?: (pageNumber: number) => void;
  className?: string;
}

export function PDFViewer({
  url,
  onTextSelect,
  onPageChange,
  className,
}: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    async function loadPDF() {
      try {
        setLoading(true);
        setError(null);

        const loadingTask = pdfjs.getDocument(url);
        const pdfDoc = await loadingTask.promise;

        if (cancelled) return;

        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setLoading(false);
      }
    }

    loadPDF();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Handle page change
  const goToPage = useCallback(
    (page: number) => {
      const newPage = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(newPage);
      onPageChange?.(newPage);

      // Scroll to page
      const pageElement = document.getElementById(`pdf-page-${newPage}`);
      pageElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [totalPages, onPageChange]
  );

  // Handle zoom
  const handleZoom = useCallback((newScale: number) => {
    setScale(Math.max(0.5, Math.min(3, newScale)));
  }, []);

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const text = selection.toString().trim();
      onTextSelect?.(text, currentPage);
    }
  }, [currentPage, onTextSelect]);

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-text-soft">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center">
          <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <p className="text-text font-medium mb-2">Failed to load PDF</p>
          <p className="text-sm text-text-soft">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-surface-alt', className)}>
      {/* Toolbar */}
      <PDFToolbar
        currentPage={currentPage}
        totalPages={totalPages}
        scale={scale}
        showThumbnails={showThumbnails}
        onPageChange={goToPage}
        onZoomChange={handleZoom}
        onToggleThumbnails={() => setShowThumbnails(!showThumbnails)}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails Sidebar */}
        {showThumbnails && pdf && (
          <PDFThumbnails
            pdf={pdf}
            currentPage={currentPage}
            onPageSelect={goToPage}
          />
        )}

        {/* Main PDF View */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto p-4"
          onScroll={(e) => {
            // Update current page based on scroll position
            const container = e.currentTarget;
            const pages = container.querySelectorAll('[id^="pdf-page-"]');
            pages.forEach((page, index) => {
              const rect = page.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              if (
                rect.top <= containerRect.top + 100 &&
                rect.bottom > containerRect.top + 100
              ) {
                const pageNum = index + 1;
                if (pageNum !== currentPage) {
                  setCurrentPage(pageNum);
                  onPageChange?.(pageNum);
                }
              }
            });
          }}
        >
          <div className="flex flex-col items-center gap-4">
            {pdf &&
              Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <PDFPage
                  key={pageNum}
                  pdf={pdf}
                  pageNumber={pageNum}
                  scale={scale}
                  onRendered={() => {
                    setRenderedPages((prev) => new Set(prev).add(pageNum));
                  }}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PDFPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onRendered: () => void;
}

function PDFPage({ pdf, pageNumber, scale, onRendered }: PDFPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      if (!canvasRef.current) return;

      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        // Get the viewport at the specified scale
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) return;

        // Handle high-DPI displays
        const outputScale = window.devicePixelRatio || 1;

        // Set the canvas size in CSS pixels
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // Set the canvas buffer size to account for device pixel ratio
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);

        // Clear canvas and reset transform before rendering
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Scale context to account for high-DPI displays
        context.scale(outputScale, outputScale);

        // Render PDF page to canvas
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;

        if (cancelled) return;

        // Render text layer for selection
        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = '';
          const textContent = await page.getTextContent();

          if (cancelled) return;

          textLayerRef.current.style.height = `${viewport.height}px`;
          textLayerRef.current.style.width = `${viewport.width}px`;

          // Create text layer using PDF.js text layer API
          const textItems = textContent.items as Array<{
            str: string;
            transform: number[];
            width: number;
            height: number;
          }>;

          textItems.forEach((item) => {
            const div = document.createElement('span');
            div.textContent = item.str;
            div.style.position = 'absolute';
            div.style.left = `${item.transform[4] * scale}px`;
            div.style.top = `${viewport.height - item.transform[5] * scale - 10}px`;
            div.style.fontSize = `${Math.abs(item.transform[0]) * scale}px`;
            div.style.fontFamily = 'sans-serif';
            div.style.color = 'transparent';
            div.style.whiteSpace = 'pre';
            textLayerRef.current?.appendChild(div);
          });
        }

        setRendered(true);
        onRendered();
      } catch (error) {
        console.error('Error rendering page:', error);
      }
    }

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale, onRendered]);

  return (
    <div
      id={`pdf-page-${pageNumber}`}
      className="relative bg-white shadow-scholar rounded-scholar overflow-hidden"
    >
      <canvas ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className="absolute top-0 left-0 select-text"
        style={{ pointerEvents: 'auto' }}
      />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-alt">
          <Spinner size="md" />
        </div>
      )}
    </div>
  );
}

