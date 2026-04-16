'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { AskAgentView } from '@/components/ask/AskAgentView';
import { WorkspaceAutomationEditor } from '@/components/workspace/WorkspaceAutomationEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

export default function WorkspaceOperatorPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const t = useTranslations('propertyOperatorPage');
  const supabase = useMemo(() => createClient(), []);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle();
      if (!cancelled && data?.name) setWorkspaceName(String(data.name));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, workspaceId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />
      <WorkspaceTabs workspaceId={workspaceId} active="operator" />

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>{t('agentSectionTitle')}</CardTitle>
              <CardDescription>{t('agentSectionDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="min-h-[28rem] border-t border-border">
                <AskAgentView workspaceId={workspaceId} workspaceName={workspaceName} />
              </div>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{t('automationSectionTitle')}</CardTitle>
                  <CardDescription>{t('automationSectionDescription')}</CardDescription>
                </div>
                <Link
                  href="/automations"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {t('openGlobalAutomations')}
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <WorkspaceAutomationEditor workspaceId={workspaceId} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
