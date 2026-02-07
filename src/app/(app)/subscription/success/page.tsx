'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Crown, ArrowRight, Sparkles } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { CHECKOUT_STATE_STORAGE_KEY, parseCheckoutState } from '@/lib/checkout-state';

export default function SubscriptionSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { user } = useAuth();
  const t = useTranslations('subscriptionSuccess');

  const [tier, setTier] = useState<string>('pro');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    async function verifyAndFetchSubscription() {
      if (!user) return;

      const stateFromQuery = searchParams.get('state');
      const stateFromStorage = typeof window !== 'undefined' ? sessionStorage.getItem(CHECKOUT_STATE_STORAGE_KEY) : null;
      const checkoutState = stateFromQuery || stateFromStorage;
      const parsed = parseCheckoutState(checkoutState);

      if (checkoutState && parsed) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            for (let attempt = 0; attempt < 5; attempt++) {
              const response = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-payment`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({
                    payment_record_id: parsed.payment_record_id,
                    invoice_id: parsed.invoice_id,
                    checkout_state: checkoutState,
                  }),
                },
              );

              const result = await response.json();
              if (response.ok && result.tier) {
                setTier(result.tier);
                setExpiresAt(result.expires_at || null);
                sessionStorage.removeItem(CHECKOUT_STATE_STORAGE_KEY);
                setVerifying(false);
                return;
              }

              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }
        } catch (err) {
          console.error('[Success] Verification error:', err);
        }
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_expires_at')
        .eq('id', user.id)
        .single();

      if (profile) {
        setTier(profile.subscription_tier || 'free');
        setExpiresAt(profile.subscription_expires_at);
      }

      setVerifying(false);
    }

    verifyAndFetchSubscription();
  }, [supabase, user, searchParams]);

  const tierColors: Record<string, { bg: string; text: string }> = {
    pro: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
    premium: { bg: 'bg-purple-500/10', text: 'text-purple-500' },
  };

  const colors = tierColors[tier] || tierColors.pro;

  if (verifying) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader title={t('processing')} />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-md text-center" padding="lg">
            <Spinner size="lg" className="mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-text mb-2">{t('activating')}</h2>
            <p className="text-text-soft">{t('pleaseWait')}</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('welcome')} />

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md text-center" padding="lg">
          <div className="relative">
            <div className={cn('w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6', colors.bg)}>
              <Crown className={cn('w-10 h-10', colors.text)} />
            </div>

            <Sparkles className="absolute top-0 right-1/4 w-5 h-5 text-amber-400 animate-pulse" />
            <Sparkles className="absolute top-4 left-1/4 w-4 h-4 text-accent animate-pulse delay-100" />
          </div>

          <h2 className="text-2xl font-bold text-text mb-2">
            {t('welcomeTo', { tier: tier.charAt(0).toUpperCase() + tier.slice(1) })}
          </h2>

          <p className="text-text-soft mb-6">
            {t('subscriptionActive', { tier })}
          </p>

          <div className="p-4 bg-surface-alt rounded-scholar mb-6 text-left">
            <p className="text-sm font-medium text-text mb-3">{t('youNowHave')}</p>
            <ul className="space-y-2">
              <BenefitItem>{t('unlimitedAi')}</BenefitItem>
              <BenefitItem>{t('allPlugins')}</BenefitItem>
              <BenefitItem>{t('priorityProcessing')}</BenefitItem>
              {tier === 'premium' && (
                <>
                  <BenefitItem>{t('driveSync')}</BenefitItem>
                  <BenefitItem>{t('prioritySupport')}</BenefitItem>
                </>
              )}
            </ul>
          </div>

          {expiresAt && (
            <p className="text-sm text-text-soft mb-6">
              {t('renewsOn', { date: new Date(expiresAt).toLocaleDateString() })}
            </p>
          )}

          <div className="space-y-3">
            <Button onClick={() => router.push('/workspaces')} className="w-full">
              {t('startUsing')}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button variant="secondary" onClick={() => router.push('/subscription')} className="w-full">
              {t('viewDetails')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function BenefitItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm text-text-soft">
      <Check className="w-4 h-4 text-success flex-shrink-0" />
      <span>{children}</span>
    </li>
  );
}
