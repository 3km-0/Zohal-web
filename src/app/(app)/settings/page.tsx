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
} from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Input, Badge, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/database';
import { getEffectiveSubscriptionTier } from '@/lib/subscription';
import {
  applyThemeMode,
  DEFAULT_THEME_MODE,
  resolveThemeMode,
  subscribeToThemeMode,
  type ThemeMode,
} from '@/lib/theme-mode';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tSettings = useTranslations('settingsPage');
  const router = useRouter();
  const supabase = createClient();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || '');
      }

      setLoading(false);
    }

    fetchData();
  }, [supabase, user]);

  useEffect(() => {
    setTheme(resolveThemeMode());
    return subscribeToThemeMode(setTheme);
  }, []);

  const handleThemeChange = (newTheme: ThemeMode) => {
    applyThemeMode(newTheme);
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

  const effectiveTier = getEffectiveSubscriptionTier(profile);

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
                  {effectiveTier === 'free'
                    ? tSettings('freePlan')
                    : effectiveTier === 'pro'
                      ? tSettings('proPlan')
                      : effectiveTier === 'team'
                        ? tSettings('teamPlan')
                        : tSettings('premiumPlan')}
                </p>
                <p className="text-sm text-text-soft">
                  {effectiveTier === 'free'
                    ? tSettings('freePlanDesc')
                    : effectiveTier === 'pro'
                      ? tSettings('proPlanDesc')
                      : effectiveTier === 'team'
                        ? tSettings('teamPlanDesc')
                        : tSettings('premiumPlanDesc')}
                </p>
              </div>
              <Badge
                variant={effectiveTier === 'free' ? 'default' : 'success'}
              >
                {effectiveTier === 'premium'
                  ? 'MAX'
                  : effectiveTier === 'team'
                    ? 'TEAM'
                    : effectiveTier.toUpperCase()}
              </Badge>
            </div>

            {effectiveTier === 'free' && (
              <Button variant="secondary" className="mt-4">
                {tSettings('upgradeToPro')}
              </Button>
            )}

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
