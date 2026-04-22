'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MessageCircle, FileUp } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { WorkspaceProjectInboxPanel } from '@/components/experiences/WorkspaceProjectInboxPanel';
import { WhatsAppPicker } from '@/components/document/WhatsAppPicker';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';

export default function WorkspaceProjectsPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const t = useTranslations('workspaceProjectsPage');
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [initialAction, setInitialAction] = useState<'project' | 'ingestion'>('project');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />
      <WorkspaceTabs workspaceId={workspaceId} active="projects" />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>{t('heroTitle')}</CardTitle>
              <CardDescription>{t('heroDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setInitialAction('project');
                  setShowWhatsApp(true);
                }}
              >
                <MessageCircle className="h-4 w-4" />
                {t('startOnWhatsApp')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setInitialAction('ingestion');
                  setShowWhatsApp(true);
                }}
              >
                <FileUp className="h-4 w-4" />
                {t('sendDocsOnWhatsApp')}
              </Button>
            </CardContent>
          </Card>

          <WorkspaceProjectInboxPanel workspaceId={workspaceId} />
        </div>
      </div>

      {showWhatsApp ? (
        <WhatsAppPicker
          workspaceId={workspaceId}
          initialAction={initialAction}
          onClose={() => setShowWhatsApp(false)}
        />
      ) : null}
    </div>
  );
}
