import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function proxy(request: NextRequest, paramsPromise: Promise<{ path: string[] }>) {
  const { path } = await paramsPromise;
  const baseUrl = process.env.EXPERIENCES_PUBLICATION_API_BASE_URL;

  if (!baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error_code: 'missing_publication_api_base_url',
        message: 'EXPERIENCES_PUBLICATION_API_BASE_URL is not configured.',
      },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const targetUrl = new URL(path.join('/'), `${baseUrl.replace(/\/$/, '')}/`);
  targetUrl.search = request.nextUrl.search;

  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.text();

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      'content-type': request.headers.get('content-type') || 'application/json',
      'x-zohal-user-id': user?.id || 'anonymous',
    },
    body,
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
    },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}
