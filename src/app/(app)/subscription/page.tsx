'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Crown,
  Check,
  Sparkles,
  Zap,
  Shield,
  CreditCard,
  ArrowRight,
  X,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Badge, Spinner } from '@/components/ui';
import { MoyasarPaymentForm } from '@/components/payment/MoyasarPaymentForm';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

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
  badge_text?: string;
}

type BillingPeriod = 'monthly' | 'yearly';
type Currency = 'SAR' | 'USD';

export default function SubscriptionPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuth();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [subscriptionExpires, setSubscriptionExpires] = useState<string | null>(null);
  const [paymentSource, setPaymentSource] = useState<string>('apple');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [currency, setCurrency] = useState<Currency>('SAR');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Fetch plans and current subscription
  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      setLoading(true);

      // Fetch subscription plans
      const { data: plansData } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (plansData) {
        setPlans(plansData);
      }

      // Fetch user's current subscription
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_expires_at, payment_source')
        .eq('id', user.id)
        .single();

      if (profile) {
        setCurrentTier(profile.subscription_tier || 'free');
        setSubscriptionExpires(profile.subscription_expires_at);
        setPaymentSource(profile.payment_source || 'apple');
      }

      setLoading(false);
    }

    fetchData();
  }, [supabase, user]);

  const getPrice = (plan: SubscriptionPlan): number | null => {
    if (currency === 'SAR') {
      return billingPeriod === 'monthly' ? plan.price_monthly_sar : plan.price_yearly_sar;
    }
    return billingPeriod === 'monthly' ? plan.price_monthly_usd : plan.price_yearly_usd;
  };

  const formatPrice = (price: number | null): string => {
    if (price === null) return 'Free';
    const symbol = currency === 'SAR' ? 'SAR' : '$';
    return `${symbol}${price.toFixed(2)}`;
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    if (plan.tier === 'free' || plan.tier === currentTier) return;
    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  const handlePaymentComplete = async (payment: { id: string; status: string }) => {
    console.log('Payment completed:', payment);
    setProcessingPayment(true);

    // Wait a moment for webhook to process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Refresh subscription status
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_expires_at')
      .eq('id', user?.id)
      .single();

    if (profile) {
      setCurrentTier(profile.subscription_tier || 'free');
      setSubscriptionExpires(profile.subscription_expires_at);
    }

    setShowPaymentModal(false);
    setSelectedPlan(null);
    setProcessingPayment(false);

    // Show success or redirect
    router.push('/subscription/success');
  };

  const tierIcons: Record<string, typeof Crown> = {
    free: Zap,
    pro: Sparkles,
    premium: Crown,
  };

  const tierColors: Record<string, string> = {
    free: 'text-text-soft',
    pro: 'text-blue-500',
    premium: 'text-purple-500',
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
      <AppHeader title="Subscription" subtitle="Choose the plan that works best for you" />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Current Plan Banner */}
          {currentTier !== 'free' && (
            <Card className="mb-8 bg-gradient-to-r from-accent/10 to-accent/5 border-accent/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-soft">Current Plan</p>
                  <p className="text-xl font-bold text-text capitalize">{currentTier}</p>
                  {subscriptionExpires && (
                    <p className="text-sm text-text-soft mt-1">
                      {paymentSource === 'apple' ? 'Managed via App Store' : `Renews on ${new Date(subscriptionExpires).toLocaleDateString()}`}
                    </p>
                  )}
                </div>
                {paymentSource === 'moyasar' && (
                  <Button variant="secondary" onClick={() => router.push('/settings/payment-methods')}>
                    <CreditCard className="w-4 h-4" />
                    Manage Payment
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Billing Period Toggle */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-colors',
                billingPeriod === 'monthly'
                  ? 'bg-accent text-white'
                  : 'bg-surface border border-border text-text-soft hover:border-accent'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-colors',
                billingPeriod === 'yearly'
                  ? 'bg-accent text-white'
                  : 'bg-surface border border-border text-text-soft hover:border-accent'
              )}
            >
              Yearly
              <Badge size="sm" variant="success" className="ml-2">
                Save 17%
              </Badge>
            </button>

            <div className="w-px h-6 bg-border mx-2" />

            <button
              onClick={() => setCurrency(currency === 'SAR' ? 'USD' : 'SAR')}
              className="px-3 py-1.5 rounded-lg bg-surface border border-border text-sm font-medium text-text-soft hover:border-accent transition-colors"
            >
              {currency}
            </button>
          </div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => {
              const Icon = tierIcons[plan.tier] || Zap;
              const price = getPrice(plan);
              const isCurrentPlan = plan.tier === currentTier;
              const isUpgrade = plans.findIndex((p) => p.tier === plan.tier) > plans.findIndex((p) => p.tier === currentTier);

              return (
                <Card
                  key={plan.tier}
                  className={cn(
                    'relative flex flex-col transition-all',
                    isCurrentPlan && 'border-accent ring-2 ring-accent/20',
                    plan.badge_text && 'border-accent'
                  )}
                  padding="lg"
                >
                  {/* Badge */}
                  {plan.badge_text && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge variant="accent">{plan.badge_text}</Badge>
                    </div>
                  )}

                  {/* Plan Header */}
                  <div className="text-center mb-6">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3',
                        `bg-${tierColors[plan.tier]?.replace('text-', '')}/10`
                      )}
                    >
                      <Icon className={cn('w-6 h-6', tierColors[plan.tier])} />
                    </div>
                    <h3 className="text-lg font-bold text-text">{plan.name}</h3>
                    <p className="text-sm text-text-soft mt-1">{plan.description}</p>
                  </div>

                  {/* Price */}
                  <div className="text-center mb-6">
                    <div className="text-3xl font-bold text-text">
                      {formatPrice(price)}
                    </div>
                    {price !== null && (
                      <p className="text-sm text-text-soft">
                        per {billingPeriod === 'monthly' ? 'month' : 'year'}
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-6 flex-1">
                    {plan.tier === 'free' && (
                      <>
                        <FeatureItem>10 documents</FeatureItem>
                        <FeatureItem>2 AI explanations/day</FeatureItem>
                        <FeatureItem>1 workspace</FeatureItem>
                      </>
                    )}
                    {plan.tier === 'pro' && (
                      <>
                        <FeatureItem>100 documents</FeatureItem>
                        <FeatureItem>Unlimited AI explanations</FeatureItem>
                        <FeatureItem>10 workspaces</FeatureItem>
                        <FeatureItem>All plugins (STEM, Legal, Finance)</FeatureItem>
                        <FeatureItem>Calendar sync</FeatureItem>
                      </>
                    )}
                    {plan.tier === 'premium' && (
                      <>
                        <FeatureItem>Unlimited documents</FeatureItem>
                        <FeatureItem>Unlimited AI usage</FeatureItem>
                        <FeatureItem>100GB storage</FeatureItem>
                        <FeatureItem>Unlimited workspaces</FeatureItem>
                        <FeatureItem>All plugins included</FeatureItem>
                        <FeatureItem>Google Drive sync</FeatureItem>
                        <FeatureItem>Priority support</FeatureItem>
                      </>
                    )}
                  </ul>

                  {/* Action Button */}
                  <Button
                    variant={isCurrentPlan ? 'secondary' : isUpgrade ? 'primary' : 'secondary'}
                    className="w-full"
                    disabled={isCurrentPlan || (plan.tier === 'free' && !isCurrentPlan)}
                    onClick={() => handleSelectPlan(plan)}
                  >
                    {isCurrentPlan ? (
                      'Current Plan'
                    ) : plan.tier === 'free' ? (
                      'Free'
                    ) : isUpgrade ? (
                      <>
                        Upgrade
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </>
                    ) : (
                      'Downgrade'
                    )}
                  </Button>
                </Card>
              );
            })}
          </div>

          {/* FAQ or Additional Info */}
          <div className="mt-12 text-center">
            <p className="text-sm text-text-soft">
              Questions about pricing?{' '}
              <a href="/support" className="text-accent hover:underline">
                Contact support
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !processingPayment && setShowPaymentModal(false)}
          />

          <Card className="relative w-full max-w-md z-10 animate-slide-up" padding="none">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="text-lg font-semibold text-text">
                  Upgrade to {selectedPlan.name}
                </h2>
                <p className="text-sm text-text-soft">
                  {billingPeriod === 'monthly' ? 'Monthly' : 'Yearly'} subscription
                </p>
              </div>
              <button
                onClick={() => !processingPayment && setShowPaymentModal(false)}
                className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors"
                disabled={processingPayment}
              >
                <X className="w-5 h-5 text-text-soft" />
              </button>
            </div>

            {/* Payment Form */}
            <div className="p-5">
              {processingPayment ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Spinner size="lg" />
                  <p className="mt-4 text-text-soft">Processing your payment...</p>
                </div>
              ) : (
                <MoyasarPaymentForm
                  amount={Math.round((getPrice(selectedPlan) || 0) * 100)}
                  description={`Zohal ${selectedPlan.name} (${billingPeriod})`}
                  tier={selectedPlan.tier}
                  period={billingPeriod}
                  callbackUrl={`${window.location.origin}/subscription/callback`}
                  onPaymentComplete={handlePaymentComplete}
                  onPaymentError={(error) => {
                    console.error('Payment error:', error);
                  }}
                  onPaymentInitiating={() => {
                    setProcessingPayment(true);
                  }}
                />
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-text-soft">
      <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </li>
  );
}

