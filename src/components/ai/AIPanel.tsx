'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Sparkles,
  MessageSquare,
  FileText,
  Send,
  Bookmark,
  Clock,
  Star,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { Button, Spinner, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn, formatRelativeTime } from '@/lib/utils';
import { mapHttpError } from '@/lib/errors';
import type { DocumentType } from '@/types/database';

interface AIPanelProps {
  documentId: string;
  workspaceId: string;
  selectedText?: string;
  currentPage?: number;
  onClose: () => void;
  documentType?: DocumentType;
}

// Tab types matching iOS RightPanelView
type Tab = 'chat' | 'conversations' | 'notes';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  isPinned?: boolean;
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
}: AIPanelProps) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [pinnedNotes, setPinnedNotes] = useState<ChatMessage[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Load pinned notes (from explanations table where they're saved as notes)
  const loadPinnedNotes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('document_id', documentId)
        .eq('note_type', 'ai_saved')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setPinnedNotes(
          data.map((note) => ({
            role: 'assistant' as const,
            content: note.note_text || '',
            timestamp: note.created_at,
            isPinned: true,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load pinned notes:', err);
    }
  }, [supabase, documentId]);

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
              preview: item.input_text || item.response_text?.slice(0, 100) || 'Conversation',
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
  }, [supabase, documentId]);

  // Initialize on mount - clear chat state and load auxiliary data
  useEffect(() => {
    // Always start with empty chat on new session
    setChatHistory([]);
    setCurrentConversationId(null);
    setResult(null);
    setError(null);
    
    // Load supporting data
    loadPinnedNotes();
    loadConversationHistory();
  }, [loadPinnedNotes, loadConversationHistory]);

  const goToContractAnalysis = useCallback(() => {
    router.push(`/workspaces/${workspaceId}/documents/${documentId}/contract-analysis`);
  }, [router, workspaceId, documentId]);

  const handleExplain = useCallback(
    async (text: string, requestType: string = 'explain') => {
      if (!text.trim()) return;

      setLoading(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) throw new Error('Not authenticated');

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/explain`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              text,
              document_id: documentId,
              page_number: currentPage,
              request_type: requestType,
            }),
          }
        );

        const json = await response.json().catch(() => null);
        if (!response.ok) {
          const uiErr = mapHttpError(response.status, json, 'explain');
          toast.show(uiErr);
          setError(uiErr.message);
          return;
        }

        const data = (json || {}) as any;
        setResult(data.explanation || data.response_html || data.response_text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [supabase, documentId, currentPage, toast]
  );

  const handleChat = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

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

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ask-workspace`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              question: message,
              workspace_id: workspaceId,
              user_id: userId,
              conversation_id: currentConversationId,
              options: {
                document_ids: [documentId],
                top_k: 10,
                include_quotes: true,
              },
            }),
          }
        );

        const json = await response.json().catch(() => null);
        if (!response.ok) {
          const uiErr = mapHttpError(response.status, json, 'ask-workspace');
          toast.show(uiErr);
          setError(uiErr.message);
          return;
        }

        const data = (json || {}) as any;

        // Update conversation ID if new
        if (data.conversation_id && !currentConversationId) {
          setCurrentConversationId(data.conversation_id);
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.answer || 'No response',
          timestamp: new Date().toISOString(),
        };
        setChatHistory((prev) => [...prev, assistantMessage]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [supabase, workspaceId, documentId, currentConversationId, toast]
  );

  const pinMessage = useCallback(
    async (message: ChatMessage) => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) return;

        // Save as a note
        await supabase.from('notes').insert({
          user_id: session.user.id,
          document_id: documentId,
          workspace_id: workspaceId,
          note_type: 'ai_saved',
          note_text: message.content,
        });

        // Refresh pinned notes
        loadPinnedNotes();
      } catch (err) {
        console.error('Failed to pin message:', err);
      }
    },
    [supabase, documentId, workspaceId, loadPinnedNotes]
  );

  const loadConversation = useCallback(
    async (conversationId: string) => {
      try {
        const { data, error } = await supabase
          .from('explanations')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (!error && data) {
          const messages: ChatMessage[] = data.flatMap((item) => {
            const msgs: ChatMessage[] = [];
            if (item.input_text) {
              msgs.push({
                role: 'user',
                content: item.input_text,
                timestamp: item.created_at,
              });
            }
            if (item.response_text) {
              msgs.push({
                role: 'assistant',
                content: item.response_text,
                timestamp: item.created_at,
              });
            }
            return msgs;
          });

          setChatHistory(messages);
          setCurrentConversationId(conversationId);
          setActiveTab('chat');
        }
      } catch (err) {
        console.error('Failed to load conversation:', err);
      }
    },
    [supabase]
  );

  const startNewConversation = useCallback(() => {
    setActiveTab('chat');
    setChatHistory([]);
    setCurrentConversationId(null);
    setResult(null);
    setError(null);
    setLoading(false);
    setChatInput('');
  }, []);

  return (
    <div className="w-96 flex flex-col bg-surface h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          <span className="font-semibold text-text">AI Assistant</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startNewConversation}
            className="p-1.5 rounded-lg hover:bg-accent/10 transition-colors"
            title="New conversation"
          >
            <Plus className="w-5 h-5 text-accent" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>
      </div>

      {/* Tabs - Matching iOS: Chat, Conversations, Notes */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'chat'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-soft hover:text-text'
          )}
        >
          <Sparkles className="w-4 h-4" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('conversations')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'conversations'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-soft hover:text-text'
          )}
        >
          <Clock className="w-4 h-4" />
          Conversations
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'notes'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-soft hover:text-text'
          )}
        >
          <Bookmark className="w-4 h-4" />
          Notes
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            {/* Quick actions when no chat */}
            {chatHistory.length === 0 && !result && (
              <div className="p-4 space-y-4">
                {/* Selected text display */}
                {selectedText && (
                  <div className="p-3 bg-accent/5 border border-accent/20 rounded-scholar">
                    <p className="text-xs text-accent font-medium mb-1">Selected Text</p>
                    <p className="text-sm text-text line-clamp-3">{selectedText}</p>
                  </div>
                )}

                {/* Empty state */}
                {!selectedText && (
                  <div className="text-center py-8">
                    <MessageSquare className="w-10 h-10 text-text-soft mx-auto mb-3" />
                    <p className="text-text-soft">
                      Ask questions about this document or select text to explain
                    </p>
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

            {/* Explanation Result */}
            {result && !loading && chatHistory.length === 0 && (
              <div className="p-4">
                <div className="p-4 bg-surface-alt border border-border rounded-scholar">
                  <div
                    className="prose prose-sm max-w-none text-text"
                    dangerouslySetInnerHTML={{ __html: result }}
                  />
                </div>
                <button
                  onClick={() =>
                    pinMessage({
                      role: 'assistant',
                      content: result,
                      timestamp: new Date().toISOString(),
                    })
                  }
                  className="mt-2 flex items-center gap-1.5 text-sm text-text-soft hover:text-accent transition-colors"
                >
                  <Star className="w-4 h-4" />
                  Save to Notes
                </button>
              </div>
            )}

            {/* Chat messages */}
            {chatHistory.length > 0 && (
              <div className="flex-1 overflow-auto p-4 space-y-4">
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
                      >
                        <Star className="w-3 h-3 text-text-soft" />
                      </button>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 p-3">
                    <Spinner size="sm" />
                    <span className="text-sm text-text-soft">Thinking...</span>
                  </div>
                )}
              </div>
            )}

            {/* Chat input - always visible */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChat(chatInput)}
                  placeholder="Ask a question..."
                  className="flex-1 px-4 py-2.5 bg-surface-alt border border-border rounded-scholar text-text placeholder:text-text-soft focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <Button
                  onClick={() => handleChat(chatInput)}
                  disabled={!chatInput.trim() || loading}
                  size="md"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="p-4 space-y-4">
            {pinnedNotes.length === 0 ? (
              <div className="text-center py-8">
                <Bookmark className="w-10 h-10 text-text-soft mx-auto mb-3" />
                <p className="text-text-soft">No saved notes yet</p>
                <p className="text-sm text-text-soft mt-1">
                  Star AI responses to save them here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-text-soft">
                  {pinnedNotes.length} saved note{pinnedNotes.length !== 1 ? 's' : ''}
                </p>
                {pinnedNotes.map((note, i) => (
                  <div
                    key={i}
                    className="p-4 bg-surface-alt border border-border rounded-scholar"
                  >
                    <div className="flex items-start gap-2">
                      <Star className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text line-clamp-4">{note.content}</p>
                        {note.timestamp && (
                          <p className="text-xs text-text-soft mt-2">
                            {formatRelativeTime(note.timestamp)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'conversations' && (
          <div className="p-4 space-y-4">
            {conversationHistory.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-10 h-10 text-text-soft mx-auto mb-3" />
                <p className="text-text-soft">No conversations yet</p>
                <p className="text-sm text-text-soft mt-1">
                  Your past conversations will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {conversationHistory.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className="w-full p-3 bg-surface-alt border border-border rounded-scholar hover:border-accent/50 transition-colors text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-text font-medium truncate flex-1">
                        {conv.preview}
                      </p>
                      <ChevronRight className="w-4 h-4 text-text-soft group-hover:text-accent transition-colors flex-shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-text-soft">
                        {conv.messageCount} message{conv.messageCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-text-soft">•</span>
                      <span className="text-xs text-text-soft">
                        {formatRelativeTime(conv.timestamp)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
