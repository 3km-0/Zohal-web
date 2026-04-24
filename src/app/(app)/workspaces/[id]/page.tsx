'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  FileText,
  ListChecks,
  MessageSquare,
  PanelsTopLeft,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { AskAgentView } from '@/components/ask/AskAgentView';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { cn, formatRelativeTime } from '@/lib/utils';

type AgentScope = {
  kind: 'workspace';
  workspaceId: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  description?: string | null;
};

type OpportunityRow = {
  id: string;
  stage?: string | null;
  metadata_json?: Record<string, unknown> | null;
  summary?: string | null;
  missing_info_json?: unknown;
  updated_at?: string | null;
};

type AcquisitionEventRow = {
  id: string;
  event_type?: string | null;
  body_text?: string | null;
  created_at?: string | null;
};

function humanize(value: string | null | undefined): string {
  const text = `${value ?? ''}`.trim();
  if (!text) return '';
  return text.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function countMissingInfo(opportunities: OpportunityRow[]): number {
  return opportunities.reduce((total, opportunity) => {
    const value = opportunity.missing_info_json;
    if (Array.isArray(value)) return total + value.length;
    if (value && typeof value === 'object') return total + Object.keys(value).length;
    return total;
  }, 0);
}

export default function WorkspaceCockpitPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const fromFolderId = searchParams.get('fromFolder');
  const backHref = fromFolderId ? `/workspaces/folders/${encodeURIComponent(fromFolderId)}` : '/workspaces';
  const tCommon = useTranslations('common');
  const t = useTranslations('workspaceCockpitPage');
  const supabase = useMemo(() => createClient(), []);

  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [events, setEvents] = useState<AcquisitionEventRow[]>([]);
  const [documentCount, setDocumentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);

  const agentScope: AgentScope = { kind: 'workspace', workspaceId };

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [workspaceResult, opportunitiesResult, documentsResult] = await Promise.all([
        supabase.from('workspaces').select('id, name, description').eq('id', workspaceId).maybeSingle(),
        supabase
          .from('acquisition_opportunities')
          .select('id, stage, metadata_json, summary, missing_info_json, updated_at')
          .eq('workspace_id', workspaceId)
          .order('updated_at', { ascending: false })
          .limit(12),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      ]);

      setWorkspace((workspaceResult.data as WorkspaceRow | null) ?? null);
      const opportunityRows = (opportunitiesResult.data ?? []) as OpportunityRow[];
      setOpportunities(opportunityRows);
      setDocumentCount(documentsResult.count ?? 0);

      const selectedOpportunityIds = opportunityRows.map((item) => item.id).slice(0, 6);
      if (selectedOpportunityIds.length > 0) {
        const eventsResult = await supabase
          .from('acquisition_events')
          .select('id, event_type, body_text, created_at')
          .in('opportunity_id', selectedOpportunityIds)
          .order('created_at', { ascending: false })
          .limit(8);
        setEvents((eventsResult.data ?? []) as AcquisitionEventRow[]);
      } else {
        setEvents([]);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, workspaceId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const leadOpportunity = opportunities[0] ?? null;
  const missingCount = countMissingInfo(opportunities);
  const recommendationFor = (item: OpportunityRow | null | undefined) => (
    typeof item?.metadata_json?.recommendation === 'string' ? item.metadata_json.recommendation : item?.stage
  );
  const confidenceFor = (item: OpportunityRow | null | undefined) => (
    typeof item?.metadata_json?.confidence === 'string' ? item.metadata_json.confidence : 'low'
  );
  const pursueCount = opportunities.filter((item) => recommendationFor(item) === 'pursue' || item.stage === 'pursue').length;
  const latestUpdate = events[0]?.created_at ?? leadOpportunity?.updated_at ?? null;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className={cn('flex min-w-0 flex-1 flex-col overflow-hidden', agentOpen && 'hidden lg:flex')}>
        <AppHeader
          title={workspace?.name || 'Workspace'}
          subtitle={t('subtitle')}
          leading={
            <Link href={backHref}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
                {tCommon('back')}
              </Button>
            </Link>
          }
          actions={
            <Button onClick={() => setAgentOpen(true)}>
              <Sparkles className="h-4 w-4" />
              {t('askZohal')}
            </Button>
          }
        />

        <WorkspaceTabs workspaceId={workspaceId} active="workspace" />

        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.5fr)_minmax(260px,0.9fr)]">
              <section className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                      {t('mandateFit')}
                    </CardTitle>
                    <CardDescription>{t('screeningPosture')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Badge>{humanize(recommendationFor(leadOpportunity) || 'insufficient_info') || t('notSet')}</Badge>
                    <p className="text-sm text-text-soft">
                      {leadOpportunity?.summary || t('emptyPosture')}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4 text-accent" />
                      {t('evidenceLayer')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-text-soft">
                    <p>{t('sourceDocuments', { count: documentCount })}</p>
                    <Link className="font-medium text-accent hover:underline" href={`/workspaces/${workspaceId}/sources`}>
                      {t('openSources')}
                    </Link>
                  </CardContent>
                </Card>
              </section>

              <section className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <MetricCard icon={Search} label={t('candidates')} value={opportunities.length.toString()} />
                  <MetricCard icon={TrendingUp} label={t('pursue')} value={pursueCount.toString()} />
                  <MetricCard icon={ListChecks} label={t('missingInfo')} value={missingCount.toString()} />
                  <MetricCard icon={BarChart3} label={t('confidence')} value={humanize(confidenceFor(leadOpportunity))} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('decisionModel')}</CardTitle>
                    <CardDescription>{t('decisionDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <DecisionBlock title={t('scenarioModeler')} body={t('scenarioBody')} />
                    <DecisionBlock title={t('capexTitle')} body={t('capexBody')} />
                    <DecisionBlock title={t('diligenceTracker')} body={t('diligenceBody', { count: missingCount })} />
                    <DecisionBlock title={t('nextAction')} body={leadOpportunity ? t('nextActionReview') : t('nextActionSearch')} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('candidateSnapshot')}</CardTitle>
                    <CardDescription>{t('candidateDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {opportunities.length === 0 ? (
                      <p className="text-sm text-text-soft">{t('emptyCandidates')}</p>
                    ) : (
                      opportunities.slice(0, 5).map((item) => (
                        <div key={item.id} className="rounded-lg border border-border bg-surface-alt p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-text">{item.summary || humanize(item.stage) || t('notSet')}</p>
                            <Badge size="sm">{humanize(recommendationFor(item)) || t('notSet')}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-text-soft">{humanize(confidenceFor(item)) || t('notSet')} {t('confidence').toLowerCase()}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </section>

              <section className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageSquare className="h-4 w-4 text-accent" />
                      {t('coordinationLog')}
                    </CardTitle>
                    <CardDescription>{latestUpdate ? t('latestUpdate', { time: formatRelativeTime(latestUpdate) }) : t('noActivity')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {events.length === 0 ? (
                      <p className="text-sm text-text-soft">{t('emptyLog')}</p>
                    ) : (
                      events.map((event) => (
                        <div key={event.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                          <p className="text-sm font-medium text-text">{humanize(event.event_type)}</p>
                          {event.body_text ? <p className="mt-1 text-sm text-text-soft">{event.body_text}</p> : null}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <PanelsTopLeft className="h-4 w-4 text-accent" />
                      {t('publish')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-text-soft">
                    <p>{t('publishBody')}</p>
                    <Link className="font-medium text-accent hover:underline" href={`/workspaces/${workspaceId}/publish`}>
                      {t('openPublish')}
                    </Link>
                  </CardContent>
                </Card>
              </section>
            </div>
          )}
        </div>
      </div>

      {agentOpen ? (
        <aside className="fixed inset-0 z-50 flex bg-black/20 lg:static lg:z-auto lg:w-[420px] lg:border-l lg:border-border lg:bg-surface">
          <div className="ml-auto flex h-full w-full max-w-xl flex-col bg-surface shadow-[var(--shadowLg)] lg:max-w-none lg:shadow-none">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-text">{t('askZohal')}</p>
                <p className="text-xs text-text-soft">{t('workspaceScope', { id: agentScope.workspaceId })}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAgentOpen(false)} aria-label={t('close')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <AskAgentView workspaceId={workspaceId} workspaceName={workspace?.name ?? undefined} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-4 w-4 text-accent" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">{label}</p>
          <p className="text-lg font-semibold text-text">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-alt p-4">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mt-2 text-sm text-text-soft">{body}</p>
    </div>
  );
}
