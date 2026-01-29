'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { Button, Card, Spinner } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

export default function AcceptInvitePage() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const loginRedirect = `/auth/login?redirect=${encodeURIComponent(`/auth/accept-invite?token=${token}`)}`;

  useEffect(() => {
    async function accept() {
      if (!user || !token || accepted) return;
      setSubmitting(true);
      setError(null);

      try {
        const { data, error: fnErr } = await supabase.functions.invoke('org-invite-accept', {
          body: { token },
        });

        if (fnErr) throw fnErr;
        if (!data?.ok) {
          throw new Error(data?.message || 'Invite acceptance failed');
        }

        // Best-effort: set default_org_id for smoother UX, without overwriting existing.
        if (data.org_id) {
          const { data: profile } = await supabase.from('profiles').select('default_org_id').eq('id', user.id).single();
          if (!profile?.default_org_id) {
            await supabase.from('profiles').update({ default_org_id: data.org_id }).eq('id', user.id);
          }
        }

        setAccepted(true);
        router.replace('/workspaces');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to accept invite');
      } finally {
        setSubmitting(false);
      }
    }

    accept();
  }, [user, token, accepted, supabase, router]);

  return (
    <Card className="w-full max-w-md" padding="lg">
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : !token ? (
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-semibold text-text">{t('invalidInvite') ?? 'Invalid invite link'}</h1>
          <p className="text-sm text-text-soft">{t('invalidInviteDesc') ?? 'This invite link is missing a token.'}</p>
          <Link href="/auth/login">
            <Button variant="secondary">{t('login')}</Button>
          </Link>
        </div>
      ) : !user ? (
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-semibold text-text">{t('acceptInvite') ?? 'Accept invite'}</h1>
          <p className="text-sm text-text-soft">
            {t('acceptInviteLoginRequired') ?? 'Please sign in (or create an account) to accept this invite.'}
          </p>
          <div className="flex justify-center gap-3">
            <Link href={loginRedirect}>
              <Button>{t('login')}</Button>
            </Link>
            <Link href={`/auth/signup?redirect=${encodeURIComponent(`/auth/accept-invite?token=${token}`)}`}>
              <Button variant="secondary">{t('signup')}</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-semibold text-text">{t('acceptingInvite') ?? 'Accepting invite…'}</h1>
          {error ? (
            <>
              <p className="text-sm text-error">{error}</p>
              <div className="flex justify-center gap-3">
                <Button
                  onClick={() => {
                    setAccepted(false);
                    setError(null);
                  }}
                  variant="secondary"
                  isLoading={submitting}
                >
                  {tCommon('retry') ?? 'Retry'}
                </Button>
                <Link href="/workspaces">
                  <Button variant="ghost">{tCommon('back') ?? 'Back'}</Button>
                </Link>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-6">
              <Spinner size="lg" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

