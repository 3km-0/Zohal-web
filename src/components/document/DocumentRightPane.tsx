'use client';

import { MessageSquare, Scale } from 'lucide-react';
import { Button } from '@/components/ui';
import { AIPanel } from '@/components/ai/AIPanel';
import { ContractAnalysisPane } from '@/components/analysis/ContractAnalysisPane';
import type { DocumentType } from '@/types/database';
import type { RightPaneMode } from '@/types/analysis-runs';
import { cn } from '@/lib/utils';

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
  return (
    <aside className="w-[32rem] max-w-[52vw] min-w-[26rem] border-l border-border bg-surface flex flex-col h-full">
      <div className="border-b border-border px-3 py-2 flex items-center gap-2">
        <div className="flex-1 flex items-center">
          {/* Top-level mode switch: Chat vs Analysis (NOT another peer tab). */}
          <div className="inline-flex items-center rounded-xl border border-border bg-surface-alt p-1">
            <button
              type="button"
              onClick={() => onModeChange('chat')}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                mode === 'chat'
                  ? 'bg-surface text-accent border border-accent/30'
                  : 'text-text-soft hover:text-text'
              )}
              aria-pressed={mode === 'chat'}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </button>
            <button
              type="button"
              onClick={() => onModeChange('analysis')}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                mode === 'analysis'
                  ? 'bg-surface text-accent border border-accent/30'
                  : 'text-text-soft hover:text-text'
              )}
              aria-pressed={mode === 'analysis'}
            >
              <Scale className="w-4 h-4" />
              Analysis
            </button>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'chat' ? (
          <AIPanel
            documentId={documentId}
            workspaceId={workspaceId}
            selectedText={selectedText}
            currentPage={currentPage}
            onClose={onClose}
            documentType={documentType}
            onOpenAnalysis={() => onModeChange('analysis')}
          />
        ) : (
          <ContractAnalysisPane embedded onSwitchToChat={() => onModeChange('chat')} />
        )}
      </div>
    </aside>
  );
}
