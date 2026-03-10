'use client';

import { AppHeader } from '@/components/layout/AppHeader';
import { AskAgentView } from '@/components/ask/AskAgentView';
import { AppModeSwitch } from '@/components/ask/AppModeSwitch';
import { useTranslations } from 'next-intl';

export default function AskPage() {
  const t = useTranslations('askAgent');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AppHeader title={t('navTitle')} />
      <div className="border-b border-border bg-surface px-4 py-3 md:px-6">
        <AppModeSwitch active="ask" />
      </div>
      <AskAgentView />
    </div>
  );
}
