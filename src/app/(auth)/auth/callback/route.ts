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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Redirect back to settings with a best-effort signal; UI will show auth error state.
      return NextResponse.redirect(`${origin}/settings?oauth=error`);
    }

    if (integration === 'google_drive' || integration === 'onedrive') {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (userId) {
        // Persist provider tokens so server routes can call provider APIs (e.g., Google Calendar).
        // These fields are already present in the integration_accounts schema.
        const accessToken = (data.session as any)?.provider_token ?? null;
        const refreshToken = (data.session as any)?.provider_refresh_token ?? null;
        const tokenExpiresAt =
          typeof (data.session as any)?.expires_at === 'number'
            ? new Date(((data.session as any).expires_at as number) * 1000).toISOString()
            : null;

        await supabase
          .from('integration_accounts')
          .upsert(
            {
              user_id: userId,
              provider: integration,
              status: 'active',
              connected_at: new Date().toISOString(),
              access_token: accessToken,
              refresh_token: refreshToken,
              token_expires_at: tokenExpiresAt,
            },
            { onConflict: 'user_id,provider' }
          );
      }
    }
  }

  // If opened as a popup (e.g. from inline calendar connect), notify the
  // opener via postMessage and close the popup instead of redirecting.
  const isPopup = requestUrl.searchParams.get('popup') === '1';
  if (isPopup) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><title>Connected</title></head><body>
        <p style="font-family:system-ui;text-align:center;padding:2rem">
          Connected! This window will close automatically&hellip;
        </p>
        <script>
          try { window.opener.postMessage({ type: 'zohal:oauth-done' }, '*'); } catch(e) {}
          window.close();
        </script>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  // URL to redirect to after sign in process completes.
  // OAuth callbacks triggered from integration flows should return to settings;
  // regular auth should land in the main workspace experience.
  if (integration === 'google_drive' || integration === 'onedrive') {
    return NextResponse.redirect(`${origin}/settings`);
  }
  return NextResponse.redirect(`${origin}/workspaces`);
}
