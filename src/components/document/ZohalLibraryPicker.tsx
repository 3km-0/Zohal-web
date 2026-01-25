'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, FileText, Download, AlertCircle, Search, Library } from 'lucide-react';
import { Button, Card, Spinner, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

type LibraryItem = {
  id: string;
  title: string;
  url: string;
  description?: string | null;
  source?: string | null;
  region?: string | null;
  tags?: string[] | null;
};

interface ZohalLibraryPickerProps {
  onClose: () => void;
  onSelectFile: (file: File) => void;
}

export function ZohalLibraryPicker({ onClose, onSelectFile }: ZohalLibraryPickerProps) {
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('zohalLibrary');
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.title} ${it.description || ''} ${(it.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('zohal-library-list', { body: {} });
      if (error) throw error;

      const list = Array.isArray((data as any)?.items) ? ((data as any).items as any[]) : [];
      const normalized: LibraryItem[] = list
        .map((raw) => ({
          id: String(raw?.id || raw?.slug || raw?.key || raw?.title || '').trim(),
          title: String(raw?.title || raw?.name || raw?.id || '').trim(),
          url: String(raw?.url || raw?.download_url || raw?.href || '').trim(),
          description: raw?.description ? String(raw.description) : null,
          source: raw?.source ? String(raw.source) : null,
          region: raw?.region ? String(raw.region) : null,
          tags: Array.isArray(raw?.tags) ? (raw.tags as any[]).map((x) => String(x)) : null,
        }))
        .filter((it) => !!it.id && !!it.title && !!it.url);

      setItems(normalized);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [supabase, t]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadAndSelect = async (it: LibraryItem) => {
    setDownloadingId(it.id);
    setError(null);
    try {
      const res = await fetch(it.url);
      if (!res.ok) throw new Error(`${t('errors.downloadFailed')} (${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], `${it.title}.pdf`, { type: 'application/pdf' });
      onSelectFile(file);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.downloadFailed'));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Card className="w-full max-w-3xl max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Library className="w-5 h-5 text-text-soft" />
            <div className="text-base font-semibold text-text">{t('title')}</div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-alt transition-colors"
            aria-label={t('close')}
          >
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-text-soft" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} />
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3">
              <AlertCircle className="w-4 h-4 text-error mt-0.5" />
              <div className="text-sm text-error">{error}</div>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner size="lg" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-text-soft py-10 text-center">{t('empty')}</div>
          ) : (
            <div className="max-h-[55vh] overflow-auto space-y-2 pr-1">
              {filtered.map((it) => (
                <div
                  key={it.id}
                  className={cn(
                    'flex items-start justify-between gap-3 p-3 rounded-scholar border border-border bg-surface-alt',
                    downloadingId === it.id && 'opacity-70'
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-text-soft" />
                      <div className="text-sm font-semibold text-text truncate">{it.title}</div>
                    </div>
                    {it.description ? (
                      <div className="mt-1 text-xs text-text-soft line-clamp-2">{it.description}</div>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => downloadAndSelect(it)}
                    disabled={downloadingId !== null}
                  >
                    {downloadingId === it.id ? <Spinner size="sm" /> : <Download className="w-4 h-4" />}
                    {t('import')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

