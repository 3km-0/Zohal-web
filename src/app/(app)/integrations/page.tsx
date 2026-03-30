'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link2, CheckCircle, MessageCircle } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface IntegrationAccount {
  provider: string;
  status: string;
  connected_at: string;
}

function normalizeWhatsappPhoneInput(value: string): string | null {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length < 8) return null;
  return `+${digits}`;
}

export default function IntegrationsPage() {
  const t = useTranslations('integrationsPage');
  const tNav = useTranslations('nav');
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [integrations, setIntegrations] = useState<IntegrationAccount[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [savingWhatsappPhone, setSavingWhatsappPhone] = useState(false);
  const [whatsappPhoneError, setWhatsappPhoneError] = useState('');
  const [whatsappPhoneSuccess, setWhatsappPhoneSuccess] = useState('');

  useEffect(() => {
    async function fetchIntegrations() {
      if (!user) return;

      const [integrationsResult, profileResult] = await Promise.all([
        supabase
          .from('integration_accounts')
          .select('provider, status, connected_at')
          .eq('user_id', user.id)
          .eq('status', 'active'),
        supabase
          .from('profiles')
          .select('whatsapp_phone_number')
          .eq('id', user.id)
          .single(),
      ]);

      if (integrationsResult.data) setIntegrations(integrationsResult.data);
      if (profileResult.data?.whatsapp_phone_number) {
        setWhatsappPhone(profileResult.data.whatsapp_phone_number);
      }
      setLoading(false);
    }

    fetchIntegrations();
  }, [supabase, user]);

  const isConnected = (provider: string) =>
    integrations.some((i) => i.provider === provider);

  const saveWhatsappPhone = async () => {
    if (!user) return;

    setSavingWhatsappPhone(true);
    setWhatsappPhoneError('');
    setWhatsappPhoneSuccess('');

    const normalizedPhone = normalizeWhatsappPhoneInput(whatsappPhone);
    if (normalizedPhone === null) {
      setSavingWhatsappPhone(false);
      setWhatsappPhoneError(t('whatsappPhoneInvalid'));
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        whatsapp_phone_number: normalizedPhone || null,
      })
      .eq('id', user.id);

    if (error) {
      setSavingWhatsappPhone(false);
      setWhatsappPhoneError(t('whatsappPhoneSaveError'));
      return;
    }

    setWhatsappPhone(normalizedPhone || '');
    setSavingWhatsappPhone(false);
    setWhatsappPhoneSuccess(t('whatsappPhoneSaveSuccess'));
  };

  const connectIntegration = async (provider: 'google_drive' | 'onedrive') => {
    setConnectingProvider(provider);

    const oauthProvider = provider === 'google_drive' ? 'google' : 'azure';

    const { error } = await supabase.auth.signInWithOAuth({
      provider: oauthProvider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?integration=${provider}`,
        scopes:
          provider === 'google_drive'
            ? 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events'
            : 'Files.Read Files.Read.All Calendars.Read Calendars.ReadWrite offline_access User.Read',
        queryParams:
          provider === 'google_drive'
            ? { access_type: 'offline', prompt: 'consent' }
            : undefined,
      },
    });

    if (error) {
      console.error('OAuth error:', error);
      setConnectingProvider(null);
    }
  };

  const disconnectIntegration = async (provider: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('integration_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', provider);

    if (!error) {
      setIntegrations((prev) => prev.filter((i) => i.provider !== provider));
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
      <AppHeader title={tNav('integrations')} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card padding="lg">
            <div className="flex items-center gap-3 mb-6">
              <Link2 className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-text">{t('title')}</h2>
            </div>

            <p className="text-sm text-text-soft mb-4">{t('description')}</p>

            <div className="space-y-3">
              <div className="p-4 bg-surface-alt rounded-scholar border border-border space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center rounded-scholar bg-[#25D366]/10 border border-[#25D366]/20">
                    <MessageCircle className="w-5 h-5 text-[#25D366]" />
                  </div>
                  <div>
                    <p className="font-medium text-text">{t('whatsapp')}</p>
                    <p className="text-xs text-text-soft">{t('whatsappDesc')}</p>
                  </div>
                </div>

                <Input
                  label={t('whatsappPhoneLabel')}
                  value={whatsappPhone}
                  onChange={(e) => {
                    setWhatsappPhone(e.target.value);
                    setWhatsappPhoneError('');
                    setWhatsappPhoneSuccess('');
                  }}
                  placeholder={t('whatsappPhonePlaceholder')}
                  hint={t('whatsappPhoneHint')}
                  error={whatsappPhoneError || undefined}
                  inputMode="tel"
                  autoComplete="tel"
                />

                {whatsappPhoneSuccess ? (
                  <div className="rounded-scholar border border-success/30 bg-success/5 p-3 text-sm text-success">
                    {whatsappPhoneSuccess}
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button size="sm" onClick={saveWhatsappPhone} isLoading={savingWhatsappPhone}>
                    {t('whatsappPhoneSave')}
                  </Button>
                </div>
              </div>

              {/* Google Integration */}
              <div className="flex items-center justify-between p-4 bg-surface-alt rounded-scholar border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center rounded-scholar bg-white border border-border">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-text">{t('google')}</p>
                    <p className="text-xs text-text-soft">{t('googleDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected('google_drive') ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span className="text-sm text-success">{t('connected')}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => disconnectIntegration('google_drive')}
                      >
                        {t('disconnect')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => connectIntegration('google_drive')}
                      isLoading={connectingProvider === 'google_drive'}
                    >
                      {t('connect')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Microsoft Integration */}
              <div className="flex items-center justify-between p-4 bg-surface-alt rounded-scholar border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center rounded-scholar bg-white border border-border">
                    <svg className="w-5 h-5" viewBox="0 0 23 23">
                      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-text">{t('microsoft')}</p>
                    <p className="text-xs text-text-soft">{t('microsoftDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected('onedrive') ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span className="text-sm text-success">{t('connected')}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => disconnectIntegration('onedrive')}
                      >
                        {t('disconnect')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => connectIntegration('onedrive')}
                      isLoading={connectingProvider === 'onedrive'}
                    >
                      {t('connect')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
