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

export default function SettingsPage() {
  const t = useTranslations('settings');
  const router = useRouter();
  const supabase = createClient();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Profile form state
  const [displayName, setDisplayName] = useState('');

  // Fetch profile
  useEffect(() => {
    async function fetchProfile() {
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

    fetchProfile();
  }, [supabase, user]);

  // Load theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
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
                <label className="block text-sm font-medium text-text mb-1">Email</label>
                <p className="text-text-soft">{user?.email}</p>
              </div>

              <Input
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />

              <Button onClick={handleSaveProfile} isLoading={saving}>
                Save Changes
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
                    ? 'Free Plan'
                    : profile?.subscription_tier === 'pro'
                    ? 'Pro Plan'
                    : 'Ultra Plan'}
                </p>
                <p className="text-sm text-text-soft">
                  {profile?.subscription_tier === 'free'
                    ? '5 documents, 10 AI explanations/day'
                    : profile?.subscription_tier === 'pro'
                    ? '100 documents, unlimited AI'
                    : 'Unlimited everything'}
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
                Upgrade to Pro
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
                <span className="font-medium">Light</span>
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
                <span className="font-medium">Dark</span>
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
              Language can be changed using the language switcher in the header.
            </p>
          </Card>

          {/* Danger Zone */}
          <Card padding="lg" className="border-error/30">
            <div className="flex items-center gap-3 mb-6">
              <AlertTriangle className="w-5 h-5 text-error" />
              <h2 className="text-lg font-semibold text-error">Danger Zone</h2>
            </div>

            <div className="space-y-4">
              <Button variant="secondary" onClick={() => signOut()}>
                <LogOut className="w-4 h-4" />
                Log Out
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
                    Are you sure you want to delete your account? This action cannot be
                    undone. All your workspaces, documents, and notes will be permanently
                    deleted.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      onClick={handleDeleteAccount}
                      isLoading={deleteLoading}
                    >
                      Yes, Delete My Account
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

