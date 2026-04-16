'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Clock3, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { AIPanel } from '@/components/ai/AIPanel';
import { ContractAnalysisPane } from '@/components/analysis/ContractAnalysisPane';
import { DocumentAgentActivityPanel } from '@/components/document/DocumentAgentActivityPanel';
import type { DocumentType } from '@/types/database';
import type { RightPaneMode } from '@/types/analysis-runs';

const MIN_PANE_WIDTH = 280;
const MAX_PANE_WIDTH_VW = 0.75;

interface DocumentRightPaneProps {
  documentId: string;
  workspaceId: string;
  selectedText: string;
  currentPage: number;
  documentType?: DocumentType;
  mode: RightPaneMode;
  onModeChange: (mode: RightPaneMode) => void;
  onClose: () => void;
  width?: number;
  onWidthChange?: (w: number) => void;
}

export function DocumentRightPane({
  documentId,
  workspaceId,
  selectedText,
  currentPage,
  mode,
  onModeChange,
  onClose,
  width,
  onWidthChange,
}: DocumentRightPaneProps) {
  const t = useTranslations('aiPane');
  const topBarItemClass =
    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-text-soft transition-colors hover:bg-surface hover:text-text';
  const [analysisInitialView, setAnalysisInitialView] = useState<'results' | 'run'>('results');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [analysisMenuOpen, setAnalysisMenuOpen] = useState(false);
  const [runConfigOpen, setRunConfigOpen] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const analysisOpen = mode === 'analysis';

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onWidthChange) return;
      e.preventDefault();
      const startWidth = width ?? 512;
      dragStateRef.current = { startX: e.clientX, startWidth };
      setIsDragging(true);

      const isRtl = document.documentElement.dir === 'rtl';

      const onMove = (me: PointerEvent) => {
        if (!dragStateRef.current) return;
        const delta = me.clientX - dragStateRef.current.startX;
        const raw = isRtl
          ? dragStateRef.current.startWidth + delta
          : dragStateRef.current.startWidth - delta;
        const clamped = Math.min(Math.max(raw, MIN_PANE_WIDTH), window.innerWidth * MAX_PANE_WIDTH_VW);
        onWidthChange(clamped);
      };

      const onUp = () => {
        dragStateRef.current = null;
        setIsDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [width, onWidthChange]
  );

  useEffect(() => {
    if (!selectedText.trim()) return;
    onModeChange('chat');
  }, [onModeChange, selectedText]);

  useEffect(() => {
    if (!historyOpen) return;
    setAnalysisMenuOpen(false);
  }, [historyOpen]);

  useEffect(() => {
    if (!analysisOpen && !runConfigOpen) return;
    setAnalysisMenuOpen(false);
  }, [analysisOpen, runConfigOpen]);

  return (
    <aside
      className="fixed inset-0 z-20 flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-surface md:relative md:z-auto md:h-full md:min-w-[17.5rem] md:max-w-[75vw] md:border-s md:border-border"
      style={width !== undefined ? { width: `${width}px` } as React.CSSProperties : undefined}
    >
      <div
        onPointerDown={handleDragStart}
        aria-hidden="true"
        className={[
          'absolute inset-y-0 start-0 z-10 hidden w-2 cursor-col-resize md:flex md:items-center md:justify-center',
          'group select-none touch-none',
          isDragging ? 'opacity-100' : '',
        ].join(' ')}
      >
        <div
          className={[
            'h-10 w-1 rounded-full transition-colors duration-150',
            isDragging ? 'bg-accent' : 'bg-border group-hover:bg-accent/60',
          ].join(' ')}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:overflow-hidden">
        <div className="shrink-0 border-b border-border bg-surface-alt px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">{t('title')}</p>
            </div>
            <button type="button" onClick={() => setHistoryOpen(true)} className={topBarItemClass}>
              {t('history')}
            </button>
            <div className="relative">
              <button
                type="button"
                className={[
                  topBarItemClass,
                  analysisOpen || runConfigOpen ? 'bg-surface text-text' : '',
                ].join(' ')}
                onClick={() => {
                  setAnalysisMenuOpen((prev) => !prev);
                }}
              >
                {t('quickActions.analysis')}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {analysisMenuOpen && (
                <div className="absolute end-0 top-full z-30 mt-2 min-w-[12rem] rounded-2xl border border-border bg-surface p-2 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisMenuOpen(false);
                      setRunConfigOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-alt"
                  >
                    <FileText className="h-4 w-4 text-accent" />
                    {t('quickActions.runAnalysis')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisMenuOpen(false);
                      setAnalysisInitialView('results');
                      onModeChange('analysis');
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-alt"
                  >
                    <Clock3 className="h-4 w-4 text-accent" />
                    {t('quickActions.openAnalysis')}
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="inline-flex items-center rounded-md p-1.5 text-text-soft transition-colors hover:bg-surface hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="h-full">
          <AIPanel
            documentId={documentId}
            workspaceId={workspaceId}
            selectedText={selectedText}
            currentPage={currentPage}
          />
        </div>

        {historyOpen && (
          <div className="absolute inset-0 z-20 flex bg-black/20 backdrop-blur-[1px]">
            <button
              type="button"
              className="hidden flex-1 md:block"
              aria-label={t('close')}
              onClick={() => setHistoryOpen(false)}
            />
            <div className="flex h-full w-full max-w-full flex-col border-s border-border bg-surface shadow-2xl md:ms-auto md:w-[24rem]">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-text">{t('history')}</div>
                  <div className="text-xs text-text-soft">{t('recentActivity')}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(false)}>
                  <X className="h-4 w-4" />
                  {t('close')}
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-3">
                <DocumentAgentActivityPanel
                  documentId={documentId}
                  workspaceId={workspaceId}
                  onSelectConversation={(conversationId) => {
                    setHistoryOpen(false);
                    onModeChange('chat');
                    window.setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent('zohal:agent:select-conversation', { detail: { conversationId } })
                      );
                    }, 50);
                  }}
                  onSelectRun={(runId) => {
                    setHistoryOpen(false);
                    setAnalysisInitialView('results');
                    onModeChange('analysis');
                    window.setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent('zohal:analysis:select-run', { detail: { runId } })
                      );
                    }, 50);
                  }}
                  variant="full"
                />
              </div>
            </div>
          </div>
        )}

        {runConfigOpen && (
          <div className="pointer-events-none absolute inset-x-3 top-[4.25rem] z-20 flex justify-end">
            <div className="pointer-events-auto flex h-[min(34rem,calc(100dvh-8rem))] w-full max-w-[25rem] flex-col overflow-hidden rounded-[1.25rem] border border-border bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-border bg-surface-alt px-4 py-3">
                <div className="text-sm font-semibold text-text">{t('quickActions.runAnalysis')}</div>
                <button
                  type="button"
                  onClick={() => setRunConfigOpen(false)}
                  aria-label={t('close')}
                  className="inline-flex items-center rounded-md p-1.5 text-text-soft transition-colors hover:bg-surface hover:text-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <ContractAnalysisPane
                  embedded
                  initialView="run"
                  presentation="run-config"
                  onRunConfigured={() => {
                    setRunConfigOpen(false);
                    setAnalysisInitialView('results');
                    onModeChange('analysis');
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {analysisOpen && (
          <div className="absolute inset-0 z-10 flex flex-col border-t border-border bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between border-b border-border bg-surface-alt px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-text">{t('documentAnalysis')}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onModeChange('chat')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ContractAnalysisPane embedded initialView={analysisInitialView} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
