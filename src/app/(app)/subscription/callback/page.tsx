'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, X, AlertCircle, ArrowRight } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type PaymentStatus = 'loading' | 'success' | 'failed' | 'pending';

interface PaymentDetails {
  id: string;
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

  useEffect(() => {
    async function verifyPayment() {
      // Get payment ID from URL params
      const paymentId = searchParams.get('id') || searchParams.get('payment_id');
      const paymentStatus = searchParams.get('status');
      const message = searchParams.get('message');

      if (!paymentId) {
        setError('No payment ID found');
        setStatus('failed');
        return;
      }

      // If status is already in URL (from Moyasar callback)
      if (paymentStatus === 'paid') {
        // Wait for webhook to process
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Fetch payment details from our database
        const { data: paymentData, error: fetchError } = await supabase
          .from('subscription_payments')
          .select('*')
          .eq('moyasar_payment_id', paymentId)
          .single();

        if (fetchError || !paymentData) {
          // Payment might still be processing via webhook
          // Check user's subscription status directly
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_tier, subscription_expires_at')
            .eq('id', user?.id)
            .single();

          if (profile && profile.subscription_tier !== 'free') {
            setPayment({
              id: paymentId,
              status: 'paid',
              amount: 0,
              currency: 'SAR',
              tier: profile.subscription_tier,
            });
            setStatus('success');
            return;
          }
        } else {
          setPayment({
            id: paymentData.moyasar_payment_id,
            status: paymentData.status,
            amount: paymentData.amount_cents,
            currency: paymentData.currency,
            tier: paymentData.subscription_tier,
            period: paymentData.subscription_period,
          });

          if (paymentData.status === 'paid') {
            setStatus('success');
            return;
          }
        }
      }

      // If status indicates failure
      if (paymentStatus === 'failed') {
        setError(message || 'Payment was declined');
        setStatus('failed');
        return;
      }

      // If status is initiated or pending, poll for updates
      if (paymentStatus === 'initiated' || !paymentStatus) {
        let attempts = 0;
        const maxAttempts = 10;

        const checkStatus = async () => {
          const { data: paymentData } = await supabase
            .from('subscription_payments')
            .select('*')
            .eq('moyasar_payment_id', paymentId)
            .single();

          if (paymentData) {
            if (paymentData.status === 'paid') {
              setPayment({
                id: paymentData.moyasar_payment_id,
                status: paymentData.status,
                amount: paymentData.amount_cents,
                currency: paymentData.currency,
                tier: paymentData.subscription_tier,
                period: paymentData.subscription_period,
              });
              setStatus('success');
              return true;
            } else if (paymentData.status === 'failed') {
              setError(paymentData.failure_reason || 'Payment failed');
              setStatus('failed');
              return true;
            }
          }
          return false;
        };

        // Poll for payment status
        while (attempts < maxAttempts) {
          const done = await checkStatus();
          if (done) return;
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts++;
        }

        // If we've exhausted attempts, show pending status
        setStatus('pending');
      }
    }

    if (user) {
      verifyPayment();
    }
  }, [searchParams, supabase, user]);

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
              {payment && (
                <div className="p-4 bg-surface-alt rounded-scholar mb-6 text-left">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-text-soft">Plan</span>
                    <span className="font-medium text-text capitalize">{payment.tier} ({payment.period})</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-soft">Amount</span>
                    <span className="font-medium text-text">
                      {(payment.amount / 100).toFixed(2)} {payment.currency}
                    </span>
                  </div>
                </div>
              )}
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
                You'll receive an email once it's complete.
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

