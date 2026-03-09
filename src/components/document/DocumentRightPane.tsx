'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { AIPanel } from '@/components/ai/AIPanel';
import { ContractAnalysisPane } from '@/components/analysis/ContractAnalysisPane';
import type { DocumentType } from '@/types/database';
import type { RightPaneMode } from '@/types/analysis-runs';

interface DocumentRightPaneProps {
  documentId: string;
  workspaceId: string;
  selectedText: string;
  currentPage: number;
  documentType?: DocumentType;
  mode: RightPaneMode;
  onModeChange: (mode: RightPaneMode) => void;
  onClose: () => void;
}

export function DocumentRightPane({
  documentId,
  workspaceId,
  selectedText,
  currentPage,
  documentType,
  mode,
  onModeChange,
  onClose,
}: DocumentRightPaneProps) {
  const t = useTranslations('aiPane');
  const [showHistoryOverlay, setShowHistoryOverlay] = useState(false);
  const [requestedRunId, setRequestedRunId] = useState<string | null>(null);

  const openHistory = () => {
    onModeChange('chat');
    setShowHistoryOverlay(true);
  };

  const openAsk = () => {
    onModeChange('chat');
    setShowHistoryOverlay(false);
  };

  const openRun = (runId?: string) => {
    setRequestedRunId(runId ?? null);
    setShowHistoryOverlay(false);
    onModeChange('analysis');
  };

  return (
    <aside className="fixed inset-0 z-20 flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-surface md:static md:z-auto md:h-full md:w-[32rem] md:min-w-[26rem] md:max-w-[52vw] md:border-l md:border-border">
      <div className="shrink-0 border-b border-border bg-surface-alt px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="truncate text-sm font-semibold text-text">{t('title')}</span>
            </div>
            <p className="mt-1 text-xs text-text-soft">{t('shellSubtitle')}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
            {t('close')}
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={openHistory}>
            <Clock className="h-4 w-4" />
            {t('history')}
          </Button>
          <Button
            variant={mode === 'chat' && !showHistoryOverlay ? 'secondary' : 'ghost'}
            size="sm"
            onClick={openAsk}
          >
            {t('ask')}
          </Button>
          <Button
            variant={mode === 'analysis' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => openRun()}
          >
            {t('run')}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:overflow-hidden">
        <div className={mode === 'chat' ? 'h-full' : 'hidden h-full'}>
          <AIPanel
            documentId={documentId}
            workspaceId={workspaceId}
            selectedText={selectedText}
            currentPage={currentPage}
            onClose={onClose}
            documentType={documentType}
            onOpenAnalysis={openRun}
            showHeader={false}
            historyOverlayOpen={showHistoryOverlay}
            onHistoryOverlayChange={setShowHistoryOverlay}
          />
        </div>
        {mode === 'analysis' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ContractAnalysisPane embedded requestedRunId={requestedRunId} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
