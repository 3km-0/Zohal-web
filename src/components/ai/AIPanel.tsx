'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Sparkles,
  MessageSquare,
  BookOpen,
  Scale,
  Calculator,
  FileText,
  Send,
  Lightbulb,
} from 'lucide-react';
import { Button, Input, Spinner, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { DocumentType } from '@/types/database';

interface AIPanelProps {
  documentId: string;
  workspaceId: string;
  selectedText?: string;
  currentPage?: number;
  onClose: () => void;
  documentType?: DocumentType;
}

type Tab = 'explain' | 'chat' | 'insights';

// Capability buttons based on document type
const getCapabilities = (docType?: DocumentType) => {
  const baseCapabilities = [
    { id: 'explain', icon: Lightbulb, label: 'Explain', color: 'text-amber-500' },
    { id: 'summarize', icon: BookOpen, label: 'Summarize', color: 'text-blue-500' },
  ];

  if (docType === 'contract') {
    return [
      ...baseCapabilities,
      { id: 'analyze', icon: Scale, label: 'Contract Analysis', color: 'text-purple-500' },
      { id: 'risks', icon: FileText, label: 'Detect Risks', color: 'text-rose-500' },
    ];
  }

  if (docType === 'problem_set' || docType === 'textbook') {
    return [
      ...baseCapabilities,
      { id: 'hint', icon: Lightbulb, label: 'Get Hint', color: 'text-green-500' },
      { id: 'verify', icon: Calculator, label: 'Verify Solution', color: 'text-cyan-500' },
    ];
  }

  return baseCapabilities;
};

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
  const [activeTab, setActiveTab] = useState<Tab>('explain');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);

  const capabilities = getCapabilities(documentType);

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

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to get explanation');
        }

        const data = await response.json();
        setResult(data.explanation || data.response_html || data.response_text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [supabase, documentId, currentPage]
  );

  const handleChat = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      const userMessage = { role: 'user' as const, content: message };
      setChatHistory((prev) => [...prev, userMessage]);
      setChatInput('');
      setLoading(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) throw new Error('Not authenticated');

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
              document_ids: [documentId],
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to get response');
        }

        const data = await response.json();
        const assistantMessage = {
          role: 'assistant' as const,
          content: data.answer || 'No response',
        };
        setChatHistory((prev) => [...prev, assistantMessage]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [supabase, workspaceId, documentId]
  );

  return (
    <div className="w-96 flex flex-col bg-surface h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          <span className="font-semibold text-text">AI Tools</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors"
        >
          <X className="w-5 h-5 text-text-soft" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('explain')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'explain'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-soft hover:text-text'
          )}
        >
          Explain
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'chat'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-soft hover:text-text'
          )}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'insights'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-soft hover:text-text'
          )}
        >
          Insights
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'explain' && (
          <div className="space-y-4">
            {/* Selected text display */}
            {selectedText && (
              <div className="p-3 bg-accent/5 border border-accent/20 rounded-scholar">
                <p className="text-xs text-accent font-medium mb-1">Selected Text</p>
                <p className="text-sm text-text line-clamp-3">{selectedText}</p>
              </div>
            )}

            {/* Capability buttons */}
            <div className="grid grid-cols-2 gap-2">
              {capabilities.map((cap) => (
                <button
                  key={cap.id}
                  onClick={() => {
                    if (cap.id === 'analyze') {
                      goToContractAnalysis();
                      return;
                    }
                    if (selectedText) {
                      handleExplain(selectedText, cap.id);
                    }
                  }}
                  disabled={(cap.id !== 'analyze' && !selectedText) || loading}
                  className={cn(
                    'flex items-center gap-2 p-3 rounded-scholar border border-border',
                    'hover:border-accent/50 hover:bg-surface-alt transition-all',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <cap.icon className={cn('w-4 h-4', cap.color)} />
                  <span className="text-sm font-medium text-text">{cap.label}</span>
                </button>
              ))}
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-error/10 border border-error/20 rounded-scholar">
                <p className="text-sm text-error">{error}</p>
              </div>
            )}

            {/* Result */}
            {result && !loading && (
              <div className="p-4 bg-surface-alt border border-border rounded-scholar">
                <div
                  className="prose prose-sm max-w-none text-text"
                  dangerouslySetInnerHTML={{ __html: result }}
                />
              </div>
            )}

            {/* Empty state */}
            {!selectedText && !result && !loading && (
              <div className="text-center py-8">
                <Sparkles className="w-10 h-10 text-text-soft mx-auto mb-3" />
                <p className="text-text-soft">
                  Select text in the document to use AI tools
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            {/* Chat messages */}
            <div className="flex-1 overflow-auto space-y-4 mb-4">
              {chatHistory.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-10 h-10 text-text-soft mx-auto mb-3" />
                  <p className="text-text-soft">Ask questions about this document</p>
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      'p-3 rounded-scholar max-w-[85%]',
                      msg.role === 'user'
                        ? 'bg-accent text-white ml-auto'
                        : 'bg-surface-alt border border-border'
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex items-center gap-2 p-3">
                  <Spinner size="sm" />
                  <span className="text-sm text-text-soft">Thinking...</span>
                </div>
              )}
            </div>

            {/* Chat input */}
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
        )}

        {activeTab === 'insights' && (
          <div className="space-y-4">
            <p className="text-sm text-text-soft">
              Insights extracted from this document will appear here.
            </p>
            {/* TODO: Fetch and display insights */}
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-text-soft mx-auto mb-3" />
              <p className="text-text-soft">No insights extracted yet</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

