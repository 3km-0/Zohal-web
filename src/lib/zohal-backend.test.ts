import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getZohalBackendBaseUrl,
  invokeZohalBackendBlob,
  invokeZohalBackendJson,
  zohalBackendUrl,
} from './zohal-backend';

function mockSupabase(token = 'access-token') {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: token } },
      })),
    },
  } as any;
}

describe('zohal backend client', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ZOHAL_BACKEND_URL = 'https://backend.example/';
    vi.restoreAllMocks();
  });

  it('normalizes the configured backend URL and route paths', () => {
    expect(getZohalBackendBaseUrl()).toBe('https://backend.example');
    expect(zohalBackendUrl('/documents/upload-url')).toBe('https://backend.example/documents/upload-url');
  });

  it('posts authenticated JSON to migrated backend routes', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, request_id: 'req-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await invokeZohalBackendJson<{ ok: boolean }>(
      mockSupabase(),
      'support/tickets',
      { subject: 'Hi' },
    );

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://backend.example/support/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
      body: JSON.stringify({ subject: 'Hi' }),
      cache: 'no-store',
    });
  });

  it('returns blobs for migrated file download routes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('pdf-bytes', {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      })
    ));

    const blob = await invokeZohalBackendBlob(
      mockSupabase(),
      'library/download',
      { object_path: 'reg.pdf' },
    );

    expect(blob.type).toBe('application/pdf');
    expect(await blob.text()).toBe('pdf-bytes');
  });
});
