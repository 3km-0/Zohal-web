'use client';

import { useParams } from 'next/navigation';

import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { WorkspaceAutomationEditor } from '@/components/workspace/WorkspaceAutomationEditor';

export default function WorkspaceAutomationsPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <WorkspaceTabs workspaceId={workspaceId} active="automations" />
      <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          <WorkspaceAutomationEditor workspaceId={workspaceId} />
        </div>
      </main>
    </div>
  );
}
