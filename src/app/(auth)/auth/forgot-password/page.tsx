'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/useAuth';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');

  const { resetPassword, loading, error } = useAuth();

  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email) {
      setFormError('Please enter your email');
      return;
    }

    const result = await resetPassword(email);

    if (result.success) {
      setSuccess(true);
    } else {
      setFormError(result.error?.message || 'Failed to send reset email');
    }
  };

  if (success) {
    return (
      <Card className="w-full max-w-md" padding="lg">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-success/10 border border-success/20 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
            ✉️
          </div>
          <CardTitle className="text-2xl">Check Your Email</CardTitle>
          <CardDescription>
            We&apos;ve sent password reset instructions to{' '}
            <strong className="text-text">{email}</strong>. Please check your inbox and follow
            the link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/auth/login">
            <Button variant="secondary" className="w-full">
              Back to Login
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md" padding="lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t('resetPassword')}</CardTitle>
        <CardDescription>
          Enter your email address and we&apos;ll send you instructions to reset your password.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            label={t('email')}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          {(formError || error) && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-scholar text-sm text-error">
              {formError || error?.message}
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={loading}>
            Send Reset Link
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-soft">
          Remember your password?{' '}
          <Link href="/auth/login" className="text-accent font-medium hover:opacity-80">
            {t('login')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

