'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { cn } from '@/lib/utils';

interface PDFThumbnailsProps {
  pdf: PDFDocumentProxy;
  currentPage: number;
  onPageSelect: (page: number) => void;
}

export function PDFThumbnails({ pdf, currentPage, onPageSelect }: PDFThumbnailsProps) {
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());

  // Generate thumbnails for visible pages
  useEffect(() => {
    async function generateThumbnails() {
      const newThumbnails = new Map<number, string>();

      for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.2 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;

          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;

          newThumbnails.set(i, canvas.toDataURL());
        } catch (error) {
          console.error(`Error generating thumbnail for page ${i}:`, error);
        }
      }

      setThumbnails(newThumbnails);
    }

    generateThumbnails();
  }, [pdf]);

  return (
    <div className="w-48 border-r border-border bg-surface overflow-auto p-3">
      <div className="space-y-3">
        {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((pageNum) => (
          <button
            key={pageNum}
            onClick={() => onPageSelect(pageNum)}
            className={cn(
              'w-full p-2 rounded-scholar border transition-all hover:-translate-y-0.5',
              currentPage === pageNum
                ? 'border-accent bg-accent/5 shadow-sm'
                : 'border-border hover:border-accent/50'
            )}
          >
            {thumbnails.has(pageNum) ? (
              <Image
                src={thumbnails.get(pageNum)!}
                alt={`Page ${pageNum}`}
                width={160}
                height={213}
                unoptimized
                className="w-full rounded-sm bg-white shadow-sm"
              />
            ) : (
              <div className="aspect-[3/4] bg-surface-alt rounded-sm flex items-center justify-center">
                <span className="text-xs text-text-soft">Loading...</span>
              </div>
            )}
            <p
              className={cn(
                'text-xs mt-2',
                currentPage === pageNum ? 'text-accent font-medium' : 'text-text-soft'
              )}
            >
              Page {pageNum}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

