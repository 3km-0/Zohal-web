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
    <aside className="fixed inset-0 z-20 flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-surface md:static md:z-auto md:h-full md:w-[32rem] md:min-w-[26rem] md:max-w-[52vw] md:border-l md:border-border">
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
          <div className="flex h-full min-h-0 flex-col">
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
