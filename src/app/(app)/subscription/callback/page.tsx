'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, X, AlertCircle, ArrowRight } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CHECKOUT_STATE_STORAGE_KEY, parseCheckoutState } from '@/lib/checkout-state';

type PaymentStatus = 'loading' | 'success' | 'failed' | 'pending';

interface PaymentDetails {
  status: string;
  amount: number;
  currency: string;
  tier?: string;
  period?: string;
}

export default function SubscriptionCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { user } = useAuth();

  const [status, setStatus] = useState<PaymentStatus>('loading');
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verifyPaymentWithServer = useCallback(
    async (paymentRecordId: string, invoiceId: string, checkoutState: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            payment_record_id: paymentRecordId,
            invoice_id: invoiceId,
            checkout_state: checkoutState,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      return data;
    },
    [supabase.auth],
  );

  useEffect(() => {
    async function verifyPayment() {
      const stateFromQuery = searchParams.get('state');
      const stateFromStorage = typeof window !== 'undefined' ? sessionStorage.getItem(CHECKOUT_STATE_STORAGE_KEY) : null;
      const checkoutState = stateFromQuery || stateFromStorage;
      const parsed = parseCheckoutState(checkoutState);

      if (!checkoutState || !parsed) {
        setError('Missing or expired checkout state. Please try again.');
        setStatus('failed');
        return;
      }

      try {
        const result = await verifyPaymentWithServer(
          parsed.payment_record_id,
          parsed.invoice_id,
          checkoutState,
        );

        setPayment({
          status: 'paid',
          amount: result.amount || 0,
          currency: result.currency || 'SAR',
          tier: result.tier,
          period: result.period,
        });
        sessionStorage.removeItem(CHECKOUT_STATE_STORAGE_KEY);
        setStatus('success');
      } catch (err) {
        console.error('[Callback] Verification failed:', err);
        setStatus('pending');
      }
    }

    if (user) {
      verifyPayment();
    }
  }, [searchParams, user, verifyPaymentWithServer]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title="Payment Status" />

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md text-center" padding="lg">
          {status === 'loading' && (
            <>
              <Spinner size="lg" className="mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text mb-2">Verifying Payment</h2>
              <p className="text-text-soft">Please wait while we confirm your payment...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-success" />
              </div>
              <h2 className="text-xl font-semibold text-text mb-2">Payment Successful!</h2>
              <p className="text-text-soft mb-6">
                {payment?.tier && (
                  <>
                    Your subscription to <span className="font-semibold capitalize">{payment.tier}</span> is now active.
                  </>
                )}
              </p>
              <Button onClick={() => router.push('/workspaces')} className="w-full">
                Go to Dashboard
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </>
          )}

          {status === 'failed' && (
            <>
              <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-error" />
              </div>
              <h2 className="text-xl font-semibold text-text mb-2">Payment Failed</h2>
              <p className="text-text-soft mb-6">
                {error || 'Your payment could not be processed. Please try again.'}
              </p>
              <div className="space-y-3">
                <Button onClick={() => router.push('/subscription')} className="w-full">
                  Try Again
                </Button>
                <Button variant="secondary" onClick={() => router.push('/support')} className="w-full">
                  Contact Support
                </Button>
              </div>
            </>
          )}

          {status === 'pending' && (
            <>
              <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-xl font-semibold text-text mb-2">Payment Processing</h2>
              <p className="text-text-soft mb-6">
                Your payment is being processed. This may take a few minutes.
              </p>
              <div className="space-y-3">
                <Button onClick={() => router.push('/workspaces')} className="w-full">
                  Go to Dashboard
                </Button>
                <Button variant="secondary" onClick={() => window.location.reload()} className="w-full">
                  Check Again
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
