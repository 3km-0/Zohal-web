'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

type ProjectCase = {
  id: string;
  phone_number: string;
  title: string | null;
  stage: string;
  summary: string | null;
  updated_at: string;
  created_at: string;
  workspace_id: string | null;
  project_kind: string | null;
  workflow_focus: string | null;
  workspace_readiness: string | null;
  missing_items_json: string[] | null;
};

type ProjectCaseActivity = {
  id: string;
  event_type: string;
  event_direction: string;
  body_text: string | null;
  created_at: string;
  event_payload: Record<string, unknown> | null;
};

type ProjectThread = {
  id: string;
  thread_kind: string;
  status: string;
  title: string;
  summary: string | null;
  created_at: string;
};

type WhatsappConversation = {
  id: string;
  phone_number: string;
  mode: string;
  language: string;
  last_user_goal: string | null;
  updated_at: string;
  active_project_thread_id: string | null;
};

type WhatsappConversationEvent = {
  id: string;
  event_type: string;
  event_direction: string;
  created_at: string;
  event_payload: Record<string, unknown> | null;
};

const STAGE_GROUPS = [
  'intake',
  'scoping',
  'quote_review',
  'permit_ready',
  'active',
  'variation_review',
  'operator_handoff',
  'completed',
  'archived',
] as const;

function stageTheme(value: string | null | undefined) {
  switch (value) {
    case 'intake':
      return {
        badge: 'border-[color:color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] text-accent',
        stripe: 'bg-[color:color-mix(in_srgb,var(--accent)_38%,transparent)]',
      };
    case 'scoping':
      return {
        badge: 'border-amber-200 bg-amber-50 text-amber-700',
        stripe: 'bg-amber-300',
      };
    case 'quote_review':
      return {
        badge: 'border-orange-200 bg-orange-50 text-orange-700',
        stripe: 'bg-orange-300',
      };
    case 'permit_ready':
      return {
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        stripe: 'bg-emerald-300',
      };
    case 'active':
      return {
        badge: 'border-sky-200 bg-sky-50 text-sky-700',
        stripe: 'bg-sky-300',
      };
    case 'variation_review':
      return {
        badge: 'border-rose-200 bg-rose-50 text-rose-700',
        stripe: 'bg-rose-300',
      };
    case 'operator_handoff':
      return {
        badge: 'border-stone-200 bg-stone-100 text-stone-700',
        stripe: 'bg-stone-300',
      };
    case 'completed':
      return {
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        stripe: 'bg-emerald-300',
      };
    default:
      return {
        badge: 'border-border bg-surface text-text-soft',
        stripe: 'bg-border',
      };
  }
}

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

function humanizeValue(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/_/g, ' ');
}

function stageLabel(value: string) {
  return humanizeValue(value) ?? value;
}

export function WorkspaceProjectInboxPanel({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('workspaceProjectsPage.inbox');
  const supabase = useMemo(() => createClient(), []);
  const db = supabase as any;
  const [loading, setLoading] = useState(true);
  const [projectCases, setProjectCases] = useState<ProjectCase[]>([]);
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [selectedProjectCaseId, setSelectedProjectCaseId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ProjectCaseActivity[]>([]);
  const [threads, setThreads] = useState<ProjectThread[]>([]);
  const [events, setEvents] = useState<WhatsappConversationEvent[]>([]);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProjectCase = projectCases.find((item) => item.id === selectedProjectCaseId) || null;
  const selectedConversation = conversations.find((item) => item.id === selectedConversationId) || null;
  const stageOptions = selectedProjectCase?.stage && !STAGE_GROUPS.includes(selectedProjectCase.stage as (typeof STAGE_GROUPS)[number])
    ? [selectedProjectCase.stage, ...STAGE_GROUPS]
    : [...STAGE_GROUPS];
  const missingItems = Array.isArray(selectedProjectCase?.missing_items_json) ? selectedProjectCase?.missing_items_json || [] : [];
  const selectedTheme = stageTheme(selectedProjectCase?.stage);

  const groupedProjects = useMemo(() => {
    const groups = new Map<string, ProjectCase[]>();
    for (const stage of STAGE_GROUPS) groups.set(stage, []);
    for (const projectCase of projectCases) {
      const bucket = groups.get(projectCase.stage) || [];
      bucket.push(projectCase);
      groups.set(projectCase.stage, bucket);
    }
    return Array.from(groups.entries()).filter(([, items]) => items.length > 0);
  }, [projectCases]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ data: projectCaseRows, error: projectCaseError }, { data: conversationRows, error: conversationError }] =
          await Promise.all([
            db
              .from('project_flows')
              .select(
                'id,phone_number,title,stage,summary,updated_at,created_at,workspace_id,project_kind,workflow_focus,workspace_readiness,missing_items_json'
              )
              .eq('workspace_id', workspaceId)
              .order('updated_at', { ascending: false })
              .limit(40),
            db
              .from('whatsapp_conversations')
              .select('id,phone_number,mode,language,last_user_goal,updated_at,active_project_thread_id')
              .eq('active_workspace_id', workspaceId)
              .order('updated_at', { ascending: false })
              .limit(30),
          ]);

        if (cancelled) return;
        if (projectCaseError) throw projectCaseError;
        if (conversationError) throw conversationError;

        const nextProjectCases = (projectCaseRows || []) as ProjectCase[];
        const nextConversations = (conversationRows || []) as WhatsappConversation[];
        setProjectCases(nextProjectCases);
        setConversations(nextConversations);
        setSelectedProjectCaseId((current) => current || nextProjectCases[0]?.id || null);
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
  }, [db, t, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedProjectCaseId) {
      setActivities([]);
      setThreads([]);
      return;
    }

    (async () => {
      try {
        const [{ data: activityRows, error: activityError }, { data: threadRows, error: threadError }] = await Promise.all([
          db
            .from('project_flow_events')
            .select('id,event_type,event_direction,body_text,created_at,event_payload')
            .eq('project_flow_id', selectedProjectCaseId)
            .order('created_at', { ascending: false })
            .limit(30),
          db
            .from('project_threads')
            .select('id,thread_kind,status,title,summary,created_at')
            .eq('project_flow_id', selectedProjectCaseId)
            .order('created_at', { ascending: false })
            .limit(12),
        ]);

        if (cancelled) return;
        if (activityError) throw activityError;
        if (threadError) throw threadError;
        setActivities((activityRows || []) as ProjectCaseActivity[]);
        setThreads((threadRows || []) as ProjectThread[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadError'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db, selectedProjectCaseId, t]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedConversationId) {
      setEvents([]);
      return;
    }

    (async () => {
      try {
        const { data, error: eventError } = await db
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
  }, [db, selectedConversationId, t]);

  async function updateStage(stage: string) {
    if (!selectedProjectCase) return;
    setBusy(`stage:${stage}`);
    setError(null);
    try {
      const { error: updateError } = await db.from('project_flows').update({ stage }).eq('id', selectedProjectCase.id);
      if (updateError) throw updateError;
      setProjectCases((current) => current.map((item) => (item.id === selectedProjectCase.id ? { ...item, stage } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('stageUpdateError'));
    } finally {
      setBusy(null);
    }
  }

  async function addOperatorNote() {
    if (!selectedProjectCase || !noteText.trim()) return;
    setBusy('note');
    setError(null);
    try {
      const { data, error: insertError } = await db
        .from('project_flow_events')
        .insert({
          project_flow_id: selectedProjectCase.id,
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
      setActivities((current) => [data as ProjectCaseActivity, ...current]);
      setNoteText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('noteError'));
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
              {t('projectCount', { count: projectCases.length })}
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

        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.25fr_0.9fr]">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-text">{t('projectsTitle')}</div>
              <div className="text-xs text-text-soft">{t('projectsDescription')}</div>
            </div>
            {projectCases.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-soft">{t('emptyProjects')}</div>
            ) : (
              groupedProjects.map(([stage, items]) => (
                <div key={stage} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${stageTheme(stage).stripe}`} />
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      {stageLabel(stage)}
                    </div>
                  </div>
                  {items.map((projectCase) => (
                    <button
                      key={projectCase.id}
                      type="button"
                      onClick={() => setSelectedProjectCaseId(projectCase.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        selectedProjectCaseId === projectCase.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-text">
                            {projectCase.title || projectCase.summary || projectCase.phone_number}
                          </div>
                          <div className="mt-1 text-xs text-text-soft">{projectCase.phone_number}</div>
                        </div>
                        <div className={`rounded-full border px-2 py-1 text-[11px] uppercase tracking-wide ${stageTheme(projectCase.stage).badge}`}>
                          {stageLabel(projectCase.stage)}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-soft">
                        {projectCase.project_kind ? <span>{humanizeValue(projectCase.project_kind)}</span> : null}
                        {projectCase.workflow_focus ? <span>· {humanizeValue(projectCase.workflow_focus)}</span> : null}
                      </div>
                      <div className="mt-2 text-xs text-text-soft">{t('updatedAt', { value: formatDate(projectCase.updated_at) })}</div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-text">{t('projectDetailTitle')}</div>
              <div className="text-xs text-text-soft">{t('projectDetailDescription')}</div>
            </div>

            {selectedProjectCase ? (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-[1.5rem] border border-border bg-surface-alt">
                  <div className={`h-1.5 w-full ${selectedTheme.stripe}`} />
                  <div className="p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-serif text-2xl leading-tight text-text">
                        {selectedProjectCase.title || selectedProjectCase.summary || selectedProjectCase.phone_number}
                      </div>
                      <div className="mt-1 text-sm text-text-soft">{selectedProjectCase.summary || selectedProjectCase.phone_number}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedProjectCase.project_kind ? (
                          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-soft">
                            {humanizeValue(selectedProjectCase.project_kind)}
                          </span>
                        ) : null}
                        {selectedProjectCase.workflow_focus ? (
                          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-soft">
                            {humanizeValue(selectedProjectCase.workflow_focus)}
                          </span>
                        ) : null}
                        {selectedProjectCase.workspace_readiness ? (
                          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-soft">
                            {humanizeValue(selectedProjectCase.workspace_readiness)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${selectedTheme.badge}`}>
                        {stageLabel(selectedProjectCase.stage)}
                      </div>
                      <select
                        className="min-h-[40px] rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text"
                        value={selectedProjectCase.stage}
                        onChange={(event) => void updateStage(event.target.value)}
                        disabled={Boolean(busy)}
                      >
                        {stageOptions.map((stage) => (
                          <option key={stage} value={stage}>
                            {stageLabel(stage)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('summaryTitle')}</div>
                    <div className="mt-3 space-y-2 text-sm text-text">
                      <div>{t('projectKindLabel')}: {humanizeValue(selectedProjectCase.project_kind) || t('unknownValue')}</div>
                      <div>{t('workflowFocusLabel')}: {humanizeValue(selectedProjectCase.workflow_focus) || t('unknownValue')}</div>
                      <div>{t('workspaceReadinessLabel')}: {humanizeValue(selectedProjectCase.workspace_readiness) || t('unknownValue')}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('missingItemsTitle')}</div>
                    <div className="mt-3 space-y-2">
                      {missingItems.length ? (
                        missingItems.map((item, index) => (
                          <div key={item} className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text">
                            <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-alt text-[11px] font-semibold text-text-soft">
                              {index + 1}
                            </span>
                            <span>{humanizeValue(item)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-text-soft">{t('emptyMissingItems')}</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('actionsTitle')}</div>
                    <div className="mt-3 grid gap-2">
                      <Button variant="secondary" onClick={() => void updateStage('scoping')} disabled={Boolean(busy)}>
                        {t('markScoping')}
                      </Button>
                      <Button variant="secondary" onClick={() => void updateStage('quote_review')} disabled={Boolean(busy)}>
                        {t('markQuoteReview')}
                      </Button>
                      <Button variant="secondary" onClick={() => void updateStage('permit_ready')} disabled={Boolean(busy)}>
                        {t('markPermitReady')}
                      </Button>
                      <Button variant="secondary" onClick={() => void updateStage('operator_handoff')} disabled={Boolean(busy)}>
                        {t('handoff')}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('threadsTitle')}</div>
                    <div className="mt-3 space-y-2">
                      {threads.length ? (
                        threads.map((thread) => (
                          <div key={thread.id} className="rounded-xl border border-border bg-surface p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="font-medium text-text">{thread.title}</div>
                              <div className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-text-soft">
                                {humanizeValue(thread.status)}
                              </div>
                            </div>
                            <div className="mt-1 text-xs text-text-soft">
                              {humanizeValue(thread.thread_kind)}
                            </div>
                            {thread.summary ? <div className="mt-2 text-sm text-text-soft">{thread.summary}</div> : null}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-text-soft">{t('emptyThreads')}</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('timelineTitle')}</div>
                    <div className="mt-3 space-y-2">
                      {activities.length ? (
                        activities.map((activity) => (
                          <div key={activity.id} className="relative rounded-xl border border-border bg-surface p-3">
                            <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${activity.event_direction === 'operator' ? 'bg-[color:color-mix(in_srgb,var(--accent)_38%,transparent)]' : 'bg-border'}`} />
                            <div className="flex items-start justify-between gap-3">
                              <div className="pl-3 font-medium text-text">{humanizeValue(activity.event_type)}</div>
                              <div className="text-xs text-text-soft">{formatDate(activity.created_at)}</div>
                            </div>
                            {activity.body_text ? <div className="mt-2 pl-3 text-sm text-text-soft">{activity.body_text}</div> : null}
                            <div className="mt-2 pl-3 text-xs uppercase tracking-[0.16em] text-text-muted">
                              {humanizeValue(activity.event_direction)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-text-soft">{t('emptyTimeline')}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-2xl border border-border bg-surface-alt p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('notesTitle')}</div>
                    <textarea
                      className="mt-3 min-h-[112px] w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text"
                      value={noteText}
                      onChange={(event) => setNoteText(event.target.value)}
                      placeholder={t('notePlaceholder')}
                    />
                    <div className="mt-3">
                      <Button onClick={() => void addOperatorNote()} isLoading={busy === 'note'}>
                        {t('saveNote')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
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
                      <div className="mt-1 text-xs text-text-soft">{conversation.last_user_goal || t('emptyGoal')}</div>
                    </div>
                    <div className={`rounded-full border px-2 py-1 text-[11px] uppercase tracking-wide ${stageTheme(conversation.mode).badge}`}>
                      {humanizeValue(conversation.mode)}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-text-soft">{t('updatedAt', { value: formatDate(conversation.updated_at) })}</div>
                </button>
              ))
            )}

            <div className="rounded-2xl border border-border bg-surface-alt p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t('conversationTimelineTitle')}</div>
              <div className="mt-3 space-y-2">
                {selectedConversation ? (
                  events.length ? (
                    events.map((event) => (
                      <div key={event.id} className="rounded-xl border border-border bg-surface p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-medium text-text">{humanizeValue(event.event_type)}</div>
                          <div className="text-xs text-text-soft">{formatDate(event.created_at)}</div>
                        </div>
                        <div className="mt-2 text-xs uppercase tracking-[0.16em] text-text-muted">
                          {humanizeValue(event.event_direction)}
                        </div>
                        {event.event_payload?.text_body || event.event_payload?.body ? (
                          <div className="mt-2 text-sm text-text-soft">
                            {String(event.event_payload?.text_body || event.event_payload?.body)}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-text-soft">{t('emptyConversationTimeline')}</div>
                  )
                ) : (
                  <div className="text-sm text-text-soft">{t('conversationHint')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
