'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { OrgDataLocalityPanel } from '@/components/enterprise/OrgDataLocalityPanel';

interface OrganizationLite {
  id: string;
  name: string;
  owner_id: string;
  multi_user_enabled?: boolean;
  data_locality_enabled?: boolean;
}

export default function DataLocalitySettingsPage() {
  const t = useTranslations('dataLocalityPage');
  const supabase = createClient();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<OrganizationLite[]>([]);
  const [orgId, setOrgId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user) return;
      setLoading(true);

      const { data } = await supabase
        .from('organizations')
        .select('id, name, owner_id, multi_user_enabled, data_locality_enabled')
        .order('created_at', { ascending: false });

      if (cancelled) return;

      const rows = ((data || []) as OrganizationLite[]);
      setOrganizations(rows);
      setOrgId((prev) => prev || rows[0]?.id || '');
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const selectedOrg = organizations.find((o) => o.id === orgId) || null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <Card padding="lg">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text">{t('orgLabel')}</h2>
                <p className="text-sm text-text-soft">{t('orgHint')}</p>
              </div>

              <div className="w-full sm:w-80">
                <select
                  className="w-full rounded-zohal border border-border bg-surface px-3 py-2 text-sm text-text"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedOrg ? (
              <OrgDataLocalityPanel orgId={selectedOrg.id} orgName={selectedOrg.name} />
            ) : (
              <div className="rounded-zohal border border-border bg-surface-alt p-4 text-sm text-text-soft">
                {t('noOrganizations')}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
