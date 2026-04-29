import type { SupabaseClient } from '@supabase/supabase-js';

export function getZohalBackendBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_ZOHAL_BACKEND_URL || process.env.ZOHAL_BACKEND_URL || '';
  const baseUrl = raw.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Zohal backend URL is not configured.');
  }
  return baseUrl;
}

export function zohalBackendUrl(path: string): string {
  const cleanPath = String(path || '').trim().replace(/^\/+/, '');
  return `${getZohalBackendBaseUrl()}/${cleanPath}`;
}

async function getAccessToken(supabase: SupabaseClient): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return session.access_token;
}

export async function invokeZohalBackendJson<T>(
  supabase: SupabaseClient,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const accessToken = await getAccessToken(supabase);
  const response = await fetch(zohalBackendUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.message || json?.error || `Request failed (${response.status})`);
  }
  return json as T;
}

export async function invokeZohalBackendBlob(
  supabase: SupabaseClient,
  path: string,
  body: Record<string, unknown>,
): Promise<Blob> {
  const accessToken = await getAccessToken(supabase);
  const response = await fetch(zohalBackendUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json?.message || json?.error || `Request failed (${response.status})`);
  }
  return response.blob();
}
