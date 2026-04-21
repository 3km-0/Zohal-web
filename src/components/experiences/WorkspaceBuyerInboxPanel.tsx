'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

type BuyerOpportunity = {
  id: string;
  phone_number: string;
  stage: string;
  summary: string | null;
  updated_at: string;
  created_at: string;
  property_id: string | null;
  surface_key: string | null;
  result_source: string | null;
  workspace_id: string | null;
};

type BuyerOpportunityActivity = {
  id: string;
  activity_type: string;
  direction: string;
  body_text: string | null;
  created_at: string;
  activity_payload: Record<string, unknown> | null;
};

type BuyerOpportunityMatch = {
  id: string;
  label: string | null;
  surface_key: string | null;
  result_source: string;
  created_at: string;
};

type WhatsappConversation = {
  id: string;
  phone_number: string;
  mode: string;
  language: string;
  last_user_goal: string | null;
  updated_at: string;
  active_surface_key: string | null;
};

type WhatsappConversationEvent = {
  id: string;
  event_type: string;
  event_direction: string;
  created_at: string;
  event_payload: Record<string, unknown> | null;
};

const STAGE_OPTIONS = ['new', 'qualified', 'viewing', 'finance', 'broker_handoff', 'converted', 'archived'];

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function WorkspaceBuyerInboxPanel({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('experiencesPage.whatsappInbox');
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<BuyerOpportunity[]>([]);
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [activities, setActivities] = useState<BuyerOpportunityActivity[]>([]);
  const [matches, setMatches] = useState<BuyerOpportunityMatch[]>([]);
  const [events, setEvents] = useState<WhatsappConversationEvent[]>([]);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedOpportunity = opportunities.find((item) => item.id === selectedOpportunityId) || null;
  const selectedConversation = conversations.find((item) => item.id === selectedConversationId) || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ data: opportunityRows, error: opportunityError }, { data: conversationRows, error: conversationError }] =
          await Promise.all([
            supabase
              .from('buyer_opportunities')
              .select('id,phone_number,stage,summary,updated_at,created_at,property_id,surface_key,result_source,workspace_id')
              .eq('workspace_id', workspaceId)
              .order('updated_at', { ascending: false })
              .limit(20),
            supabase
              .from('whatsapp_conversations')
              .select('id,phone_number,mode,language,last_user_goal,updated_at,active_surface_key')
              .eq('linked_workspace_id', workspaceId)
              .order('updated_at', { ascending: false })
              .limit(20),
          ]);

        if (cancelled) return;
        if (opportunityError) throw opportunityError;
        if (conversationError) throw conversationError;

        const nextOpportunities = (opportunityRows || []) as BuyerOpportunity[];
        const nextConversations = (conversationRows || []) as WhatsappConversation[];
        setOpportunities(nextOpportunities);
        setConversations(nextConversations);
        setSelectedOpportunityId((current) => current || nextOpportunities[0]?.id || null);
        setSelectedConversationId((current) => current || nextConversations[0]?.id || null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, t, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedOpportunityId) {
      setActivities([]);
      setMatches([]);
      return;
    }

    (async () => {
      try {
        const [{ data: activityRows, error: activityError }, { data: matchRows, error: matchError }] = await Promise.all([
          supabase
            .from('buyer_opportunity_activities')
            .select('id,activity_type,direction,body_text,created_at,activity_payload')
            .eq('opportunity_id', selectedOpportunityId)
            .order('created_at', { ascending: false })
            .limit(30),
          supabase
            .from('buyer_opportunity_matches')
            .select('id,label,surface_key,result_source,created_at')
            .eq('opportunity_id', selectedOpportunityId)
            .order('created_at', { ascending: false })
            .limit(12),
        ]);

        if (cancelled) return;
        if (activityError) throw activityError;
        if (matchError) throw matchError;
        setActivities((activityRows || []) as BuyerOpportunityActivity[]);
        setMatches((matchRows || []) as BuyerOpportunityMatch[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadError'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedOpportunityId, supabase, t]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedConversationId) {
      setEvents([]);
      return;
    }

    (async () => {
      try {
        const { data, error: eventError } = await supabase
          .from('whatsapp_conversation_events')
          .select('id,event_type,event_direction,created_at,event_payload')
          .eq('conversation_id', selectedConversationId)
          .order('created_at', { ascending: false })
          .limit(30);
        if (cancelled) return;
        if (eventError) throw eventError;
        setEvents((data || []) as WhatsappConversationEvent[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadError'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, supabase, t]);

  async function updateStage(stage: string) {
    if (!selectedOpportunity) return;
    setBusy(`stage:${stage}`);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('buyer_opportunities')
        .update({ stage })
        .eq('id', selectedOpportunity.id);
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
      const { data, error: insertError } = await supabase
        .from('buyer_opportunity_activities')
        .insert({
          opportunity_id: selectedOpportunity.id,
          workspace_id: workspaceId,
          activity_type: 'operator_note',
          direction: 'operator',
          body_text: noteText.trim(),
          media_json: [],
          activity_payload: { source: 'web_operator_note' },
        })
        .select('id,activity_type,direction,body_text,created_at,activity_payload')
        .single();
      if (insertError) throw insertError;
      setActivities((current) => [data as BuyerOpportunityActivity, ...current]);
      setNoteText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('noteError'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? <div className="text-sm text-text-soft">{t('loading')}</div> : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-text">{t('opportunitiesTitle')}</div>
              <div className="text-xs text-text-soft">{t('opportunitiesDescription')}</div>
            </div>
            {opportunities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-soft">{t('emptyOpportunities')}</div>
            ) : (
              opportunities.map((opportunity) => (
                <button
                  key={opportunity.id}
                  type="button"
                  onClick={() => setSelectedOpportunityId(opportunity.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedOpportunityId === opportunity.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-text">{opportunity.summary || opportunity.phone_number}</div>
                      <div className="mt-1 text-xs text-text-soft">{opportunity.phone_number}</div>
                    </div>
                    <div className="rounded-full bg-surface px-2 py-1 text-[11px] uppercase tracking-wide text-text-soft">
                      {opportunity.stage}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-text-soft">
                    {t('updatedAt', { value: formatDate(opportunity.updated_at) })}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-text">{t('conversationsTitle')}</div>
              <div className="text-xs text-text-soft">{t('conversationsDescription')}</div>
            </div>
            {conversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-soft">{t('emptyConversations')}</div>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedConversationId === conversation.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-text">{conversation.phone_number}</div>
                      <div className="mt-1 text-xs text-text-soft">{conversation.last_user_goal || t('noGoal')}</div>
                    </div>
                    <div className="rounded-full bg-surface px-2 py-1 text-[11px] uppercase tracking-wide text-text-soft">
                      {conversation.mode}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-text-soft">
                    {conversation.language.toUpperCase()} · {formatDate(conversation.updated_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-border/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-text">{t('detailTitle')}</div>
                <div className="text-xs text-text-soft">{selectedOpportunity?.summary || t('detailHint')}</div>
              </div>
              {selectedOpportunity ? (
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
                  value={selectedOpportunity.stage}
                  onChange={(event) => void updateStage(event.target.value)}
                  disabled={busy !== null}
                >
                  {STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            {selectedOpportunity ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-surface p-3 text-sm text-text-soft">
                    <div className="text-xs uppercase tracking-wide">{t('matchedProperties')}</div>
                    <div className="mt-2 space-y-2">
                      {matches.length === 0 ? (
                        <div>{t('emptyMatches')}</div>
                      ) : (
                        matches.map((match) => (
                          <div key={match.id} className="rounded-lg border border-border/60 bg-background px-3 py-2">
                            <div className="font-medium text-text">{match.label || t('unnamedMatch')}</div>
                            <div className="mt-1 text-xs text-text-soft">
                              {match.result_source}
                              {match.surface_key ? ` · ${match.surface_key}` : ''}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-surface p-3 text-sm text-text-soft">
                    <div className="text-xs uppercase tracking-wide">{t('actionsTitle')}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => void updateStage('viewing')} disabled={busy !== null}>
                        {t('markViewing')}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void updateStage('finance')} disabled={busy !== null}>
                        {t('markFinance')}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void updateStage('broker_handoff')} disabled={busy !== null}>
                        {t('handoff')}
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-text">{t('timelineTitle')}</div>
                  <div className="mt-2 space-y-2">
                    {activities.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-3 text-sm text-text-soft">{t('emptyTimeline')}</div>
                    ) : (
                      activities.map((activity) => (
                        <div key={activity.id} className="rounded-xl border border-border/70 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-text">{activity.activity_type}</div>
                            <div className="text-xs text-text-soft">{formatDate(activity.created_at)}</div>
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-wide text-text-soft">{activity.direction}</div>
                          {activity.body_text ? <div className="mt-2 text-sm text-text">{activity.body_text}</div> : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-text">{t('notesTitle')}</div>
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-text outline-none ring-0"
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder={t('notePlaceholder')}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button onClick={() => void addOperatorNote()} disabled={busy !== null || !noteText.trim()}>
                      {t('saveNote')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-text-soft">{t('detailHint')}</div>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 p-4">
            <div className="text-sm font-medium text-text">{t('conversationTimelineTitle')}</div>
            <div className="mt-1 text-xs text-text-soft">{selectedConversation?.phone_number || t('conversationHint')}</div>
            <div className="mt-4 space-y-2">
              {events.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-3 text-sm text-text-soft">{t('emptyConversationTimeline')}</div>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="rounded-xl border border-border/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-text">{event.event_type}</div>
                      <div className="text-xs text-text-soft">{formatDate(event.created_at)}</div>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-text-soft">{event.event_direction}</div>
                    {event.event_payload?.body || event.event_payload?.text_body ? (
                      <div className="mt-2 text-sm text-text">
                        {String(event.event_payload?.body || event.event_payload?.text_body || '')}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
