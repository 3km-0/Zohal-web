import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function ShareVerificationPage({ params }: PageProps) {
  const { token } = await params;
  if (!token) notFound();

  const supabase = await createServiceClient();

  // Resolve share token -> verification object
  const { data: vo, error: voError } = await supabase
    .from('verification_objects')
    .select('id, visibility, current_version_id, title')
    .eq('share_token', token)
    .maybeSingle();

  if (voError || !vo) notFound();
  if (vo.visibility !== 'link') notFound();

  // Generate HTML via Edge Function (same template used by iOS "Generate Report")
  const { data: reportData, error: reportError } = await supabase.functions.invoke(
    'export-contract-report',
    {
      body: { verification_object_id: vo.id },
    }
  );

  if (reportError || !reportData?.html) notFound();

  return (
    <div className="min-h-screen bg-white">
      {/* Report HTML is generated server-side by our own Edge Function template */}
      <div dangerouslySetInnerHTML={{ __html: reportData.html as string }} />
    </div>
  );
}

