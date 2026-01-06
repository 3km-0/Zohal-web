'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Scale, Calendar, FileText, ShieldAlert } from 'lucide-react';
import { Button, Spinner, Badge, Card, CardHeader, CardTitle, CardContent, EmptyState } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { LegalClause, LegalContract, LegalObligation, LegalRiskFlag } from '@/types/database';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'clauses' | 'obligations' | 'deadlines' | 'risks';

export default function ContractAnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const documentId = params.docId as string;
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  const [contract, setContract] = useState<LegalContract | null>(null);
  const [clauses, setClauses] = useState<LegalClause[]>([]);
  const [obligations, setObligations] = useState<LegalObligation[]>([]);
  const [risks, setRisks] = useState<LegalRiskFlag[]>([]);

  const deadlines = useMemo(() => {
    return obligations
      .filter((o) => !!o.due_at)
      .slice()
      .sort((a, b) => (a.due_at || '').localeCompare(b.due_at || ''));
  }, [obligations]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: contractData, error: contractError } = await supabase
        .from('legal_contracts')
        .select('*')
        .eq('document_id', documentId)
        .maybeSingle();

      if (contractError) throw contractError;

      if (!contractData) {
        setContract(null);
        setClauses([]);
        setObligations([]);
        setRisks([]);
        return;
      }

      setContract(contractData);

      const [clausesRes, obligationsRes, risksRes] = await Promise.all([
        supabase.from('legal_clauses').select('*').eq('contract_id', contractData.id).order('page_number', { ascending: true }),
        supabase.from('legal_obligations').select('*').eq('contract_id', contractData.id).order('due_at', { ascending: true }),
        supabase.from('legal_risk_flags').select('*').eq('contract_id', contractData.id),
      ]);

      if (clausesRes.error) throw clausesRes.error;
      if (obligationsRes.error) throw obligationsRes.error;
      if (risksRes.error) throw risksRes.error;

      setClauses((clausesRes.data || []) as LegalClause[]);
      setObligations((obligationsRes.data || []) as LegalObligation[]);
      setRisks((risksRes.data || []) as LegalRiskFlag[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contract analysis');
    } finally {
      setLoading(false);
    }
  }

  async function analyzeOnce() {
    setIsAnalyzing(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userData.user.id;

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          document_id: documentId,
          workspace_id: workspaceId,
          user_id: userId,
        }),
      });

      const json = await res.json().catch(() => null);

      // 202 = document_not_ready (processing). Surface the localized message if present.
      if (!res.ok && res.status !== 202) {
        throw new Error(json?.error || json?.message || 'Contract analysis failed');
      }

      if (res.status === 202) {
        throw new Error(json?.user_message || json?.message || 'Document is still processing. Try again shortly.');
      }

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Contract analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function exportCalendar() {
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/export-calendar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          document_id: documentId,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'No obligations with due dates found');
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('content-disposition') || '';
      const match = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || 'contract_obligations.ics';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export calendar');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-3">
          <Link
            href={`/workspaces/${workspaceId}/documents/${documentId}`}
            className="p-2 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-text-soft" />
          </Link>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-purple-500" />
            <h1 className="font-semibold text-text">Contract Analysis</h1>
            <Badge size="sm">saved</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {contract && (
            <Button variant="secondary" size="sm" onClick={exportCalendar}>
              <Download className="w-4 h-4" />
              Export Calendar
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => router.push(`/workspaces/${workspaceId}/documents/${documentId}`)}>
            Back to PDF
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : !contract ? (
          <EmptyState
            title="Not analyzed yet"
            description="This contract doesn't have a saved analysis. Run it once, then you can reopen it anytime."
            action={
              <Button onClick={analyzeOnce} isLoading={isAnalyzing}>
                <Scale className="w-4 h-4" />
                Contract Analysis
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="p-3 rounded-scholar border border-error/30 bg-error/5 text-error text-sm">
                {error}
              </div>
            )}

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'overview', label: 'Overview', icon: FileText },
                  { id: 'clauses', label: `Clauses (${clauses.length})`, icon: FileText },
                  { id: 'obligations', label: `Obligations (${obligations.length})`, icon: FileText },
                  { id: 'deadlines', label: `Deadlines (${deadlines.length})`, icon: Calendar },
                  { id: 'risks', label: `Risks (${risks.length})`, icon: ShieldAlert },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-2 rounded-scholar border text-sm font-semibold transition-colors',
                    tab === t.id ? 'border-accent text-accent bg-accent/5' : 'border-border text-text hover:bg-surface-alt'
                  )}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm text-text">
                    <span className="text-text-soft">Counterparty: </span>
                    {contract.counterparty_name || '—'}
                  </div>
                  <div className="text-sm text-text">
                    <span className="text-text-soft">Effective: </span>
                    {contract.effective_date || '—'}
                  </div>
                  <div className="text-sm text-text">
                    <span className="text-text-soft">End: </span>
                    {contract.end_date || '—'}
                  </div>
                  <div className="text-sm text-text">
                    <span className="text-text-soft">Notice: </span>
                    {contract.notice_period_days != null ? `${contract.notice_period_days} days` : '—'}
                  </div>
                </CardContent>
              </Card>
            )}

            {tab === 'clauses' && (
              <div className="space-y-3">
                {clauses.length === 0 ? (
                  <EmptyState title="No clauses" description="No clauses were saved for this analysis." />
                ) : (
                  clauses.map((c) => (
                    <Card key={c.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{c.clause_title || c.clause_type}</span>
                          <Badge size="sm">{c.risk_level}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xs text-text-soft mb-2">
                          Page {c.page_number ?? '—'} {c.clause_number ? `• ${c.clause_number}` : ''}
                        </div>
                        <div className="text-sm text-text whitespace-pre-wrap">{c.text}</div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {tab === 'obligations' && (
              <div className="space-y-3">
                {obligations.length === 0 ? (
                  <EmptyState title="No obligations" description="No obligations were saved for this analysis." />
                ) : (
                  obligations.map((o) => (
                    <Card key={o.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{o.obligation_type}</span>
                          <Badge size="sm">{o.confidence_state}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {o.due_at && (
                          <div className="text-xs text-text-soft">
                            Due: <span className="text-text">{o.due_at}</span>
                          </div>
                        )}
                        {o.summary && <div className="text-sm text-text">{o.summary}</div>}
                        {o.action && (
                          <div className="text-sm text-text">
                            <span className="text-text-soft">Action: </span>
                            {o.action}
                          </div>
                        )}
                        {o.responsible_party && (
                          <div className="text-xs text-text-soft">
                            Responsible: <span className="text-text">{o.responsible_party}</span>
                          </div>
                        )}
                        {o.page_number != null && <div className="text-xs text-text-soft">Page {o.page_number}</div>}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {tab === 'deadlines' && (
              <div className="space-y-3">
                {deadlines.length === 0 ? (
                  <EmptyState title="No deadlines" description="No obligations with due dates were found." />
                ) : (
                  deadlines.map((o) => (
                    <Card key={o.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{o.obligation_type}</span>
                          <Badge size="sm">{o.due_at}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm text-text">{o.summary || o.action || '—'}</div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {tab === 'risks' && (
              <div className="space-y-3">
                {risks.length === 0 ? (
                  <EmptyState title="No risks" description="No risks were saved for this analysis." />
                ) : (
                  risks.map((r) => (
                    <Card key={r.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{r.description}</span>
                          <Badge size="sm">{r.severity}</Badge>
                        </CardTitle>
                      </CardHeader>
                      {r.explanation && <CardContent className="text-sm text-text whitespace-pre-wrap">{r.explanation}</CardContent>}
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


