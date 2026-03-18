'use client';

import { useParams } from 'next/navigation';
import { ExperiencePublicationPanel } from '@/components/experiences/ExperiencePublicationPanel';

export default function WorkspaceExperiencesPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  return <ExperiencePublicationPanel workspaceId={workspaceId} />;
}
