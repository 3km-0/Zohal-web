'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreditCard,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Badge, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface PaymentMethod {
  id: string;
  card_last_four: string | null;
  card_brand: string | null;
  card_holder_name: string | null;
  card_expiry_month: number | null;
  card_expiry_year: number | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export default function PaymentMethodsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuth();

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch payment methods
  useEffect(() => {
    async function fetchPaymentMethods() {
      if (!user) return;

      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('payment_methods')
        .select('id, card_last_four, card_brand, card_holder_name, card_expiry_month, card_expiry_year, is_default, is_active, created_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching payment methods:', fetchError);
        setError('Failed to load payment methods');
      } else {
        setPaymentMethods(data || []);
      }

      setLoading(false);
    }

    fetchPaymentMethods();
  }, [supabase, user]);

  // Set payment method as default
  const handleSetDefault = async (methodId: string) => {
    setActionLoading(methodId);
    setError(null);

    try {
      // First, unset all defaults
      await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', user?.id);

      // Then set the selected one as default
      await supabase
        .from('payment_methods')
        .update({ is_default: true })
        .eq('id', methodId);

      // Update local state
      setPaymentMethods((prev) =>
        prev.map((pm) => ({
          ...pm,
          is_default: pm.id === methodId,
        }))
      );
    } catch (err) {
      console.error('Error setting default payment method:', err);
      setError('Failed to update payment method');
    } finally {
      setActionLoading(null);
    }
  };

  // Remove payment method
  const handleRemove = async (methodId: string) => {
    if (!confirm('Are you sure you want to remove this payment method?')) {
      return;
    }

    setActionLoading(methodId);
    setError(null);

    try {
      // Soft delete by setting is_active to false
      await supabase
        .from('payment_methods')
        .update({ is_active: false })
        .eq('id', methodId);

      // Update local state
      setPaymentMethods((prev) => prev.filter((pm) => pm.id !== methodId));

      // If we removed the default, set another as default
      const remaining = paymentMethods.filter((pm) => pm.id !== methodId);
      if (remaining.length > 0 && paymentMethods.find((pm) => pm.id === methodId)?.is_default) {
        await handleSetDefault(remaining[0].id);
      }
    } catch (err) {
      console.error('Error removing payment method:', err);
      setError('Failed to remove payment method');
    } finally {
      setActionLoading(null);
    }
  };

  // Get card brand icon/emoji
  const getCardBrandIcon = (brand: string | null): string => {
    switch (brand?.toLowerCase()) {
      case 'visa':
        return '💳';
      case 'mastercard':
        return '💳';
      case 'mada':
        return '🏦';
      case 'amex':
        return '💳';
      default:
        return '💳';
    }
  };

  // Get card brand display name
  const getCardBrandName = (brand: string | null): string => {
    switch (brand?.toLowerCase()) {
      case 'visa':
        return 'Visa';
      case 'mastercard':
        return 'Mastercard';
      case 'mada':
        return 'mada';
      case 'amex':
        return 'American Express';
      default:
        return 'Card';
    }
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
      <AppHeader 
        title="Payment Methods" 
        subtitle="Manage your saved payment methods"
        actions={
          <Button variant="secondary" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-error/10 border border-error/20 rounded-scholar flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
              <p className="text-error text-sm">{error}</p>
            </div>
          )}

          {/* Payment Methods List */}
          {paymentMethods.length === 0 ? (
            <Card className="text-center py-12">
              <CreditCard className="w-12 h-12 text-text-soft mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text mb-2">No Payment Methods</h3>
              <p className="text-text-soft mb-6">
                You don&apos;t have any saved payment methods yet.
                <br />
                Add one when you subscribe to a plan.
              </p>
              <Button onClick={() => router.push('/subscription')}>
                View Subscription Plans
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {paymentMethods.map((method) => (
                <Card
                  key={method.id}
                  className={cn(
                    'flex items-center justify-between p-4',
                    method.is_default && 'border-accent ring-1 ring-accent/20'
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Card Icon */}
                    <div className="w-12 h-12 bg-surface-alt rounded-lg flex items-center justify-center text-2xl">
                      {getCardBrandIcon(method.card_brand)}
                    </div>

                    {/* Card Details */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text">
                          {getCardBrandName(method.card_brand)} •••• {method.card_last_four}
                        </span>
                        {method.is_default && (
                          <Badge size="sm" variant="accent">
                            Default
                          </Badge>
                        )}
                      </div>
                      {method.card_holder_name && (
                        <p className="text-sm text-text-soft">{method.card_holder_name}</p>
                      )}
                      {method.card_expiry_month && method.card_expiry_year && (
                        <p className="text-sm text-text-soft">
                          Expires {method.card_expiry_month.toString().padStart(2, '0')}/{method.card_expiry_year}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!method.is_default && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSetDefault(method.id)}
                        disabled={actionLoading === method.id}
                      >
                        {actionLoading === method.id ? (
                          <Spinner size="sm" />
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Set Default
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemove(method.id)}
                      disabled={actionLoading === method.id}
                    >
                      {actionLoading === method.id ? (
                        <Spinner size="sm" />
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Add Payment Method Note */}
          <div className="text-center text-sm text-text-soft">
            <p>
              New payment methods are automatically added when you subscribe to a plan.
            </p>
          </div>

          {/* Payment History Link */}
          <Card className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-text">Payment History</h3>
              <p className="text-sm text-text-soft">View your past transactions</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => router.push('/settings/payment-history')}
            >
              View History
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
