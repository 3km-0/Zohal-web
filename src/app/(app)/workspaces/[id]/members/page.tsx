'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Input, Spinner, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';

type WorkspaceRole = 'owner' | 'editor' | 'viewer' | 'guest';

type MemberRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles?: {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export default function WorkspaceMembersPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const tCommon = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('viewer');
  const [submitting, setSubmitting] = useState(false);
  const [needsOrgInvite, setNeedsOrgInvite] = useState(false);

  const fetchWorkspaceOrgId = useCallback(async () => {
    const { data, error } = await supabase.from('workspaces').select('org_id').eq('id', workspaceId).single();
    if (!error && data?.org_id) {
      setOrgId(data.org_id);
      return;
    }

    // Fallback: RPC listing (shared-safe)
    const { data: rpcData } = await supabase.rpc('list_accessible_workspaces');
    const found = (rpcData as Array<{ id: string; org_id: string | null }> | null)?.find((w) => w.id === workspaceId);
    setOrgId(found?.org_id ?? null);
  }, [supabase, workspaceId]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('workspace-members-list', {
      body: { workspace_id: workspaceId },
    });
    if (error) {
      showError(error, 'members');
      setMembers([]);
      setLoading(false);
      return;
    }
    setMembers((data?.members as MemberRow[]) ?? []);
    setLoading(false);
  }, [supabase, workspaceId, showError]);

  useEffect(() => {
    fetchWorkspaceOrgId();
    fetchMembers();
  }, [fetchWorkspaceOrgId, fetchMembers]);

  const handleAddMember = async () => {
    setSubmitting(true);
    setNeedsOrgInvite(false);
    try {
      const { data, error } = await supabase.functions.invoke('workspace-member-add', {
        body: { workspace_id: workspaceId, email, role },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to add member');
      showSuccess('Member added');
      setEmail('');
      await fetchMembers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add member';
      // If the profile doesn't exist, offer org invite flow.
      if (msg.toLowerCase().includes('user not found')) {
        setNeedsOrgInvite(true);
      }
      showError(e, 'members');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInviteToOrg = async () => {
    if (!orgId) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('org-invite-create', {
        body: { org_id: orgId, email, role: 'member' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to invite');
      showSuccess('Invite created', 'Share the invite link if email delivery is not configured.');
      setNeedsOrgInvite(false);
    } catch (e) {
      showError(e, 'members');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRole = async (memberId: string, nextRole: WorkspaceRole) => {
    try {
      const { data, error } = await supabase.functions.invoke('workspace-member-update-role', {
        body: { member_id: memberId, role: nextRole },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to update role');
      showSuccess('Role updated');
      await fetchMembers();
    } catch (e) {
      showError(e, 'members');
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm('Remove this member from the workspace?')) return;
    try {
      const { data, error } = await supabase.functions.invoke('workspace-member-remove', {
        body: { member_id: memberId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Failed to remove member');
      showSuccess('Member removed');
      await fetchMembers();
    } catch (e) {
      showError(e, 'members');
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title="Members" />
      <WorkspaceTabs workspaceId={workspaceId} active="members" showMembersTab />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <Card padding="lg">
            <h2 className="text-sm font-semibold text-text mb-4">Add member</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                label="Email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Role</label>
                <select
                  className="w-full px-4 py-3 bg-surface border border-border rounded-scholar text-text"
                  value={role}
                  onChange={(e) => setRole(e.target.value as WorkspaceRole)}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                  <option value="guest">Guest</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleAddMember} isLoading={submitting} className="w-full">
                  Add
                </Button>
              </div>
            </div>

            {needsOrgInvite && (
              <div className="mt-4 p-3 border border-border rounded-scholar bg-surface-alt">
                <p className="text-sm text-text">
                  This email doesn’t match an existing account yet. You can send an organization invite first.
                </p>
                <div className="mt-3 flex gap-3">
                  <Button onClick={handleInviteToOrg} isLoading={submitting} disabled={!orgId}>
                    Invite to organization
                  </Button>
                  <Button variant="secondary" onClick={() => setNeedsOrgInvite(false)}>
                    {tCommon('cancel')}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text">Workspace members</h2>
              <Badge size="sm">{members.length}</Badge>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size="lg" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-text-soft">No members yet.</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 border border-border rounded-scholar bg-surface"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-text truncate">
                        {m.profiles?.display_name || m.profiles?.email || m.user_id}
                      </div>
                      {m.profiles?.email && (
                        <div className="text-xs text-text-soft truncate">{m.profiles.email}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        className="px-3 py-2 bg-surface border border-border rounded-scholar text-sm text-text"
                        value={(m.role as WorkspaceRole) || 'viewer'}
                        onChange={(e) => handleUpdateRole(m.id, e.target.value as WorkspaceRole)}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="owner">Owner</option>
                        <option value="guest">Guest</option>
                      </select>
                      <Button variant="secondary" size="sm" onClick={() => handleRemove(m.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

