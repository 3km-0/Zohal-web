'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, CheckCircle, Clock, FileText, RefreshCw, Sparkles, X, Zap } from 'lucide-react';
import { Button, ScholarActionMenu, ScholarTabs, type ScholarActionMenuItem, type ScholarTab } from '@/components/ui';
import { AIPanel } from '@/components/ai/AIPanel';
import { ContractAnalysisPane } from '@/components/analysis/ContractAnalysisPane';
import type { DocumentType } from '@/types/database';
import type { RightPaneMode } from '@/types/analysis-runs';

type PaneTab = 'history' | 'ask' | 'run';

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
  mode,
  onModeChange,
  onClose,
}: DocumentRightPaneProps) {
  const t = useTranslations('aiPane');
  const [analysisInitialView, setAnalysisInitialView] = useState<'results' | 'run'>('results');
  const [paneTab, setPaneTab] = useState<PaneTab>(mode === 'analysis' ? 'run' : 'ask');

  useEffect(() => {
    if (!selectedText.trim()) return;
    setPaneTab('ask');
  }, [selectedText]);

  const tabs = useMemo<ScholarTab[]>(() => {
    return [
      { id: 'history', label: t('history'), icon: <Clock className="h-4 w-4" /> },
      { id: 'ask', label: t('ask'), icon: <Sparkles className="h-4 w-4" /> },
      { id: 'run', label: t('run'), icon: <FileText className="h-4 w-4" /> },
    ];
  }, [t]);

  const handleTabChange = (tabId: string) => {
    const nextTab = tabId as PaneTab;
    setPaneTab(nextTab);

    if (nextTab === 'history' || nextTab === 'ask') {
      onModeChange('chat');
      return;
    }

    setAnalysisInitialView('results');
    onModeChange('analysis');
  };

  const triggerAnalysisAction = useCallback(
    (action: 'new-run' | 'generate-report' | 'export-calendar' | 'finalize') => {
      setPaneTab('run');
      setAnalysisInitialView(action === 'new-run' ? 'run' : 'results');
      onModeChange('analysis');

      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(`zohal:analysis:${action}`));
      }, 50);
    },
    [onModeChange]
  );

  const actionItems = useMemo<ScholarActionMenuItem[]>(
    () => [
      {
        label: t('actionItems.newRun'),
        icon: <RefreshCw className="h-4 w-4" />,
        onClick: () => triggerAnalysisAction('new-run'),
      },
      { type: 'divider' },
      {
        label: t('actionItems.generateReport'),
        icon: <FileText className="h-4 w-4" />,
        onClick: () => triggerAnalysisAction('generate-report'),
      },
      {
        label: t('actionItems.exportCalendar'),
        icon: <Calendar className="h-4 w-4" />,
        onClick: () => triggerAnalysisAction('export-calendar'),
      },
      {
        label: t('actionItems.finalize'),
        icon: <CheckCircle className="h-4 w-4" />,
        onClick: () => triggerAnalysisAction('finalize'),
      },
    ],
    [t, triggerAnalysisAction]
  );

  return (
    <aside className="fixed inset-0 z-20 flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-surface md:static md:z-auto md:h-full md:w-[32rem] md:min-w-[26rem] md:max-w-[52vw] md:border-l md:border-border">
      <div className="flex min-h-0 flex-1 flex-col md:overflow-hidden">
        <div className="shrink-0 border-b border-border bg-surface-alt px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">{t('title')}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
              {t('close')}
            </Button>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ScholarTabs tabs={tabs} activeTab={paneTab} onTabChange={handleTabChange} />
              </div>
              <ScholarActionMenu
                icon={<Zap className="h-4 w-4" />}
                label={t('actions')}
                items={actionItems}
              />
            </div>
          </div>
        </div>

        <div className={mode === 'chat' ? 'h-full' : 'hidden h-full'}>
          <AIPanel
            documentId={documentId}
            workspaceId={workspaceId}
            selectedText={selectedText}
            currentPage={currentPage}
            activeTab={paneTab === 'history' ? 'history' : 'ask'}
            onConversationLoaded={() => {
              setPaneTab('ask');
              onModeChange('chat');
            }}
          />
        </div>
        {mode === 'analysis' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ContractAnalysisPane embedded initialView={analysisInitialView} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
