import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { PublicSourceViewerClient } from './PublicSourceViewerClient';

type PageProps = {
  params: Promise<{
    sourceId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseTapToProof(searchParams: Record<string, string | string[] | undefined>) {
  const pageStr = readSearchParam(searchParams, 'page');
  const page = pageStr ? Number.parseInt(pageStr, 10) : NaN;
  if (!pageStr || Number.isNaN(page) || page < 1) return undefined;

  const quote = readSearchParam(searchParams, 'quote') || undefined;
  const bboxStr = readSearchParam(searchParams, 'bbox');
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

export default async function PublicSourceViewerPage({ params, searchParams }: PageProps) {
  const [{ sourceId }, resolvedSearchParams, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('sourceViewer'),
  ]);

  const normalizedSourceId = String(sourceId || '').trim();
  const titleKey = SOURCE_TITLES[normalizedSourceId];
  const requestedTitle = readSearchParam(resolvedSearchParams, 'title');
  const title = requestedTitle || (titleKey ? t(titleKey) : t('defaultTitle'));
  const pdfUrl = `/api/public-source/${encodeURIComponent(normalizedSourceId)}/file`;
  const tapToProof = parseTapToProof(resolvedSearchParams);

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
          <PublicSourceViewerClient pdfUrl={pdfUrl} tapToProof={tapToProof} />
        </div>
      </div>
    </div>
  );
}
