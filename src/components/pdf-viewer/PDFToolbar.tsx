'use client';

import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Sidebar,
  Download,
  Maximize,
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useState } from 'react';

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

  // Update input when page changes externally
  if (pageInput !== currentPage.toString() && document.activeElement?.tagName !== 'INPUT') {
    setPageInput(currentPage.toString());
  }

  const zoomPercentage = Math.round(scale * 100);

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
      {/* Left: Thumbnails toggle & Page navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleThumbnails}
          className={cn(
            'p-2 rounded-lg transition-colors',
            showThumbnails
              ? 'bg-accent/10 text-accent'
              : 'hover:bg-surface-alt text-text-soft'
          )}
          title="Toggle thumbnails"
        >
          <Sidebar className="w-5 h-5" />
        </button>

        <div className="h-6 w-px bg-border mx-1" />

        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-2 rounded-lg hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-5 h-5 text-text-soft" />
        </button>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={pageInput}
            onChange={handlePageInputChange}
            onBlur={handlePageInputBlur}
            onKeyDown={handlePageInputKeyDown}
            className="w-12 px-2 py-1 text-center text-sm bg-surface-alt border border-border rounded-scholar-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-sm text-text-soft">of {totalPages}</span>
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-2 rounded-lg hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-5 h-5 text-text-soft" />
        </button>
      </div>

      {/* Center: Zoom controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onZoomChange(scale - 0.25)}
          disabled={scale <= 0.5}
          className="p-2 rounded-lg hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-5 h-5 text-text-soft" />
        </button>

        <span className="w-16 text-center text-sm text-text-soft">{zoomPercentage}%</span>

        <button
          onClick={() => onZoomChange(scale + 0.25)}
          disabled={scale >= 3}
          className="p-2 rounded-lg hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-5 h-5 text-text-soft" />
        </button>
      </div>

      {/* Right: Additional actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onZoomChange(1)}
          className="px-3 py-1.5 text-sm rounded-lg hover:bg-surface-alt text-text-soft transition-colors"
        >
          Fit
        </button>
      </div>
    </div>
  );
}

