'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ExperiencePublicationPanel } from '@/components/experiences/ExperiencePublicationPanel';
import { WorkspaceAutomationEditor } from '@/components/workspace/WorkspaceAutomationEditor';

export default function WorkspaceAutomationsPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const t = useTranslations('automationReportsPage');

  return (
    <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[18px] border border-border bg-[image:var(--panel-bg)] p-5 shadow-[var(--shadowSm)] md:p-6">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">{t('eyebrow')}</p>
          <div className="mt-2 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] xl:items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-normal text-text md:text-4xl">{t('title')}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-text-soft">
                {t('subtitle')}
              </p>
            </div>
            <div className="grid gap-2 rounded-[14px] border border-[rgba(var(--accent-rgb),0.16)] bg-surface-alt p-3 text-sm text-text-soft">
              <div className="flex items-center justify-between gap-3">
                <span>{t('delivery')}</span>
                <span className="font-semibold text-text">{t('deliveryValue')}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{t('output')}</span>
                <span className="font-semibold text-text">{t('outputValue')}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.05fr)]">
          <div>
            <WorkspaceAutomationEditor workspaceId={workspaceId} />
          </div>
          <div className="min-w-0">
            <ExperiencePublicationPanel workspaceId={workspaceId} embedded />
          </div>
        </section>
      </div>
    </main>
  );
}
