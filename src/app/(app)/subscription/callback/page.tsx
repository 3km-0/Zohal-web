'use client';

import { useEffect, useState, useCallback } from 'react';
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

  const verifyPaymentWithServer = useCallback(async (paymentId: string, invoiceId: string | null) => {
    try {
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
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            payment_id: paymentId,
            invoice_id: invoiceId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      return data;
    } catch (err) {
      console.error('Payment verification error:', err);
      throw err;
    }
  }, [supabase.auth]);

  useEffect(() => {
    async function verifyPayment() {
      // Get payment ID from URL params (Moyasar sends these)
      const paymentId = searchParams.get('id') || searchParams.get('payment_id');
      const invoiceId = searchParams.get('invoice_id');
      const paymentStatus = searchParams.get('status');
      const message = searchParams.get('message');

      console.log('[Callback] Params:', { paymentId, invoiceId, paymentStatus, message });

      if (!paymentId && !invoiceId) {
        setError('No payment information found');
        setStatus('failed');
        return;
      }

      // If status indicates failure
      if (paymentStatus === 'failed') {
        setError(message || 'Payment was declined');
        setStatus('failed');
        return;
      }

      // If status is paid or we have a payment ID, verify with our server
      if (paymentStatus === 'paid' || paymentId) {
        try {
          // Call our verify-payment Edge Function
          const result = await verifyPaymentWithServer(paymentId || '', invoiceId);
          
          console.log('[Callback] Verification result:', result);

          setPayment({
            id: paymentId || invoiceId || '',
            status: 'paid',
            amount: result.amount || 0,
            currency: result.currency || 'SAR',
            tier: result.tier,
            period: result.period,
          });
          setStatus('success');
          return;
        } catch (err) {
          console.error('[Callback] Verification failed:', err);
          // Don't fail immediately - the payment might still be processing
        }
      }

      // If verification failed but status was paid, try polling
      if (paymentStatus === 'paid') {
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          
          try {
            const result = await verifyPaymentWithServer(paymentId || '', invoiceId);
            setPayment({
              id: paymentId || invoiceId || '',
              status: 'paid',
              amount: result.amount || 0,
              currency: result.currency || 'SAR',
              tier: result.tier,
              period: result.period,
            });
            setStatus('success');
            return;
          } catch {
            attempts++;
          }
        }
      }

      // If we still couldn't verify, show pending
      setStatus('pending');
    }

    if (user) {
      verifyPayment();
    }
  }, [searchParams, supabase, user, verifyPaymentWithServer]);

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

