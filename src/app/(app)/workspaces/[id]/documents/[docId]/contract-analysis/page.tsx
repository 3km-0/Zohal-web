'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Scale, Calendar, FileText, ShieldAlert } from 'lucide-react';
import { Button, Spinner, Badge, Card, CardHeader, CardTitle, CardContent, EmptyState } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { LegalClause, LegalContract, LegalObligation, LegalRiskFlag } from '@/types/database';
import type { EvidenceGradeSnapshot } from '@/types/evidence-grade';
import { parseSnapshot } from '@/types/evidence-grade';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'variables' | 'clauses' | 'obligations' | 'deadlines' | 'risks';

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
  const [progressStep, setProgressStep] = useState(0);

  const [contract, setContract] = useState<LegalContract | null>(null);
  const [clauses, setClauses] = useState<LegalClause[]>([]);
  const [obligations, setObligations] = useState<LegalObligation[]>([]);
  const [risks, setRisks] = useState<LegalRiskFlag[]>([]);
  const [snapshot, setSnapshot] = useState<EvidenceGradeSnapshot | null>(null);

  const deadlines = useMemo(() => {
    return obligations
      .filter((o) => !!o.due_at)
      .slice()
      .sort((a, b) => (a.due_at || '').localeCompare(b.due_at || ''));
  }, [obligations]);
  
  const attention = useMemo(() => {
    const highRiskClauses = clauses.filter((c) => c.risk_level === 'high').length;
    const obligationsNeedsReview = obligations.filter((o) => o.confidence_state === 'needs_review').length;
    const unresolvedRisks = risks.filter((r) => !r.resolved).length;
    
    // Upcoming deadlines: within next 30 days
    const now = new Date();
    const upcomingDeadlines = deadlines.filter((o) => {
      if (!o.due_at) return false;
      const d = new Date(o.due_at);
      if (Number.isNaN(d.getTime())) return false;
      const days = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 30;
    }).length;
    
    return {
      clauses: highRiskClauses,
      obligations: obligationsNeedsReview,
      deadlines: upcomingDeadlines,
      risks: unresolvedRisks,
    };
  }, [clauses, obligations, risks, deadlines]);

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
        setSnapshot(null);
        return;
      }

      setContract(contractData);
      setSnapshot(null);

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

      // Load evidence-grade snapshot (canonical) to power Variables + verifier
      if (contractData.verification_object_id) {
        const { data: vo, error: voErr } = await supabase
          .from('verification_objects')
          .select('current_version_id')
          .eq('id', contractData.verification_object_id)
          .maybeSingle();
        if (!voErr && vo?.current_version_id) {
          const { data: vov, error: vovErr } = await supabase
            .from('verification_object_versions')
            .select('snapshot_json')
            .eq('id', vo.current_version_id)
            .maybeSingle();
          if (!vovErr && vov?.snapshot_json) {
            const parsed = parseSnapshot(vov.snapshot_json, documentId);
            setSnapshot(parsed);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contract analysis');
    } finally {
      setLoading(false);
    }
  }

  async function analyzeOnce() {
    setIsAnalyzing(true);
    setError(null);
    setProgressStep(0);

    // Client-side progress hints (the edge function is one call, so we simulate phases for UX).
    const steps = [
      'Preparing document…',
      'Identifying parties & dates…',
      'Extracting clauses…',
      'Extracting obligations & deadlines…',
      'Assessing risks…',
      'Finalizing…',
    ];
    let tick = 0;
    const timer = window.setInterval(() => {
      tick = Math.min(tick + 1, steps.length - 1);
      setProgressStep(tick);
    }, 1600);
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
      window.clearInterval(timer);
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
          <details className="relative">
            <summary className="list-none">
              <Button variant="secondary" size="sm">
                Actions
                <span className="ml-1 text-text-soft">▾</span>
              </Button>
            </summary>
            <div className="absolute right-0 mt-2 w-52 rounded-scholar border border-border bg-surface shadow-scholar overflow-hidden z-30">
              <div className="px-3 py-2 text-xs font-semibold text-text-soft border-b border-border bg-surface-alt">
                Actions
              </div>
              <div className="p-2 space-y-1">
                {contract && (
                  <button
                    onClick={() => exportCalendar()}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-scholar-sm text-sm font-semibold text-text hover:bg-surface-alt transition-colors"
                  >
                    <Download className="w-4 h-4 text-text-soft" />
                    Export Calendar
                  </button>
                )}
                <button
                  onClick={() => router.push(`/workspaces/${workspaceId}/documents/${documentId}`)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-scholar-sm text-sm font-semibold text-text hover:bg-surface-alt transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-text-soft" />
                  Back to PDF
                </button>
              </div>
            </div>
          </details>
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
            action={{
              label: isAnalyzing ? 'Analyzing…' : 'Contract Analysis',
              onClick: () => {
                if (!isAnalyzing) analyzeOnce();
              },
            }}
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
                  { id: 'variables', label: `Variables (${snapshot?.variables.length ?? 0})`, icon: FileText },
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
                  <span className="relative inline-flex">
                    <t.icon className="w-4 h-4" />
                    {t.id !== 'overview' &&
                      (t.id === 'variables'
                        ? (snapshot?.variables.some((v) => v.verification_state === 'needs_review') ?? false)
                        : t.id === 'clauses'
                        ? attention.clauses > 0
                        : t.id === 'obligations'
                          ? attention.obligations > 0
                          : t.id === 'deadlines'
                            ? attention.deadlines > 0
                            : t.id === 'risks'
                              ? attention.risks > 0
                              : false) && (
                        <span
                          className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent-alt ring-2 ring-surface"
                          aria-label="Needs attention"
                        />
                      )}
                  </span>
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

            {tab === 'variables' && (
              <div className="space-y-3">
                {!snapshot ? (
                  <EmptyState
                    title="No variables snapshot"
                    description="This view is driven by the evidence-grade snapshot (canonical). Re-run analysis if needed."
                  />
                ) : snapshot.variables.length === 0 ? (
                  <EmptyState title="No variables" description="No variables were stored in the canonical snapshot." />
                ) : (
                  snapshot.variables.map((v) => (
                    <Card key={v.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{v.display_name}</span>
                          <div className="flex items-center gap-2">
                            {v.verifier?.status && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold',
                                  v.verifier.status === 'green'
                                    ? 'border-success/30 bg-success/5 text-text'
                                    : v.verifier.status === 'red'
                                      ? 'border-error/30 bg-error/5 text-text'
                                      : 'border-accent-alt/30 bg-accent-alt/5 text-text'
                                )}
                                title={v.verifier.reasons?.join(', ') || undefined}
                              >
                                <span
                                  className={cn(
                                    'inline-flex w-2.5 h-2.5 rounded-full',
                                    v.verifier.status === 'green'
                                      ? 'bg-success'
                                      : v.verifier.status === 'red'
                                        ? 'bg-error'
                                        : 'bg-accent-alt'
                                  )}
                                />
                                {v.verifier.status.toUpperCase()}
                              </span>
                            )}
                            <Badge size="sm">{v.verification_state}</Badge>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-sm text-text">
                          <span className="text-text-soft">Value: </span>
                          {v.value == null ? '—' : String(v.value)}
                          {v.unit ? ` ${v.unit}` : ''}
                        </div>
                        <div className="text-xs text-text-soft">
                          AI confidence: <span className="text-text">{v.ai_confidence}</span>
                        </div>
                        {v.evidence?.page_number != null && (
                          <div>
                            <Link
                              href={`/workspaces/${workspaceId}/documents/${documentId}?page=${v.evidence.page_number}&quote=${encodeURIComponent(
                                (v.evidence.snippet || '').slice(0, 140)
                              )}`}
                              className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:underline"
                            >
                              View in PDF (p. {v.evidence.page_number})
                            </Link>
                          </div>
                        )}
                        {v.verifier?.reasons?.length ? (
                          <div className="text-xs text-text-soft">
                            {v.verifier.reasons.map((r) => (
                              <div key={r}>• {r.replace(/_/g, ' ')}</div>
                            ))}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
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
                        {c.page_number != null && (
                          <div className="mb-2">
                            <Link
                              href={`/workspaces/${workspaceId}/documents/${documentId}?page=${c.page_number}&quote=${encodeURIComponent(
                                (c.text || '').slice(0, 120)
                              )}`}
                              className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:underline"
                            >
                              View in PDF
                            </Link>
                          </div>
                        )}
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
                        {o.page_number != null && (
                          <div>
                            <Link
                              href={`/workspaces/${workspaceId}/documents/${documentId}?page=${o.page_number}&quote=${encodeURIComponent(
                                (o.summary || o.action || '').slice(0, 120)
                              )}`}
                              className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:underline"
                            >
                              View in PDF
                            </Link>
                          </div>
                        )}
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

        {/* Analyzing state (visible even before contract exists) */}
        {isAnalyzing && (
          <div className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-purple-500" />
                  Contract Analysis in progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: `${Math.min(100, ((progressStep + 1) / 6) * 100)}%` }}
                  />
                </div>
                <div className="text-sm text-text-soft">
                  {[
                    'Preparing document…',
                    'Identifying parties & dates…',
                    'Extracting clauses…',
                    'Extracting obligations & deadlines…',
                    'Assessing risks…',
                    'Finalizing…',
                  ][progressStep]}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    'Identify parties & key dates',
                    'Extract clauses',
                    'Extract obligations & deadlines',
                    'Assess risks',
                  ].map((label, idx) => {
                    const complete = progressStep >= idx + 2; // heuristically mark later steps as we tick
                    const active = !complete && progressStep === idx + 1;
                    return (
                      <div
                        key={label}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-scholar border',
                          complete
                            ? 'border-success/30 bg-success/5 text-text'
                            : active
                              ? 'border-accent/30 bg-accent/5 text-text'
                              : 'border-border text-text-soft'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex w-2.5 h-2.5 rounded-full',
                            complete ? 'bg-success' : active ? 'bg-accent' : 'bg-border'
                          )}
                        />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-text-soft">
                  This can take ~10–20 seconds depending on document size.
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}


