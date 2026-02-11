import { createHmac } from 'crypto';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { SharePasswordGate } from './share-password-gate';

type PageProps = {
  params: Promise<{ token: string }>;
};

function cookieNameForToken(token: string): string {
  const normalized = token.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return `zohal_share_unlock_${normalized}`;
}

function signUnlockToken(token: string, passwordHash: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createHmac('sha256', secret).update(`${token}:${passwordHash}`).digest('hex');
}

export default async function ShareVerificationPage({ params }: PageProps) {
  const { token } = await params;
  if (!token) notFound();

  const supabase = await createServiceClient();

  const { data: vo, error: voError } = await supabase
    .from('verification_objects')
    .select('id, visibility')
    .eq('share_token', token)
    .maybeSingle();

  if (voError || !vo) notFound();
  if (vo.visibility !== 'link') notFound();

  const { data: protectedRowRaw } = await supabase
    .from('generated_reports')
    .select('is_password_protected, password_hash, password_hint')
    .eq('share_token', token)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const protectedRow = (protectedRowRaw as {
    is_password_protected?: boolean | null;
    password_hash?: string | null;
    password_hint?: string | null;
  } | null);

  const isProtected = protectedRow?.is_password_protected === true && !!protectedRow?.password_hash;
  if (isProtected) {
    const cookieStore = await cookies();
    const currentUnlock = cookieStore.get(cookieNameForToken(token))?.value;
    const expectedUnlock = signUnlockToken(token, String(protectedRow.password_hash));
    if (!currentUnlock || currentUnlock !== expectedUnlock) {
      return (
        <SharePasswordGate
          token={token}
          hint={protectedRow.password_hint ? String(protectedRow.password_hint) : null}
        />
      );
    }
  }

  const { data: reportData, error: reportError } = await supabase.functions.invoke(
    'export-contract-report',
    {
      body: { verification_object_id: vo.id },
    }
  );

  if (reportError || !reportData?.html) notFound();

  return (
    <div className="min-h-screen bg-white">
      <div dangerouslySetInnerHTML={{ __html: reportData.html as string }} />
    </div>
  );
}
