'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/useAuth';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/workspaces';

  const { signIn, signInWithOAuth, loading, error } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email || !password) {
      setFormError(t('fillAllFields'));
      return;
    }

    const result = await signIn(email, password);

    if (result.success) {
      router.push(redirectTo);
    } else {
      setFormError(result.error?.message || t('signInFailed'));
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'apple' | 'azure') => {
    const result = await signInWithOAuth(provider);
    if (!result.success) {
      const providerName = provider === 'azure' ? t('microsoft') : provider === 'google' ? t('google') : t('apple');
      setFormError(result.error?.message || t('signInWith', { provider: providerName }));
    }
  };

  return (
    <Card className="w-full max-w-md" padding="lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t('login')}</CardTitle>
        <CardDescription>{t('welcomeBack')}</CardDescription>
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

          <Input
            type="password"
            label={t('password')}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {(formError || error) && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-scholar text-sm text-error">
              {formError || error?.message}
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={loading}>
            {t('login')}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link
            href="/auth/forgot-password"
            className="text-sm text-accent hover:opacity-80"
          >
            {t('forgotPassword')}
          </Link>
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-surface text-text-soft">{t('continueWith')}</span>
          </div>
        </div>

        {/* OAuth Buttons */}
        <div className="space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => handleOAuthLogin('google')}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => handleOAuthLogin('apple')}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Continue with Apple
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => handleOAuthLogin('azure')}
          >
            <svg className="w-5 h-5" viewBox="0 0 23 23">
              <rect x="1" y="1" width="10" height="10" fill="#F25022" />
              <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
              <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
              <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
            </svg>
            Continue with Microsoft
          </Button>
        </div>

        {/* Sign up link */}
        <p className="mt-6 text-center text-sm text-text-soft">
          {t('noAccount')}{' '}
          <Link href="/auth/signup" className="text-accent font-medium hover:opacity-80">
            {t('signup')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

