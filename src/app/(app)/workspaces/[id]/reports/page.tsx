'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { Button, Card, EmptyState, Spinner, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { FileText, Eye, Trash2, ExternalLink } from 'lucide-react';

type GeneratedReport = {
  id: string;
  workspace_id: string;
  document_id: string;
  title: string;
  subtitle?: string | null;
  template: string;
  output_type: 'download' | 'shareable_link';
  format: 'html' | 'pdf' | 'link';
  storage_bucket?: string | null;
  storage_path?: string | null;
  share_url?: string | null;
  created_at: string;
};

export default function WorkspaceReportsPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('reportsPage');

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('Report');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('list-reports', {
        body: { workspace_id: workspaceId },
      });
      if (error) throw error;
      setReports((data?.reports || []) as GeneratedReport[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [supabase, workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const openReport = useCallback(
    async (report: GeneratedReport) => {
      setPreviewTitle(report.title);
      setPreviewHtml(null);

      try {
        if (report.output_type === 'shareable_link' && report.share_url) {
          setPreviewHtml(`
            <html><body style="font-family:ui-sans-serif,system-ui; padding:16px;">
              <h2>${escapeHtml(report.title)}</h2>
              <p>${escapeHtml(t('shareableLinkNotice'))}</p>
              <p><a href="${report.share_url}" target="_blank" rel="noreferrer">${escapeHtml(t('openShareLink'))}</a></p>
            </body></html>
          `);
          return;
        }

        if (!report.storage_bucket || !report.storage_path) {
          throw new Error('Report file not available');
        }

        const { data, error } = await supabase.storage
          .from(report.storage_bucket)
          .download(report.storage_path);
        if (error) throw error;
        const html = await data.text();
        setPreviewHtml(html);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('errors.openFailed'));
      }
    },
    [supabase]
  );

  const deleteReport = useCallback(
    async (report: GeneratedReport) => {
      if (!confirm(t('confirmDelete', { title: report.title }))) return;
      try {
        const { error } = await supabase.functions.invoke('delete-report', {
          body: { report_id: report.id },
        });
        if (error) throw error;
        setReports((prev) => prev.filter((r) => r.id !== report.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : t('errors.deleteFailed'));
      }
    },
    [supabase]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />
      <WorkspaceTabs workspaceId={workspaceId} active="reports" />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title={t('empty.title')}
            description={t('empty.description')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge size="sm">{r.template}</Badge>
                      <Badge size="sm" variant="default">
                        {r.output_type === 'shareable_link' ? t('badges.link') : t('badges.html')}
                      </Badge>
                    </div>
                    <h3 className="mt-2 font-semibold text-text truncate">{r.title}</h3>
                    <p className="text-xs text-text-soft truncate">{t('documentLabel', { id: r.document_id })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.share_url ? (
                      <a
                        href={r.share_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg hover:bg-surface-alt transition-colors"
                        title="Open share link"
                      >
                        <ExternalLink className="w-4 h-4 text-text-soft" />
                      </a>
                    ) : null}
                    <button
                      onClick={() => openReport(r)}
                      className="p-2 rounded-lg hover:bg-surface-alt transition-colors"
                      title="Open"
                    >
                      <Eye className="w-4 h-4 text-text-soft" />
                    </button>
                    <button
                      onClick={() => deleteReport(r)}
                      className="p-2 rounded-lg hover:bg-error/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-error" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-error/10 border border-error/20 rounded-scholar text-error text-sm">
            {error}
          </div>
        )}
      </div>

      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-5xl h-[80vh] bg-surface border border-border rounded-scholar shadow-scholar overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-alt">
              <div className="font-semibold text-text truncate">{previewTitle}</div>
              <Button variant="secondary" size="sm" onClick={() => setPreviewHtml(null)}>
                Close
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div
                className="prose prose-sm max-w-none text-text"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

