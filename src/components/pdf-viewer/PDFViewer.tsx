'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { PDFToolbar } from './PDFToolbar';
import { PDFThumbnails } from './PDFThumbnails';
import { Spinner } from '@/components/ui';

// Set worker path for PDF.js - use unpkg which has all versions
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  onTextSelect?: (text: string, pageNumber: number) => void;
  onPageChange?: (pageNumber: number) => void;
  tapToProof?: { page: number; quote?: string; bbox?: { x: number; y: number; width: number; height: number } };
  className?: string;
}

export function PDFViewer({
  url,
  onTextSelect,
  onPageChange,
  tapToProof,
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
  const [highlight, setHighlight] = useState<{ page: number; rect: { left: number; top: number; width: number; height: number } } | null>(null);
  const [proofMessage, setProofMessage] = useState<string | null>(null);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjs.PDFDocumentLoadingTask | null = null;

    async function loadPDF() {
      try {
        setLoading(true);
        setError(null);

        loadingTask = pdfjs.getDocument(url);
        const pdfDoc = await loadingTask.promise;

        if (cancelled) {
          pdfDoc.destroy();
          return;
        }

        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('PDF load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setLoading(false);
      }
    }

    loadPDF();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
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
  
  const normalize = (s: string) =>
    s
      .replace(/…/g, ' ')
      .replace(/\.\.\./g, ' ')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Tap-to-Proof: jump + highlight bbox, else highlight quote
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!tapToProof || !pdf) return;
      const page = Math.max(1, Math.min(tapToProof.page, totalPages || tapToProof.page));
      goToPage(page);
      setProofMessage(null);

      // Clear any previous highlight after page jump.
      setHighlight(null);

      // Wait for scrollIntoView to settle.
      await new Promise((r) => window.setTimeout(r, 250));
      if (cancelled) return;

      if (tapToProof.bbox) {
        const pe = document.getElementById(`pdf-page-${page}`);
        if (!pe) return;
        const rect = pe.getBoundingClientRect();
        // We need page dimensions; take from element size.
        const width = rect.width;
        const height = rect.height;
        const b = tapToProof.bbox;
        setHighlight({
          page,
          rect: {
            left: b.x * width,
            top: b.y * height,
            width: b.width * width,
            height: b.height * height,
          },
        });
        window.setTimeout(() => setHighlight(null), 8000);
        return;
      }

      const quote = tapToProof.quote ? normalize(tapToProof.quote) : '';
      if (!quote || quote.length < 10) return;

      try {
        const pageObj = await pdf.getPage(page);
        const viewport = pageObj.getViewport({ scale });
        const textContent = await pageObj.getTextContent();

        const items = (textContent.items as any[])
          .map((it) => ({
            str: String(it.str || ''),
            width: Number(it.width || 0) * scale,
            height: Number(it.height || 0) * scale,
            transform: it.transform as number[],
          }))
          .filter((it) => it.str.trim().length > 0);

        const quoteShort = normalize(quote).slice(0, 90);
        const quoteWords = quoteShort.split(' ').filter((w) => w.length > 2);

        // Find a run of items that covers a large fraction of words.
        let best: { start: number; end: number; score: number } | null = null;
        for (let i = 0; i < items.length; i++) {
          let acc = '';
          for (let j = i; j < Math.min(items.length, i + 40); j++) {
            acc = `${acc} ${items[j].str}`.trim();
            const accN = normalize(acc);
            if (accN.length < 12) continue;
            let matched = 0;
            for (const w of quoteWords) {
              if (accN.includes(w)) matched++;
            }
            const score = quoteWords.length ? matched / quoteWords.length : 0;
            if (!best || score > best.score) best = { start: i, end: j, score };
            if (score >= 0.85) break;
          }
        }

        if (!best || best.score < 0.45) {
          setProofMessage(`Couldn’t locate quote; jumped to page ${page}.`);
          window.setTimeout(() => setProofMessage(null), 2600);
          return;
        }

        // Union rect in viewport coordinates.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let k = best.start; k <= best.end; k++) {
          const it = items[k];
          const [xPdf, yPdf] = [it.transform[4], it.transform[5]];
          const [xV, yV] = viewport.convertToViewportPoint(xPdf, yPdf);
          const h = it.height || 10;
          const w = it.width || 20;
          // yV is at text baseline; approximate top by subtracting height
          const left = xV;
          const top = yV - h;
          minX = Math.min(minX, left);
          minY = Math.min(minY, top);
          maxX = Math.max(maxX, left + w);
          maxY = Math.max(maxY, top + h);
        }

        if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
        setHighlight({
          page,
          rect: { left: minX, top: minY, width: maxX - minX, height: maxY - minY },
        });
        window.setTimeout(() => setHighlight(null), 8000);
      } catch (e) {
        setProofMessage(`Couldn’t locate quote; jumped to page ${page}.`);
        window.setTimeout(() => setProofMessage(null), 2600);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [tapToProof, pdf, totalPages, goToPage, scale]);

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
          {proofMessage && (
            <div className="sticky top-2 z-20 mx-auto w-fit px-3 py-2 rounded-scholar border border-border bg-surface text-text text-sm shadow-scholar">
              {proofMessage}
            </div>
          )}
          <div className="flex flex-col items-center gap-4">
            {pdf &&
              Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <PDFPage
                  key={`${url}-${pageNum}-${scale}`}
                  pdf={pdf}
                  pageNumber={pageNum}
                  scale={scale}
                  highlightRect={highlight?.page === pageNum ? highlight.rect : null}
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
  highlightRect: { left: number; top: number; width: number; height: number } | null;
}

function PDFPage({ pdf, pageNumber, scale, highlightRect }: PDFPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [status, setStatus] = useState<'loading' | 'rendered' | 'error'>('loading');
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let cancelled = false;
    let page: PDFPageProxy | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        setStatus('loading');

        // Cancel any existing render task
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        // Get the page
        page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        // Get viewport - PDF.js handles rotation internally
        const viewport = page.getViewport({ scale });
        
        // Set dimensions for the container placeholder
        setDimensions({ width: viewport.width, height: viewport.height });

        // Get the 2D context
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) {
          console.error('Could not get canvas context');
          setStatus('error');
          return;
        }

        // Set canvas dimensions directly (no DPI scaling to keep it simple)
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Clear canvas
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Create render task
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          background: 'white',
        };

        renderTaskRef.current = page.render(renderContext);
        
        await renderTaskRef.current.promise;
        
        if (cancelled) return;
        
        setStatus('rendered');
      } catch (err) {
        if (cancelled) return;
        // Ignore cancelled errors
        if (err instanceof Error && err.message.includes('cancelled')) {
          return;
        }
        console.error(`Error rendering page ${pageNumber}:`, err);
        setStatus('error');
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdf, pageNumber, scale]);

  return (
    <div
      id={`pdf-page-${pageNumber}`}
      className="relative bg-white shadow-scholar rounded-scholar overflow-hidden"
      style={{
        minWidth: dimensions.width || 200,
        minHeight: dimensions.height || 280,
      }}
    >
      {highlightRect && status === 'rendered' && (
        <div
          className="absolute z-10 border border-accent/40 bg-accent/15 rounded-scholar-sm pointer-events-none"
          style={{
            left: highlightRect.left,
            top: highlightRect.top,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
        />
      )}
      <canvas 
        ref={canvasRef} 
        className="block"
        style={{ display: status === 'rendered' ? 'block' : 'none' }}
      />
      {status === 'loading' && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-white"
          style={{ width: dimensions.width || '100%', height: dimensions.height || 280 }}
        >
          <Spinner size="md" />
        </div>
      )}
      {status === 'error' && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-surface-alt"
          style={{ width: dimensions.width || '100%', height: dimensions.height || 280 }}
        >
          <div className="text-center p-4">
            <span className="text-2xl mb-2 block">⚠️</span>
            <p className="text-sm text-text-soft">Failed to load page {pageNumber}</p>
          </div>
        </div>
      )}
    </div>
  );
}

