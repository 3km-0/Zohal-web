'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, FileText, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn, formatRelativeTime } from '@/lib/utils';
import { mergeVerificationObjectFallbackRun, toAnalysisRunSummary } from '@/lib/analysis/runs';
import type { AnalysisRunSummary } from '@/types/analysis-runs';

type ConversationSummary = {
  id: string;
  preview: string;
  timestamp: string;
  messageCount: number;
};

type ActivityItem =
  | {
      id: string;
      kind: 'conversation';
      timestamp: string;
      title: string;
      subtitle: string;
      conversationId: string;
    }
  | {
      id: string;
      kind: 'analysis_run';
      timestamp: string;
      title: string;
      subtitle: string;
      runId: string;
      status: AnalysisRunSummary['status'];
    };

interface DocumentAgentActivityPanelProps {
  documentId: string;
  workspaceId: string;
  currentConversationId?: string | null;
  onSelectConversation?: (conversationId: string) => void;
  onSelectRun?: (runId: string) => void;
  variant?: 'full' | 'compact';
  limit?: number;
  title?: string | null;
}

export function DocumentAgentActivityPanel({
  documentId,
  workspaceId,
  currentConversationId = null,
  onSelectConversation,
  onSelectRun,
  variant = 'full',
  limit = 8,
  title = null,
}: DocumentAgentActivityPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const tAi = useTranslations('aiPane');
  const tRun = useTranslations('runAnalysis.runs');
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: explanationRows }, { data: runRows }, { data: verificationObject }] = await Promise.all([
        supabase
          .from('explanations')
          .select('conversation_id, input_text, response_text, created_at')
          .eq('document_id', documentId)
          .not('conversation_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('extraction_runs')
          .select('id, status, created_at, updated_at, input_config, output_summary, action_id')
          .eq('workspace_id', workspaceId)
          .eq('document_id', documentId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('verification_objects')
          .select('id, title, state, created_at, updated_at, current_version_id')
          .eq('document_id', documentId)
          .eq('object_type', 'contract_analysis')
          .maybeSingle(),
      ]);

      const conversationsMap = new Map<string, ConversationSummary>();
      for (const item of explanationRows ?? []) {
        const conversationId = String(item.conversation_id || '').trim();
        if (!conversationId) continue;
        if (!conversationsMap.has(conversationId)) {
          conversationsMap.set(conversationId, {
            id: conversationId,
            preview:
              (item.input_text as string | null)?.trim() ||
              (item.response_text as string | null)?.trim() ||
              tAi('conversationFallback'),
            timestamp: String(item.created_at || new Date().toISOString()),
            messageCount: 1,
          });
        } else {
          const existing = conversationsMap.get(conversationId)!;
          existing.messageCount += 1;
        }
      }

      const actionIds = Array.from(
        new Set(
          (runRows ?? [])
            .map((row) => (typeof row.action_id === 'string' ? row.action_id : null))
            .filter((value): value is string => Boolean(value))
        )
      );

      const actionsById = new Map<string, { id: string; status: string | null }>();
      if (actionIds.length > 0) {
        const { data: actions } = await supabase
          .from('actions')
          .select('id, status')
          .in('id', actionIds);
        for (const action of actions ?? []) {
          actionsById.set(String(action.id), {
            id: String(action.id),
            status: typeof action.status === 'string' ? action.status : null,
          });
        }
      }

      const conversationItems: ActivityItem[] = Array.from(conversationsMap.values()).map((item) => ({
        id: `conversation:${item.id}`,
        kind: 'conversation',
        timestamp: item.timestamp,
        title: item.preview,
        subtitle: `${tAi('messageCount', { count: item.messageCount })} • ${formatRelativeTime(item.timestamp)}`,
        conversationId: item.id,
      }));

      const normalizedRuns = mergeVerificationObjectFallbackRun(
        (runRows ?? []).map((row) => {
          const summary = toAnalysisRunSummary(
            row as never,
            (row.action_id ? actionsById.get(String(row.action_id)) : null) as never
          );
          return summary;
        }),
        verificationObject as never
      );

      const runItems: ActivityItem[] = normalizedRuns.map((summary) => {
        return {
          id: `analysis_run:${summary.runId}`,
          kind: 'analysis_run',
          timestamp: summary.createdAt,
          title: summary.playbookLabel || tRun('defaultLabel'),
          subtitle: `${summary.scope === 'bundle' ? tRun('scopeDocset') : tRun('scopeSingle')} • ${summary.status}`,
          runId: summary.runId,
          status: summary.status,
        };
      });

      const mergedItems = [...conversationItems, ...runItems]
        .sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, limit);

      setItems(mergedItems);
    } finally {
      setLoading(false);
    }
  }, [documentId, limit, supabase, tAi, tRun, workspaceId]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center p-4 text-sm text-text-soft', variant === 'full' ? 'h-full' : 'min-h-[6rem]')}>
        {tAi('loadingActivity')}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-alt/50 px-6 text-center', variant === 'full' ? 'h-full' : 'py-8')}>
        <Clock className="mb-3 h-10 w-10 text-text-soft" />
        <p className="text-sm font-semibold text-text">{tAi('noActivity')}</p>
        <p className="mt-1 text-sm text-text-soft">{tAi('activityEmpty')}</p>
      </div>
    );
  }

  return (
    <div className={cn(variant === 'full' ? 'h-full overflow-auto p-4' : 'space-y-3')}>
      {title ? (
        <div className="px-1">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-text-soft">{title}</div>
        </div>
      ) : null}
      <div className="space-y-3">
        {items.map((item) => {
          const isConversation = item.kind === 'conversation';
          const isActiveConversation = isConversation && item.conversationId === currentConversationId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.kind === 'conversation') {
                  onSelectConversation?.(item.conversationId);
                  return;
                }
                onSelectRun?.(item.runId);
              }}
              className={cn(
                'w-full rounded-2xl border p-4 text-left transition-colors',
                isActiveConversation ? 'border-accent bg-accent/5' : 'border-border bg-surface-alt hover:border-accent/40'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-accent/10 p-2 text-accent">
                  {isConversation ? <MessageSquare className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{item.title}</p>
                  <p className="mt-1 text-sm text-text-soft">{item.subtitle}</p>
                  <div className="mt-2 text-xs text-text-soft">{formatRelativeTime(item.timestamp)}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
