'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { invokeZohalBackendBlob } from '@/lib/zohal-backend';

export type ZohalLibraryDownloadRequest = {
  objectPath?: string | null;
  url?: string | null;
  filename?: string | null;
};

export function normalizeLibraryObjectPath(value: unknown): string | null {
  const path = decodeURIComponent(String(value || '').trim()).replace(/^\/+/, '');
  if (!path || path.includes('..')) return null;
  return path;
}

export function deriveLibraryObjectPathFromUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('gs://')) {
    const noScheme = trimmed.replace(/^gs:\/\//, '');
    const slash = noScheme.indexOf('/');
    if (slash < 0) return null;
    return normalizeLibraryObjectPath(noScheme.slice(slash + 1));
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.hostname.endsWith('.storage.googleapis.com')) {
      return normalizeLibraryObjectPath(parsed.pathname);
    }

    if (parsed.hostname === 'storage.googleapis.com') {
      const parts = decodeURIComponent(parsed.pathname).split('/').filter(Boolean);
      if (parts.length === 0) return null;

      const objectIndex = parts.indexOf('o');
      if (objectIndex >= 0 && objectIndex + 1 < parts.length) {
        return normalizeLibraryObjectPath(parts.slice(objectIndex + 1).join('/'));
      }

      if (parts.length >= 2) {
        return normalizeLibraryObjectPath(parts.slice(1).join('/'));
      }

      return normalizeLibraryObjectPath(parts[0]);
    }

    return normalizeLibraryObjectPath(parsed.pathname);
  } catch {
    return null;
  }
}

export async function downloadLibraryPdf(
  supabase: SupabaseClient,
  request: ZohalLibraryDownloadRequest,
): Promise<Blob> {
  return invokeZohalBackendBlob(supabase, 'library/download', {
    object_path: request.objectPath || undefined,
    url: request.url || undefined,
    filename: request.filename || undefined,
  });
}
