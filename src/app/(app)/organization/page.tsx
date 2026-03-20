'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Users } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { OrgDataLocalityPanel } from '@/components/enterprise/OrgDataLocalityPanel';
import Link from 'next/link';

interface Organization {
  id: string;
  name: string;
  owner_id: string;
  multi_user_enabled?: boolean;
  data_locality_enabled?: boolean;
}

export default function OrganizationPage() {
  const t = useTranslations('organizationPage');
  const tNav = useTranslations('nav');
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgRoles, setOrgRoles] = useState<Record<string, string>>({});
  const [defaultOrgId, setDefaultOrgId] = useState<string | null>(null);
  const [savingOrg, setSavingOrg] = useState(false);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; org_id: string | null }>>([]);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      const [profileRes, orgsRes, membershipsRes, wsRes] = await Promise.all([
        supabase.from('profiles').select('default_org_id').eq('id', user.id).single(),
        supabase
          .from('organizations')
          .select('id, name, owner_id, multi_user_enabled, data_locality_enabled')
          .order('created_at', { ascending: false }),
        supabase
          .from('organization_members')
          .select('org_id, role')
          .eq('user_id', user.id),
        supabase.rpc('list_accessible_workspaces'),
      ]);

      if (profileRes.data) {
        setDefaultOrgId(profileRes.data.default_org_id || null);
      }

      setOrganizations((orgsRes.data as Organization[]) || []);

      const roleMap: Record<string, string> = {};
      for (const row of (membershipsRes.data || []) as Array<{ org_id: string; role: string }>) {
        roleMap[String(row.org_id)] = String(row.role || '').toLowerCase();
      }
      setOrgRoles(roleMap);

      setWorkspaces((wsRes.data as Array<{ id: string; name: string; org_id: string | null }>) || []);

      setLoading(false);
    }

    fetchData();
  }, [supabase, user]);

  const handleSaveDefaultOrg = async () => {
    if (!user) return;
    setSavingOrg(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ default_org_id: defaultOrgId })
        .eq('id', user.id);
      if (error) throw error;
    } catch (e) {
      console.error('Save default org error:', e);
    } finally {
      setSavingOrg(false);
    }
  };

  const handleToggleOrgMultiUser = async (orgId: string, enabled: boolean) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ multi_user_enabled: enabled })
        .eq('id', orgId);
      if (error) throw error;
      setOrganizations((prev) =>
        prev.map((o) => (o.id === orgId ? { ...o, multi_user_enabled: enabled } : o))
      );
    } catch (e) {
      console.error('Toggle multi-user error:', e);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const selectedOrg = organizations.find((o) => o.id === defaultOrgId);
  const isOwner = selectedOrg?.owner_id === user?.id;
  const role = String(orgRoles[selectedOrg?.id ?? ''] || '').toLowerCase();
  const isOrgAdmin = isOwner || role === 'owner' || role === 'admin';

  const orgWorkspaces = workspaces.filter(
    (w) => defaultOrgId && w.org_id === defaultOrgId
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={tNav('organization')} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Default Organization Selector */}
          <Card padding="lg">
            <div className="flex items-center gap-3 mb-6">
              <Building2 className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-text">{t('title')}</h2>
            </div>

            {organizations.length === 0 ? (
              <p className="text-sm text-text-soft">{t('noOrganizations')}</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    {t('defaultOrg')}
                  </label>
                  <select
                    className="w-full px-4 py-3 bg-surface border border-border rounded-scholar text-text"
                    value={defaultOrgId ?? ''}
                    onChange={(e) => setDefaultOrgId(e.target.value || null)}
                  >
                    <option value="">{t('none')}</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    className="mt-3"
                    onClick={handleSaveDefaultOrg}
                    isLoading={savingOrg}
                  >
                    {t('save')}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Admin Controls (multi-user toggle + data locality) */}
          {selectedOrg && isOrgAdmin && (
            <Card padding="lg">
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-text">{t('accessControl')}</h2>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-surface-alt rounded-scholar border border-border">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-text">{t('multiUser')}</div>
                      <div className="text-sm text-text-soft">{t('multiUserDesc')}</div>
                    </div>
                    <button
                      className={cn(
                        'w-12 h-7 rounded-full border transition-colors flex items-center px-1',
                        selectedOrg.multi_user_enabled
                          ? 'bg-accent border-accent'
                          : 'bg-surface border-border'
                      )}
                      onClick={() =>
                        handleToggleOrgMultiUser(
                          selectedOrg.id,
                          !selectedOrg.multi_user_enabled
                        )
                      }
                      aria-label="Toggle enterprise multi-user"
                    >
                      <span
                        className={cn(
                          'w-5 h-5 rounded-full bg-white transition-transform',
                          selectedOrg.multi_user_enabled
                            ? 'translate-x-5'
                            : 'translate-x-0'
                        )}
                      />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-surface-alt rounded-scholar border border-border">
                  <OrgDataLocalityPanel
                    key={`${selectedOrg.id}:${selectedOrg.multi_user_enabled ? '1' : '0'}:${selectedOrg.data_locality_enabled ? '1' : '0'}`}
                    orgId={selectedOrg.id}
                    orgName={selectedOrg.name}
                  />
                </div>
              </div>
            </Card>
          )}

          {/* Workspace Members Quick Links */}
          {selectedOrg && selectedOrg.multi_user_enabled && orgWorkspaces.length > 0 && (
            <Card padding="lg">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-text">{t('workspaceMembers')}</h2>
              </div>
              <p className="text-sm text-text-soft mb-4">{t('workspaceMembersDesc')}</p>
              <div className="space-y-2">
                {orgWorkspaces.map((ws) => (
                  <Link
                    key={ws.id}
                    href={`/workspaces/${ws.id}/members`}
                    className="flex items-center justify-between p-3 bg-surface-alt rounded-scholar border border-border hover:border-accent/40 transition-colors"
                  >
                    <span className="font-medium text-text">{ws.name}</span>
                    <span className="text-xs text-text-soft">{t('manageMembers')}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
