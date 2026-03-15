export interface SubscriptionProfileLike {
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  grace_period_ends_at?: string | null;
}

const ENTITLED_STATUSES = new Set([
  '',
  'active',
  'past_due',
  'trialing',
  'canceled',
  'cancelled',
]);

function normalizeTier(rawTier: string | null | undefined): string {
  const value = String(rawTier || 'free').trim().toLowerCase();
  if (value === 'premium' || value === 'ultra') return 'premium';
  if (value === 'team' || value === 'institutional') return 'team';
  if (
    value === 'pro'
    || value === 'pro_plus'
    || value === 'student_monthly'
    || value === 'student_semester'
    || value === 'exam_prep'
    || value === 'educator'
  ) {
    return 'pro';
  }
  return 'free';
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getEffectiveSubscriptionTier(profile: SubscriptionProfileLike | null | undefined): string {
  const normalizedTier = normalizeTier(profile?.subscription_tier);
  if (normalizedTier === 'free') return 'free';

  const now = Date.now();
  const graceEndsAt = parseIsoDate(profile?.grace_period_ends_at);
  if (graceEndsAt && graceEndsAt.getTime() > now) {
    return normalizedTier;
  }

  const expiresAt = parseIsoDate(profile?.subscription_expires_at);
  if (expiresAt && expiresAt.getTime() <= now) {
    return 'free';
  }

  const status = String(profile?.subscription_status || 'active').trim().toLowerCase();
  return ENTITLED_STATUSES.has(status) ? normalizedTier : 'free';
}

export function hasEffectivePaidSubscription(profile: SubscriptionProfileLike | null | undefined): boolean {
  return getEffectiveSubscriptionTier(profile) !== 'free';
}
