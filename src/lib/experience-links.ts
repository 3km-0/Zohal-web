export type SurfaceOpenResult = {
  openedUrl: string;
};

export type LiveExperienceLinkState = {
  experience_id?: string | null;
  experience_url?: string | null;
  live_url?: string | null;
  redeem_url?: string | null;
  public_url?: string | null;
};

export type PublishedInterfaceLinkState = {
  experience_id?: string | null;
  url?: string | null;
};

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveHost(url: string): string | null {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

function openExternal(url: string): SurfaceOpenResult {
  window.open(url, '_blank', 'noopener,noreferrer');
  return { openedUrl: url };
}

export function describeLiveExperienceLink(state: LiveExperienceLinkState | null): string {
  return resolveCanonicalLiveExperienceUrl(state) || 'Live Experience is prepared.';
}

export function resolveCanonicalLiveExperienceUrl(state: LiveExperienceLinkState | null): string {
  return safeTrim(state?.experience_url) || safeTrim(state?.live_url) || safeTrim(state?.public_url);
}

export function describePublishedInterfaceLink(state: PublishedInterfaceLinkState | null): string {
  return safeTrim(state?.url) || 'Published interface is ready.';
}

export async function openLiveExperience(state: LiveExperienceLinkState | null): Promise<SurfaceOpenResult> {
  const redeemUrl = safeTrim(state?.redeem_url);
  if (redeemUrl) return openExternal(redeemUrl);

  const experienceId = safeTrim(state?.experience_id);
  if (experienceId) {
    const response = await fetch('/api/experiences/v1/experiences/private-live/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ experience_id: experienceId }),
    });
    const json = await response.json().catch(() => null);
    const openedRedeemUrl = safeTrim(json?.redeem_url);
    const openedExperienceUrl = safeTrim(json?.experience_url) || safeTrim(json?.live_url);
    if (!response.ok || (!openedRedeemUrl && !openedExperienceUrl)) {
      throw new Error(safeTrim(json?.message) || 'Failed to open the live interface.');
    }
    return openExternal(openedRedeemUrl || openedExperienceUrl);
  }

  const fallbackUrl = resolveCanonicalLiveExperienceUrl(state);
  if (fallbackUrl) return openExternal(fallbackUrl);
  throw new Error('Live interface is not ready yet.');
}

export async function openPublishedInterface(state: PublishedInterfaceLinkState | null): Promise<SurfaceOpenResult> {
  const experienceId = safeTrim(state?.experience_id);
  const publishedUrl = safeTrim(state?.url);
  const host = resolveHost(publishedUrl || '') || 'live.zohal.ai';

  if (experienceId) {
    const response = await fetch('/api/experiences/v1/experiences/access/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        experience_id: experienceId,
        host,
        ttl_seconds: 1800,
      }),
    });
    const json = await response.json().catch(() => null);
    const redeemUrl = safeTrim(json?.redeem_url);
    if (response.ok && redeemUrl) {
      return openExternal(redeemUrl);
    }
    if (!response.ok) {
      throw new Error(safeTrim(json?.message) || 'Failed to open the published interface.');
    }
  }

  if (publishedUrl) return openExternal(publishedUrl);
  throw new Error('Published interface is not ready yet.');
}
