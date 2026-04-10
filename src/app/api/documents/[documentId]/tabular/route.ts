import { createClient } from '@/lib/supabase/server';
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
    .select('source_metadata')
    .eq('id', documentId)
    .single();

  if (documentError || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const sourceMetadata = (document.source_metadata || {}) as Record<string, unknown>;
  const manifestStoragePath = typeof sourceMetadata.tabular_manifest_storage_path === 'string'
    ? sourceMetadata.tabular_manifest_storage_path
    : null;

  if (!manifestStoragePath) {
    return NextResponse.json({ error: 'Tabular manifest unavailable' }, { status: 404 });
  }

  const signedUrlResponse = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/document-download-url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        document_id: documentId,
        storage_path_override: manifestStoragePath,
      }),
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

  const payload = (await signedUrlResponse.json().catch(() => null)) as { download_url?: string } | null;
  if (!payload?.download_url) {
    return NextResponse.json({ error: 'Tabular manifest download URL unavailable' }, { status: 404 });
  }

  const upstream = await fetch(payload.download_url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Failed to fetch tabular manifest' }, { status: upstream.status || 502 });
  }

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'application/json');
  headers.set('Cache-Control', 'private, no-store');

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
