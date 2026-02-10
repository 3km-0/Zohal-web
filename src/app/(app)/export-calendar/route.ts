import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Same-origin calendar export proxy.
 *
 * Why:
 * - Browser download initiation can be blocked when a click happens only after async awaits.
 * - Serving the file from a same-origin route lets us trigger a download synchronously via
 *   normal navigation, while the server attaches auth from cookies.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const documentId = url.searchParams.get('document_id');

  if (!documentId) {
    return NextResponse.json({ error: 'Missing document_id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const upstream = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/export-calendar`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ document_id: documentId }),
    }
  );

  // If the upstream returns an error payload (usually JSON), forward it as-is.
  if (!upstream.ok) {
    const contentType = upstream.headers.get('content-type') || 'application/json';
    const body = await upstream.text().catch(() => '');
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'Content-Type': contentType },
    });
  }

  const arrayBuffer = await upstream.arrayBuffer();
  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'text/calendar; charset=utf-8');

  const contentDisposition = upstream.headers.get('content-disposition');
  if (contentDisposition) headers.set('Content-Disposition', contentDisposition);
  else headers.set('Content-Disposition', 'attachment; filename="contract_obligations.ics"');

  return new NextResponse(arrayBuffer, { status: 200, headers });
}

