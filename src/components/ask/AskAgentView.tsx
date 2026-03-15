'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Brain,
  ChevronRight,
  Clock,
  FileText,
  Globe2,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn, formatRelativeTime, truncate } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { downloadLibraryPdf } from '@/lib/zohal-library';
import { mapHttpError } from '@/lib/errors';
import { useToast } from '@/components/ui/Toast';

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
  source_kind?: 'workspace_document' | 'zohal_library';
  workspace_id?: string | null;
  workspace_name?: string | null;
  library_item_id?: string | null;
  library_object_path?: string | null;
  library_url?: string | null;
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
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [conversations, setConversations] = useState<AskConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, activities]);

  const loadConversations = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ask-conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'list', workspace_id: workspaceId ?? undefined }),
    });
    const json = await response.json().catch(() => ({ items: [] }));
    setConversations(Array.isArray(json.items) ? json.items : []);
  }, [supabase, workspaceId]);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      setLoadingHistory(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoadingHistory(false); return; }
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ask-conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'history', conversation_id: conversationId, workspace_id: workspaceId ?? undefined }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json) { setError(t('errors.history')); setLoadingHistory(false); return; }
      setSelectedConversationId(conversationId);
      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setActivities([]);
      setHistoryOpen(false);
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
    async (citation: AskCitation) => {
      if (citation.source_kind === 'zohal_library' || citation.library_item_id) {
        try {
          const blob = await downloadLibraryPdf(supabase, {
            objectPath: citation.library_object_path,
            url: citation.library_url,
            filename: citation.document_title,
          });
          const objectUrl = URL.createObjectURL(blob);
          const pageSuffix = citation.page_number > 0 ? `#page=${citation.page_number}` : '';
          window.open(`${objectUrl}${pageSuffix}`, '_blank', 'noopener,noreferrer');
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch {
          setError(t('errors.generic'));
        }
        return;
      }

      const targetWorkspaceId = workspaceId ?? citation.workspace_id;
      if (!targetWorkspaceId) return;
      router.push(`/workspaces/${targetWorkspaceId}/documents/${citation.document_id}?page=${citation.page_number}&pane=chat`);
    },
    [router, supabase, t, workspaceId]
  );

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setActivities([]);
    setSelectedConversationId(null);
    setError(null);
    setHistoryOpen(false);
    textareaRef.current?.focus();
  }, []);

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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError(t('errors.auth')); setLoading(false); return; }

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ask-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ question: trimmed, workspace_id: workspaceId ?? undefined, conversation_id: selectedConversationId ?? undefined }),
      signal: abortRef.current.signal,
    });

    if (!response.ok || !response.body) {
      const json = await response.json().catch(() => null);
      const uiErr = mapHttpError(response.status, json, 'ask-stream');
      toast.show(uiErr);
      setError(uiErr.message);
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
            setMessages((prev) => prev.map((m) => m.id === pendingAssistantId ? { ...m, content: `${m.content}${event.delta}` } : m));
          } else if (event.type === 'citations') {
            setMessages((prev) => prev.map((m) => m.id === pendingAssistantId ? { ...m, citations: event.citations } : m));
          } else if (event.type === 'completed') {
            setMessages((prev) => prev.map((m) => m.id === pendingAssistantId ? { ...m, citations: event.citations } : m));
            void loadConversations();
          } else if (event.type === 'error') {
            setError(sanitizeAskError(event.message, t('errors.generic')));
          }
        }
      }
    } catch (streamError) {
      if ((streamError as Error).name !== 'AbortError') setError(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [loadConversations, loading, query, selectedConversationId, supabase, t, toast, workspaceId]);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setActivities((prev) => [...prev, t('cancelled')]);
  }, [t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSubmit(); }
    },
    [handleSubmit]
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-5">
      {/* History slide-over backdrop */}
      {historyOpen && (
        <div
          className="absolute inset-0 z-20 bg-black/30 backdrop-blur-[2px]"
          onClick={() => setHistoryOpen(false)}
        />
      )}

      {/* History slide-over panel */}
      <div
        className={cn(
          'absolute inset-y-0 left-4 z-30 flex w-[300px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadowMd)] transition-all duration-250',
          historyOpen ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2">
            {workspaceId ? <Search className="h-4 w-4 text-accent" /> : <Globe2 className="h-4 w-4 text-accent" />}
            <span className="text-sm font-semibold text-text">
              {workspaceId ? t('workspaceHistory') : t('globalHistory')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={startNewConversation}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-alt text-text-soft transition-colors hover:border-accent/40 hover:text-accent"
              title="New conversation"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-text-soft transition-colors hover:bg-surface-alt hover:text-text"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {workspaceName && (
          <div className="border-b border-border px-4 py-2">
            <p className="text-xs font-medium text-accent">{workspaceName}</p>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
              <MessageSquare className="h-6 w-6 text-text-soft opacity-30" />
              <p className="text-xs text-text-soft">{t('noConversations')}</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void loadConversation(conversation.id)}
                className={cn(
                  'mb-1.5 w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-150',
                  selectedConversationId === conversation.id
                    ? 'border-accent/25 bg-accent/10'
                    : 'border-transparent hover:border-border hover:bg-surface-alt'
                )}
              >
                <div className="line-clamp-1 text-sm font-medium text-text">{conversation.title}</div>
                <div className="mt-0.5 line-clamp-1 text-xs text-text-soft">{truncate(conversation.preview, 72)}</div>
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-text-soft opacity-55">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(conversation.updated_at)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main chat panel */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
        {/* Header */}
        <div className="relative overflow-hidden border-b border-border px-5 py-3.5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{ background: 'radial-gradient(ellipse 60% 100% at 6% 50%, #c9973e 0%, transparent 70%)' }}
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent shadow-[0_0_14px_rgba(201,151,62,0.1)]">
                <Brain className="h-4.5 w-4.5" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-text">
                  {workspaceName ?? (workspaceId ? t('workspaceTitle') : t('globalTitle'))}
                </h1>
                <span className="flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent">
                  <Sparkles className="h-2.5 w-2.5" />
                  AI
                </span>
              </div>
            </div>

            {/* History + New buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all',
                  historyOpen
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-border bg-surface-alt text-text-soft hover:border-accent/30 hover:text-accent'
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('globalHistory')}</span>
              </button>
              <button
                type="button"
                onClick={startNewConversation}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-alt px-2.5 py-1.5 text-xs font-medium text-text-soft transition-all hover:border-accent/30 hover:text-accent"
                title="New conversation"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div ref={transcriptRef} className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-5">
          {loadingHistory ? (
            <div className="flex items-center justify-center gap-2 py-20 text-text-soft">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
              <span className="text-sm">{t('loadingHistory')}</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 shadow-[0_0_28px_rgba(201,151,62,0.08)]">
                <Brain className="h-7 w-7 text-accent" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-text">
                  {workspaceId ? t('emptyWorkspaceTitle') : t('emptyGlobalTitle')}
                </h2>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((message) => (
                <div key={message.id} className={cn('flex gap-3', message.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  {/* Avatar */}
                  <div className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    message.role === 'user'
                      ? 'border border-accent/25 bg-accent/15 text-accent'
                      : 'border border-border bg-surface-alt text-text-soft'
                  )}>
                    {message.role === 'user' ? 'Y' : <Brain className="h-3.5 w-3.5" />}
                  </div>

                  {/* Bubble */}
                  <div className={cn(
                    'max-w-[78%] space-y-3 rounded-2xl border px-4 py-3',
                    message.role === 'user'
                      ? 'rounded-tr-sm border-accent/20 bg-accent/10'
                      : 'rounded-tl-sm border-border bg-surface-alt'
                  )}>
                    <div className="whitespace-pre-wrap text-sm leading-7 text-text">
                      {message.content || (loading ? (
                        <span className="flex items-center gap-1.5 text-text-soft">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t('thinking')}
                        </span>
                      ) : '')}
                    </div>

                    {/* Citations */}
                    {message.citations && message.citations.length > 0 && (
                      <div className="mt-3 grid gap-2 border-t border-border pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Sources</p>
                        {message.citations.map((citation, index) => (
                          <button
                            key={`${message.id}-${index}`}
                            type="button"
                            onClick={() => openCitation(citation)}
                            className="flex items-start justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-all hover:border-accent/30 hover:bg-accent/5"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 shrink-0 text-accent" />
                                <span className="line-clamp-1 text-xs font-semibold text-text">
                                  {citation.source_kind === 'zohal_library'
                                    ? `${t('librarySource')} · ${citation.document_title}`
                                    : `${citation.workspace_name ? `${citation.workspace_name} · ` : ''}${citation.document_title}`}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-text-soft">p. {citation.page_number}</div>
                              {citation.quote ? (
                                <div className="mt-1.5 line-clamp-2 text-xs italic text-text-soft">&ldquo;{citation.quote}&rdquo;</div>
                              ) : null}
                            </div>
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-text-soft" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Activity log */}
          {(activities.length > 0 || error) && (
            <details className="mt-5 rounded-xl border border-border bg-surface-alt px-4 py-3" open>
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-widest text-text-soft">
                {t('activity')}
              </summary>
              <div className="mt-3 space-y-1.5">
                {activities.map((activity, index) => (
                  <div key={`${activity}-${index}`} className="flex items-start gap-2 text-sm text-text-soft">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                    <span>{activity}</span>
                  </div>
                ))}
                {error ? (
                  <div className="mt-1 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-sm font-medium text-error">
                    {error}
                  </div>
                ) : null}
              </div>
            </details>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border px-4 py-4 md:px-5">
          <div className="overflow-hidden rounded-xl border border-border bg-surface-alt transition-all focus-within:border-accent/40 focus-within:shadow-[0_0_0_3px_rgba(201,151,62,0.06)]">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={workspaceId ? t('workspacePlaceholder') : t('globalPlaceholder')}
              rows={3}
              className="block w-full resize-none bg-transparent px-4 pt-3.5 text-sm text-text outline-none placeholder:text-text-soft"
            />
            <div className="flex items-center justify-end gap-2 px-3 pb-3 pt-1">
              <span className="mr-auto hidden text-[11px] text-text-soft opacity-40 sm:inline">↵ Send · Shift+↵ Newline</span>
              {loading ? (
                <button
                  type="button"
                  onClick={cancelRun}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-soft transition-colors hover:border-error/30 hover:text-error"
                >
                  <Square className="h-3.5 w-3.5" />
                  {t('cancel')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!query.trim() || loading}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all duration-150',
                  query.trim() && !loading
                    ? 'bg-accent text-white shadow-[0_2px_12px_rgba(201,151,62,0.25)] hover:opacity-90 hover:-translate-y-px active:translate-y-0'
                    : 'cursor-not-allowed border border-border bg-surface text-text-soft opacity-40'
                )}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {t('send')}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
