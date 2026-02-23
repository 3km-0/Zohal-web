'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';

export default function VerifyPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();

  const emailFromParams = searchParams.get('email') || '';
  const redirectTo = searchParams.get('redirect') || '/workspaces';

  const [email, setEmail] = useState(emailFromParams);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const supabase = createClient();
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (emailFromParams && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [emailFromParams]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResendSuccess(false);

    if (!email) {
      setError(t('fillAllFields'));
      return;
    }

    const trimmedCode = code.replace(/\s/g, '');
    if (!trimmedCode || trimmedCode.length !== 8) {
      setError(t('verificationCodePlaceholder'));
      return;
    }

    setLoading(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: trimmedCode,
      type: 'signup',
    });

    setLoading(false);

    if (verifyError) {
      setError(t('verificationFailed'));
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push(redirectTo), 1500);
  };

  const handleResend = async () => {
    setError(null);
    setResendSuccess(false);

    if (!email) {
      setError(t('enterEmailFirst'));
      return;
    }

    setResendLoading(true);

    // Re-trigger OTP by calling signInWithOtp (email OTP mode)
    const { error: resendError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    setResendLoading(false);

    if (resendError) {
      setError(resendError.message);
      return;
    }

    setResendSuccess(true);
  };

  return (
    <Card className="w-full max-w-md" padding="lg">
      <CardHeader className="text-center">
        <div className="w-16 h-16 bg-success/10 border border-success/20 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
          ✉️
        </div>
        <CardTitle className="text-2xl">{t('enterVerificationCode')}</CardTitle>
        <CardDescription>{t('verificationCodeHint')}</CardDescription>
      </CardHeader>

      <CardContent>
        {success ? (
          <div className="p-4 bg-success/10 border border-success/20 rounded-scholar text-sm text-success text-center">
            {t('verificationSuccess')}
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            {!emailFromParams && (
              <Input
                type="email"
                label={t('email')}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            )}

            <Input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              label={t('verificationCode')}
              placeholder={t('verificationCodePlaceholder')}
              value={code}
              onChange={(e) => {
                // Allow only digits and spaces, max 8 digits
                const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 8);
                setCode(raw);
              }}
              autoComplete="one-time-code"
              required
            />

            {error && (
              <div className="p-3 bg-error/10 border border-error/20 rounded-scholar text-sm text-error">
                {error}
              </div>
            )}

            {resendSuccess && (
              <div className="p-3 bg-success/10 border border-success/20 rounded-scholar text-sm text-success">
                {t('resendCodeSuccess')}
              </div>
            )}

            <Button type="submit" className="w-full" isLoading={loading}>
              {t('verifyEmail')}
            </Button>

            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleResend}
              isLoading={resendLoading}
            >
              {t('resendCode')}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-text-soft">
          <Link href="/auth/signup" className="text-accent hover:opacity-80">
            {t('backToSignup')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
