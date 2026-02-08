import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const integration = requestUrl.searchParams.get('integration');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    if (integration === 'google_drive' || integration === 'onedrive') {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (userId) {
        await supabase
          .from('integration_accounts')
          .upsert(
            {
              user_id: userId,
              provider: integration,
              status: 'active',
              connected_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,provider' }
          );
      }
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}/settings`);
}
