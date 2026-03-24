'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Brain,
  ChevronRight,
  Clock,
  ExternalLink,
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
import {
  describeLiveExperienceLink,
  describePublishedInterfaceLink,
  openLiveExperience,
  openPublishedInterface,
} from '@/lib/experience-links';
import { useToast } from '@/components/ui/Toast';
import {
  type WorkspaceAgentCanonicalOutput,
  ctaButtonClass,
  type WorkspaceAgentCitation as AskCitation,
  type WorkspaceAgentCta,
  type WorkspaceAgentExecutionPlan,
  type WorkspaceAgentLiveExperience,
  type WorkspaceAgentPipelineStatus,
  type WorkspaceAgentPreheatStatus,
  type WorkspaceAgentPublishedInterface,
  type WorkspaceAgentReviewState,
  type WorkspaceAgentSource,
  type WorkspaceAgentStreamEvent as StreamEvent,
  type WorkspaceAgentTemplatePlan,
  type WorkspaceAgentUserIntent,
} from '@/lib/workspace-agent';

type AskConversationSummary = {
  id: string;
  title: string;
  preview: string;
  updated_at: string;
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
  const [scopeCandidate, setScopeCandidate] = useState<{
    included_sources: WorkspaceAgentSource[];
    excluded_sources: WorkspaceAgentSource[];
    primary_document_id?: string | null;
  } | null>(null);
  const [userIntent, setUserIntent] = useState<WorkspaceAgentUserIntent | null>(null);
  const [executionPlan, setExecutionPlan] = useState<WorkspaceAgentExecutionPlan | null>(null);
  const [canonicalOutput, setCanonicalOutput] = useState<WorkspaceAgentCanonicalOutput | null>(null);
  const [preheatStatus, setPreheatStatus] = useState<WorkspaceAgentPreheatStatus | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<WorkspaceAgentPipelineStatus | null>(null);
  const [reviewState, setReviewState] = useState<WorkspaceAgentReviewState | null>(null);
  const [templatePlan, setTemplatePlan] = useState<WorkspaceAgentTemplatePlan | null>(null);
  const [liveExperience, setLiveExperience] = useState<WorkspaceAgentLiveExperience | null>(null);
  const [publishedInterface, setPublishedInterface] = useState<WorkspaceAgentPublishedInterface | null>(null);
  const [ctas, setCtas] = useState<WorkspaceAgentCta[]>([]);
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [editingSources, setEditingSources] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [surfaceOpeningId, setSurfaceOpeningId] = useState<'live' | 'published' | null>(null);

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
      setScopeCandidate(null);
      setUserIntent(null);
      setExecutionPlan(null);
      setCanonicalOutput(null);
      setPreheatStatus(null);
      setPipelineStatus(null);
      setReviewState(null);
      setTemplatePlan(null);
      setLiveExperience(null);
      setPublishedInterface(null);
      setCtas([]);
      setPendingKind(null);
      setSelectedSourceIds([]);
      setEditingSources(false);
      setHistoryOpen(false);
      setLoadingHistory(false);
    },
    [supabase, t, workspaceId]
  );

  useEffect(() => {
    setMessages([]);
    setActivities([]);
    setSelectedConversationId(null);
    setPipelineStatus(null);
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
    setScopeCandidate(null);
    setUserIntent(null);
    setExecutionPlan(null);
    setCanonicalOutput(null);
    setPreheatStatus(null);
    setPipelineStatus(null);
    setReviewState(null);
    setTemplatePlan(null);
    setLiveExperience(null);
    setPublishedInterface(null);
    setCtas([]);
    setPendingKind(null);
    setSelectedSourceIds([]);
    setEditingSources(false);
    textareaRef.current?.focus();
  }, []);

  const consumeStream = useCallback(async (
    response: Response,
    pendingAssistantId: string,
    options?: { skipConversationReload?: boolean }
  ) => {
    if (!response.ok || !response.body) {
      const json = await response.json().catch(() => null);
      const uiErr = mapHttpError(response.status, json, 'workspace-agent');
      toast.show(uiErr);
      setError(uiErr.message);
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
          } else if (event.type === 'status' || event.type === 'tool_activity' || event.type === 'run_progress') {
            setActivities((prev) => [...prev, event.message]);
          } else if (event.type === 'scope_candidate') {
            setScopeCandidate({
              included_sources: event.included_sources,
              excluded_sources: event.excluded_sources,
              primary_document_id: event.primary_document_id,
            });
            setSelectedSourceIds(event.included_sources.map((item) => item.document_id));
            setEditingSources(false);
          } else if (event.type === 'intent_candidate') {
            setUserIntent(event.user_intent);
          } else if (event.type === 'analysis_plan') {
            setExecutionPlan(event.analysis_plan);
          } else if (event.type === 'canonical_output') {
            setCanonicalOutput(event.canonical_output);
          } else if (event.type === 'preheat_status') {
            setPreheatStatus(event.preheat);
          } else if (event.type === 'pipeline_status') {
            setPipelineStatus(event.pipeline_status);
          } else if (event.type === 'review_signals') {
            setReviewState(event.review);
          } else if (event.type === 'template_candidate') {
            setTemplatePlan(event.template_plan);
          } else if (event.type === 'pending_confirmation') {
            setPendingKind(event.pending_kind);
            setActivities((prev) => [...prev, event.message]);
          } else if (event.type === 'cta_set') {
            setCtas(event.ctas);
          } else if (event.type === 'answer_delta') {
            setMessages((prev) => prev.map((m) => m.id === pendingAssistantId ? { ...m, content: `${m.content}${event.delta}` } : m));
          } else if (event.type === 'citations') {
            setMessages((prev) => prev.map((m) => m.id === pendingAssistantId ? { ...m, citations: event.citations } : m));
          } else if (event.type === 'completed') {
            setMessages((prev) => prev.map((m) => m.id === pendingAssistantId ? { ...m, citations: event.citations } : m));
            if (!options?.skipConversationReload) void loadConversations();
          } else if (event.type === 'live_experience_ready') {
            setLiveExperience(event.live_experience);
          } else if (event.type === 'published_interface_ready') {
            setPublishedInterface(event.published_interface);
          } else if (event.type === 'error') {
            setError(sanitizeAskError(event.message, t('errors.generic')));
          }
        }
      }
    } catch (streamError) {
      if ((streamError as Error).name !== 'AbortError') setError(t('errors.generic'));
    }
  }, [loadConversations, t, toast]);

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

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/workspace-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        question: trimmed,
        workspace_id: workspaceId ?? undefined,
        conversation_id: selectedConversationId ?? undefined,
        ui_surface: 'workspace',
      }),
      signal: abortRef.current.signal,
    });

    try {
      await consumeStream(response, pendingAssistantId);
    } finally {
      setLoading(false);
    }
  }, [consumeStream, loading, query, selectedConversationId, supabase, t, workspaceId]);

  const handleAgentAction = useCallback(async (action: WorkspaceAgentCta) => {
    if (!selectedConversationId || !workspaceId || loading || actionLoadingId) return;

    if (action.action_id === 'edit_sources' && !editingSources) {
      setEditingSources(true);
      return;
    }

    setError(null);
    setActionLoadingId(action.action_id);
    setActivities([]);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const pendingAssistantId = crypto.randomUUID();
    let nextLiveExperience = liveExperience;
    let nextPublishedInterface = publishedInterface;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: action.label, created_at: new Date().toISOString() },
      { id: pendingAssistantId, role: 'assistant', content: '', citations: [] },
    ]);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError(t('errors.auth')); setActionLoadingId(null); return; }

    const payload = action.action_id === 'edit_sources'
      ? { included_document_ids: selectedSourceIds }
      : action.payload;

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/workspace-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        workspace_id: workspaceId,
        conversation_id: selectedConversationId,
        ui_surface: 'workspace',
        agent_action: {
          action_id: action.action_id,
          ...(payload ? { payload } : {}),
        },
      }),
      signal: abortRef.current.signal,
    });

    try {
      const reader = response.body?.getReader();
      if (!response.ok || !reader) {
        await consumeStream(response, pendingAssistantId, { skipConversationReload: false });
      } else {
        const decoder = new TextDecoder();
        let buffer = '';
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
            } else if (event.type === 'status' || event.type === 'tool_activity' || event.type === 'run_progress') {
              setActivities((prev) => [...prev, event.message]);
            } else if (event.type === 'scope_candidate') {
              setScopeCandidate({
                included_sources: event.included_sources,
                excluded_sources: event.excluded_sources,
                primary_document_id: event.primary_document_id,
              });
              setSelectedSourceIds(event.included_sources.map((item) => item.document_id));
              setEditingSources(false);
            } else if (event.type === 'intent_candidate') {
              setUserIntent(event.user_intent);
            } else if (event.type === 'analysis_plan') {
              setExecutionPlan(event.analysis_plan);
            } else if (event.type === 'canonical_output') {
              setCanonicalOutput(event.canonical_output);
            } else if (event.type === 'preheat_status') {
              setPreheatStatus(event.preheat);
            } else if (event.type === 'pipeline_status') {
              setPipelineStatus(event.pipeline_status);
            } else if (event.type === 'review_signals') {
              setReviewState(event.review);
            } else if (event.type === 'template_candidate') {
              setTemplatePlan(event.template_plan);
            } else if (event.type === 'pending_confirmation') {
              setPendingKind(event.pending_kind);
              setActivities((prev) => [...prev, event.message]);
            } else if (event.type === 'cta_set') {
              setCtas(event.ctas);
            } else if (event.type === 'answer_delta') {
              setMessages((prev) => prev.map((m) => m.id === pendingAssistantId ? { ...m, content: `${m.content}${event.delta}` } : m));
            } else if (event.type === 'citations') {
              setMessages((prev) => prev.map((m) => m.id === pendingAssistantId ? { ...m, citations: event.citations } : m));
            } else if (event.type === 'completed') {
              setMessages((prev) => prev.map((m) => m.id === pendingAssistantId ? { ...m, citations: event.citations } : m));
              void loadConversations();
            } else if (event.type === 'live_experience_ready') {
              setLiveExperience(event.live_experience);
              nextLiveExperience = event.live_experience;
            } else if (event.type === 'published_interface_ready') {
              setPublishedInterface(event.published_interface);
              nextPublishedInterface = event.published_interface;
            } else if (event.type === 'error') {
              setError(sanitizeAskError(event.message, t('errors.generic')));
            }
          }
        }
      }

      if (action.action_id === 'open_live_experience' && nextLiveExperience) {
        setSurfaceOpeningId('live');
        try {
          await openLiveExperience(nextLiveExperience);
        } finally {
          setSurfaceOpeningId(null);
        }
      }

      if (action.action_id === 'open_published_interface' && nextPublishedInterface) {
        setSurfaceOpeningId('published');
        try {
          await openPublishedInterface(nextPublishedInterface);
        } finally {
          setSurfaceOpeningId(null);
        }
      }

      if (action.action_id === 'edit_sources') setEditingSources(false);
    } finally {
      setActionLoadingId(null);
    }
  }, [actionLoadingId, consumeStream, editingSources, liveExperience, loading, loadConversations, publishedInterface, selectedConversationId, selectedSourceIds, supabase, t, workspaceId]);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setActivities((prev) => [...prev, t('cancelled')]);
  }, [t]);

  const toggleSourceSelection = useCallback((documentId: string) => {
    if (!editingSources) return;
    setSelectedSourceIds((prev) =>
      prev.includes(documentId)
        ? prev.filter((item) => item !== documentId)
        : [...prev, documentId]
    );
  }, [editingSources]);

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

          {(scopeCandidate || userIntent || executionPlan || canonicalOutput || preheatStatus || pipelineStatus || reviewState || templatePlan || liveExperience || publishedInterface || ctas.length > 0) && (
            <div className="mt-5 rounded-2xl border border-border bg-surface-alt p-4">
              {userIntent ? (
                <div className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">User intent</p>
                  <p className="mt-2 text-sm text-text">{userIntent.summary}</p>
                  {userIntent.requested_focus?.length ? (
                    <p className="mt-1 text-xs text-text-soft">Focus: {userIntent.requested_focus.join(', ')}</p>
                  ) : null}
                </div>
              ) : null}

              {executionPlan ? (
                <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Agent analysis plan</p>
                  <p className="mt-2 text-sm text-text">{executionPlan.summary}</p>
                  <p className="mt-1 text-xs text-text-soft">Output: {executionPlan.output_shape.join(', ')}</p>
                </div>
              ) : null}

              {canonicalOutput ? (
                <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Canonical output</p>
                  <p className="mt-2 text-sm text-text">{canonicalOutput.canonical_store}</p>
                  <p className="mt-1 text-xs text-text-soft">Sections: {canonicalOutput.expected_sections.join(', ')}</p>
                </div>
              ) : null}

              {preheatStatus ? (
                <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Workspace preheat</p>
                  <p className="mt-2 text-sm text-text">{preheatStatus.summary}</p>
                  <p className="mt-1 text-xs text-text-soft">Status: {preheatStatus.status}</p>
                </div>
              ) : null}

              {pipelineStatus ? (
                <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Pipeline status</p>
                  <p className="mt-2 text-sm text-text">{pipelineStatus.summary}</p>
                  <div className="mt-3 space-y-2">
                    {pipelineStatus.stages.map((stage) => (
                      <div key={stage.id} className="rounded-lg border border-border/70 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-text">{stage.label}</p>
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                            stage.status === 'ready'
                              ? 'bg-emerald-500/15 text-emerald-600'
                              : stage.status === 'blocked'
                              ? 'bg-rose-500/15 text-rose-600'
                              : stage.status === 'running'
                              ? 'bg-amber-500/15 text-amber-700'
                              : 'bg-muted text-text-soft'
                          )}>
                            {stage.status.replaceAll('_', ' ')}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-text-soft">{stage.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {scopeCandidate ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Included sources</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {scopeCandidate.included_sources.map((source) => {
                        const selected = selectedSourceIds.includes(source.document_id);
                        return (
                          <button
                            key={source.document_id}
                            type="button"
                            onClick={() => toggleSourceSelection(source.document_id)}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-xs transition-colors',
                              editingSources
                                ? selected
                                  ? 'border-accent bg-accent/10 text-accent'
                                  : 'border-border bg-surface text-text-soft'
                                : 'border-accent/20 bg-accent/10 text-accent'
                            )}
                          >
                            {source.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {scopeCandidate.excluded_sources.length > 0 ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Excluded sources</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {scopeCandidate.excluded_sources.slice(0, 8).map((source) => {
                          const selected = selectedSourceIds.includes(source.document_id);
                          return (
                            <button
                              key={source.document_id}
                              type="button"
                              onClick={() => toggleSourceSelection(source.document_id)}
                              className={cn(
                                'rounded-full border px-3 py-1.5 text-xs transition-colors',
                                editingSources
                                  ? selected
                                    ? 'border-accent bg-accent/10 text-accent'
                                    : 'border-border bg-surface text-text-soft'
                                  : 'border-border bg-surface text-text-soft'
                              )}
                            >
                              {source.title}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {templatePlan ? (
                <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Analysis recipe</p>
                  <p className="mt-2 text-sm text-text">
                    {templatePlan.selected_template_name
                      ? `Using existing template: ${templatePlan.selected_template_name}`
                      : templatePlan.draft_summary || `Planned template: ${templatePlan.planned_template_name ?? 'Workspace Analysis'}`}
                  </p>
                  {templatePlan.reason ? (
                    <p className="mt-1 text-xs text-text-soft">{templatePlan.reason}</p>
                  ) : null}
                </div>
              ) : null}

              {reviewState ? (
                <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Review signals</p>
                  <div className="mt-2 space-y-1">
                    {reviewState.signals.map((signal, index) => (
                      <p key={`${signal.kind}-${index}`} className="text-xs text-text-soft">{signal.message}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              {liveExperience ? (
                <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Live interface</p>
                  <p className="mt-2 text-sm text-text">
                    {describeLiveExperienceLink(liveExperience)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSurfaceOpeningId('live');
                      void openLiveExperience(liveExperience)
                        .catch((err) => setError(err instanceof Error ? err.message : t('errors.generic')))
                        .finally(() => setSurfaceOpeningId(null));
                    }}
                    disabled={surfaceOpeningId !== null}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-medium text-text transition-colors hover:border-accent/30 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {surfaceOpeningId === 'live' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    Open Live Interface
                  </button>
                </div>
              ) : null}

              {publishedInterface ? (
                <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">Published interface</p>
                  <p className="mt-2 text-sm text-text">{describePublishedInterfaceLink(publishedInterface)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSurfaceOpeningId('published');
                      void openPublishedInterface(publishedInterface)
                        .catch((err) => setError(err instanceof Error ? err.message : t('errors.generic')))
                        .finally(() => setSurfaceOpeningId(null));
                    }}
                    disabled={surfaceOpeningId !== null}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-medium text-text transition-colors hover:border-accent/30 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {surfaceOpeningId === 'published' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    Open Published Interface
                  </button>
                </div>
              ) : null}

              {pendingKind ? (
                <p className="mt-4 text-xs font-medium text-text-soft">Pending step: {pendingKind.replaceAll('_', ' ')}</p>
              ) : null}

              {ctas.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {ctas.map((cta) => (
                    <button
                      key={cta.action_id}
                      type="button"
                      onClick={() => void handleAgentAction(cta)}
                      disabled={Boolean(actionLoadingId) || (cta.action_id === 'edit_sources' && editingSources && selectedSourceIds.length === 0)}
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                        ctaButtonClass(cta.kind)
                      )}
                    >
                      {actionLoadingId === cta.action_id ? <Loader2 className="h-4 w-4 animate-spin" /> : cta.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
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
