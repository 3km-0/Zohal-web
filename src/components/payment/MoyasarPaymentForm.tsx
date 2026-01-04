'use client';

import { useState } from 'react';
import { CreditCard, Smartphone, ArrowRight, Lock } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface MoyasarPaymentFormProps {
  amount: number; // In halalas (SAR cents)
  description: string;
  tier: string;
  period: 'monthly' | 'yearly';
  callbackUrl: string;
  onPaymentComplete?: (payment: { id: string; status: string }) => void;
  onPaymentError?: (error: { message: string }) => void;
  onPaymentInitiating?: () => void;
  className?: string;
}

export function MoyasarPaymentForm({
  amount,
  description,
  tier,
  period,
  callbackUrl,
  onPaymentInitiating,
  className,
}: MoyasarPaymentFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handlePayment = async () => {
    setLoading(true);
    setError(null);
    onPaymentInitiating?.();

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Please log in to continue');
        setLoading(false);
        return;
      }

      // Call our Edge Function to create the payment
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/moyasar-create-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            tier,
            period,
            callback_url: callbackUrl,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create payment');
      }

      // If there's a transaction URL (for 3DS), redirect to it
      if (data.transaction_url) {
        window.location.href = data.transaction_url;
        return;
      }

      // If payment was immediately successful
      if (data.status === 'paid') {
        window.location.href = '/subscription/success';
        return;
      }

      // Otherwise, redirect to Moyasar's payment page
      // The Edge Function should return a payment URL
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        // Fallback: redirect to callback to check status
        window.location.href = `${callbackUrl}?payment_id=${data.payment_id}&status=pending`;
      }

    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Error state */}
      {error && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-scholar text-error text-sm">
          {error}
        </div>
      )}

      {/* Payment method info */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 bg-surface-alt rounded-scholar border border-border">
          <CreditCard className="w-5 h-5 text-text-soft" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text">Credit/Debit Card</p>
            <p className="text-xs text-text-soft">Visa, Mastercard, mada</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 p-3 bg-surface-alt rounded-scholar border border-border">
          <Smartphone className="w-5 h-5 text-text-soft" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text">STC Pay</p>
            <p className="text-xs text-text-soft">Pay with your STC Pay wallet</p>
          </div>
        </div>
      </div>

      {/* Pay button */}
      <Button
        onClick={handlePayment}
        disabled={loading}
        className="w-full"
        size="lg"
      >
        {loading ? (
          <>
            <Spinner size="sm" className="mr-2" />
            Processing...
          </>
        ) : (
          <>
            Pay {(amount / 100).toFixed(2)} SAR
            <ArrowRight className="w-4 h-4 ml-2" />
          </>
        )}
      </Button>

      {/* Payment summary */}
      <div className="mt-4 p-4 bg-surface-alt rounded-scholar">
        <div className="flex justify-between text-sm">
          <span className="text-text-soft">Plan</span>
          <span className="font-medium text-text capitalize">{tier} ({period})</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span className="text-text-soft">Amount</span>
          <span className="font-semibold text-text">
            {(amount / 100).toFixed(2)} SAR
          </span>
        </div>
      </div>

      {/* Security note */}
      <p className="mt-4 text-xs text-text-soft text-center">
        🔒 Payments are securely processed by Moyasar. Your card details are never stored on our servers.
      </p>
    </div>
  );
}

