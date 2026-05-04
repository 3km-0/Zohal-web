'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  Check,
  CheckCircle,
  CreditCard,
  Crown,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Badge, Spinner, Input } from '@/components/ui';
import { MoyasarPaymentForm } from '@/components/payment/MoyasarPaymentForm';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { getWebSubscriptionFlags } from '@/lib/feature-flags';
import { CHECKOUT_STATE_STORAGE_KEY } from '@/lib/checkout-state';
import { getEffectiveSubscriptionTier } from '@/lib/subscription';

interface SubscriptionPlan {
  tier: string;
  name: string;
  description: string;
  price_monthly_usd: number | null;
  price_yearly_usd: number | null;
  price_monthly_sar: number | null;
  price_yearly_sar: number | null;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  guardrails?: Record<string, number | Record<string, number>>;
  badge_text?: string | null;
  display_order?: number | null;
}

interface BillingProfile {
  subscription_tier: string | null;
  subscription_expires_at: string | null;
  payment_source: string | null;
  subscription_status: string | null;
  grace_period_ends_at?: string | null;
  subscription_trial_consumed_at?: string | null;
}

type BillingPeriod = 'monthly' | 'yearly';
type BillingSegment = 'individuals' | 'business';
const PUBLIC_SUBSCRIPTION_TIERS = new Set(['pro']);

const TIER_RANK: Record<string, number> = {
  free: 0,
  pro: 1,
  premium: 2,
  team: 3,
};

function sortPlans(plans: SubscriptionPlan[]) {
  return [...plans].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
}

function readNumericValue(
  source: Record<string, number | Record<string, number>> | Record<string, number> | undefined,
  key: string
): number | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export default function SubscriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { user } = useAuth();
  const t = useTranslations('subscriptionPage');
  const tFeatures = useTranslations('subscriptionPage.features');
  const tEnterprise = useTranslations('subscriptionPage.enterprise');
  const subscriptionFlags = getWebSubscriptionFlags();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [currentStatus, setCurrentStatus] = useState<string>('active');
  const [subscriptionExpires, setSubscriptionExpires] = useState<string | null>(null);
  const [paymentSource, setPaymentSource] = useState<string>('apple');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [billingSegment, setBillingSegment] = useState<BillingSegment>('individuals');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');

  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);
  const [enterpriseForm, setEnterpriseForm] = useState({
    name: '',
    email: '',
    company: '',
    companySize: '',
    phone: '',
    message: '',
  });
  const [enterpriseSubmitting, setEnterpriseSubmitting] = useState(false);
  const [enterpriseSuccess, setEnterpriseSuccess] = useState(false);
  const [enterpriseError, setEnterpriseError] = useState<string | null>(null);
  const compactNumber = useCallback(
    (value: number) =>
      new Intl.NumberFormat(undefined, {
        notation: value >= 1_000_000 ? 'compact' : 'standard',
        maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
      }).format(value),
    []
  );

  const individualPlans = useMemo(
    () => sortPlans(plans.filter((plan) => PUBLIC_SUBSCRIPTION_TIERS.has(plan.tier))),
    [plans]
  );
  const businessPlans = useMemo<SubscriptionPlan[]>(() => [], []);
  const visiblePlans = billingSegment === 'individuals' ? individualPlans : businessPlans;

  const refreshProfile = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    const profile = data as BillingProfile | null;

    if (profile) {
      const effectiveTier = getEffectiveSubscriptionTier(profile);
      setCurrentTier(effectiveTier);
      setSubscriptionExpires(profile.subscription_expires_at);
      setPaymentSource(profile.payment_source || 'apple');
      setCurrentStatus(profile.subscription_status || 'active');
    }
  }, [supabase, user]);

  const mapCheckoutError = useCallback(
    (code: string | undefined, fallback: string) => {
      switch (code) {
        case 'invalid_promo':
          return t('promoErrors.invalid');
        case 'promo_not_started':
          return t('promoErrors.notStarted');
        case 'promo_expired':
          return t('promoErrors.expired');
        case 'promo_ineligible_tier':
          return t('promoErrors.planMismatch');
        case 'promo_ineligible_period':
          return t('promoErrors.periodMismatch');
        default:
          return fallback;
      }
    },
    [t]
  );

  useEffect(() => {
    setBillingSegment('individuals');
  }, [searchParams]);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      setLoading(true);

      const { data: plansData } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .in('tier', ['free', 'pro', 'premium', 'team'])
        .order('display_order');

      if (plansData) {
        setPlans(plansData);
      }

      await refreshProfile();
      setLoading(false);
    }

    fetchData();
  }, [refreshProfile, supabase, user]);

  const getPrice = (plan: SubscriptionPlan): number | null => {
    if (plan.tier === 'team') return null;
    if (plan.tier === 'pro') return billingPeriod === 'monthly' ? 299 : 2999;
    return billingPeriod === 'monthly' ? plan.price_monthly_sar : plan.price_yearly_sar;
  };

  const formatPrice = (price: number | null, tier: string): string => {
    if (tier === 'team' || tier === 'enterprise') return tEnterprise('customPricing');
    if (price === null) return t('free');
    return `SAR ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(price)}`;
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    if (plan.tier === 'free' || plan.tier === currentTier) return;
    if (plan.tier === 'team') {
      setShowEnterpriseModal(true);
      return;
    }
    setSelectedPlan(plan);
    setPaymentError(null);
    setShowPaymentModal(true);
  };

  const startHostedCheckout = async (plan: SubscriptionPlan) => {
    if (!user) return;
    setProcessingPayment(true);
    setPaymentError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error(t('notAuthenticated'));
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/moyasar-create-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            tier: plan.tier,
            period: billingPeriod,
            promo_code: promoCode.trim() || undefined,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data?.payment_url || !data?.checkout_state) {
        throw new Error(mapCheckoutError(data?.code, data?.error || t('checkoutError')));
      }

      sessionStorage.setItem(CHECKOUT_STATE_STORAGE_KEY, data.checkout_state);
      window.location.href = data.payment_url as string;
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : t('checkoutError'));
      setProcessingPayment(false);
    }
  };

  const handlePaymentComplete = async () => {
    setProcessingPayment(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await refreshProfile();
    setShowPaymentModal(false);
    setSelectedPlan(null);
    setProcessingPayment(false);
    router.push('/subscription/success');
  };

  const isTrialEligible = (_plan: SubscriptionPlan) => false;
  // Promo input is shown for any web-checkoutable tier when the hosted-checkout
  // flow (v2) is enabled. Server-side promo resolution lives in
  // `moyasar-create-subscription`; the legacy MoyasarPaymentForm path bypasses
  // the server and therefore cannot honor coupons safely.
  const canApplyPromo = (plan: SubscriptionPlan) =>
    PUBLIC_SUBSCRIPTION_TIERS.has(plan.tier) && subscriptionFlags.v2Enabled;

  const tierIcons: Record<string, typeof Crown> = {
    free: Zap,
    pro: Sparkles,
    premium: Crown,
    team: Users,
  };

  const tierColors: Record<string, string> = {
    free: 'text-text-soft',
    pro: 'text-blue-500',
    premium: 'text-purple-500',
    team: 'text-accent',
  };

  const planDescription = useCallback(
    (plan: SubscriptionPlan) => {
      if (plan.tier === 'pro') return t('planDescriptions.pro');
      if (plan.tier === 'premium') return t('planDescriptions.premium');
      if (plan.tier === 'team') return t('planDescriptions.team');
      return plan.description;
    },
    [t]
  );

  const buildPlanBullets = useCallback(
    (plan: SubscriptionPlan) => {
      const bullets: string[] = [];
      const maxWorkspaces =
        readNumericValue(plan.guardrails, 'max_workspaces') ?? readNumericValue(plan.limits, 'max_workspaces');
      const maxMembers =
        readNumericValue(plan.guardrails, 'max_workspace_members') ??
        readNumericValue(plan.limits, 'max_workspace_members');
      const vendorVisits =
        readNumericValue(plan.guardrails, 'renovation_vendor_visits_yearly') ??
        readNumericValue(plan.limits, 'renovation_vendor_visits_yearly');

      if (maxWorkspaces === 1) {
        bullets.push(tFeatures('workspace1'));
      } else if (maxWorkspaces === 3) {
        bullets.push(tFeatures('workspaces3'));
      } else if (maxWorkspaces === 20) {
        bullets.push(tFeatures('workspaces20'));
      } else if (maxWorkspaces && maxWorkspaces >= 999999) {
        bullets.push(tFeatures('unlimitedWorkspaces'));
      } else if (maxWorkspaces && maxWorkspaces >= 250) {
        bullets.push(tFeatures('sharedWorkspaces'));
      }

      if (maxMembers === 1) {
        bullets.push(tFeatures('user1'));
      } else if (maxMembers && maxMembers > 1) {
        bullets.push(tFeatures('usersCount', { count: compactNumber(maxMembers) }));
      }

      const hasAllCoreTools =
        plan.features?.stem_check && plan.features?.legal_tools && plan.features?.finance_tools;
      if (hasAllCoreTools) {
        bullets.push(tFeatures('allTools'));
      }
      if (plan.features?.google_drive_import || plan.features?.onedrive_import || plan.features?.whatsapp_import) {
        bullets.push(tFeatures('importsIncluded'));
      }
      if (plan.features?.google_drive_sync) {
        bullets.push(tFeatures('driveSync'));
      }
      if (plan.features?.calendar_sync) {
        bullets.push(tFeatures('calendarSync'));
      }
      if (plan.features?.priority_support) {
        bullets.push(tFeatures('prioritySupport'));
      }
      if (plan.features?.team_management) {
        bullets.push(tFeatures('teamManagement'));
      }
      if (plan.features?.acquisition_broadcast) {
        bullets.push(tFeatures('mandateBroadcasts'));
      }
      if (plan.features?.portfolio_tab) {
        bullets.push(tFeatures('portfolioTab'));
      }
      if (vendorVisits && vendorVisits > 0) {
        bullets.push(tFeatures('vendorVisits', { count: compactNumber(vendorVisits) }));
      }
      if (plan.tier === 'team') {
        bullets.push(tFeatures('teamAnnualContact'));
      }

      return bullets.slice(0, 8);
    },
    [compactNumber, tFeatures]
  );

  const handleEnterpriseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnterpriseSubmitting(true);
    setEnterpriseError(null);

    try {
      const { error } = await supabase.from('enterprise_inquiries').insert({
        user_id: user?.id || null,
        name: enterpriseForm.name,
        email: enterpriseForm.email,
        company: enterpriseForm.company || null,
        company_size: enterpriseForm.companySize || null,
        phone: enterpriseForm.phone || null,
        message: enterpriseForm.message || null,
      });

      if (error) throw error;

      setEnterpriseSuccess(true);
      setEnterpriseForm({
        name: '',
        email: '',
        company: '',
        companySize: '',
        phone: '',
        message: '',
      });
    } catch {
      setEnterpriseError(tEnterprise('errorMessage'));
    } finally {
      setEnterpriseSubmitting(false);
    }
  };

  const handleCloseEnterpriseModal = () => {
    setShowEnterpriseModal(false);
    setTimeout(() => {
      setEnterpriseSuccess(false);
      setEnterpriseError(null);
    }, 300);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          {currentTier !== 'free' ? (
            <Card className="mb-8 border-accent/20 bg-gradient-to-r from-accent/10 to-accent/5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-text-soft">{t('currentPlan')}</p>
                    {currentStatus === 'trialing' ? <Badge variant="accent">{t('trialBadge')}</Badge> : null}
                  </div>
                  <p className="text-xl font-bold text-text">
                    {currentTier === 'pro'
                      ? t('proPlan')
                      : currentTier === 'premium'
                        ? t('premiumPlan')
                        : currentTier === 'team'
                          ? t('teamPlan')
                          : currentTier}
                  </p>
                  {subscriptionExpires ? (
                    <p className="mt-1 text-sm text-text-soft">
                      {currentStatus === 'trialing'
                        ? t('trialEndsOn', { date: new Date(subscriptionExpires).toLocaleDateString() })
                        : paymentSource === 'apple'
                          ? t('managedByAppStore')
                          : t('renewsOn', { date: new Date(subscriptionExpires).toLocaleDateString() })}
                    </p>
                  ) : null}
                </div>
                {paymentSource === 'moyasar' ? (
                  <Button variant="secondary" onClick={() => router.push('/settings/payment-methods')}>
                    <CreditCard className="h-4 w-4" />
                    {t('managePayment')}
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}

          <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center rounded-full border border-border bg-surface p-1">
              {(['monthly', 'yearly'] as BillingPeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setBillingPeriod(period)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    billingPeriod === period
                      ? 'bg-accent text-white'
                      : 'text-text-soft hover:text-text'
                  )}
                >
                  {period === 'monthly' ? t('monthly') : t('yearly')}
                </button>
              ))}
            </div>

          </div>

          <div className="mx-auto grid max-w-xl gap-6">
            {visiblePlans.map((plan) => {
              const Icon = tierIcons[plan.tier] || Zap;
              const price = getPrice(plan);
              const isCurrentPlan = plan.tier === currentTier;
              const isUpgrade = (TIER_RANK[plan.tier] || 0) > (TIER_RANK[currentTier] || 0);

              return (
                <Card
                  key={plan.tier}
                  className={cn(
                    'relative flex h-full flex-col transition-all',
                    isCurrentPlan && 'border-accent ring-2 ring-accent/20',
                    plan.badge_text && 'border-accent'
                  )}
                  padding="lg"
                >
                  {plan.badge_text ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge variant="accent">{plan.badge_text}</Badge>
                    </div>
                  ) : null}

                  <div className="mb-6 text-center">
                    <div
                      className={cn(
                        'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full',
                        plan.tier === 'team' ? 'bg-accent/10' : 'bg-surface-alt'
                      )}
                    >
                      <Icon className={cn('h-6 w-6', tierColors[plan.tier])} />
                    </div>
                    <h3 className="text-lg font-bold text-text">
                      {plan.tier === 'pro'
                        ? t('proPlan')
                        : plan.tier === 'premium'
                          ? t('premiumPlan')
                          : plan.tier === 'team'
                            ? t('teamPlan')
                            : plan.name}
                    </h3>
                    <p className="mt-1 text-sm text-text-soft">{planDescription(plan)}</p>
                  </div>

                  <div className="mb-6 text-center">
                    <div className="text-3xl font-bold text-text">{formatPrice(price, plan.tier)}</div>
                    {price !== null ? (
                      <p className="text-sm text-text-soft">
                        {billingPeriod === 'monthly' ? t('perMonth') : t('perYear')}
                      </p>
                    ) : null}
                  </div>

                  <ul className="mb-6 flex-1 space-y-3">
                    {buildPlanBullets(plan).map((bullet) => (
                      <FeatureItem key={`${plan.tier}-${bullet}`}>{bullet}</FeatureItem>
                    ))}
                  </ul>

                  <Button
                    variant={isCurrentPlan ? 'secondary' : isUpgrade ? 'primary' : 'secondary'}
                    className="w-full"
                    disabled={isCurrentPlan}
                    onClick={() => handleSelectPlan(plan)}
                  >
                    {isCurrentPlan ? (
                      currentStatus === 'trialing' ? t('currentTrial') : t('currentPlanBadge')
                    ) : plan.tier === 'team' ? (
                      <>
                        {t('contactSales')}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </>
                    ) : isTrialEligible(plan) ? (
                      t('startTrial')
                    ) : isUpgrade ? (
                      <>
                        {t('upgrade')}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </>
                    ) : (
                      t('downgrade')
                    )}
                  </Button>
                </Card>
              );
            })}

          </div>

          {paymentError ? (
            <div className="mx-auto mt-6 max-w-2xl rounded-zohal border border-error/30 bg-error/10 p-4 text-sm text-error">
              {paymentError}
            </div>
          ) : null}

          <div className="mt-12 text-center">
            <p className="text-sm text-text-soft">
              {t('questionsAboutPricing')}{' '}
              <a href="/support" className="text-accent hover:underline">
                {t('contactSupport')}
              </a>
            </p>
          </div>
        </div>
      </div>

      {showPaymentModal && selectedPlan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !processingPayment && setShowPaymentModal(false)}
          />

          <Card className="relative z-10 w-full max-w-md animate-slide-up" padding="none">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold text-text">
                  {t('upgradeTo', {
                    plan: selectedPlan.tier === 'premium' ? t('premiumPlan') : selectedPlan.name,
                  })}
                </h2>
                <p className="text-sm text-text-soft">
                  {billingPeriod === 'monthly' ? t('monthlySubscription') : t('yearlySubscription')}
                </p>
              </div>
              <button
                onClick={() => !processingPayment && setShowPaymentModal(false)}
                className="rounded-lg p-1.5 transition-colors hover:bg-surface-alt"
                disabled={processingPayment}
              >
                <X className="h-5 w-5 text-text-soft" />
              </button>
            </div>

            <div className="p-5">
              {processingPayment ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Spinner size="lg" />
                  <p className="mt-4 text-text-soft">{t('processingPayment')}</p>
                </div>
              ) : subscriptionFlags.v2Enabled ? (
                <div className="space-y-4">
                  {canApplyPromo(selectedPlan) ? (
                    <div className="space-y-2">
                      <Input
                        label={t('promoCodeLabel')}
                        placeholder={t('promoCodePlaceholder')}
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                        maxLength={32}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        disabled={processingPayment}
                      />
                      <p className="text-xs text-text-soft">{t('promoCheckoutHint')}</p>
                    </div>
                  ) : null}
                  <div className="rounded-zohal bg-surface-alt p-4 text-sm text-text-soft">
                    {t('hostedCheckoutNote')}
                  </div>
                  <Button className="w-full" onClick={() => startHostedCheckout(selectedPlan)}>
                    {t('continueToCheckout')}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <MoyasarPaymentForm
                  amount={Math.round((getPrice(selectedPlan) || 0) * 100)}
                  description={`Zohal ${selectedPlan.name} (${billingPeriod})`}
                  tier={selectedPlan.tier}
                  period={billingPeriod}
                  callbackUrl={`${window.location.origin}/subscription/callback`}
                  onPaymentComplete={handlePaymentComplete}
                  onPaymentError={(error) => setPaymentError(error.message)}
                  onPaymentInitiating={() => setProcessingPayment(true)}
                />
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {showEnterpriseModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !enterpriseSubmitting && handleCloseEnterpriseModal()}
          />

          <Card className="relative z-10 w-full max-w-lg animate-slide-up" padding="none">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold text-text">{tEnterprise('modalTitle')}</h2>
                <p className="text-sm text-text-soft">{tEnterprise('modalSubtitle')}</p>
              </div>
              <button
                onClick={() => !enterpriseSubmitting && handleCloseEnterpriseModal()}
                className="rounded-lg p-1.5 transition-colors hover:bg-surface-alt"
                disabled={enterpriseSubmitting}
              >
                <X className="h-5 w-5 text-text-soft" />
              </button>
            </div>

            <div className="p-5">
              {enterpriseSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                    <CheckCircle className="h-8 w-8 text-success" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-text">{tEnterprise('successTitle')}</h3>
                  <p className="max-w-sm text-text-soft">{tEnterprise('successMessage')}</p>
                  <Button variant="secondary" className="mt-6" onClick={handleCloseEnterpriseModal}>
                    {t('close')}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleEnterpriseSubmit} className="space-y-4">
                  {enterpriseError ? (
                    <div className="rounded-lg border border-error/20 bg-error/10 p-3 text-sm text-error">
                      {enterpriseError}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label={tEnterprise('name')}
                      placeholder={tEnterprise('namePlaceholder')}
                      value={enterpriseForm.name}
                      onChange={(e) => setEnterpriseForm({ ...enterpriseForm, name: e.target.value })}
                      required
                      disabled={enterpriseSubmitting}
                    />
                    <Input
                      label={tEnterprise('email')}
                      type="email"
                      placeholder={tEnterprise('emailPlaceholder')}
                      value={enterpriseForm.email}
                      onChange={(e) => setEnterpriseForm({ ...enterpriseForm, email: e.target.value })}
                      required
                      disabled={enterpriseSubmitting}
                    />
                    <Input
                      label={tEnterprise('company')}
                      placeholder={tEnterprise('companyPlaceholder')}
                      value={enterpriseForm.company}
                      onChange={(e) => setEnterpriseForm({ ...enterpriseForm, company: e.target.value })}
                      disabled={enterpriseSubmitting}
                    />
                    <div className="w-full">
                      <label className="mb-1.5 block text-sm font-medium text-text">
                        {tEnterprise('companySize')}
                      </label>
                      <select
                        className="min-h-[44px] w-full rounded-zohal border border-border bg-surface px-4 py-3 text-text"
                        value={enterpriseForm.companySize}
                        onChange={(e) =>
                          setEnterpriseForm({ ...enterpriseForm, companySize: e.target.value })
                        }
                        disabled={enterpriseSubmitting}
                      >
                        <option value="">{tEnterprise('companySizePlaceholder')}</option>
                        {(['1-10', '11-50', '51-200', '201-500', '500+'] as const).map((size) => (
                          <option key={size} value={size}>
                            {tEnterprise(`companySizes.${size}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Input
                    label={tEnterprise('phone')}
                    placeholder={tEnterprise('phonePlaceholder')}
                    value={enterpriseForm.phone}
                    onChange={(e) => setEnterpriseForm({ ...enterpriseForm, phone: e.target.value })}
                    disabled={enterpriseSubmitting}
                  />

                  <div className="w-full">
                    <label className="mb-1.5 block text-sm font-medium text-text">
                      {tEnterprise('message')}
                    </label>
                    <textarea
                      className="min-h-[120px] w-full rounded-zohal border border-border bg-surface px-4 py-3 text-text"
                      placeholder={tEnterprise('messagePlaceholder')}
                      value={enterpriseForm.message}
                      onChange={(e) => setEnterpriseForm({ ...enterpriseForm, message: e.target.value })}
                      disabled={enterpriseSubmitting}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    isLoading={enterpriseSubmitting}
                    disabled={enterpriseSubmitting || !enterpriseForm.name || !enterpriseForm.email}
                  >
                    {enterpriseSubmitting ? tEnterprise('submitting') : tEnterprise('submit')}
                  </Button>
                </form>
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm text-text-soft">
      <Check className="h-4 w-4 flex-shrink-0 text-success" />
      <span>{children}</span>
    </li>
  );
}
