'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

type AcquisitionOpportunity = {
  id: string;
  phone_number: string;
  title: string | null;
  stage: string;
  summary: string | null;
  updated_at: string;
  created_at: string;
  workspace_id: string | null;
  opportunity_kind: string | null;
  acquisition_focus: string | null;
  screening_readiness: string | null;
  missing_info_json: string[] | null;
  metadata_json: Record<string, unknown> | null;
};

type AcquisitionEvent = {
  id: string;
  event_type: string;
  event_direction: string;
  body_text: string | null;
  created_at: string;
  event_payload: Record<string, unknown> | null;
};

type AcquisitionThread = {
  id: string;
  thread_kind: string;
  status: string;
  title: string;
  summary: string | null;
  created_at: string;
};

type AcquisitionClaim = {
  id: string;
  fact_key: string;
  basis_label: string;
  confidence: number;
  value_json: Record<string, unknown> | null;
};

type AcquisitionScenario = {
  id: string;
  title: string;
  scenario_kind: string;
  assumptions_json: Record<string, unknown> | null;
  outputs_json: Record<string, unknown> | null;
};

type DiligenceItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  owner_kind: string;
};

type WhatsappConversation = {
  id: string;
  phone_number: string;
  mode: string;
  language: string;
  last_user_goal: string | null;
  updated_at: string;
  active_acquisition_thread_id: string | null;
};

const STAGE_GROUPS = [
  'submitted',
  'screening',
  'needs_info',
  'workspace_created',
  'watch',
  'pursue',
  'negotiation',
  'offer',
  'formal_diligence',
  'passed',
  'closed',
  'archived',
] as const;

function stageTheme(value: string | null | undefined) {
  switch (value) {
    case 'pursue':
    case 'closed':
      return { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', stripe: 'bg-emerald-300' };
    case 'watch':
    case 'screening':
      return { badge: 'border-amber-200 bg-amber-50 text-amber-700', stripe: 'bg-amber-300' };
    case 'needs_info':
    case 'formal_diligence':
      return { badge: 'border-orange-200 bg-orange-50 text-orange-700', stripe: 'bg-orange-300' };
    case 'passed':
    case 'archived':
      return { badge: 'border-stone-200 bg-stone-100 text-stone-700', stripe: 'bg-stone-300' };
    default:
      return {
        badge: 'border-[color:color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] text-accent',
        stripe: 'bg-[color:color-mix(in_srgb,var(--accent)_38%,transparent)]',
      };
  }
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function humanizeValue(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/_/g, ' ');
}

function stringifyJson(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(stringifyJson).filter(Boolean).join(', ');
  if (typeof value === 'object' && 'value' in value) return stringifyJson((value as { value?: unknown }).value);
  return JSON.stringify(value);
}

export function WorkspaceAcquisitionOpportunityPanel({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('workspaceProjectsPage.inbox');
  const supabase = useMemo(() => createClient(), []);
  const db = supabase as any;
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<AcquisitionOpportunity[]>([]);
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [events, setEvents] = useState<AcquisitionEvent[]>([]);
  const [threads, setThreads] = useState<AcquisitionThread[]>([]);
  const [claims, setClaims] = useState<AcquisitionClaim[]>([]);
  const [scenarios, setScenarios] = useState<AcquisitionScenario[]>([]);
  const [diligence, setDiligence] = useState<DiligenceItem[]>([]);
  const [noteText, setNoteText] = useState('');
  const [scenarioText, setScenarioText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedOpportunity = opportunities.find((item) => item.id === selectedOpportunityId) || null;
  const missingInfo = Array.isArray(selectedOpportunity?.missing_info_json) ? selectedOpportunity?.missing_info_json || [] : [];
  const selectedTheme = stageTheme(selectedOpportunity?.stage);
  const metadata = selectedOpportunity?.metadata_json || {};
  const screening = (metadata.screening || {}) as Record<string, unknown>;
  const brokerDraft = typeof metadata.broker_draft === 'string' ? metadata.broker_draft : '';
  const stageOptions = selectedOpportunity?.stage && !STAGE_GROUPS.includes(selectedOpportunity.stage as (typeof STAGE_GROUPS)[number])
    ? [selectedOpportunity.stage, ...STAGE_GROUPS]
    : [...STAGE_GROUPS];

  const groupedOpportunities = useMemo(() => {
    const groups = new Map<string, AcquisitionOpportunity[]>();
    for (const stage of STAGE_GROUPS) groups.set(stage, []);
    for (const opportunity of opportunities) {
      const bucket = groups.get(opportunity.stage) || [];
      bucket.push(opportunity);
      groups.set(opportunity.stage, bucket);
    }
    return Array.from(groups.entries()).filter(([, items]) => items.length > 0);
  }, [opportunities]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ data: opportunityRows, error: opportunityError }, { data: conversationRows, error: conversationError }] =
          await Promise.all([
            db
              .from('acquisition_opportunities')
              .select('id,phone_number,title,stage,summary,updated_at,created_at,workspace_id,opportunity_kind,acquisition_focus,screening_readiness,missing_info_json,metadata_json')
              .eq('workspace_id', workspaceId)
              .order('updated_at', { ascending: false })
              .limit(40),
            db
              .from('whatsapp_conversations')
              .select('id,phone_number,mode,language,last_user_goal,updated_at,active_acquisition_thread_id')
              .eq('active_workspace_id', workspaceId)
              .order('updated_at', { ascending: false })
              .limit(30),
          ]);

        if (cancelled) return;
        if (opportunityError) throw opportunityError;
        if (conversationError) throw conversationError;

        const nextOpportunities = (opportunityRows || []) as AcquisitionOpportunity[];
        setOpportunities(nextOpportunities);
        setConversations((conversationRows || []) as WhatsappConversation[]);
        setSelectedOpportunityId((current) => current || nextOpportunities[0]?.id || null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, t, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedOpportunityId) {
      setEvents([]);
      setThreads([]);
      setClaims([]);
      setScenarios([]);
      setDiligence([]);
      return;
    }

    (async () => {
      try {
        const [eventResult, threadResult, claimResult, scenarioResult, diligenceResult] = await Promise.all([
          db
            .from('acquisition_events')
            .select('id,event_type,event_direction,body_text,created_at,event_payload')
            .eq('opportunity_id', selectedOpportunityId)
            .order('created_at', { ascending: false })
            .limit(30),
          db
            .from('acquisition_threads')
            .select('id,thread_kind,status,title,summary,created_at')
            .eq('opportunity_id', selectedOpportunityId)
            .order('created_at', { ascending: false })
            .limit(12),
          db
            .from('acquisition_claims')
            .select('id,fact_key,basis_label,confidence,value_json')
            .eq('opportunity_id', selectedOpportunityId)
            .order('created_at', { ascending: false })
            .limit(30),
          db
            .from('acquisition_scenarios')
            .select('id,title,scenario_kind,assumptions_json,outputs_json')
            .eq('opportunity_id', selectedOpportunityId)
            .order('created_at', { ascending: false })
            .limit(8),
          db
            .from('acquisition_diligence_items')
            .select('id,title,status,priority,owner_kind')
            .eq('opportunity_id', selectedOpportunityId)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        if (cancelled) return;
        if (eventResult.error) throw eventResult.error;
        if (threadResult.error) throw threadResult.error;
        if (claimResult.error) throw claimResult.error;
        if (scenarioResult.error) throw scenarioResult.error;
        if (diligenceResult.error) throw diligenceResult.error;

        setEvents((eventResult.data || []) as AcquisitionEvent[]);
        setThreads((threadResult.data || []) as AcquisitionThread[]);
        setClaims((claimResult.data || []) as AcquisitionClaim[]);
        const nextScenarios = (scenarioResult.data || []) as AcquisitionScenario[];
        setScenarios(nextScenarios);
        setScenarioText(JSON.stringify(nextScenarios[0]?.assumptions_json || {}, null, 2));
        setDiligence((diligenceResult.data || []) as DiligenceItem[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadError'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, selectedOpportunityId, t]);

  async function updateStage(stage: string) {
    if (!selectedOpportunity) return;
    setBusy(`stage:${stage}`);
    setError(null);
    try {
      const { error: updateError } = await db.from('acquisition_opportunities').update({ stage }).eq('id', selectedOpportunity.id);
      if (updateError) throw updateError;
      setOpportunities((current) => current.map((item) => (item.id === selectedOpportunity.id ? { ...item, stage } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('stageUpdateError'));
    } finally {
      setBusy(null);
    }
  }

  async function addOperatorNote() {
    if (!selectedOpportunity || !noteText.trim()) return;
    setBusy('note');
    setError(null);
    try {
      const { data, error: insertError } = await db
        .from('acquisition_events')
        .insert({
          opportunity_id: selectedOpportunity.id,
          workspace_id: workspaceId,
          event_type: 'operator_note',
          event_direction: 'operator',
          body_text: noteText.trim(),
          media_json: [],
          event_payload: { source: 'web_operator_note' },
        })
        .select('id,event_type,event_direction,body_text,created_at,event_payload')
        .single();
      if (insertError) throw insertError;
      setEvents((current) => [data as AcquisitionEvent, ...current]);
      setNoteText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('noteError'));
    } finally {
      setBusy(null);
    }
  }

  async function saveScenario() {
    if (!selectedOpportunity || !scenarios[0]) return;
    setBusy('scenario');
    setError(null);
    try {
      const parsed = JSON.parse(scenarioText || '{}');
      const { data, error: updateError } = await db
        .from('acquisition_scenarios')
        .update({ assumptions_json: parsed })
        .eq('id', scenarios[0].id)
        .select('id,title,scenario_kind,assumptions_json,outputs_json')
        .single();
      if (updateError) throw updateError;
      setScenarios((current) => current.map((item) => (item.id === scenarios[0].id ? data as AcquisitionScenario : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('scenarioError'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card variant="elevated" className="border-border/70">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-text-soft">
            <span className="rounded-full border border-border bg-surface-alt px-3 py-1.5">
              {t('opportunityCount', { count: opportunities.length })}
            </span>
            <span className="rounded-full border border-border bg-surface-alt px-3 py-1.5">
              {t('conversationCount', { count: conversations.length })}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? <div className="text-sm text-text-soft">{t('loading')}</div> : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}

        <div className="grid gap-5 xl:grid-cols-[0.75fr_1.45fr_0.8fr]">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-text">{t('opportunitiesTitle')}</div>
              <div className="text-xs text-text-soft">{t('opportunitiesDescription')}</div>
            </div>
            {opportunities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-soft">{t('emptyOpportunities')}</div>
            ) : (
              groupedOpportunities.map(([stage, items]) => (
                <div key={stage} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${stageTheme(stage).stripe}`} />
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      {humanizeValue(stage)}
                    </div>
                  </div>
                  {items.map((opportunity) => (
                    <button
                      key={opportunity.id}
                      type="button"
                      onClick={() => setSelectedOpportunityId(opportunity.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        selectedOpportunityId === opportunity.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-text">{opportunity.title || opportunity.summary || opportunity.phone_number}</div>
                          <div className="mt-1 text-xs text-text-soft">{opportunity.phone_number}</div>
                        </div>
                        <div className={`rounded-full border px-2 py-1 text-[11px] uppercase tracking-wide ${stageTheme(opportunity.stage).badge}`}>
                          {humanizeValue(opportunity.stage)}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-text-soft">{t('updatedAt', { value: formatDate(opportunity.updated_at) })}</div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="space-y-4">
            {selectedOpportunity ? (
              <>
                <div className="overflow-hidden rounded-[1.5rem] border border-border bg-surface-alt">
                  <div className={`h-1.5 w-full ${selectedTheme.stripe}`} />
                  <div className="p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="font-serif text-2xl leading-tight text-text">
                          {selectedOpportunity.title || selectedOpportunity.summary || selectedOpportunity.phone_number}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[selectedOpportunity.opportunity_kind, selectedOpportunity.acquisition_focus, selectedOpportunity.screening_readiness].map((item) => (
                            item ? (
                              <span key={item} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-soft">
                                {humanizeValue(item)}
                              </span>
                            ) : null
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${selectedTheme.badge}`}>
                          {humanizeValue(selectedOpportunity.stage)}
                        </div>
                        <select
                          className="min-h-[40px] rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text"
                          value={selectedOpportunity.stage}
                          onChange={(event) => void updateStage(event.target.value)}
                          disabled={Boolean(busy)}
                        >
                          {stageOptions.map((stage) => (
                            <option key={stage} value={stage}>{humanizeValue(stage)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <section className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('dealOverviewTitle')}</div>
                    <div className="mt-3 space-y-2 text-sm text-text">
                      <div>{t('recommendationLabel')}: {humanizeValue(String(screening.recommendation || selectedOpportunity.stage))}</div>
                      <div>{t('confidenceLabel')}: {String(screening.confidence ?? 'n/a')}</div>
                      <div>{t('nextActionLabel')}: {String(screening.next_action || selectedOpportunity.summary || t('unknownValue'))}</div>
                    </div>
                  </section>
                  <section className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('mandateFitTitle')}</div>
                    <div className="mt-3 text-sm text-text-soft">{t('mandateFitDescription')}</div>
                  </section>
                  <section className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('missingInfoTitle')}</div>
                    <div className="mt-3 space-y-2">
                      {missingInfo.length ? missingInfo.map((item) => (
                        <div key={item} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text">
                          {humanizeValue(item)}
                        </div>
                      )) : <div className="text-sm text-text-soft">{t('emptyMissingInfo')}</div>}
                    </div>
                  </section>
                </div>

                <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                  <section className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('propertyFactsTitle')}</div>
                    <div className="mt-3 space-y-2">
                      {claims.length ? claims.map((claim) => (
                        <div key={claim.id} className="rounded-xl border border-border bg-surface p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-medium text-text">{humanizeValue(claim.fact_key)}</div>
                            <div className="text-xs text-text-soft">{Math.round(claim.confidence * 100)}%</div>
                          </div>
                          <div className="mt-1 text-sm text-text-soft">{stringifyJson(claim.value_json)}</div>
                          <div className="mt-2 text-xs uppercase tracking-[0.16em] text-text-muted">{humanizeValue(claim.basis_label)}</div>
                        </div>
                      )) : <div className="text-sm text-text-soft">{t('emptyFacts')}</div>}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('scenarioTitle')}</div>
                    {scenarios.length ? (
                      <>
                        <textarea
                          className="mt-3 min-h-[150px] w-full rounded-xl border border-border bg-surface px-3 py-3 font-mono text-xs text-text"
                          value={scenarioText}
                          onChange={(event) => setScenarioText(event.target.value)}
                        />
                        <div className="mt-3 flex items-center gap-2">
                          <Button onClick={() => void saveScenario()} isLoading={busy === 'scenario'}>{t('saveScenario')}</Button>
                          <span className="text-xs text-text-soft">{t('capexRangeTitle')}: {stringifyJson(scenarios[0]?.outputs_json)}</span>
                        </div>
                      </>
                    ) : <div className="mt-3 text-sm text-text-soft">{t('emptyScenario')}</div>}
                  </section>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <section className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('diligenceTitle')}</div>
                    <div className="mt-3 space-y-2">
                      {diligence.length ? diligence.map((item) => (
                        <div key={item.id} className="rounded-xl border border-border bg-surface p-3">
                          <div className="font-medium text-text">{item.title}</div>
                          <div className="mt-1 text-xs text-text-soft">{humanizeValue(item.status)} · {humanizeValue(item.priority)} · {humanizeValue(item.owner_kind)}</div>
                        </div>
                      )) : <div className="text-sm text-text-soft">{t('emptyDiligence')}</div>}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('coordinationTitle')}</div>
                    <div className="mt-3 space-y-2">
                      {threads.length ? threads.map((thread) => (
                        <div key={thread.id} className="rounded-xl border border-border bg-surface p-3">
                          <div className="font-medium text-text">{thread.title}</div>
                          <div className="mt-1 text-xs text-text-soft">{humanizeValue(thread.thread_kind)} · {humanizeValue(thread.status)}</div>
                          {thread.summary ? <div className="mt-2 text-sm text-text-soft">{thread.summary}</div> : null}
                        </div>
                      )) : <div className="text-sm text-text-soft">{t('emptyThreads')}</div>}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('decisionNotesTitle')}</div>
                    <textarea
                      className="mt-3 min-h-[112px] w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text"
                      value={noteText}
                      onChange={(event) => setNoteText(event.target.value)}
                      placeholder={t('notePlaceholder')}
                    />
                    <div className="mt-3">
                      <Button onClick={() => void addOperatorNote()} isLoading={busy === 'note'}>{t('saveNote')}</Button>
                    </div>
                    {brokerDraft ? <div className="mt-4 rounded-xl border border-border bg-surface p-3 text-sm text-text-soft">{brokerDraft}</div> : null}
                  </section>
                </div>

                <section className="rounded-2xl border border-border bg-surface-alt p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('timelineTitle')}</div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {events.length ? events.map((event) => (
                      <div key={event.id} className="rounded-xl border border-border bg-surface p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-medium text-text">{humanizeValue(event.event_type)}</div>
                          <div className="text-xs text-text-soft">{formatDate(event.created_at)}</div>
                        </div>
                        {event.body_text ? <div className="mt-2 text-sm text-text-soft">{event.body_text}</div> : null}
                        <div className="mt-2 text-xs uppercase tracking-[0.16em] text-text-muted">{humanizeValue(event.event_direction)}</div>
                      </div>
                    )) : <div className="text-sm text-text-soft">{t('emptyTimeline')}</div>}
                  </div>
                </section>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-text-soft">{t('detailHint')}</div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-text">{t('conversationsTitle')}</div>
              <div className="text-xs text-text-soft">{t('conversationsDescription')}</div>
            </div>
            {conversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-soft">{t('emptyConversations')}</div>
            ) : conversations.map((conversation) => (
              <div key={conversation.id} className="rounded-xl border border-border p-4">
                <div className="font-medium text-text">{conversation.phone_number}</div>
                <div className="mt-1 text-xs text-text-soft">{conversation.last_user_goal || t('emptyGoal')}</div>
                <div className={`mt-3 inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-wide ${stageTheme(conversation.mode).badge}`}>
                  {humanizeValue(conversation.mode)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
