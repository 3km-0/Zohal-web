import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

const GCC_COUNTRY_CODES = new Set(['SA', 'AE', 'KW', 'QA', 'BH', 'OM']);
const LOCALE_COOKIE = 'NEXT_LOCALE';

function detectGccLocale(request: NextRequest): 'ar' | null {
  if (request.cookies.has(LOCALE_COOKIE)) return null;

  // Vercel injects x-vercel-ip-country at the edge; Cloudflare uses cf-ipcountry
  const country =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry');

  if (country && GCC_COUNTRY_CODES.has(country.toUpperCase())) {
    return 'ar';
  }
  return null;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create Supabase client for auth
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ['/workspaces', '/documents', '/notes', '/search', '/tasks', '/settings'];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath && !user) {
    const redirectUrl = new URL('/auth/login', request.url);
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from auth pages
  const authPaths = ['/auth/login', '/auth/signup'];
  const isAuthPath = authPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isAuthPath && user) {
    return NextResponse.redirect(new URL('/workspaces', request.url));
  }

  // Auto-set Arabic for first-time GCC visitors.
  // We redirect (same URL) so the browser re-requests with the cookie already
  // present, ensuring i18n/request.ts picks up Arabic on the very first render.
  // Only fires on GET requests with no existing locale cookie.
  const gccLocale = detectGccLocale(request);
  if (gccLocale && request.method === 'GET') {
    const redirectResponse = NextResponse.redirect(request.nextUrl.clone());
    // Carry over any Supabase session cookies refreshed above.
    response.cookies.getAll().forEach(({ name, value, ...opts }) => {
      redirectResponse.cookies.set(name, value, opts);
    });
    redirectResponse.cookies.set(LOCALE_COOKIE, gccLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$|api).*)',
  ],
};

