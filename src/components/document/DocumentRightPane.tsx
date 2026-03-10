'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Sparkles, X } from 'lucide-react';
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
  const [analysisInitialView, setAnalysisInitialView] = useState<'results' | 'run'>('results');

  return (
    <aside className="fixed inset-0 z-20 flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-surface md:static md:z-auto md:h-full md:w-[32rem] md:min-w-[26rem] md:max-w-[52vw] md:border-l md:border-border">
      <div className="flex min-h-0 flex-1 flex-col md:overflow-hidden">
        <div className={mode === 'chat' ? 'h-full' : 'hidden h-full'}>
          <AIPanel
            documentId={documentId}
            workspaceId={workspaceId}
            selectedText={selectedText}
            currentPage={currentPage}
            onClose={onClose}
            documentType={documentType}
            onOpenAnalysis={(view = 'run') => {
              setAnalysisInitialView(view);
              onModeChange('analysis');
            }}
          />
        </div>
        {mode === 'analysis' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border bg-surface px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text">{t('documentAnalysis')}</p>
                  <p className="text-xs text-text-soft">{t('analysisCardBody')}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onModeChange('chat')}>
                  <Sparkles className="h-4 w-4" />
                  {t('backToAI')}
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="h-4 w-4" />
                  {t('close')}
                </Button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ContractAnalysisPane embedded initialView={analysisInitialView} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
