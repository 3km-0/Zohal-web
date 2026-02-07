'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

// Moyasar types
declare global {
  interface Window {
    Moyasar: {
      init: (config: MoyasarConfig) => MoyasarInstance;
    };
  }
}

interface MoyasarConfig {
  element: string;
  amount: number;
  currency: string;
  description: string;
  publishable_api_key: string;
  callback_url: string;
  methods?: string[];
  apple_pay?: {
    country: string;
    label: string;
    validate_merchant_url: string;
  };
  on_initiating?: () => void;
  on_completed?: (payment: MoyasarPayment) => void;
  on_failure?: (error: MoyasarError) => void;
}

interface MoyasarInstance {
  submit: () => void;
}

interface MoyasarPayment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  source: {
    type: string;
    token?: string;
    transaction_url?: string;
  };
}

interface MoyasarError {
  type: string;
  message: string;
}

interface MoyasarPaymentFormProps {
  amount: number; // In halalas (SAR cents)
  description: string;
  tier: string;
  period: 'monthly' | 'yearly';
  callbackUrl: string;
  onPaymentComplete?: (payment: MoyasarPayment) => void;
  onPaymentError?: (error: MoyasarError) => void;
  onPaymentInitiating?: () => void;
  className?: string;
}

export function MoyasarPaymentForm({
  amount,
  description,
  tier,
  period,
  callbackUrl,
  onPaymentComplete,
  onPaymentError,
  onPaymentInitiating,
  className,
}: MoyasarPaymentFormProps) {
  // NOTE: recurring subscriptions use server-hosted invoice checkout (WEB_SUBSCRIPTION_V2).
  // This component is retained for non-recurring/legacy payment experiences.
  const formRef = useRef<HTMLDivElement>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publishableKey = process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY;

  useEffect(() => {
    if (!sdkLoaded || formInitialized || !publishableKey) return;

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(() => {
      try {
        if (!window.Moyasar) {
          console.error('Moyasar SDK not loaded');
          setError('Payment form failed to load. Please refresh the page.');
          return;
        }

        window.Moyasar.init({
          element: '.moyasar-form',
          amount: amount,
          currency: 'SAR',
          description: description,
          publishable_api_key: publishableKey,
          callback_url: callbackUrl,
          methods: ['creditcard', 'stcpay'],
          on_initiating: () => {
            console.log('[MoyasarForm] Payment initiating...');
            onPaymentInitiating?.();
          },
          on_completed: (payment) => {
            console.log('[MoyasarForm] Payment completed:', payment);
            onPaymentComplete?.(payment);
          },
          on_failure: (err) => {
            console.error('[MoyasarForm] Payment failed:', err);
            setError(err.message || 'Payment failed. Please try again.');
            onPaymentError?.(err);
          },
        });

        setFormInitialized(true);
        console.log('[MoyasarForm] Form initialized successfully');
      } catch (err) {
        console.error('[MoyasarForm] Error initializing form:', err);
        setError('Failed to initialize payment form. Please refresh the page.');
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [sdkLoaded, formInitialized, amount, description, callbackUrl, publishableKey, onPaymentComplete, onPaymentError, onPaymentInitiating]);

  if (!publishableKey) {
    return (
      <div className={cn('p-4 bg-error/10 border border-error/20 rounded-scholar text-error', className)}>
        Payment configuration error. Please contact support.
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Moyasar SDK */}
      <Script
        src="https://cdn.moyasar.com/mpf/1.14.0/moyasar.min.js"
        onLoad={() => {
          console.log('[MoyasarForm] SDK loaded');
          setSdkLoaded(true);
        }}
        onError={() => {
          console.error('[MoyasarForm] Failed to load SDK');
          setError('Failed to load payment form. Please refresh the page.');
        }}
      />
      
      {/* Moyasar CSS */}
      <link
        rel="stylesheet"
        href="https://cdn.moyasar.com/mpf/1.14.0/moyasar.css"
      />

      {/* Custom styling for Moyasar form to match Scholar theme */}
      <style jsx global>{`
        .moyasar-form {
          font-family: inherit;
        }
        
        .moyasar-form .mpf-card-number,
        .moyasar-form .mpf-card-expiry,
        .moyasar-form .mpf-card-cvc,
        .moyasar-form .mpf-card-holder {
          border-radius: 8px;
          border-color: var(--border);
          background-color: var(--surface);
          transition: all 0.2s;
        }
        
        .moyasar-form .mpf-card-number:focus,
        .moyasar-form .mpf-card-expiry:focus,
        .moyasar-form .mpf-card-cvc:focus,
        .moyasar-form .mpf-card-holder:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.1);
        }
        
        .moyasar-form .mpf-submit {
          background-color: var(--accent) !important;
          border-radius: 8px !important;
          font-weight: 600;
          transition: all 0.2s;
        }
        
        .moyasar-form .mpf-submit:hover {
          opacity: 0.9;
        }
        
        .moyasar-form .mpf-error {
          color: var(--error);
          font-size: 0.875rem;
          margin-top: 0.5rem;
        }
        
        .moyasar-form label {
          color: var(--text);
          font-weight: 500;
          margin-bottom: 0.5rem;
        }
        
        /* Method selector styling */
        .moyasar-form .mpf-methods {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        
        .moyasar-form .mpf-method {
          flex: 1;
          border-radius: 8px;
          border: 2px solid var(--border);
          padding: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .moyasar-form .mpf-method.active {
          border-color: var(--accent);
          background-color: rgba(var(--accent-rgb), 0.05);
        }
        
        /* Dark mode support */
        [data-theme="dark"] .moyasar-form .mpf-card-number,
        [data-theme="dark"] .moyasar-form .mpf-card-expiry,
        [data-theme="dark"] .moyasar-form .mpf-card-cvc,
        [data-theme="dark"] .moyasar-form .mpf-card-holder {
          background-color: var(--surface-alt);
          color: var(--text);
        }
      `}</style>

      {/* Loading state */}
      {!formInitialized && !error && (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
          <span className="ml-3 text-text-soft">Loading payment form...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-scholar text-error text-sm">
          {error}
        </div>
      )}

      {/* Moyasar form container */}
      <div
        ref={formRef}
        className={cn(
          'moyasar-form',
          !formInitialized && 'hidden'
        )}
      />

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
