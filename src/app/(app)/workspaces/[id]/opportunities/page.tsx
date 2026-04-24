import { redirect } from 'next/navigation';

export default async function WorkspaceOpportunitiesRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/workspaces/${id}`);
}
