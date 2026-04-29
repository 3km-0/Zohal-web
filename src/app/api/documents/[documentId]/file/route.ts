import { createClient } from '@/lib/supabase/server';
import { zohalBackendUrl } from '@/lib/zohal-backend';
import { NextResponse } from 'next/server';

type RouteContext = {
  params: Promise<{
    documentId: string;
  }>;
};

export async function GET(_: Request, { params }: RouteContext) {
  const { documentId } = await params;
  if (!documentId) {
    return NextResponse.json({ error: 'Missing document id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: document, error: documentError } = await supabase
    .from('documents')
    .select('original_filename, source_metadata')
    .eq('id', documentId)
    .single();

  if (documentError || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const signedUrlResponse = await fetch(
    zohalBackendUrl('documents/download-url'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ document_id: documentId }),
      cache: 'no-store',
    }
  );

  if (!signedUrlResponse.ok) {
    const contentType = signedUrlResponse.headers.get('content-type') || 'application/json';
    const body = await signedUrlResponse.text().catch(() => '');
    return new NextResponse(body, {
      status: signedUrlResponse.status,
      headers: { 'Content-Type': contentType },
    });
  }

  const payload = (await signedUrlResponse.json().catch(() => null)) as {
    download_url?: string;
    storage_path?: string;
  } | null;
  if (!payload?.download_url) {
    return NextResponse.json({ error: 'Document download URL unavailable' }, { status: 404 });
  }

  const upstream = await fetch(payload.download_url, {
    headers: { Accept: '*/*' },
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Failed to fetch document file' }, { status: upstream.status || 502 });
  }

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'application/pdf');
  headers.set('Cache-Control', 'private, no-store');
  const originalFilename =
    document.original_filename ||
    (payload.storage_path ? payload.storage_path.split('/').pop() : null) ||
    `document-${documentId}`;
  headers.set(
    'Content-Disposition',
    upstream.headers.get('content-disposition') || `inline; filename="${originalFilename}"`
  );

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
