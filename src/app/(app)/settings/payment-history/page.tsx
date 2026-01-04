'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Receipt,
  ArrowLeft,
  Download,
  Check,
  X,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Badge, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface PaymentRecord {
  id: string;
  moyasar_payment_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  subscription_tier: string;
  subscription_period: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  failure_reason: string | null;
  is_renewal: boolean;
  created_at: string;
}

export default function PaymentHistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuth();

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch payment history
  useEffect(() => {
    async function fetchPayments() {
      if (!user) return;

      setLoading(true);

      const { data, error } = await supabase
        .from('subscription_payments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching payments:', error);
      } else {
        setPayments(data || []);
      }

      setLoading(false);
    }

    fetchPayments();
  }, [supabase, user]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <Badge variant="success" size="sm">
            <Check className="w-3 h-3 mr-1" />
            Paid
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="error" size="sm">
            <X className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="default" size="sm">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'refunded':
        return (
          <Badge variant="default" size="sm">
            <AlertCircle className="w-3 h-3 mr-1" />
            Refunded
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="default" size="sm">
            <X className="w-3 h-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="default" size="sm">
            {status}
          </Badge>
        );
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatAmount = (cents: number, currency: string) => {
    const amount = cents / 100;
    if (currency === 'SAR') {
      return `${amount.toFixed(2)} SAR`;
    }
    return `$${amount.toFixed(2)}`;
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
        title="Payment History" 
        subtitle="View your past transactions"
        actions={
          <Button variant="secondary" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Payment History List */}
          {payments.length === 0 ? (
            <Card className="text-center py-12">
              <Receipt className="w-12 h-12 text-text-soft mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text mb-2">No Payment History</h3>
              <p className="text-text-soft mb-6">
                You don&apos;t have any payment records yet.
              </p>
              <Button onClick={() => router.push('/subscription')}>
                View Subscription Plans
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {payments.map((payment) => (
                <Card key={payment.id} className="p-4">
                  <div className="flex items-start justify-between">
                    {/* Payment Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-text capitalize">
                          {payment.subscription_tier} Plan
                          {payment.is_renewal && (
                            <span className="text-text-soft font-normal ml-2">(Renewal)</span>
                          )}
                        </h3>
                        {getStatusBadge(payment.status)}
                      </div>

                      <div className="text-sm text-text-soft space-y-1">
                        <p>
                          {formatDate(payment.created_at)}
                          {payment.subscription_period && (
                            <span className="mx-2">•</span>
                          )}
                          {payment.subscription_period && (
                            <span className="capitalize">{payment.subscription_period}</span>
                          )}
                        </p>

                        {payment.billing_period_start && payment.billing_period_end && (
                          <p>
                            Billing period: {formatDate(payment.billing_period_start)} - {formatDate(payment.billing_period_end)}
                          </p>
                        )}

                        {payment.failure_reason && (
                          <p className="text-error">
                            Failed: {payment.failure_reason}
                          </p>
                        )}

                        {payment.moyasar_payment_id && (
                          <p className="text-xs text-text-soft/70">
                            ID: {payment.moyasar_payment_id}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                      <p className={cn(
                        'text-lg font-semibold',
                        payment.status === 'paid' ? 'text-text' : 'text-text-soft'
                      )}>
                        {payment.amount_cents > 0 
                          ? formatAmount(payment.amount_cents, payment.currency)
                          : '—'
                        }
                      </p>
                      <p className="text-xs text-text-soft">{payment.currency}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Note */}
          {payments.length > 0 && (
            <p className="text-center text-sm text-text-soft">
              Showing last {payments.length} transactions
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

