'use client';

import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Sidebar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface PDFToolbarProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  showThumbnails: boolean;
  onPageChange: (page: number) => void;
  onZoomChange: (scale: number) => void;
  onToggleThumbnails: () => void;
}

export function PDFToolbar({
  currentPage,
  totalPages,
  scale,
  showThumbnails,
  onPageChange,
  onZoomChange,
  onToggleThumbnails,
}: PDFToolbarProps) {
  const [pageInput, setPageInput] = useState(currentPage.toString());

  useEffect(() => {
    if (document.activeElement?.tagName !== 'INPUT') {
      setPageInput(currentPage.toString());
    }
  }, [currentPage]);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputBlur = () => {
    const page = parseInt(pageInput, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePageInputBlur();
    }
  };

  const zoomPercentage = Math.round(scale * 100);

  return (
    <>
      <div className="flex items-center justify-center gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded-lg p-2 transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
          title="Previous page"
        >
          <ChevronLeft className="h-5 w-5 text-text-soft rtl-flip" />
        </button>

        <div className="flex min-w-[132px] items-center justify-center gap-2 rounded-full border border-border bg-surface-alt px-3 py-1.5">
          <input
            type="text"
            value={pageInput}
            onChange={handlePageInputChange}
            onBlur={handlePageInputBlur}
            onKeyDown={handlePageInputKeyDown}
            inputMode="numeric"
            className="w-9 bg-transparent text-center text-sm font-semibold text-text focus:outline-none"
          />
          <span className="text-sm text-text-soft">of {totalPages}</span>
        </div>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="rounded-lg p-2 transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
          title="Next page"
        >
          <ChevronRight className="h-5 w-5 text-text-soft rtl-flip" />
        </button>
      </div>

      <div className="hidden flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2 sm:px-4 md:flex">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleThumbnails}
            className={cn(
              'hidden rounded-lg p-2 transition-colors md:inline-flex',
              showThumbnails
                ? 'bg-accent/10 text-accent'
                : 'hover:bg-surface-alt text-text-soft'
            )}
            title="Toggle thumbnails"
          >
            <Sidebar className="w-5 h-5" />
          </button>

          <div className="mx-1 hidden h-6 w-px bg-border md:block" />

          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-2 rounded-lg hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Previous page"
          >
            <ChevronLeft className="w-5 h-5 text-text-soft rtl-flip" />
          </button>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={pageInput}
              onChange={handlePageInputChange}
              onBlur={handlePageInputBlur}
              onKeyDown={handlePageInputKeyDown}
              inputMode="numeric"
              className="w-12 rounded-scholar-sm border border-border bg-surface-alt px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <span className="text-sm text-text-soft">of {totalPages}</span>
          </div>

          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-2 rounded-lg hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Next page"
          >
            <ChevronRight className="w-5 h-5 text-text-soft rtl-flip" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onZoomChange(scale - 0.25)}
            disabled={scale <= 0.5}
            className="p-2 rounded-lg hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-5 h-5 text-text-soft" />
          </button>

          <span className="w-16 text-center text-sm text-text-soft">{zoomPercentage}%</span>

          <button
            type="button"
            onClick={() => onZoomChange(scale + 0.25)}
            disabled={scale >= 3}
            className="p-2 rounded-lg hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onZoomChange(1)}
            className="px-3 py-1.5 text-sm rounded-lg hover:bg-surface-alt text-text-soft transition-colors"
          >
            Fit
          </button>
        </div>
      </div>
    </>
  );
}
