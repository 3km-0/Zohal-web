'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Search as SearchIcon,
  FileText,
  Sparkles,
  ArrowRight,
  Globe,
  Building2,
  MessageSquare,
  History,
  GitBranch,
  CircleHelp,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Spinner, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn, truncate } from '@/lib/utils';
import { mapHttpError } from '@/lib/errors';
import type {
  UnifiedSearchResponse,
  UnifiedSearchMessage,
  UnifiedSearchScope,
  Workspace,
} from '@/types/database';

type ThreadTurn = {
  id: string;
  userText: string;
  assistantText?: string;
  response?: UnifiedSearchResponse;
  createdAt: string;
  loading?: boolean;
};

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  scope: UnifiedSearchScope;
  workspaceId: string | null;
};

const MAX_CONTEXT_MESSAGES = 8;

function asScope(value: string | null): UnifiedSearchScope {
  return value === 'workspace' ? 'workspace' : 'global';
}

function parseScopeFromContext(contextText: string | null): UnifiedSearchScope {
  if (!contextText) return 'global';
  try {
    const parsed = JSON.parse(contextText);
    return parsed?.scope === 'workspace' ? 'workspace' : 'global';
  } catch {
    return 'global';
  }
}

function buildContextMessages(turns: ThreadTurn[]): UnifiedSearchMessage[] {
  const messages: UnifiedSearchMessage[] = [];
  for (const turn of turns) {
    messages.push({ role: 'user', content: turn.userText });
    const assistant = turn.assistantText || turn.response?.insight_answer?.answer || turn.response?.ai_answer?.answer;
    if (assistant) {
      messages.push({ role: 'assistant', content: assistant });
    }
  }
  if (messages.length <= MAX_CONTEXT_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_CONTEXT_MESSAGES);
}

function getAssistantText(response?: UnifiedSearchResponse, fallback?: string): string {
  if (fallback) return fallback;
  if (!response) return '';
  if (response.insight_answer?.answer) return response.insight_answer.answer;
  if (response.ai_answer?.answer) return response.ai_answer.answer;
  if (response.status === 'needs_clarification') {
    return response.clarifying_question || '';
  }
  return '';
}

export default function SearchPage() {
  const t = useTranslations('search');
  const tCommon = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const searchParams = useSearchParams();

  const [composerQuery, setComposerQuery] = useState('');
  const [followUpQuery, setFollowUpQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scope, setScope] = useState<UnifiedSearchScope>('global');
  const [workspaceFilterId, setWorkspaceFilterId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationSummary[]>([]);
  const [turns, setTurns] = useState<ThreadTurn[]>([]);

  const [documentWorkspaceMap, setDocumentWorkspaceMap] = useState<Record<string, string>>({});

  const bootstrapDoneRef = useRef(false);
  const inFlightControllerRef = useRef<AbortController | null>(null);

  const selectedWorkspaceName = useMemo(() => {
    if (!workspaceFilterId) return null;
    return workspaces.find((ws) => ws.id === workspaceFilterId)?.name || null;
  }, [workspaceFilterId, workspaces]);

  const refreshConversationHistory = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) return;

    const { data, error: listError } = await supabase
      .from('conversations')
      .select('id, title, updated_at, context_text, workspace_id')
      .order('updated_at', { ascending: false })
      .limit(30);

    if (listError || !data) return;

    setConversationHistory(
      data.map((row: any) => ({
        id: row.id,
        title: row.title || t('untitledThread'),
        updatedAt: row.updated_at,
        scope: parseScopeFromContext(row.context_text),
        workspaceId: row.workspace_id || null,
      }))
    );
  }, [supabase, t]);

  const hydrateDocumentWorkspaceIds = useCallback(
    async (response: UnifiedSearchResponse | undefined) => {
      if (!response) return;

      const ids = new Set<string>();
      response.search_results.forEach((item) => ids.add(item.document_id));
      response.ai_answer?.citations.forEach((item) => ids.add(item.document_id));
      if (response.insight_answer?.document_id) ids.add(response.insight_answer.document_id);

      const pendingIds = Array.from(ids).filter((id) => !documentWorkspaceMap[id]);
      if (pendingIds.length === 0) return;

      const { data } = await supabase
        .from('documents')
        .select('id, workspace_id')
        .in('id', pendingIds);

      if (!data) return;

      setDocumentWorkspaceMap((prev) => {
        const next = { ...prev };
        data.forEach((row: any) => {
          if (row.workspace_id) {
            next[row.id] = row.workspace_id;
          }
        });
        return next;
      });
    },
    [documentWorkspaceMap, supabase]
  );

  const executeTurn = useCallback(
    async (
      rawQuery: string,
      opts?: {
        startNew?: boolean;
        overrideScope?: UnifiedSearchScope;
        overrideWorkspaceId?: string | null;
      }
    ) => {
      const query = rawQuery.trim();
      if (!query) return;

      const startNew = opts?.startNew ?? false;
      const effectiveScope = opts?.overrideScope ?? scope;
      const effectiveWorkspaceFilter = opts?.overrideWorkspaceId ?? workspaceFilterId;
      const previousTurns = startNew ? [] : turns;

      if (startNew) {
        setConversationId(null);
        setActiveConversationId(null);
      }

      inFlightControllerRef.current?.abort();
      const abortController = new AbortController();
      inFlightControllerRef.current = abortController;

      const turnId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const pendingTurn: ThreadTurn = {
        id: turnId,
        userText: query,
        createdAt: new Date().toISOString(),
        loading: true,
      };

      setError(null);
      setLoading(true);
      setTurns(startNew ? [pendingTurn] : [...previousTurns, pendingTurn]);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          throw new Error(t('errors.notAuthenticated'));
        }

        const payload: Record<string, unknown> = {
          query,
          user_id: session.user.id,
          scope: effectiveScope,
          options: {
            top_k: 20,
            include_ai_answer: true,
          },
          messages: buildContextMessages(previousTurns),
        };

        if (!startNew && conversationId) {
          payload.conversation_id = conversationId;
        }

        if (effectiveScope === 'workspace' && effectiveWorkspaceFilter) {
          payload.workspace_id = effectiveWorkspaceFilter;
        }

        if (effectiveScope === 'global' && effectiveWorkspaceFilter) {
          payload.workspace_ids_override = [effectiveWorkspaceFilter];
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/unified-search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });

        const json = await response.json().catch(() => null);

        if (!response.ok) {
          const uiErr = mapHttpError(response.status, json, 'unified-search');
          toast.show(uiErr);
          throw new Error(uiErr.message);
        }

        const data = (json || {}) as UnifiedSearchResponse;
        const assistantText = getAssistantText(data);

        setConversationId(data.conversation_id || conversationId);
        setActiveConversationId(data.conversation_id || conversationId);
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  loading: false,
                  response: data,
                  assistantText,
                }
              : turn
          )
        );

        await hydrateDocumentWorkspaceIds(data);
        await refreshConversationHistory();
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setTurns((prev) => prev.filter((turn) => turn.id !== turnId));
        setError(err instanceof Error ? err.message : t('errors.generic'));
      } finally {
        setLoading(false);
      }
    },
    [
      conversationId,
      hydrateDocumentWorkspaceIds,
      refreshConversationHistory,
      scope,
      supabase,
      t,
      toast,
      turns,
      workspaceFilterId,
    ]
  );

  const loadConversation = useCallback(
    async (nextConversationId: string, nextScope?: UnifiedSearchScope, nextWorkspaceId?: string | null) => {
      const { data, error: loadError } = await supabase
        .from('explanations')
        .select('id, role, input_text, response_text, created_at')
        .eq('conversation_id', nextConversationId)
        .order('created_at', { ascending: true })
        .limit(120);

      if (loadError) {
        setError(loadError.message);
        return;
      }

      const rebuilt: ThreadTurn[] = [];
      for (const row of (data || []) as any[]) {
        if (row.role === 'user') {
          rebuilt.push({
            id: row.id,
            userText: row.input_text || '',
            createdAt: row.created_at,
          });
          continue;
        }

        const last = rebuilt[rebuilt.length - 1];
        if (last && !last.assistantText) {
          last.assistantText = row.response_text || '';
        }
      }

      setTurns(rebuilt.filter((turn) => turn.userText));
      setConversationId(nextConversationId);
      setActiveConversationId(nextConversationId);
      if (nextScope) setScope(nextScope);
      if (nextScope === 'workspace') {
        setWorkspaceFilterId(nextWorkspaceId || null);
      }
      if (nextScope === 'global' && !nextWorkspaceId) {
        setWorkspaceFilterId(null);
      }
      setError(null);
    },
    [supabase]
  );

  useEffect(() => {
    async function fetchWorkspaces() {
      const { data } = await supabase
        .from('workspaces')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      if (data) {
        setWorkspaces(data as Workspace[]);
      }
    }

    void fetchWorkspaces();
    void refreshConversationHistory();
  }, [refreshConversationHistory, supabase]);

  useEffect(() => {
    if (bootstrapDoneRef.current) return;
    bootstrapDoneRef.current = true;

    const q = searchParams.get('q') || '';
    const nextScope = asScope(searchParams.get('scope'));
    const workspaceIdFromParams = searchParams.get('workspaceId');

    setScope(nextScope);
    if (workspaceIdFromParams) {
      setWorkspaceFilterId(workspaceIdFromParams);
    }

    if (q) {
      setComposerQuery(q);
      void executeTurn(q, {
        startNew: true,
        overrideScope: nextScope,
        overrideWorkspaceId: workspaceIdFromParams,
      });
    }
  }, [executeTurn, searchParams]);

  const handleScopeSwitch = (nextScope: UnifiedSearchScope) => {
    if (nextScope === scope) return;

    if (loading) {
      inFlightControllerRef.current?.abort();
    }

    if (turns.length > 0) {
      const confirmed = window.confirm(t('switchScopeConfirm'));
      if (!confirmed) return;
    }

    setScope(nextScope);
    if (nextScope === 'global' && !workspaceFilterId) {
      setWorkspaceFilterId(null);
    }
  };

  const startNewThread = () => {
    inFlightControllerRef.current?.abort();
    setTurns([]);
    setConversationId(null);
    setActiveConversationId(null);
    setComposerQuery('');
    setFollowUpQuery('');
    setError(null);
  };

  const handleComposerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeTurn(composerQuery, { startNew: true });
    setComposerQuery('');
  };

  const handleFollowUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeTurn(followUpQuery);
    setFollowUpQuery('');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <form onSubmit={handleComposerSubmit}>
            <Card className="border-accent/20 bg-gradient-to-br from-surface to-surface-alt" padding="lg">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-accent" />
                <p className="text-sm font-medium text-text">{t('askFindTitle')}</p>
              </div>
              <textarea
                value={composerQuery}
                onChange={(e) => setComposerQuery(e.target.value)}
                placeholder={t('askFindPlaceholder')}
                className="w-full min-h-[104px] rounded-scholar-lg border border-border bg-surface p-3 text-text placeholder:text-text-soft focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleScopeSwitch('global')}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    scope === 'global'
                      ? 'border-accent bg-accent text-white'
                      : 'border-border text-text-soft hover:border-accent'
                  )}
                >
                  <Globe className="h-4 w-4" />
                  {t('scopeGlobal')}
                </button>
                <button
                  type="button"
                  onClick={() => handleScopeSwitch('workspace')}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    scope === 'workspace'
                      ? 'border-accent bg-accent text-white'
                      : 'border-border text-text-soft hover:border-accent'
                  )}
                >
                  <Building2 className="h-4 w-4" />
                  {t('scopeWorkspace')}
                </button>

                <div className="ml-auto">
                  <Button type="submit" disabled={!composerQuery.trim() || loading}>
                    {loading ? <Spinner size="sm" /> : <SearchIcon className="h-4 w-4" />}
                    {t('askFindSubmit')}
                  </Button>
                </div>
              </div>

              {scope === 'global' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setWorkspaceFilterId(null)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-colors',
                      !workspaceFilterId ? 'border-accent bg-accent text-white' : 'border-border text-text-soft'
                    )}
                  >
                    {t('allWorkspacesFilter')}
                  </button>
                  {workspaces.slice(0, 8).map((ws) => (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => setWorkspaceFilterId(ws.id)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        workspaceFilterId === ws.id
                          ? 'border-accent bg-accent text-white'
                          : 'border-border text-text-soft'
                      )}
                    >
                      {ws.name}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </form>

          {error && (
            <div className="rounded-scholar border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</div>
          )}

          <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <Card padding="md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-text">
                    <History className="h-4 w-4" />
                    <p className="text-sm font-semibold">{t('threadHistory')}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={startNewThread}>
                    <GitBranch className="h-4 w-4" />
                    {t('newThread')}
                  </Button>
                </div>
                <div className="mt-3 space-y-1">
                  {conversationHistory.length === 0 && (
                    <p className="text-xs text-text-soft">{t('threadHistoryEmpty')}</p>
                  )}
                  {conversationHistory.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void loadConversation(item.id, item.scope, item.workspaceId)}
                      className={cn(
                        'w-full rounded-scholar px-2 py-2 text-left text-xs transition-colors',
                        activeConversationId === item.id ? 'bg-accent/10 text-accent' : 'text-text-soft hover:bg-surface-alt'
                      )}
                    >
                      <p className="line-clamp-2 font-medium text-sm text-text">{item.title}</p>
                      <p>
                        {item.scope === 'workspace' ? t('scopeWorkspace') : t('scopeGlobal')} ·{' '}
                        {new Date(item.updatedAt).toLocaleString()}
                      </p>
                    </button>
                  ))}
                </div>
              </Card>
            </aside>

            <section className="space-y-4">
              {turns.length === 0 && !loading && (
                <EmptyState
                  icon={<MessageSquare className="h-8 w-8" />}
                  title={t('threadEmptyTitle')}
                  description={t('threadEmptyDescription')}
                />
              )}

              {turns.map((turn) => {
                const response = turn.response;
                const appliedScope = response?.applied_scope?.scope || scope;
                const assistantText = getAssistantText(response, turn.assistantText);
                const confidence = response?.insight_answer?.confidence ?? response?.ai_answer?.confidence;
                const citations = response?.ai_answer?.citations || [];

                return (
                  <div key={turn.id} className="space-y-3">
                    <Card padding="md">
                      <p className="text-xs text-text-soft mb-1">{t('userLabel')}</p>
                      <p className="text-text whitespace-pre-wrap">{turn.userText}</p>
                    </Card>

                    <Card className="border-accent/20" padding="md">
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <Badge size="sm">{appliedScope === 'workspace' ? t('scopeWorkspace') : t('scopeGlobal')}</Badge>
                        {selectedWorkspaceName && scope === 'global' && (
                          <Badge size="sm" variant="default">
                            {selectedWorkspaceName}
                          </Badge>
                        )}
                        {response?.status && response.status !== 'answered' && (
                          <Badge size="sm" variant="default">
                            {response.status === 'needs_clarification' ? t('statusNeedsClarification') : t('statusInsufficientEvidence')}
                          </Badge>
                        )}
                        {typeof confidence === 'number' && (
                          <Badge size="sm" variant="default">
                            {t('confidenceLabel', { value: Math.round(confidence * 100) })}
                          </Badge>
                        )}
                      </div>

                      {turn.loading ? (
                        <div className="flex items-center gap-2 text-text-soft">
                          <Spinner size="sm" />
                          <span>{t('turnLoading')}</span>
                        </div>
                      ) : assistantText ? (
                        <p className="text-text whitespace-pre-wrap">{assistantText}</p>
                      ) : (
                        <p className="text-text-soft">{t('noAssistantText')}</p>
                      )}

                      {response?.clarifying_question && response.status === 'needs_clarification' && (
                        <div className="mt-3 rounded-scholar border border-border bg-surface-alt p-3 text-sm text-text">
                          <div className="mb-1 inline-flex items-center gap-1 text-text-soft">
                            <CircleHelp className="h-4 w-4" />
                            {t('clarificationTitle')}
                          </div>
                          <p>{response.clarifying_question}</p>
                        </div>
                      )}

                      {response?.status === 'insufficient_evidence' && (
                        <div className="mt-3 rounded-scholar border border-border bg-surface-alt p-3 text-sm text-text-soft inline-flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          {t('insufficientEvidenceHint')}
                        </div>
                      )}

                      {citations.length > 0 && (
                        <div className="mt-4 border-t border-border pt-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-text-soft">{t('sourcesTitle', { count: citations.length })}</p>
                          {citations.map((citation, idx) => {
                            const workspaceId = documentWorkspaceMap[citation.document_id];
                            const href = workspaceId ? `/workspaces/${workspaceId}/documents/${citation.document_id}` : '';
                            return (
                              <div key={`${citation.document_id}-${idx}`} className="rounded-scholar border border-border p-2">
                                {href ? (
                                  <Link href={href} className="group flex items-center gap-2 text-sm text-text">
                                    <FileText className="h-4 w-4 text-text-soft" />
                                    <span className="flex-1 truncate">{citation.document_title}</span>
                                    <Badge size="sm">p. {citation.page_number}</Badge>
                                    <ArrowRight className="h-4 w-4 text-text-soft opacity-0 transition-opacity group-hover:opacity-100" />
                                  </Link>
                                ) : (
                                  <div className="flex items-center gap-2 text-sm text-text-soft">
                                    <FileText className="h-4 w-4" />
                                    <span className="flex-1 truncate">{citation.document_title}</span>
                                    <Badge size="sm">p. {citation.page_number}</Badge>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {response?.search_results && response.search_results.length > 0 && (
                        <div className="mt-4 border-t border-border pt-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-text-soft">
                            {t('evidenceTitle', { count: response.search_results.length })}
                          </p>
                          {response.search_results.slice(0, 5).map((result) => {
                            const workspaceId = documentWorkspaceMap[result.document_id];
                            const href = workspaceId ? `/workspaces/${workspaceId}/documents/${result.document_id}` : '';
                            return (
                              <div key={result.chunk_id} className="rounded-scholar border border-border p-3">
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="font-medium text-text truncate">{result.document_title}</span>
                                  <Badge size="sm">p. {result.page_number}</Badge>
                                  <Badge size="sm" variant="default">
                                    {Math.round((result.similarity || 0) * 100)}%
                                  </Badge>
                                </div>
                                <p className="text-sm text-text-soft">{truncate(result.content_text, 220)}</p>
                                {href && (
                                  <Link href={href} className="mt-2 inline-flex items-center gap-1 text-xs text-accent">
                                    {tCommon('open')}
                                    <ArrowRight className="h-3 w-3" />
                                  </Link>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  </div>
                );
              })}

              {turns.length > 0 && (
                <form onSubmit={handleFollowUpSubmit} className="sticky bottom-0 z-10 rounded-scholar-lg border border-border bg-surface/95 p-3 backdrop-blur">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={followUpQuery}
                      onChange={(e) => setFollowUpQuery(e.target.value)}
                      placeholder={t('followUpPlaceholder')}
                      className="min-h-[70px] flex-1 rounded-scholar border border-border bg-surface p-2 text-text placeholder:text-text-soft focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <Button type="submit" disabled={!followUpQuery.trim() || loading}>
                      {loading ? <Spinner size="sm" /> : <ArrowRight className="h-4 w-4" />}
                      {t('followUpSubmit')}
                    </Button>
                  </div>
                </form>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
