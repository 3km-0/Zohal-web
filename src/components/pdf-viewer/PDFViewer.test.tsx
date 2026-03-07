import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const pdfMocks = vi.hoisted(() => {
  const mockRenderTask = {
    promise: Promise.resolve(),
    cancel: vi.fn(),
  };

  const mockPage = {
    getViewport: vi.fn(() => ({
      width: 600,
      height: 800,
      convertToViewportPoint: (x: number, y: number) => [x, y],
    })),
    render: vi.fn(() => mockRenderTask),
  };

  const mockPdfDocument = {
    numPages: 1,
    getPage: vi.fn(async () => mockPage),
    destroy: vi.fn(),
  };

  const mockLoadingTask = {
    promise: Promise.resolve(mockPdfDocument),
    destroy: vi.fn(),
  };

  return {
    mockGetDocument: vi.fn(() => mockLoadingTask),
  };
});

vi.mock('pdfjs-dist', () => ({
  version: 'test-version',
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: pdfMocks.mockGetDocument,
}));

vi.mock('./PDFToolbar', () => ({
  PDFToolbar: () => <div data-testid="pdf-toolbar" />,
}));

vi.mock('./PDFThumbnails', () => ({
  PDFThumbnails: () => <div data-testid="pdf-thumbnails" />,
}));

vi.mock('@/components/ui', () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

import { PDFViewer } from './PDFViewer';

describe('PDFViewer RTL isolation', () => {
  let contextSpy: ReturnType<typeof vi.spyOn>;
  let mockCanvasContext: {
    fillStyle: string;
    fillRect: ReturnType<typeof vi.fn>;
    direction: CanvasDirection;
  };

  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  beforeEach(() => {
    document.documentElement.setAttribute('dir', 'rtl');

    mockCanvasContext = {
      fillStyle: '',
      fillRect: vi.fn(),
      direction: 'inherit',
    };

    contextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => mockCanvasContext as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    contextSpy.mockRestore();
    document.documentElement.setAttribute('dir', 'ltr');
    vi.clearAllMocks();
  });

  it('forces the PDF render surface to stay LTR inside an RTL app shell', async () => {
    render(<PDFViewer url="/documents/test.pdf" />);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-render-surface')).toHaveAttribute('dir', 'ltr');
    });

    await waitFor(() => {
      expect(screen.getByTestId('pdf-canvas-1')).toHaveAttribute('dir', 'ltr');
    });

    expect(mockCanvasContext.direction).toBe('ltr');
    expect(pdfMocks.mockGetDocument).toHaveBeenCalledWith({
      url: '/documents/test.pdf',
      disableRange: true,
      disableStream: true,
    });
  });
});
