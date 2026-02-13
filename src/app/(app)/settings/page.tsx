'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  User,
  CreditCard,
  Globe,
  Moon,
  Sun,
  Trash2,
  LogOut,
  AlertTriangle,
  Link2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Input, Badge, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/database';

function readThemeFromStorage(): 'light' | 'dark' | null {
  try {
    const value = window.localStorage.getItem('theme');
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function writeThemeToStorage(value: 'light' | 'dark'): void {
  try {
    window.localStorage.setItem('theme', value);
  } catch {
    // Ignore blocked storage environments.
  }
}

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tSettings = useTranslations('settingsPage');
  const router = useRouter();
  const supabase = createClient();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Profile form state
  const [displayName, setDisplayName] = useState('');
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; owner_id: string; multi_user_enabled?: boolean }>>([]);
  const [defaultOrgId, setDefaultOrgId] = useState<string | null>(null);
  const [savingOrg, setSavingOrg] = useState(false);

  // Integration states
  interface IntegrationAccount {
    provider: string;
    status: string;
    connected_at: string;
  }
  const [integrations, setIntegrations] = useState<IntegrationAccount[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  // Fetch profile and integrations
  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      const [profileRes, integrationsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('integration_accounts')
          .select('provider, status, connected_at')
          .eq('user_id', user.id)
          .eq('status', 'active'),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        setDisplayName(profileRes.data.display_name || '');
        setDefaultOrgId(profileRes.data.default_org_id || null);
      }

      if (integrationsRes.data) {
        setIntegrations(integrationsRes.data);
      }

      // Best-effort org list (RLS may restrict in some environments)
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, owner_id, multi_user_enabled')
        .order('created_at', { ascending: false });
      setOrganizations((orgs as any[]) || []);

      setLoading(false);
    }

    fetchData();
  }, [supabase, user]);

  // Check if a provider is connected
  const isConnected = (provider: string) => {
    return integrations.some((i) => i.provider === provider);
  };

  // Connect an integration (redirects to OAuth)
  const connectIntegration = async (provider: 'google_drive' | 'onedrive') => {
    setConnectingProvider(provider);
    
    // Use Supabase OAuth and request only scopes the web flow actually uses.
    const oauthProvider = provider === 'google_drive' ? 'google' : 'azure';
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: oauthProvider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?integration=${provider}`,
        scopes: provider === 'google_drive' 
          ? 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events'
          : 'Files.Read Files.Read.All Calendars.Read Calendars.ReadWrite offline_access User.Read',
        queryParams: provider === 'google_drive'
          ? { access_type: 'offline', prompt: 'consent' }
          : undefined,
      },
    });

    if (error) {
      console.error('OAuth error:', error);
      setConnectingProvider(null);
    }
  };

  // Disconnect an integration
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

  // Load theme from localStorage
  useEffect(() => {
    const savedTheme = readThemeFromStorage();
    const resolvedTheme = savedTheme ?? 'dark';
    setTheme(resolvedTheme);
    writeThemeToStorage(resolvedTheme);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, []);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    writeThemeToStorage(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', user.id);

    if (!error) {
      setProfile((prev) => (prev ? { ...prev, display_name: displayName.trim() || null } : null));
    }

    setSaving(false);
  };

  const handleSaveDefaultOrg = async () => {
    if (!user) return;
    setSavingOrg(true);
    try {
      const { error } = await supabase.from('profiles').update({ default_org_id: defaultOrgId }).eq('id', user.id);
      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, default_org_id: defaultOrgId } : prev));
    } catch (e) {
      console.error('Save default org error:', e);
    } finally {
      setSavingOrg(false);
    }
  };

  const handleToggleOrgMultiUser = async (orgId: string, enabled: boolean) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('organizations').update({ multi_user_enabled: enabled }).eq('id', orgId);
      if (error) throw error;
      setOrganizations((prev) => prev.map((o) => (o.id === orgId ? { ...o, multi_user_enabled: enabled } : o)));
    } catch (e) {
      console.error('Toggle multi-user error:', e);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleteLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ user_id: user.id }),
        }
      );

      if (!response.ok) throw new Error('Failed to delete account');

      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Delete account error:', error);
    } finally {
      setDeleteLoading(false);
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
      <AppHeader title={t('title')} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Profile Section */}
          <Card padding="lg">
            <div className="flex items-center gap-3 mb-6">
              <User className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-text">{t('profile')}</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1">{tSettings('email')}</label>
                <p className="text-text-soft">{user?.email}</p>
              </div>

              <Input
                label={tSettings('displayName')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={tSettings('displayNamePlaceholder')}
              />

              <Button onClick={handleSaveProfile} isLoading={saving}>
                {tSettings('saveChanges')}
              </Button>
            </div>
          </Card>

          {/* Subscription Section */}
          <Card padding="lg">
            <div className="flex items-center gap-3 mb-6">
              <CreditCard className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-text">{t('subscription')}</h2>
            </div>

            <div className="flex items-center justify-between p-4 bg-surface-alt rounded-scholar">
              <div>
                <p className="font-medium text-text">
                  {profile?.subscription_tier === 'free'
                    ? tSettings('freePlan')
                    : profile?.subscription_tier === 'pro'
                    ? tSettings('proPlan')
                    : tSettings('premiumPlan')}
                </p>
                <p className="text-sm text-text-soft">
                  {profile?.subscription_tier === 'free'
                    ? tSettings('freePlanDesc')
                    : profile?.subscription_tier === 'pro'
                    ? tSettings('proPlanDesc')
                    : tSettings('premiumPlanDesc')}
                </p>
              </div>
              <Badge
                variant={profile?.subscription_tier === 'free' ? 'default' : 'success'}
              >
                {profile?.subscription_tier?.toUpperCase()}
              </Badge>
            </div>

            {profile?.subscription_tier === 'free' && (
              <Button variant="secondary" className="mt-4">
                {tSettings('upgradeToPro')}
              </Button>
            )}
          </Card>

          {/* Organization Section (Enterprise) */}
          {organizations.length > 0 && (
            <Card padding="lg">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-text">Organization</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Default organization</label>
                  <select
                    className="w-full px-4 py-3 bg-surface border border-border rounded-scholar text-text"
                    value={defaultOrgId ?? ''}
                    onChange={(e) => setDefaultOrgId(e.target.value || null)}
                  >
                    <option value="">None</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <Button className="mt-3" onClick={handleSaveDefaultOrg} isLoading={savingOrg}>
                    Save
                  </Button>
                </div>

                {/* Multi-user switch for org owners */}
                {defaultOrgId && (
                  <>
                    {(() => {
                      const org = organizations.find((o) => o.id === defaultOrgId);
                      if (!org) return null;
                      const isOwner = org.owner_id === user?.id;
                      if (!isOwner) return null;
                      return (
                        <div className="p-4 bg-surface-alt rounded-scholar border border-border">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="font-medium text-text">Enterprise multi-user</div>
                              <div className="text-sm text-text-soft">
                                Enable workspace sharing via members. Safe to keep off until you’re ready to flip.
                              </div>
                            </div>
                            <button
                              className={cn(
                                'w-12 h-7 rounded-full border transition-colors flex items-center px-1',
                                org.multi_user_enabled ? 'bg-accent border-accent' : 'bg-surface border-border'
                              )}
                              onClick={() => handleToggleOrgMultiUser(org.id, !org.multi_user_enabled)}
                              aria-label="Toggle enterprise multi-user"
                            >
                              <span
                                className={cn(
                                  'w-5 h-5 rounded-full bg-white transition-transform',
                                  org.multi_user_enabled ? 'translate-x-5' : 'translate-x-0'
                                )}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </Card>
          )}

          {/* Integrations Section */}
          <Card padding="lg">
            <div className="flex items-center gap-3 mb-6">
              <Link2 className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-text">{tSettings('integrations')}</h2>
            </div>

            <p className="text-sm text-text-soft mb-4">
              {tSettings('integrationsDesc')}
            </p>

            <div className="space-y-3">
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
                    <p className="font-medium text-text">{tSettings('google')}</p>
                    <p className="text-xs text-text-soft">{tSettings('googleDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected('google_drive') ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span className="text-sm text-success">{tSettings('connected')}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => disconnectIntegration('google_drive')}
                      >
                        {tSettings('disconnect')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => connectIntegration('google_drive')}
                      isLoading={connectingProvider === 'google_drive'}
                    >
                      {tSettings('connect')}
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
                    <p className="font-medium text-text">{tSettings('microsoft')}</p>
                    <p className="text-xs text-text-soft">{tSettings('microsoftDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected('onedrive') ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span className="text-sm text-success">{tSettings('connected')}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => disconnectIntegration('onedrive')}
                      >
                        {tSettings('disconnect')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => connectIntegration('onedrive')}
                      isLoading={connectingProvider === 'onedrive'}
                    >
                      {tSettings('connect')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Appearance Section */}
          <Card padding="lg">
            <div className="flex items-center gap-3 mb-6">
              {theme === 'dark' ? (
                <Moon className="w-5 h-5 text-accent" />
              ) : (
                <Sun className="w-5 h-5 text-accent" />
              )}
              <h2 className="text-lg font-semibold text-text">{t('appearance')}</h2>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleThemeChange('light')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 p-4 rounded-scholar border transition-all',
                  theme === 'light'
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/50'
                )}
              >
                <Sun className="w-5 h-5" />
                <span className="font-medium">{tSettings('light')}</span>
              </button>
              <button
                onClick={() => handleThemeChange('dark')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 p-4 rounded-scholar border transition-all',
                  theme === 'dark'
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/50'
                )}
              >
                <Moon className="w-5 h-5" />
                <span className="font-medium">{tSettings('dark')}</span>
              </button>
            </div>
          </Card>

          {/* Language Section */}
          <Card padding="lg">
            <div className="flex items-center gap-3 mb-6">
              <Globe className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-text">{t('language')}</h2>
            </div>

            <p className="text-sm text-text-soft mb-4">
              {tSettings('languageDesc')}
            </p>
          </Card>

          {/* Danger Zone */}
          <Card padding="lg" className="border-error/30">
            <div className="flex items-center gap-3 mb-6">
              <AlertTriangle className="w-5 h-5 text-error" />
              <h2 className="text-lg font-semibold text-error">{tSettings('dangerZone')}</h2>
            </div>

            <div className="space-y-4">
              <Button variant="secondary" onClick={() => signOut()}>
                <LogOut className="w-4 h-4" />
                {tSettings('logOut')}
              </Button>

              {!showDeleteConfirm ? (
                <Button
                  variant="danger"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  {t('deleteAccount')}
                </Button>
              ) : (
                <div className="p-4 bg-error/10 border border-error/30 rounded-scholar">
                  <p className="text-sm text-error mb-4">
                    {tSettings('deleteAccountConfirm')}
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={handleDeleteAccount}
                      isLoading={deleteLoading}
                    >
                      {tSettings('yesDeleteAccount')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
