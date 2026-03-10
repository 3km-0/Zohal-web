'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { AskAgentView } from '@/components/ask/AskAgentView';
import { createClient } from '@/lib/supabase/client';

export default function WorkspaceAskPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const t = useTranslations('askAgent');
  const supabase = createClient();
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [orgMultiUserEnabled, setOrgMultiUserEnabled] = useState(false);

  useEffect(() => {
    async function loadWorkspace() {
      const { data } = await supabase.from('workspaces').select('name, org_id').eq('id', workspaceId).single();
      setWorkspaceName(data?.name ?? null);
      if (!data?.org_id) {
        setOrgMultiUserEnabled(false);
        return;
      }
      const { data: org } = await supabase
        .from('organizations')
        .select('multi_user_enabled')
        .eq('id', data.org_id)
        .maybeSingle();
      setOrgMultiUserEnabled(org?.multi_user_enabled === true);
    }

    void loadWorkspace();
  }, [supabase, workspaceId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AppHeader title={workspaceName ?? t('workspaceTitle')} subtitle={t('workspaceSubtitleFallback')} />
      <WorkspaceTabs workspaceId={workspaceId} active="ask" showMembersTab={orgMultiUserEnabled} />
      <AskAgentView workspaceId={workspaceId} workspaceName={workspaceName} />
    </div>
  );
}
