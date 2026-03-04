'use client';

import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
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

  return (
    <aside className="w-[32rem] max-w-[52vw] min-w-[26rem] border-l border-border bg-surface flex flex-col h-full">
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className={mode === 'chat' ? 'h-full' : 'hidden h-full'}>
          <AIPanel
            documentId={documentId}
            workspaceId={workspaceId}
            selectedText={selectedText}
            currentPage={currentPage}
            onClose={onClose}
            documentType={documentType}
            onOpenAnalysis={() => onModeChange('analysis')}
          />
        </div>
        {mode === 'analysis' && (
          <div className="h-full flex flex-col">
            <div className="border-b border-border px-4 py-3 flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onModeChange('chat')}>
                <ArrowLeft className="w-4 h-4 rtl-flip" />
                {t('backToAI')}
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t('close')}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ContractAnalysisPane embedded />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
