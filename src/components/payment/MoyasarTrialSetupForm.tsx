'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Input } from '@/components/ui';

export const PENDING_TRIAL_SETUP_STORAGE_KEY = 'zohal_pending_trial_setup';

interface MoyasarTrialSetupFormProps {
  tier: string;
  period: 'monthly' | 'yearly';
  callbackUrl: string;
  promoCode?: string;
  onTokenReady: (tokenId: string) => Promise<void>;
}

interface MoyasarTokenResponse {
  id?: string;
  token?: string;
  verification_url?: string | null;
  message?: string;
  errors?: Record<string, string[]>;
}

export function MoyasarTrialSetupForm({
  tier,
  period,
  callbackUrl,
  promoCode,
  onTokenReady,
}: MoyasarTrialSetupFormProps) {
  const t = useTranslations('subscriptionPage.trial');
  const [holderName, setHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const publishableKey = process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!publishableKey) {
      setError(t('configurationError'));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('https://api.moyasar.com/v1/tokens', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${publishableKey}:`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: holderName.trim(),
          number: cardNumber.replace(/\s+/g, ''),
          month: expiryMonth.trim(),
          year: expiryYear.trim(),
          cvc: cvc.trim(),
          save_only: true,
          callback_url: callbackUrl,
        }),
      });

      const data = (await response.json()) as MoyasarTokenResponse;
      const tokenId = String(data.id || data.token || '').trim();
      const verificationUrl = String(data.verification_url || '').trim();

      if (!response.ok || !tokenId) {
        const firstFieldError = data.errors
          ? Object.values(data.errors).flat()[0]
          : null;
        throw new Error(firstFieldError || data.message || t('genericError'));
      }

      sessionStorage.setItem(
        PENDING_TRIAL_SETUP_STORAGE_KEY,
        JSON.stringify({
          tokenId,
          tier,
          period,
          promoCode: promoCode?.trim() || undefined,
          callbackUrl,
        })
      );

      if (verificationUrl) {
        window.location.assign(verificationUrl);
        return;
      }

      await onTokenReady(tokenId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-zohal border border-border bg-surface-alt p-4 text-sm text-text-soft">
        {t('intro')}
      </div>

      {error ? (
        <div className="rounded-zohal border border-error/30 bg-error/10 p-3 text-sm text-error">
          {error}
        </div>
      ) : null}

      <Input
        label={t('holderName')}
        value={holderName}
        onChange={(event) => setHolderName(event.target.value)}
        placeholder={t('holderNamePlaceholder')}
        autoComplete="cc-name"
        required
        disabled={submitting}
      />

      <Input
        label={t('cardNumber')}
        value={cardNumber}
        onChange={(event) => setCardNumber(event.target.value.replace(/[^\d\s]/g, ''))}
        placeholder={t('cardNumberPlaceholder')}
        autoComplete="cc-number"
        inputMode="numeric"
        required
        disabled={submitting}
      />

      <div className="grid grid-cols-3 gap-4">
        <Input
          label={t('expiryMonth')}
          value={expiryMonth}
          onChange={(event) => setExpiryMonth(event.target.value.replace(/\D/g, '').slice(0, 2))}
          placeholder="MM"
          autoComplete="cc-exp-month"
          inputMode="numeric"
          required
          disabled={submitting}
        />
        <Input
          label={t('expiryYear')}
          value={expiryYear}
          onChange={(event) => setExpiryYear(event.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="YYYY"
          autoComplete="cc-exp-year"
          inputMode="numeric"
          required
          disabled={submitting}
        />
        <Input
          label={t('cvc')}
          value={cvc}
          onChange={(event) => setCvc(event.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="CVC"
          autoComplete="cc-csc"
          inputMode="numeric"
          required
          disabled={submitting}
        />
      </div>

      <div className="rounded-zohal border border-border bg-surface-alt p-4 text-sm text-text-soft">
        {t('note')}
      </div>

      <Button type="submit" className="w-full" isLoading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
