'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function WorkspaceExperiencesPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const router = useRouter();

  useEffect(() => {
    router.replace(`/workspaces/${encodeURIComponent(workspaceId)}/automations`);
  }, [router, workspaceId]);

  return null;
}
