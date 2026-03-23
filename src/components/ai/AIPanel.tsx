'use client';

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  Code2,
  FileText,
  Globe2,
  Hammer,
  Layers3,
  LockOpen,
  MessageSquare,
  Send,
  Star,
  Type,
  X,
  Zap,
} from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { mapHttpError } from '@/lib/errors';
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL_ID, findChatModelOption, type ChatModelOption } from '@/lib/chat-models';
import {
  ctaButtonClass,
  type WorkspaceAgentCta,
  type WorkspaceAgentSource,
  type WorkspaceAgentStreamEvent as DocumentAgentStreamEvent,
  type WorkspaceAgentTemplatePlan,
} from '@/lib/workspace-agent';

interface AIPanelProps {
  documentId: string;
  workspaceId: string;
  selectedText?: string;
  currentPage?: number;
  onConversationStateChange?: (conversationId: string | null) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function shortenUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'live.zohal.ai' && parsed.pathname.startsWith('/__access/redeem')) {
      return 'Open Live Interface';
    }
    if (parsed.hostname === 'live.zohal.ai' && parsed.pathname.startsWith('/live/')) {
      const slug = parsed.pathname.split('/').filter(Boolean).pop() || 'live';
      return `Live Interface URL (${slug})`;
    }
    const shortPath = parsed.pathname === '/'
      ? ''
      : parsed.pathname.length > 24
      ? `${parsed.pathname.slice(0, 24)}…`
      : parsed.pathname;
    return `${parsed.hostname}${shortPath}`;
  } catch {
    return url.length > 48 ? `${url.slice(0, 45)}…` : url;
  }
}

function renderInlineContent(text: string): ReactNode[] {
  return text.split(URL_PATTERN).map((part, index) => {
    if (!part) return null;
    if (index % 2 === 1) {
      return (
        <a
          key={`url-${index}-${part}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline decoration-accent/60 underline-offset-4 transition-colors hover:text-accent"
        >
          {shortenUrlLabel(part)}
        </a>
      );
    }
    const lines = part.split('\n');
    return (
      <span key={`text-${index}`}>
        {lines.map((line, lineIndex) => (
          <span key={`line-${index}-${lineIndex}`}>
            {line}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </span>
    );
  }).filter(Boolean) as ReactNode[];
}

function renderMessageContent(content: string): ReactNode {
  const paragraphs = content
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const blocks = paragraphs.length ? paragraphs : [content];
  return (
    <div className="space-y-3">
      {blocks.map((paragraph, index) => (
        <p key={`${paragraph.slice(0, 24)}-${index}`} className="text-sm leading-7 text-inherit">
          {renderInlineContent(paragraph)}
        </p>
      ))}
    </div>
  );
}

export function AIPanel({
  documentId,
  workspaceId,
  selectedText,
  currentPage,
  onConversationStateChange,
}: AIPanelProps) {
  // IMPORTANT: Memoize the Supabase client. If we recreate it every render,
  // any callbacks depending on it will change every render, which can re-trigger
  // effects and constantly reset chat state.
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('aiPane');
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [agentActivities, setAgentActivities] = useState<string[]>([]);
  const [scopeCandidate, setScopeCandidate] = useState<{
    included_sources: WorkspaceAgentSource[];
    excluded_sources: WorkspaceAgentSource[];
  } | null>(null);
  const [templatePlan, setTemplatePlan] = useState<WorkspaceAgentTemplatePlan | null>(null);
  const [ctas, setCtas] = useState<WorkspaceAgentCta[]>([]);
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [editingSources, setEditingSources] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatSeqRef = useRef(0);
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_CHAT_MODEL_ID;
    return window.localStorage.getItem('zohal.chat.modelId') || DEFAULT_CHAT_MODEL_ID;
  });

  const selectedModel = useMemo(() => findChatModelOption(selectedModelId), [selectedModelId]);

  useEffect(() => {
    try {
      window.localStorage.setItem('zohal.chat.modelId', selectedModelId);
    } catch {
      // ignore
    }
  }, [selectedModelId]);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 240 ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [chatInput, resizeTextarea]);

  // Initialize on mount and when the document changes.
  // (Do NOT tie this to callbacks that might change every render.)
  useEffect(() => {
    setChatHistory([]);
    setCurrentConversationId(null);
    setAgentActivities([]);
    setScopeCandidate(null);
    setTemplatePlan(null);
    setCtas([]);
    setPendingKind(null);
    setSelectedSourceIds([]);
    setEditingSources(false);
    setError(null);
    setLoading(false);
    setLoadingConversation(false);

    // Cancel any in-flight chat request when switching documents / mounting.
    chatSeqRef.current++;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
  }, [workspaceId]);

  useEffect(() => {
    onConversationStateChange?.(currentConversationId);
  }, [currentConversationId, onConversationStateChange]);

  const filteredModelOptions = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    if (!query) return CHAT_MODEL_OPTIONS;
    return CHAT_MODEL_OPTIONS.filter((option) => {
      return (
        option.title.toLowerCase().includes(query) ||
        option.id.toLowerCase().includes(query) ||
        option.provider.toLowerCase().includes(query) ||
        t(`modelPicker.featureLabels.${option.featureKey}`).toLowerCase().includes(query)
      );
    });
  }, [modelSearch, t]);

  const handleChat = useCallback(
    async (message: string) => {
      if (!message.trim()) return;
      if (loading) return;

      // Cancel any previous in-flight request so "+" and rapid sends behave predictably.
      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;
      const seq = ++chatSeqRef.current;
      const conversationIdAtSend = currentConversationId;

      const userMessage: ChatMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      setChatHistory((prev) => [...prev, userMessage]);
      setChatInput('');
      setLoading(true);
      setError(null);
      setAgentActivities([]);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) throw new Error('Not authenticated');
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/workspace-agent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
              question: message,
              workspace_id: workspaceId,
              opened_document_id: documentId,
              conversation_id: conversationIdAtSend,
              current_page: currentPage,
              selected_text: selectedText?.trim() || undefined,
              ui_surface: 'document',
              top_k: 8,
            }),
          }
        );

        if (!response.ok || !response.body) {
          const json = await response.json().catch(() => null);
          const uiErr = mapHttpError(response.status, json, 'chat');
          toast.show(uiErr);
          setError(uiErr.message);
          return;
        }

        const pendingAssistantIndex = chatHistory.length + 1;
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
          },
        ]);

        const reader = response.body.getReader();
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
            const event = JSON.parse(line) as DocumentAgentStreamEvent;

            if (seq !== chatSeqRef.current) return;

            if (event.type === 'run_started') {
              setCurrentConversationId(event.conversation_id);
              continue;
            }

            if (event.type === 'status' || event.type === 'tool_activity' || event.type === 'run_progress') {
              setAgentActivities((prev) => [...prev, event.message]);
              continue;
            }

            if (event.type === 'scope_candidate') {
              setScopeCandidate({
                included_sources: event.included_sources,
                excluded_sources: event.excluded_sources,
              });
              setSelectedSourceIds(event.included_sources.map((item) => item.document_id));
              setEditingSources(false);
              continue;
            }

            if (event.type === 'template_candidate') {
              setTemplatePlan(event.template_plan);
              continue;
            }

            if (event.type === 'pending_confirmation') {
              setPendingKind(event.pending_kind);
              setAgentActivities((prev) => [...prev, event.message]);
              continue;
            }

            if (event.type === 'cta_set') {
              setCtas(event.ctas);
              continue;
            }

            if (event.type === 'answer_delta') {
              setChatHistory((prev) =>
                prev.map((item, index) =>
                  index === pendingAssistantIndex
                    ? { ...item, content: `${item.content}${event.delta}` }
                    : item
                )
              );
              continue;
            }

            if (event.type === 'completed') {
              setCurrentConversationId(event.conversation_id);
              continue;
            }

            if (event.type === 'error') {
              setError(event.message);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        // Only clear loading for the latest request.
        if (seq === chatSeqRef.current) setLoading(false);
      }
    },
    [
      supabase,
      workspaceId,
      documentId,
      currentConversationId,
      toast,
      loading,
      currentPage,
      selectedText,
      chatHistory.length,
    ]
  );

  const pinMessage = useCallback(
    async (message: ChatMessage) => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) return;

        // Save as a note
        const { error } = await supabase.from('notes').insert({
          user_id: session.user.id,
          document_id: documentId,
          workspace_id: workspaceId,
          note_type: 'ai_saved',
          note_text: message.content,
        });
        if (error) throw error;
        toast.showSuccess(t('savedToNotesTitle'), t('savedToNotesBody'));
      } catch (err) {
        console.error('Failed to pin message:', err);
      }
    },
    [supabase, documentId, workspaceId, toast, t]
  );

  const loadConversation = useCallback(
    async (conversationId: string) => {
      try {
        setLoadingConversation(true);
        setError(null);
        const { data, error } = await supabase
          .from('explanations')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (error) {
          toast.showError(error, 'explanations');
          setError(error.message);
          return;
        }

        if (data) {
          const messages: ChatMessage[] = [];
          for (const item of data) {
            const createdAt = item.created_at as string | undefined;
            const role = (item.role as string | null) ?? null;
            const requestType = (item.request_type as string | null) ?? null;
            const inputText = (item.input_text as string | null) ?? null;
            const responseText = (item.response_text as string | null) ?? null;

            // ask-workspace persists a single assistant row that includes both question and answer.
            // Render it as user+assistant for a proper chat transcript.
            if (role === 'assistant' && requestType === 'ask' && inputText && responseText) {
              messages.push({ role: 'user', content: inputText, timestamp: createdAt });
              messages.push({ role: 'assistant', content: responseText, timestamp: createdAt });
              continue;
            }

            // chat() edge function may persist separate user/assistant rows.
            if (role === 'user') {
              const content = inputText || responseText;
              if (content) messages.push({ role: 'user', content, timestamp: createdAt });
              continue;
            }
            if (role === 'assistant') {
              const content = responseText || inputText;
              if (content) messages.push({ role: 'assistant', content, timestamp: createdAt });
              continue;
            }

            // Fallback: treat as paired row.
            if (inputText) messages.push({ role: 'user', content: inputText, timestamp: createdAt });
            if (responseText) messages.push({ role: 'assistant', content: responseText, timestamp: createdAt });
          }

          setChatHistory(messages);
          setCurrentConversationId(conversationId);
          setAgentActivities([]);
          setScopeCandidate(null);
          setTemplatePlan(null);
          setCtas([]);
          setPendingKind(null);
          setSelectedSourceIds([]);
          setEditingSources(false);
        }
      } catch (err) {
        console.error('Failed to load conversation:', err);
        toast.showError(err, 'explanations');
      }
      finally {
        setLoadingConversation(false);
      }
    },
    [supabase, toast]
  );

  const startNewConversation = useCallback(() => {
    // Cancel in-flight request and ignore any late responses.
    chatSeqRef.current++;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;

    setChatHistory([]);
    setCurrentConversationId(null);
    setError(null);
    setLoading(false);
    setLoadingConversation(false);
    setChatInput('');
    setAgentActivities([]);
    setScopeCandidate(null);
    setTemplatePlan(null);
    setCtas([]);
    setPendingKind(null);
    setSelectedSourceIds([]);
    setEditingSources(false);
    resizeTextarea();
  }, [resizeTextarea]);

  const toggleSourceSelection = useCallback((documentIdToToggle: string) => {
    if (!editingSources) return;
    setSelectedSourceIds((prev) =>
      prev.includes(documentIdToToggle)
        ? prev.filter((item) => item !== documentIdToToggle)
        : [...prev, documentIdToToggle]
    );
  }, [editingSources]);

  const handleAgentAction = useCallback(async (action: WorkspaceAgentCta) => {
    if (!currentConversationId || loading || loadingConversation || actionLoadingId) return;

    if (action.action_id === 'edit_sources' && !editingSources) {
      setEditingSources(true);
      return;
    }

    setActionLoadingId(action.action_id);
    setError(null);
    setAgentActivities([]);

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    const pendingAssistantIndex = chatHistory.length + 1;
    setChatHistory((prev) => [
      ...prev,
      { role: 'user', content: action.label, timestamp: new Date().toISOString() },
      { role: 'assistant', content: '', timestamp: new Date().toISOString() },
    ]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error('Not authenticated');

      const payload = action.action_id === 'edit_sources'
        ? { included_document_ids: selectedSourceIds }
        : action.payload;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/workspace-agent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            workspace_id: workspaceId,
            conversation_id: currentConversationId,
            opened_document_id: documentId,
            ui_surface: 'document',
            agent_action: {
              action_id: action.action_id,
              ...(payload ? { payload } : {}),
            },
          }),
        }
      );

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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as DocumentAgentStreamEvent;

          if (event.type === 'run_started') {
            setCurrentConversationId(event.conversation_id);
            continue;
          }
          if (event.type === 'status' || event.type === 'tool_activity' || event.type === 'run_progress') {
            setAgentActivities((prev) => [...prev, event.message]);
            continue;
          }
          if (event.type === 'scope_candidate') {
            setScopeCandidate({
              included_sources: event.included_sources,
              excluded_sources: event.excluded_sources,
            });
            setSelectedSourceIds(event.included_sources.map((item) => item.document_id));
            setEditingSources(false);
            continue;
          }
          if (event.type === 'template_candidate') {
            setTemplatePlan(event.template_plan);
            continue;
          }
          if (event.type === 'pending_confirmation') {
            setPendingKind(event.pending_kind);
            setAgentActivities((prev) => [...prev, event.message]);
            continue;
          }
          if (event.type === 'cta_set') {
            setCtas(event.ctas);
            continue;
          }
          if (event.type === 'answer_delta') {
            setChatHistory((prev) =>
              prev.map((item, index) =>
                index === pendingAssistantIndex
                  ? { ...item, content: `${item.content}${event.delta}` }
                  : item
              )
            );
            continue;
          }
          if (event.type === 'completed') {
            setCurrentConversationId(event.conversation_id);
            continue;
          }
          if (event.type === 'error') {
            setError(event.message);
          }
        }
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      setActionLoadingId(null);
    }
  }, [
    actionLoadingId,
    chatHistory.length,
    currentConversationId,
    documentId,
    editingSources,
    loading,
    loadingConversation,
    selectedSourceIds,
    supabase,
    toast,
    workspaceId,
  ]);

  useEffect(() => {
    const handleConversationSelect = (event: Event) => {
      const customEvent = event as CustomEvent<{ conversationId?: string }>;
      const conversationId = String(customEvent.detail?.conversationId || '').trim();
      if (!conversationId) return;
      void loadConversation(conversationId);
    };

    window.addEventListener('zohal:agent:select-conversation', handleConversationSelect as EventListener);
    return () => {
      window.removeEventListener('zohal:agent:select-conversation', handleConversationSelect as EventListener);
    };
  }, [loadConversation]);

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className="relative flex-1 min-h-0">
        <div className="flex h-full flex-col">
          <>
            <div className="flex-1 overflow-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <div className="space-y-4">
                {selectedText && chatHistory.length === 0 && (
                  <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                      {t('selectedText')}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-text line-clamp-4">{selectedText}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          handleChat(
                            `Explain the selected text (from page ${currentPage ?? ''}):\n\n${selectedText}`
                          )
                        }
                        disabled={loading || loadingConversation}
                        title={t('explainSelected')}
                      >
                        <FileText className="w-4 h-4" />
                        {t('explain')}
                      </Button>
                    </div>
                  </div>
                )}

                {chatHistory.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-surface-alt/50 px-6 py-8 text-center">
                    <MessageSquare className="mx-auto mb-3 h-10 w-10 text-text-soft" />
                    <p className="text-sm font-semibold text-text">{t('agentHeading')}</p>
                    <p className="mt-1 text-sm text-text-soft">{t('emptyState')}</p>
                  </div>
                )}

                {error && (
                  <div className="rounded-2xl border border-error/20 bg-error/10 p-3">
                    <p className="text-sm text-error">{error}</p>
                  </div>
                )}

                {agentActivities.map((activity, index) => (
                  <div
                    key={`${activity}-${index}`}
                    className="mx-auto max-w-[92%] rounded-2xl border border-border bg-surface-alt/70 px-4 py-3 text-center text-sm text-text-soft"
                  >
                    {activity}
                  </div>
                ))}

                {(scopeCandidate || templatePlan || ctas.length > 0) && (
                  <div className="rounded-2xl border border-border bg-surface-alt p-4">
                    {scopeCandidate ? (
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">
                            Included sources
                          </p>
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
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">
                              Excluded sources
                            </p>
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
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">
                          Analysis recipe
                        </p>
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

                    {pendingKind ? (
                      <p className="mt-4 text-xs font-medium text-text-soft">
                        Pending step: {pendingKind.replaceAll('_', ' ')}
                      </p>
                    ) : null}

                    {ctas.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {ctas.map((cta) => (
                          <button
                            key={cta.action_id}
                            type="button"
                            onClick={() => void handleAgentAction(cta)}
                            disabled={Boolean(actionLoadingId)}
                            className={cn(
                              'rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                              ctaButtonClass(cta.kind)
                            )}
                          >
                            {actionLoadingId === cta.action_id ? <Spinner size="sm" /> : cta.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}

                {chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      'group relative max-w-[88%] rounded-2xl border p-4 shadow-sm',
                      msg.role === 'user'
                        ? 'ml-auto border-accent bg-accent text-white'
                        : 'border-border bg-surface-alt'
                    )}
                  >
                    {renderMessageContent(msg.content)}
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => pinMessage(msg)}
                        className="absolute -top-2 -right-2 rounded-full border border-border bg-surface p-1.5 opacity-0 transition-opacity hover:bg-surface-alt group-hover:opacity-100"
                        title={t('saveToNotes')}
                      >
                        <Star className="h-3 w-3 text-text-soft" />
                      </button>
                    )}
                  </div>
                ))}

                {(loading || loadingConversation) && (
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface-alt px-4 py-3">
                    <Spinner size="sm" />
                    <span className="text-sm text-text-soft">
                      {loadingConversation ? t('loadingConversation') : t('thinking')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <div className="rounded-[1.75rem] border border-border bg-surface-alt/90 p-3 shadow-[var(--shadowSm)]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setShowModelPicker(true)}
                      className="inline-flex max-w-[70%] items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1.5 text-left transition-colors hover:border-accent/40 hover:text-text"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">
                        {selectedModel?.providerMark || 'M'}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text">
                          {selectedModel?.shortTitle || selectedModel?.title || t('modelPicker.customModel')}
                        </span>
                        {selectedModel ? (
                          <span className="block truncate text-[11px] text-text-soft">
                            {t(`modelPicker.featureLabels.${selectedModel.featureKey}`)}
                          </span>
                        ) : null}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-text-soft" />
                    </button>
                    <div className="flex items-center gap-2 self-start">
                      {selectedModel?.isOpenSource ? (
                        <span className="hidden rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent md:inline-flex">
                          {t('modelPicker.openSource')}
                        </span>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={startNewConversation}
                        disabled={chatHistory.length === 0 && !currentConversationId}
                      >
                        {t('newConversation')}
                      </Button>
                    </div>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void handleChat(chatInput);
                      }
                    }}
                    rows={1}
                    placeholder={t('inputPlaceholder')}
                    className="min-h-[140px] w-full resize-none rounded-2xl border border-transparent bg-surface px-4 py-4 text-base leading-7 text-text placeholder:text-text-soft focus:border-accent/30 focus:outline-none"
                  />
                  <div className="mt-3 flex items-center justify-end">
                    <Button
                      onClick={() => handleChat(chatInput)}
                      disabled={!chatInput.trim() || loading || loadingConversation}
                      size="md"
                      className="min-w-[3rem]"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
            </div>
          </>
        </div>

        {showModelPicker && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-end md:inset-x-4 md:bottom-24 md:items-start md:justify-start">
            <button
              type="button"
              className="absolute inset-0 bg-black/40 md:hidden"
              onClick={() => setShowModelPicker(false)}
              aria-label={t('close')}
            />
            <div className="relative flex w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-border bg-surface shadow-2xl md:w-[24rem] md:max-w-[calc(100%-2rem)] md:rounded-2xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-base font-semibold text-text">{t('modelPicker.title')}</div>
                  <div className="hidden text-sm text-text-soft md:block">{t('modelPicker.subtitle')}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowModelPicker(false)}>
                  <X className="w-4 h-4" />
                  {t('close')}
                </Button>
              </div>

              <div className="border-b border-border px-4 py-3">
                <input
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder={t('modelPicker.search')}
                  className="w-full rounded-scholar border border-border bg-surface-alt px-4 py-2.5 text-sm text-text placeholder:text-text-soft focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="min-h-0 max-h-[min(26rem,calc(100dvh-10rem))] flex-1 overflow-auto p-3 space-y-2.5 md:max-h-[22rem]">
                {filteredModelOptions.map((option) => {
                  const isSelected = selectedModelId === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSelectedModelId(option.id);
                        setShowModelPicker(false);
                      }}
                      className={cn(
                        'w-full rounded-xl border p-3 text-left transition-colors',
                        isSelected
                          ? 'border-accent bg-accent/5'
                          : 'border-border bg-surface-alt hover:border-accent/40'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                          {option.providerMark}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-text">{option.title}</span>
                            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-soft">
                              {option.provider}
                            </span>
                            {option.isOpenSource ? (
                              <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                                {t('modelPicker.openSource')}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-sm text-text-soft">
                            {modelFeatureIcon(option)}
                            <span>{t(`modelPicker.featureLabels.${option.featureKey}`)}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-text-soft">{option.id}</div>
                        </div>
                        <CheckCircle2
                          className={cn('mt-0.5 h-5 w-5 shrink-0', isSelected ? 'text-accent' : 'text-transparent')}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function modelFeatureIcon(option: ChatModelOption) {
    const className = 'h-4 w-4 shrink-0';
    switch (option.icon) {
      case 'brain':
        return <Brain className={className} />;
      case 'context':
        return <Layers3 className={className} />;
      case 'tools':
        return <Hammer className={className} />;
      case 'fast':
        return <Zap className={className} />;
      case 'open':
        return <LockOpen className={className} />;
      case 'code':
        return <Code2 className={className} />;
      case 'globe':
        return <Globe2 className={className} />;
      case 'text':
      default:
        return <Type className={className} />;
    }
  }
}
