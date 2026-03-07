'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  Code2,
  Clock,
  FileText,
  Globe2,
  Hammer,
  Layers3,
  LockOpen,
  MessageSquare,
  Send,
  Sparkles,
  Star,
  Type,
  X,
  Zap,
} from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn, formatRelativeTime } from '@/lib/utils';
import { mapHttpError } from '@/lib/errors';
import type { DocumentType } from '@/types/database';
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL_ID, findChatModelOption, type ChatModelOption } from '@/lib/chat-models';
import { supportsStructuredAnalysis } from '@/lib/document-analysis';

interface AIPanelProps {
  documentId: string;
  workspaceId: string;
  selectedText?: string;
  currentPage?: number;
  onClose: () => void;
  documentType?: DocumentType;
  onOpenAnalysis?: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface ConversationSummary {
  id: string;
  preview: string;
  timestamp: string;
  messageCount: number;
}


export function AIPanel({
  documentId,
  workspaceId,
  selectedText,
  currentPage,
  onClose,
  documentType,
  onOpenAnalysis,
}: AIPanelProps) {
  // IMPORTANT: Memoize the Supabase client. If we recreate it every render,
  // any callbacks depending on it will change every render, which can re-trigger
  // effects and constantly reset chat state.
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const t = useTranslations('aiPane');
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showHistoryOverlay, setShowHistoryOverlay] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
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

  // Load conversation history
  const loadConversationHistory = useCallback(async () => {
    try {
      // Get unique conversations for this document
      const { data, error } = await supabase
        .from('explanations')
        .select('conversation_id, request_type, input_text, response_text, created_at')
        .eq('document_id', documentId)
        .not('conversation_id', 'is', null)
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Group by conversation_id and get the first message as preview
        const conversationsMap = new Map<string, ConversationSummary>();
        
        data.forEach((item) => {
          if (!item.conversation_id) return;
          
          if (!conversationsMap.has(item.conversation_id)) {
            conversationsMap.set(item.conversation_id, {
              id: item.conversation_id,
              preview: item.input_text || item.response_text?.slice(0, 100) || t('conversationFallback'),
              timestamp: item.created_at,
              messageCount: 1,
            });
          } else {
            const conv = conversationsMap.get(item.conversation_id)!;
            conv.messageCount++;
          }
        });

        setConversationHistory(Array.from(conversationsMap.values()).slice(0, 10));
      }
    } catch (err) {
      console.error('Failed to load conversation history:', err);
    }
  }, [supabase, documentId, t]);

  // Initialize on mount and when the document changes.
  // (Do NOT tie this to callbacks that might change every render.)
  useEffect(() => {
    setChatHistory([]);
    setCurrentConversationId(null);
    setError(null);
    setLoading(false);
    setLoadingConversation(false);

    // Cancel any in-flight chat request when switching documents / mounting.
    chatSeqRef.current++;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;

    loadConversationHistory();
    setShowHistoryOverlay(false);
  }, [documentId, loadConversationHistory]);

  const goToContractAnalysis = useCallback(() => {
    if (onOpenAnalysis) {
      onOpenAnalysis();
      return;
    }
    router.push(`/workspaces/${workspaceId}/documents/${documentId}/contract-analysis`);
  }, [onOpenAnalysis, router, workspaceId, documentId]);

  const supportsAnalysis = useMemo(() => supportsStructuredAnalysis(documentType), [documentType]);

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

  const buildChatContext = useCallback(async () => {
    const contextParts: string[] = [];
    const maxChars = 15000;
    let totalChars = 0;

    const appendPart = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      const separator = contextParts.length > 0 ? '\n\n' : '';
      const availableChars = maxChars - totalChars - separator.length;
      if (availableChars <= 0) return;

      const nextValue = trimmed.length > availableChars ? trimmed.slice(0, availableChars) : trimmed;
      contextParts.push(nextValue);
      totalChars += separator.length + nextValue.length;
    };

    let isPrivacyModeDocument = false;
    let documentTitle = '';

    try {
      const { data } = await supabase
        .from('documents')
        .select('title, privacy_mode')
        .eq('id', documentId)
        .single();

      documentTitle = (data?.title as string | undefined) ?? '';
      isPrivacyModeDocument = data?.privacy_mode === true;
    } catch (err) {
      console.error('Failed to load document metadata for chat context:', err);
    }

    if (documentTitle) appendPart(`Document: ${documentTitle}`);
    if (documentType) appendPart(`Document type: ${documentType}`);
    if (typeof currentPage === 'number') appendPart(`Current page: ${currentPage}`);
    if (selectedText?.trim()) appendPart(`Selected text:\n${selectedText.trim()}`);

    if (isPrivacyModeDocument) {
      return contextParts.join('\n\n') || undefined;
    }

    const loadChunks = async (pageRange?: { start: number; end: number }) => {
      let query = supabase
        .from('document_chunks')
        .select('page_number, chunk_index, content_text')
        .eq('document_id', documentId)
        .order('page_number', { ascending: true })
        .order('chunk_index', { ascending: true })
        .limit(80);

      if (pageRange) {
        query = query
          .gte('page_number', pageRange.start)
          .lte('page_number', pageRange.end);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    };

    try {
      const nearbyRange =
        typeof currentPage === 'number'
          ? { start: Math.max(1, currentPage - 2), end: Math.max(1, currentPage + 2) }
          : undefined;

      let chunks = await loadChunks(nearbyRange);
      if (chunks.length === 0 && nearbyRange) {
        chunks = await loadChunks();
      }

      if (chunks.length > 0) {
        const pageBlocks: string[] = [];
        let contentChars = 0;

        for (const row of chunks as Array<{
          page_number: number | null;
          content_text: string | null;
        }>) {
          const text = (row.content_text ?? '').trim();
          if (!text) continue;

          const block = `--- Page ${row.page_number ?? 1} ---\n${text}`;
          const separator = pageBlocks.length > 0 ? '\n\n' : '';
          const availableChars = maxChars - totalChars - contentChars - separator.length;
          if (availableChars <= 0) break;

          const nextBlock = block.length > availableChars ? block.slice(0, availableChars) : block;
          pageBlocks.push(nextBlock);
          contentChars += separator.length + nextBlock.length;
        }

        if (pageBlocks.length > 0) {
          appendPart(`--- DOCUMENT CONTENT ---\n${pageBlocks.join('\n\n')}\n--- END DOCUMENT CONTENT ---`);
        }
      }
    } catch (err) {
      console.error('Failed to load document chunks for chat context:', err);
    }

    return contextParts.join('\n\n') || undefined;
  }, [supabase, documentId, documentType, currentPage, selectedText]);

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

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) throw new Error('Not authenticated');

        const userId = session.user?.id;
        if (!userId) throw new Error('Missing user');

        const context = await buildChatContext();

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
              user_id: userId,
              document_id: documentId,
              workspace_id: workspaceId,
              conversation_id: conversationIdAtSend,
              message,
              context,
              request_type: 'chat',
              model: selectedModelId,
            }),
          }
        );

        const json = await response.json().catch(() => null);
        if (!response.ok) {
          const uiErr = mapHttpError(response.status, json, 'chat');
          toast.show(uiErr);
          setError(uiErr.message);
          return;
        }

        // If the user started a new conversation (or hit "+") while the request was in-flight,
        // ignore this stale response.
        if (seq !== chatSeqRef.current) return;

        const data = ((json || {}) as any).data ?? ((json || {}) as any);

        // Update conversation ID if new
        if (data.conversation_id && !conversationIdAtSend) {
          setCurrentConversationId(data.conversation_id);
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.message?.content || 'No response',
          timestamp: data.message?.created_at || new Date().toISOString(),
        };
        setChatHistory((prev) => [...prev, assistantMessage]);
        // Keep Conversations list in sync (otherwise "+" feels like it does nothing).
        loadConversationHistory();
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
      loadConversationHistory,
      buildChatContext,
      selectedModelId,
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
          setShowHistoryOverlay(false);
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
    setShowHistoryOverlay(false);
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          <span className="font-semibold text-text">{t('title')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistoryOverlay(true)}
            title={t('history')}
          >
            <Clock className="w-4 h-4" />
            {t('history')}
          </Button>
          {supportsAnalysis && (
            <Button variant="ghost" size="sm" onClick={goToContractAnalysis}>
              <FileText className="w-4 h-4" />
              {t('documentAnalysis')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
            {t('close')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 min-h-0">
        <div className="flex flex-col h-full">
          {/* Quick actions when no chat */}
          {chatHistory.length === 0 && (
            <div className="space-y-4 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {/* Selected text display */}
              {selectedText && (
                <div className="p-3 bg-accent/5 border border-accent/20 rounded-scholar">
                  <p className="text-xs text-accent font-medium mb-1">{t('selectedText')}</p>
                  <p className="text-sm text-text line-clamp-3">{selectedText}</p>
                  <div className="mt-3 flex items-center gap-2">
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

              {supportsAnalysis && (
                <div className="p-4 bg-surface-alt border border-border rounded-scholar">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-accent/10 p-2">
                      <FileText className="w-4 h-4 text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text">{t('analysisCardTitle')}</p>
                      <p className="mt-1 text-sm text-text-soft">{t('analysisCardBody')}</p>
                      <div className="mt-3">
                        <Button variant="secondary" size="sm" onClick={goToContractAnalysis}>
                          {t('openAnalysis')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!selectedText && (
                <div className="text-center py-8">
                  <MessageSquare className="w-10 h-10 text-text-soft mx-auto mb-3" />
                  <p className="text-text-soft">{t('emptyState')}</p>
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && chatHistory.length === 0 && (
            <div className="flex items-center justify-center py-8 px-4">
              <Spinner size="lg" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4">
              <div className="p-3 bg-error/10 border border-error/20 rounded-scholar">
                <p className="text-sm text-error">{error}</p>
              </div>
            </div>
          )}

          {/* Chat messages */}
          {chatHistory.length > 0 && (
            <div className="flex-1 overflow-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-4">
              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-scholar max-w-[85%] group relative',
                    msg.role === 'user'
                      ? 'bg-accent text-white ml-auto'
                      : 'bg-surface-alt border border-border'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => pinMessage(msg)}
                      className="absolute -top-2 -right-2 p-1 bg-surface rounded-full border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-alt"
                      title={t('saveToNotes')}
                    >
                      <Star className="w-3 h-3 text-text-soft" />
                    </button>
                  )}
                </div>
              ))}
              {(loading || loadingConversation) && (
                <div className="flex items-center gap-2 p-3">
                  <Spinner size="sm" />
                  <span className="text-sm text-text-soft">
                    {loadingConversation ? t('loadingConversation') : t('thinking')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Chat input - always visible */}
          <div className="border-t border-border p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowModelPicker(true)}
                className="inline-flex max-w-full items-center gap-2 rounded-scholar border border-border bg-surface-alt px-3 py-2 text-left transition-colors hover:border-accent/40 hover:text-text"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                  {selectedModel?.providerMark || 'M'}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-text">
                    {selectedModel?.title || t('modelPicker.customModel')}
                  </span>
                  <span className="block truncate text-xs text-text-soft">
                    {selectedModel ? t(`modelPicker.featureLabels.${selectedModel.featureKey}`) : selectedModelId}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-text-soft" />
              </button>
              {selectedModel?.isOpenSource ? (
                <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent">
                  {t('modelPicker.openSource')}
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChat(chatInput)}
                placeholder={t('inputPlaceholder')}
                className="flex-1 px-4 py-2.5 bg-surface-alt border border-border rounded-scholar text-text placeholder:text-text-soft focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <Button
                onClick={() => handleChat(chatInput)}
                disabled={!chatInput.trim() || loading || loadingConversation}
                size="md"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {showHistoryOverlay && (
          <div className="absolute inset-0 z-10 border-t border-border bg-surface flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" />
                <span className="font-semibold text-text">{t('history')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startNewConversation}
                >
                  {t('newConversation')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowHistoryOverlay(false)}>
                  <X className="w-4 h-4" />
                  {t('close')}
                </Button>
              </div>
            </div>
            <div className="p-4 space-y-4 overflow-auto min-h-0 flex-1">
              {conversationHistory.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-10 h-10 text-text-soft mx-auto mb-3" />
                  <p className="text-text-soft">{t('noConversations')}</p>
                  <p className="text-sm text-text-soft mt-1">{t('historyEmpty')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversationHistory.map((conv) => (
                    (() => {
                      const isActive = conv.id === currentConversationId;
                      return (
                        <button
                          key={conv.id}
                          onClick={() => loadConversation(conv.id)}
                          className={cn(
                            'w-full p-3 border rounded-scholar transition-colors text-left group',
                            isActive
                              ? 'bg-accent/5 border-accent/40'
                              : 'bg-surface-alt border-border hover:border-accent/50'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-text font-medium truncate flex-1">
                              {conv.preview}
                            </p>
                            <Clock className="w-4 h-4 text-text-soft group-hover:text-accent transition-colors flex-shrink-0" />
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-soft">
                              {t('messageCount', { count: conv.messageCount })}
                            </span>
                            <span className="text-xs text-text-soft">•</span>
                            <span className="text-xs text-text-soft">
                              {formatRelativeTime(conv.timestamp)}
                            </span>
                          </div>
                        </button>
                      );
                    })()
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {showModelPicker && (
          <div className="absolute inset-0 z-20 bg-black/40 p-4">
            <div className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-base font-semibold text-text">{t('modelPicker.title')}</div>
                  <div className="text-sm text-text-soft">{t('modelPicker.subtitle')}</div>
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

              <div className="min-h-0 flex-1 overflow-auto p-4 space-y-3">
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
                        'w-full rounded-2xl border p-4 text-left transition-colors',
                        isSelected
                          ? 'border-accent bg-accent/5'
                          : 'border-border bg-surface-alt hover:border-accent/40'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                          {option.providerMark}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-text">{option.title}</span>
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
                          <div className="mt-2 text-xs text-text-soft">{option.id}</div>
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
