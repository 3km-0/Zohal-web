'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Brain, ChevronRight, Globe2, Loader2, MessageSquare, Search, Send, Square, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Card, EmptyState } from '@/components/ui';
import { cn, formatRelativeTime, truncate } from '@/lib/utils';
import { useRouter } from 'next/navigation';

type AskConversationSummary = {
  id: string;
  title: string;
  preview: string;
  updated_at: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
};

type AskCitation = {
  document_id: string;
  document_title: string;
  page_number: number;
  quote: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
};

type AskMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  citations?: AskCitation[];
};

type AskAgentViewProps = {
  workspaceId?: string | null;
  workspaceName?: string | null;
};

type StreamEvent =
  | { type: 'run_started'; conversation_id: string }
  | { type: 'status'; message: string }
  | { type: 'tool_activity'; message: string }
  | { type: 'answer_delta'; delta: string }
  | { type: 'citations'; citations: AskCitation[] }
  | { type: 'completed'; conversation_id: string; citations: AskCitation[] }
  | { type: 'error'; message: string };

function sanitizeAskError(message: string | null | undefined, fallback: string): string {
  const trimmed = `${message ?? ''}`.trim();
  if (!trimmed) return fallback;

  const lowered = trimmed.toLowerCase();
  const looksTechnical =
    trimmed.startsWith('<') ||
    lowered.includes('invalid schema') ||
    lowered.includes('function_call') ||
    lowered.includes('openai') ||
    lowered.includes('semantic search failed') ||
    lowered.includes('missing workspace_ids') ||
    lowered.includes('stack');

  return looksTechnical ? fallback : trimmed;
}

export function AskAgentView({ workspaceId = null, workspaceName = null }: AskAgentViewProps) {
  const t = useTranslations('askAgent');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [conversations, setConversations] = useState<AskConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, activities]);

  const loadConversations = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ask-conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: 'list',
        workspace_id: workspaceId ?? undefined,
      }),
    });

    const json = await response.json().catch(() => ({ items: [] }));
    setConversations(Array.isArray(json.items) ? json.items : []);
  }, [supabase, workspaceId]);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      setLoadingHistory(true);
      setError(null);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoadingHistory(false);
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ask-conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'history',
          conversation_id: conversationId,
          workspace_id: workspaceId ?? undefined,
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json) {
        setError(t('errors.history'));
        setLoadingHistory(false);
        return;
      }

      setSelectedConversationId(conversationId);
      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setActivities([]);
      setLoadingHistory(false);
    },
    [supabase, t, workspaceId]
  );

  useEffect(() => {
    setMessages([]);
    setActivities([]);
    setSelectedConversationId(null);
    void loadConversations();
  }, [loadConversations]);

  const openCitation = useCallback(
    (citation: AskCitation) => {
      const targetWorkspaceId = workspaceId ?? citation.workspace_id;
      if (!targetWorkspaceId) return;
      router.push(
        `/workspaces/${targetWorkspaceId}/documents/${citation.document_id}?page=${citation.page_number}&pane=chat`
      );
    },
    [router, workspaceId]
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    setError(null);
    setLoading(true);
    setActivities([]);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const pendingAssistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: trimmed, created_at: new Date().toISOString() },
      { id: pendingAssistantId, role: 'assistant', content: '', citations: [] },
    ]);
    setQuery('');

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError(t('errors.auth'));
      setLoading(false);
      return;
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ask-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        question: trimmed,
        workspace_id: workspaceId ?? undefined,
        conversation_id: selectedConversationId ?? undefined,
      }),
      signal: abortRef.current.signal,
    });

    if (!response.ok || !response.body) {
      const json = await response.json().catch(() => null);
      setError(sanitizeAskError(json?.error, t('errors.generic')));
      setLoading(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;

          if (event.type === 'run_started') {
            setSelectedConversationId(event.conversation_id);
          } else if (event.type === 'status' || event.type === 'tool_activity') {
            setActivities((prev) => [...prev, event.message]);
          } else if (event.type === 'answer_delta') {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === pendingAssistantId
                  ? { ...message, content: `${message.content}${event.delta}` }
                  : message
              )
            );
          } else if (event.type === 'citations') {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === pendingAssistantId ? { ...message, citations: event.citations } : message
              )
            );
          } else if (event.type === 'completed') {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === pendingAssistantId ? { ...message, citations: event.citations } : message
              )
            );
            void loadConversations();
          } else if (event.type === 'error') {
            setError(sanitizeAskError(event.message, t('errors.generic')));
          }
        }
      }
    } catch (streamError) {
      if ((streamError as Error).name !== 'AbortError') {
        setError(t('errors.generic'));
      }
    } finally {
      setLoading(false);
    }
  }, [loadConversations, loading, query, selectedConversationId, supabase, t, workspaceId]);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setActivities((prev) => [...prev, t('cancelled')]);
  }, [t]);

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4 md:p-6">
      <aside className="hidden w-[290px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-border bg-surface md:flex">
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            {workspaceId ? <Search className="h-4 w-4 text-accent" /> : <Globe2 className="h-4 w-4 text-accent" />}
            <span>{workspaceId ? t('workspaceHistory') : t('globalHistory')}</span>
          </div>
          <p className="mt-1 text-sm text-text-soft">
            {workspaceName ?? t('historyDescription')}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {conversations.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-border p-4 text-sm text-text-soft">
              {t('noConversations')}
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void loadConversation(conversation.id)}
                className={cn(
                  'mb-2 w-full rounded-[18px] border px-3 py-3 text-left transition-colors',
                  selectedConversationId === conversation.id
                    ? 'border-accent/30 bg-accent/10'
                    : 'border-border bg-surface hover:bg-surface-alt'
                )}
              >
                <div className="line-clamp-1 text-sm font-semibold text-text">{conversation.title}</div>
                <div className="mt-1 line-clamp-2 text-sm text-text-soft">{truncate(conversation.preview, 96)}</div>
                <div className="mt-2 text-xs text-text-soft">{formatRelativeTime(conversation.updated_at)}</div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-border bg-surface shadow-[var(--shadowMd)]">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-accent/10 text-accent">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold text-text">{workspaceId ? t('workspaceTitle') : t('globalTitle')}</div>
              <div className="text-sm text-text-soft">
                {workspaceName ?? (workspaceId ? t('workspaceSubtitleFallback') : t('globalSubtitle'))}
              </div>
            </div>
          </div>
        </div>

        <div ref={transcriptRef} className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-5">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-20 text-text-soft">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t('loadingHistory')}
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-8 w-8" />}
              title={workspaceId ? t('emptyWorkspaceTitle') : t('emptyGlobalTitle')}
              description={workspaceId ? t('emptyWorkspaceDescription') : t('emptyGlobalDescription')}
            />
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <Card key={message.id} className={cn('max-w-3xl', message.role === 'user' ? 'ml-auto bg-accent text-white' : '')}>
                  <div className="space-y-3 p-4">
                    <div className={cn('text-xs font-semibold uppercase tracking-[0.18em]', message.role === 'user' ? 'text-white/80' : 'text-text-soft')}>
                      {message.role === 'user' ? t('you') : t('agent')}
                    </div>
                    <div className={cn('whitespace-pre-wrap text-sm leading-7', message.role === 'user' ? 'text-white' : 'text-text')}>
                      {message.content || (loading ? t('thinking') : '')}
                    </div>
                    {message.citations && message.citations.length > 0 && (
                      <div className="grid gap-2">
                        {message.citations.map((citation, index) => (
                          <button
                            key={`${message.id}-${index}`}
                            type="button"
                            onClick={() => openCitation(citation)}
                            className="flex items-start justify-between rounded-[16px] border border-border bg-surface-alt px-3 py-3 text-left transition-colors hover:border-accent/30 hover:bg-accent/5"
                          >
                            <div className="min-w-0">
                              <div className="line-clamp-1 text-sm font-semibold text-text">
                                {citation.workspace_name ? `${citation.workspace_name} • ` : ''}
                                {citation.document_title}
                              </div>
                              <div className="mt-1 text-xs text-text-soft">
                                {t('page', { page: citation.page_number })}
                              </div>
                              {citation.quote ? (
                                <div className="mt-2 line-clamp-2 text-sm text-text-soft">{citation.quote}</div>
                              ) : null}
                            </div>
                            <ChevronRight className="ml-3 mt-1 h-4 w-4 shrink-0 text-text-soft" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {(activities.length > 0 || error) && (
            <details className="mt-4 rounded-[20px] border border-border bg-surface-alt p-4" open>
              <summary className="cursor-pointer list-none text-sm font-semibold text-text">
                {t('activity')}
              </summary>
              <div className="mt-3 space-y-2">
                {activities.map((activity, index) => (
                  <div key={`${activity}-${index}`} className="flex items-start gap-2 text-sm text-text-soft">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>{activity}</span>
                  </div>
                ))}
                {error ? <div className="text-sm font-medium text-error">{error}</div> : null}
              </div>
            </details>
          )}
        </div>

        <div className="border-t border-border px-4 py-4 md:px-5">
          <div className="flex flex-col gap-3">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={workspaceId ? t('workspacePlaceholder') : t('globalPlaceholder')}
              className="min-h-[112px] w-full rounded-[20px] border border-border bg-surface-alt px-4 py-3 text-sm text-text outline-none transition-colors placeholder:text-text-soft focus:border-accent"
            />
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-text-soft">
                {workspaceId ? t('workspaceScopeHint') : t('globalScopeHint')}
              </div>
              <div className="flex items-center gap-2">
                {loading ? (
                  <Button type="button" variant="secondary" onClick={cancelRun}>
                    <Square className="h-4 w-4" />
                    {t('cancel')}
                  </Button>
                ) : null}
                <Button type="button" onClick={() => void handleSubmit()} disabled={!query.trim()} isLoading={loading}>
                  <Send className="h-4 w-4" />
                  {t('send')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
