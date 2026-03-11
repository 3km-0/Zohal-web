'use client';

import { AppHeader } from '@/components/layout/AppHeader';
import { AskAgentView } from '@/components/ask/AskAgentView';
import { useTranslations } from 'next-intl';

export default function AskPage() {
  const t = useTranslations('askAgent');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AppHeader title={t('navTitle')} />
      <AskAgentView />
    </div>
  );
}
