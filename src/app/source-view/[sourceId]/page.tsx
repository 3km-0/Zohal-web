'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PDFViewer } from '@/components/pdf-viewer';

function parseTapToProof(searchParams: ReturnType<typeof useSearchParams>) {
  const pageStr = searchParams.get('page');
  const page = pageStr ? Number.parseInt(pageStr, 10) : NaN;
  if (!pageStr || Number.isNaN(page) || page < 1) return undefined;

  const quote = searchParams.get('quote') || undefined;
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
    const parts = bboxStr.split(',').map((part) => Number.parseFloat(part.trim()));
    if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
      const [x, y, width, height] = parts;
      bbox = { x, y, width, height };
    }
  }

  return { page, quote, bbox };
}

const SOURCE_TITLES: Record<string, string> = {
  'receipt-revenue-review': 'receiptRevenueReviewTitle',
};

export default function PublicSourceViewerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const t = useTranslations('sourceViewer');

  const sourceId = String(params.sourceId || '').trim();
  const titleKey = SOURCE_TITLES[sourceId];
  const title = searchParams.get('title') || (titleKey ? t(titleKey) : t('defaultTitle'));
  const pdfUrl = `/api/public-source/${encodeURIComponent(sourceId)}/file`;
  const tapToProof = useMemo(() => parseTapToProof(searchParams), [searchParams]);

  if (!titleKey) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--text-soft)]">
            {t('kicker')}
          </p>
          <h1 className="font-[family:var(--font-instrument-serif)] text-4xl text-[color:var(--text)]">
            {t('unavailableTitle')}
          </h1>
          <p className="max-w-xl text-base text-[color:var(--text-soft)]">
            {t('unavailableBody')}
          </p>
          <Link
            href="/home"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-sm font-medium text-[color:var(--text)] transition-colors hover:bg-[color:var(--surface-alt)]"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t('backToHome')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-5 shadow-[0_18px_48px_rgba(12,14,24,0.08)] sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--accent)]">
              {t('kicker')}
            </p>
            <h1 className="font-[family:var(--font-instrument-serif)] text-4xl text-[color:var(--text)]">
              {title}
            </h1>
            <p className="max-w-3xl text-sm text-[color:var(--text-soft)] sm:text-base">
              {t('subtitle')}
            </p>
          </div>

          <Link
            href="/home"
            className="inline-flex items-center gap-2 self-start rounded-full border border-[color:var(--border)] bg-[color:var(--surface-alt)] px-4 py-2 text-sm font-medium text-[color:var(--text)] transition-colors hover:bg-[color:var(--surface)]"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t('backToHome')}
          </Link>
        </header>

        <div className="overflow-hidden rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[0_28px_80px_rgba(12,14,24,0.12)]">
          <PDFViewer url={pdfUrl} tapToProof={tapToProof} className="min-h-[78vh]" />
        </div>
      </div>
    </div>
  );
}
