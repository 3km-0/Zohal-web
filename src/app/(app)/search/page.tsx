'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Search as SearchIcon, FileText, Sparkles, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Input, Button, Card, Spinner, Badge, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn, debounce, truncate } from '@/lib/utils';
import { mapHttpError } from '@/lib/errors';
import { getWorkspaceFilterChips, isQuestionQuery } from '@/lib/workspace-logic';
import type { SearchResult, AskWorkspaceResult, Workspace } from '@/types/database';

export default function SearchPage() {
  const t = useTranslations('search');
  const supabase = createClient();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState<AskWorkspaceResult | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch workspaces on mount
  useEffect(() => {
    async function fetchWorkspaces() {
      const { data } = await supabase
        .from('workspaces')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      if (data) {
        setWorkspaces(data);
      }
    }
    fetchWorkspaces();
  }, [supabase]);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setAnswer(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) throw new Error('Not authenticated');
        const userId = session.user?.id;
        if (!userId) throw new Error('Missing user');

        // If it's a question, use ask-workspace for RAG
        if (isQuestionQuery(searchQuery)) {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ask-workspace`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                question: searchQuery,
                workspace_id: selectedWorkspace || undefined,
                user_id: userId,
              }),
            }
          );

          const json = await response.json().catch(() => null);
          if (!response.ok) {
            const uiErr = mapHttpError(response.status, json, 'ask-workspace');
            toast.show(uiErr);
            throw new Error(uiErr.message);
          }

          setAnswer(json as AskWorkspaceResult);
          setResults([]); // Clear semantic results when showing answer
        } else {
          // Use semantic search for keyword searches
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/semantic-search`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                query: searchQuery,
                workspace_id: selectedWorkspace || undefined,
                user_id: userId,
                options: { top_k: 20 },
              }),
            }
          );

          const json = await response.json().catch(() => null);
          if (!response.ok) {
            const uiErr = mapHttpError(response.status, json, 'semantic-search');
            toast.show(uiErr);
            throw new Error(uiErr.message);
          }

          const data = (json || {}) as any;
          setResults((data.results || []) as SearchResult[]);
          setAnswer(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [supabase, selectedWorkspace, toast]
  );

  // Debounced search
  const debouncedSearch = useCallback(
    debounce((q: string) => performSearch(q), 300),
    [performSearch]
  );

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    debouncedSearch(newQuery);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* Search Form */}
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-soft" />
              <input
                type="text"
                value={query}
                onChange={handleQueryChange}
                placeholder={t('placeholder')}
                className="w-full pl-12 pr-4 py-4 text-lg bg-surface border border-border rounded-scholar-lg text-text placeholder:text-text-soft focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setResults([]);
                    setAnswer(null);
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface-alt"
                >
                  <X className="w-5 h-5 text-text-soft" />
                </button>
              )}
            </div>

            {/* Workspace filter */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-sm text-text-soft">Search in:</span>
              <button
                type="button"
                onClick={() => setSelectedWorkspace(null)}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-full border transition-colors',
                  !selectedWorkspace
                    ? 'bg-accent text-white border-accent'
                    : 'border-border text-text-soft hover:border-accent'
                )}
              >
                All Workspaces
              </button>
              {getWorkspaceFilterChips(workspaces).map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => setSelectedWorkspace(ws.id)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-full border transition-colors',
                    selectedWorkspace === ws.id
                      ? 'bg-accent text-white border-accent'
                      : 'border-border text-text-soft hover:border-accent'
                  )}
                >
                  {ws.icon && <span className="mr-1">{ws.icon}</span>}
                  {ws.name}
                </button>
              ))}
            </div>
          </form>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-error/10 border border-error/20 rounded-scholar mb-6">
              <p className="text-error">{error}</p>
            </div>
          )}

          {/* AI Answer */}
          {answer && !loading && (
            <Card className="mb-6 border-accent/30 bg-accent/5" padding="lg">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-text">AI Answer</h3>
                  <p className="text-sm text-text-soft">
                    Based on your documents
                  </p>
                </div>
              </div>

              <div className="prose prose-sm max-w-none text-text mb-4">
                <p>{answer.answer}</p>
              </div>

              {answer.citations && answer.citations.length > 0 && (
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-text-soft mb-2 uppercase font-medium">
                    Sources ({answer.citations.length})
                  </p>
                  <div className="space-y-2">
                    {answer.citations.map((citation, i) => (
                      <Link
                        key={i}
                        href={`/workspaces/${selectedWorkspace || 'unknown'}/documents/${citation.document_id}`}
                        className="flex items-center gap-2 p-2 rounded-scholar hover:bg-surface transition-colors group"
                      >
                        <FileText className="w-4 h-4 text-text-soft" />
                        <span className="text-sm text-text flex-1 truncate">
                          {citation.document_title}
                        </span>
                        <Badge size="sm">p. {citation.page_number}</Badge>
                        <ArrowRight className="w-4 h-4 text-text-soft opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Search Results */}
          {results.length > 0 && !loading && (
            <div className="space-y-4">
              <p className="text-sm text-text-soft">
                {results.length} result{results.length !== 1 && 's'} found
              </p>

              {results.map((result, i) => (
                <SearchResultCard key={result.chunk_id || i} result={result} />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && query && results.length === 0 && !answer && (
            <EmptyState
              icon={<SearchIcon className="w-8 h-8" />}
              title={t('noResults')}
              description={t('noResultsDescription')}
            />
          )}

          {/* Initial State */}
          {!query && !loading && (
            <div className="text-center py-12">
              <SearchIcon className="w-16 h-16 text-text-soft mx-auto mb-4 opacity-50" />
              <p className="text-text-soft text-lg">
                Search across all your documents
              </p>
              <p className="text-text-soft text-sm mt-2">
                Ask questions to get AI-powered answers with citations
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResult }) {
  return (
    <Card
      className="hover:-translate-y-0.5 hover:shadow-scholar transition-all cursor-pointer"
      padding="md"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-surface-alt border border-border rounded-lg flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-text-soft" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-text truncate">
              {result.document_title}
            </h3>
            <Badge size="sm">Page {result.page_number}</Badge>
          </div>
          <p className="text-sm text-text-soft line-clamp-2">
            {result.content_preview || truncate(result.content_text, 200)}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-text-soft">
              Relevance: {Math.round(result.similarity * 100)}%
            </span>
            {result.language && (
              <Badge size="sm" variant="default">
                {result.language}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
