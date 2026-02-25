import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    vercelCountry: request.headers.get('x-vercel-ip-country'),
    cfCountry: request.headers.get('cf-ipcountry'),
    acceptLanguage: request.headers.get('accept-language'),
    nextLocaleCookie: request.cookies.get('NEXT_LOCALE')?.value ?? null,
    // All request headers (for full visibility)
    allHeaders: Object.fromEntries(request.headers.entries()),
  });
}
