'use client';

import dynamic from 'next/dynamic';

const PDFViewer = dynamic(
  () => import('@/components/pdf-viewer').then((mod) => mod.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[78vh] items-center justify-center text-sm text-[color:var(--text-soft)]">
        Loading source viewer...
      </div>
    ),
  }
);

type TapToProof = {
  page: number;
  quote?: string;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export function PublicSourceViewerClient({
  pdfUrl,
  tapToProof,
}: {
  pdfUrl: string;
  tapToProof?: TapToProof;
}) {
  return <PDFViewer url={pdfUrl} tapToProof={tapToProof} className="min-h-[78vh]" />;
}
