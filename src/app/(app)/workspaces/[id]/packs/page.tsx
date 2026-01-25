'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Package, Layers } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card } from '@/components/ui';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';

export default function WorkspacePacksPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const t = useTranslations('packs');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} />

      <WorkspaceTabs workspaceId={workspaceId} active="packs" />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href={`/workspaces/${workspaceId}/packs/bundles`}>
            <Card className="p-5 hover:bg-surface-alt transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <Package className="w-6 h-6 text-accent" />
                <div className="space-y-1">
                  <div className="text-base font-semibold text-text">{t('bundles.title')}</div>
                  <div className="text-sm text-text-soft">{t('bundles.subtitle')}</div>
                </div>
              </div>
            </Card>
          </Link>

          <Link href={`/workspaces/${workspaceId}/packs/context-sets`}>
            <Card className="p-5 hover:bg-surface-alt transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <Layers className="w-6 h-6 text-accent" />
                <div className="space-y-1">
                  <div className="text-base font-semibold text-text">{t('contextSets.title')}</div>
                  <div className="text-sm text-text-soft">{t('contextSets.subtitle')}</div>
                </div>
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

