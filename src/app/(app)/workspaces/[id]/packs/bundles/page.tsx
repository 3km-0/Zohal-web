'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Package,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import {
  Button,
  EmptyState,
  Input,
  ScholarNotebookCard,
  ScholarSelect,
  Spinner,
} from '@/components/ui';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type PackRow = {
  id: string;
  workspace_id: string;
  name: string | null;
  precedence_policy?: string | null;
  created_at?: string | null;
  pack_type?: string | null;
  primary_document_id?: string | null;
};

type PackMember = {
  id: string;
  pack_id: string;
  document_id: string;
  role: string;
  sort_order: number;
  document?: { id: string; title: string } | null;
};

type Document = {
  id: string;
  title: string;
};

const ROLE_OPTIONS = [
  { value: 'master', label: 'Master Agreement' },
  { value: 'amendment', label: 'Amendment' },
  { value: 'sow', label: 'Statement of Work' },
  { value: 'exhibit', label: 'Exhibit' },
  { value: 'other', label: 'Other' },
];

function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
}

export default function WorkspaceBundlesPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('packs');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [bundles, setBundles] = useState<PackRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [orgMultiUserEnabled, setOrgMultiUserEnabled] = useState(false);

  // Bundle detail view
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [members, setMembers] = useState<PackMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [workspaceDocuments, setWorkspaceDocuments] = useState<Document[]>([]);
  const [showAddDocs, setShowAddDocs] = useState(false);
  const [selectedDocsToAdd, setSelectedDocsToAdd] = useState<Set<string>>(new Set());
  const [savingMember, setSavingMember] = useState(false);

  const selectedBundle = useMemo(
    () => bundles.find((b) => b.id === selectedBundleId) || null,
    [bundles, selectedBundleId]
  );

  const fetchBundles = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('packs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('pack_type', 'bundle')
      .order('created_at', { ascending: false });

    setBundles((data as any[]) || []);
    setLoading(false);
  }, [supabase, workspaceId]);

  const fetchMembers = useCallback(
    async (packId: string) => {
      setLoadingMembers(true);
      const { data } = await supabase
        .from('pack_members')
        .select('*, document:documents(id, title)')
        .eq('pack_id', packId)
        .order('sort_order', { ascending: true });

      setMembers((data as any[]) || []);
      setLoadingMembers(false);
    },
    [supabase]
  );

  const fetchWorkspaceDocuments = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('id, title')
      .eq('workspace_id', workspaceId)
      .order('title', { ascending: true });

    setWorkspaceDocuments((data as any[]) || []);
  }, [supabase, workspaceId]);

  useEffect(() => {
    fetchBundles();
    fetchWorkspaceDocuments();
  }, [fetchBundles, fetchWorkspaceDocuments]);

  useEffect(() => {
    if (selectedBundleId) {
      fetchMembers(selectedBundleId);
    }
  }, [selectedBundleId, fetchMembers]);

  useEffect(() => {
    async function loadOrgFlag() {
      const { data } = await supabase
        .from('workspaces')
        .select('org_id')
        .eq('id', workspaceId)
        .single();
      const orgId = data?.org_id;
      if (!orgId) {
        setOrgMultiUserEnabled(false);
        return;
      }
      const { data: org } = await supabase
        .from('organizations')
        .select('multi_user_enabled')
        .eq('id', orgId)
        .maybeSingle();
      setOrgMultiUserEnabled(org?.multi_user_enabled === true);
    }
    loadOrgFlag();
  }, [supabase, workspaceId]);

  const createBundle = async () => {
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: newPack } = await supabase
        .from('packs')
        .insert({
          workspace_id: workspaceId,
          name: newName.trim() ? newName.trim() : null,
          created_by: user.id,
          pack_type: 'bundle',
          precedence_policy: 'manual',
        })
        .select('id')
        .single();

      setNewName('');
      await fetchBundles();

      // Auto-select the new bundle
      if (newPack?.id) {
        setSelectedBundleId(newPack.id);
      }
    } finally {
      setCreating(false);
    }
  };

  const deleteBundle = async (id: string) => {
    if (!confirm(t('bundlesManager.confirmDelete'))) return;
    await supabase.from('packs').delete().eq('id', id);
    setBundles((prev) => prev.filter((b) => b.id !== id));
    if (selectedBundleId === id) {
      setSelectedBundleId(null);
      setMembers([]);
    }
  };

  const addDocumentsToBundle = async () => {
    if (!selectedBundleId || selectedDocsToAdd.size === 0) return;
    setSavingMember(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const existingDocIds = new Set(members.map((m) => m.document_id));
      const toAdd = Array.from(selectedDocsToAdd).filter((id) => !existingDocIds.has(id));

      for (let i = 0; i < toAdd.length; i++) {
        await supabase.from('pack_members').insert({
          pack_id: selectedBundleId,
          document_id: toAdd[i],
          role: 'other',
          sort_order: members.length + i,
          added_by: user.id,
        });
      }

      setSelectedDocsToAdd(new Set());
      setShowAddDocs(false);
      await fetchMembers(selectedBundleId);
    } finally {
      setSavingMember(false);
    }
  };

  const updateMemberRole = async (memberId: string, role: string) => {
    await supabase.from('pack_members').update({ role }).eq('id', memberId);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
  };

  const removeMember = async (memberId: string) => {
    await supabase.from('pack_members').delete().eq('id', memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const setPrimaryDocument = async (documentId: string) => {
    if (!selectedBundleId) return;
    await supabase.from('packs').update({ primary_document_id: documentId }).eq('id', selectedBundleId);
    setBundles((prev) =>
      prev.map((b) => (b.id === selectedBundleId ? { ...b, primary_document_id: documentId } : b))
    );
  };

  const existingDocIds = new Set(members.map((m) => m.document_id));
  const availableDocsToAdd = workspaceDocuments.filter((d) => !existingDocIds.has(d.id));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title={t('bundlesManager.title')}
        actions={
          <Link href={`/workspaces/${workspaceId}/packs`}>
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4" />
              {t('backToPacks')}
            </Button>
          </Link>
        }
      />

      <WorkspaceTabs workspaceId={workspaceId} active="packs" showMembersTab={orgMultiUserEnabled} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* About Card */}
          <ScholarNotebookCard header="ABOUT">
            <div className="p-4 text-sm text-text-soft">
              {t('bundlesManager.aboutBody')}
            </div>
          </ScholarNotebookCard>

          {/* Create Card */}
          <ScholarNotebookCard header="CREATE">
            <div className="p-4">
              <div className="flex items-center gap-3">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('bundlesManager.newNamePlaceholder')}
                  className="flex-1"
                />
                <Button onClick={createBundle} disabled={creating}>
                  {creating ? <Spinner size="sm" /> : <Plus className="w-4 h-4" />}
                  {tCommon('create')}
                </Button>
              </div>
            </div>
          </ScholarNotebookCard>

          {/* Bundles List */}
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Spinner size="lg" />
            </div>
          ) : bundles.length === 0 ? (
            <EmptyState
              icon={<Package className="w-8 h-8" />}
              title={t('bundlesManager.emptyTitle')}
              description={t('bundlesManager.emptyDescription')}
              variant="card"
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Bundle List */}
              <ScholarNotebookCard header="BUNDLES">
                <div className="divide-y divide-border">
                  {bundles.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBundleId(b.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                        selectedBundleId === b.id
                          ? 'bg-accent/5'
                          : 'hover:bg-surface-alt'
                      )}
                    >
                      <Package
                        className={cn(
                          'w-5 h-5 flex-shrink-0',
                          selectedBundleId === b.id ? 'text-accent' : 'text-text-soft'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text truncate">
                          {b.name || t('bundlesManager.unnamed')}
                        </div>
                        <div className="text-xs text-text-soft">
                          {t('bundlesManager.precedence', {
                            value: b.precedence_policy || 'primary_first',
                          })}
                        </div>
                      </div>
                      {selectedBundleId === b.id ? (
                        <div className="w-2 h-2 rounded-full bg-accent" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-text-soft rtl-flip" />
                      )}
                    </button>
                  ))}
                </div>
              </ScholarNotebookCard>

              {/* Bundle Detail */}
              {selectedBundle ? (
                <ScholarNotebookCard
                  headerContent={
                    <div className="flex items-center justify-between gap-3 w-full">
                      <span className="text-[11px] font-semibold text-text-soft uppercase tracking-[1.2px]">
                        {selectedBundle.name || t('bundlesManager.unnamed')}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAddDocs(true)}
                        >
                          <Plus className="w-4 h-4" />
                          Add
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteBundle(selectedBundle.id)}
                        >
                          <Trash2 className="w-4 h-4 text-error" />
                        </Button>
                      </div>
                    </div>
                  }
                >
                  {loadingMembers ? (
                    <div className="p-8 flex justify-center">
                      <Spinner size="md" />
                    </div>
                  ) : members.length === 0 ? (
                    <div className="p-6">
                      <EmptyState
                        icon={<FileText className="w-6 h-6" />}
                        title="No documents"
                        description="Add documents to this bundle to analyze them together."
                        action={{
                          label: 'Add Documents',
                          onClick: () => setShowAddDocs(true),
                        }}
                        variant="inline"
                      />
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {members.map((member) => {
                        const isPrimary =
                          member.document_id === selectedBundle.primary_document_id;
                        return (
                          <div
                            key={member.id}
                            className="flex items-center gap-3 px-4 py-3"
                          >
                            <FileText
                              className={cn(
                                'w-5 h-5 flex-shrink-0',
                                isPrimary ? 'text-accent' : 'text-text-soft'
                              )}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-text truncate">
                                {member.document?.title || 'Document'}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-text-soft">
                                  {getRoleLabel(member.role)}
                                </span>
                                {isPrimary && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-semibold">
                                    <Star className="w-3 h-3" />
                                    Primary
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <ScholarSelect
                                options={ROLE_OPTIONS}
                                value={member.role}
                                onChange={(e) =>
                                  updateMemberRole(member.id, e.target.value)
                                }
                                className="w-32"
                              />
                              {!isPrimary && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setPrimaryDocument(member.document_id)}
                                  title="Set as Primary"
                                >
                                  <Star className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeMember(member.id)}
                              >
                                <X className="w-4 h-4 text-error" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScholarNotebookCard>
              ) : (
                <ScholarNotebookCard header="DETAILS">
                  <div className="p-6">
                    <EmptyState
                      icon={<Package className="w-6 h-6" />}
                      title="Select a bundle"
                      description="Choose a bundle from the list to view and manage its documents."
                      variant="inline"
                    />
                  </div>
                </ScholarNotebookCard>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Documents Modal */}
      {showAddDocs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg mx-4 bg-surface rounded-scholar border border-border shadow-[var(--shadowMd)] overflow-hidden">
            <div className="px-4 py-3 bg-surface-alt border-b border-border flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-soft uppercase tracking-[1.2px]">
                ADD DOCUMENTS
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddDocs(false);
                  setSelectedDocsToAdd(new Set());
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {availableDocsToAdd.length === 0 ? (
                <div className="p-6 text-center text-sm text-text-soft">
                  No more documents available to add.
                </div>
              ) : (
                availableDocsToAdd.map((doc) => {
                  const isSelected = selectedDocsToAdd.has(doc.id);
                  return (
                    <button
                      key={doc.id}
                      onClick={() => {
                        setSelectedDocsToAdd((prev) => {
                          const next = new Set(prev);
                          if (isSelected) {
                            next.delete(doc.id);
                          } else {
                            next.add(doc.id);
                          }
                          return next;
                        });
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                        isSelected ? 'bg-accent/5' : 'hover:bg-surface-alt'
                      )}
                    >
                      <div
                        className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                          isSelected
                            ? 'border-accent bg-accent'
                            : 'border-border bg-surface'
                        )}
                      >
                        {isSelected && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      <FileText className="w-4 h-4 text-text-soft" />
                      <span className="text-sm font-medium text-text truncate">
                        {doc.title}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-3 bg-surface-alt border-t border-border flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowAddDocs(false);
                  setSelectedDocsToAdd(new Set());
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={addDocumentsToBundle}
                disabled={selectedDocsToAdd.size === 0 || savingMember}
              >
                {savingMember ? (
                  <Spinner size="sm" />
                ) : (
                  `Add ${selectedDocsToAdd.size} Document${selectedDocsToAdd.size !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

