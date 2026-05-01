'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  Clock3,
  Hammer,
  MapPin,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { invokeZohalBackendJson } from '@/lib/zohal-backend';
import type { Folder, Workspace, WorkspaceType } from '@/types/database';
import { cn } from '@/lib/utils';
import { resolveIcon, isSFSymbol } from '@/lib/icon-mapping';
import { isHiddenSystemPlaybook, getTemplateEmoji, getTemplateDescription } from '@/lib/template-library';

interface PlaybookRecord {
  id: string;
  name: string;
  is_system_preset: boolean | null;
  current_version?: {
    spec_json?: Record<string, unknown> | null;
  } | null;
}

interface WorkspaceModalProps {
  workspace?: Workspace | null;
  initialParentFolderId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const workspaceTypes: { value: WorkspaceType; icon: string }[] = [
  { value: 'project', icon: '📁' },
  { value: 'case', icon: '⚖️' },
  { value: 'course', icon: '📚' },
  { value: 'personal', icon: '👤' },
  { value: 'research', icon: '🔬' },
  { value: 'client', icon: '🏢' },
  { value: 'other', icon: '📂' },
];

const assetTypes = ['villa', 'townhouse', 'apartment', 'building', 'land', 'mixed_use'] as const;
const strategyTypes = ['buy_renovate_rent', 'buy_renovate_sell', 'income_hold', 'family_office', 'opportunistic'] as const;
const renovationAppetites = ['light', 'medium', 'heavy', 'avoid'] as const;
const timelineOptions = ['now', '30_days', '90_days', 'six_months'] as const;
const riskOptions = ['conservative', 'balanced', 'opportunistic'] as const;

function splitList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalNumber(value: string) {
  const normalized = value.replace(/[^\d.]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function WorkspaceModal({ workspace, initialParentFolderId, onClose, onSaved }: WorkspaceModalProps) {
  const t = useTranslations('workspaces');
  const tModal = useTranslations('workspaceModal');
  const tCommon = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState(workspace?.name || '');
  const [description, setDescription] = useState(workspace?.description || '');
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>(
    workspace?.workspace_type || 'project'
  );
  const getInitialIcon = () => {
    if (!workspace?.icon) return '';
    if (isSFSymbol(workspace.icon)) {
      const resolved = resolveIcon(workspace.icon);
      return resolved.type === 'emoji' ? resolved.emoji : '';
    }
    return workspace.icon;
  };
  const [iconEmoji, setIconEmoji] = useState(getInitialIcon());
  const [folders, setFolders] = useState<Folder[]>([]);
  const [parentFolderId, setParentFolderId] = useState<string>(workspace?.parent_folder_id || initialParentFolderId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    workspace?.default_playbook_id || null
  );
  const [availableTemplates, setAvailableTemplates] = useState<PlaybookRecord[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const [city, setCity] = useState('Riyadh');
  const [districts, setDistricts] = useState('');
  const [assetType, setAssetType] = useState<(typeof assetTypes)[number]>('villa');
  const [strategy, setStrategy] = useState<(typeof strategyTypes)[number]>('buy_renovate_rent');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [targetReturn, setTargetReturn] = useState('');
  const [renovationAppetite, setRenovationAppetite] = useState<(typeof renovationAppetites)[number]>('medium');
  const [timeline, setTimeline] = useState<(typeof timelineOptions)[number]>('90_days');
  const [riskAppetite, setRiskAppetite] = useState<(typeof riskOptions)[number]>('balanced');
  const [financing, setFinancing] = useState('');
  const [mustHaves, setMustHaves] = useState('');
  const [avoidList, setAvoidList] = useState('');
  const [mandateNotes, setMandateNotes] = useState('');

  const isEditing = !!workspace;

  const buyBox = useMemo(() => {
    const min = optionalNumber(budgetMin);
    const max = optionalNumber(budgetMax);
    return {
      city: city.trim() || null,
      districts: splitList(districts),
      asset_type: assetType,
      strategy,
      budget_min_sar: min,
      budget_max_sar: max,
      target_return: targetReturn.trim() || null,
      renovation_appetite: renovationAppetite,
      timeline,
      risk_appetite: riskAppetite,
      financing: financing.trim() || null,
      must_haves: splitList(mustHaves),
      avoid: splitList(avoidList),
      notes: mandateNotes.trim() || null,
    };
  }, [
    assetType,
    avoidList,
    budgetMax,
    budgetMin,
    city,
    districts,
    financing,
    mandateNotes,
    mustHaves,
    renovationAppetite,
    riskAppetite,
    strategy,
    targetReturn,
    timeline,
  ]);

  const generatedBrief = useMemo(() => {
    const parts = [
      `${tModal('brief.asset')}: ${tModal(`assetTypes.${assetType}`)}`,
      `${tModal('brief.location')}: ${city}${districts.trim() ? ` - ${districts.trim()}` : ''}`,
      budgetMin || budgetMax ? `${tModal('brief.budget')}: ${budgetMin || '...'} - ${budgetMax || '...'} SAR` : null,
      `${tModal('brief.strategy')}: ${tModal(`strategies.${strategy}`)}`,
      `${tModal('brief.renovation')}: ${tModal(`renovation.${renovationAppetite}`)}`,
      targetReturn.trim() ? `${tModal('brief.return')}: ${targetReturn.trim()}` : null,
      mandateNotes.trim() ? `${tModal('brief.notes')}: ${mandateNotes.trim()}` : null,
    ].filter(Boolean);
    return parts.join('\n');
  }, [assetType, budgetMax, budgetMin, city, districts, mandateNotes, renovationAppetite, strategy, tModal, targetReturn]);

  useEffect(() => {
    const loadFolders = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      if (!error && data) {
        setFolders((data as Folder[]).filter((folder) => folder.owner_id === user.id || folder.org_id != null));
      }
    };

    void loadFolders();
  }, [supabase]);

  useEffect(() => {
    const loadTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const data = await invokeZohalBackendJson<{ templates?: PlaybookRecord[] }>(
          supabase,
          'templates/list',
          {
            workspace_id: '00000000-0000-0000-0000-000000000000',
            kind: 'document',
            status: 'published',
          },
        );
        if (data?.templates) {
          const visible = (data.templates as PlaybookRecord[]).filter(
            (p) => !p.is_system_preset || !isHiddenSystemPlaybook(p as Parameters<typeof isHiddenSystemPlaybook>[0])
          );
          setAvailableTemplates(visible);
        }
      } catch {
        // Non-fatal: the acquisition form can create the workspace without a template binding.
      } finally {
        setLoadingTemplates(false);
      }
    };

    void loadTemplates();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(tModal('nameRequired'));
      return;
    }

    setLoading(true);

    try {
      if (isEditing) {
        const { error } = await supabase
          .from('workspaces')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            workspace_type: workspaceType,
            icon: iconEmoji.trim() || null,
            parent_folder_id: parentFolderId || null,
            default_playbook_id: selectedTemplateId || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', workspace.id);

        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const summary = description.trim() || generatedBrief;
        const createdAt = new Date().toISOString();
        const { data: createdWorkspace, error } = await supabase
          .from('workspaces')
          .insert({
            name: name.trim(),
            description: summary || null,
            analysis_brief: generatedBrief || summary || null,
            workspace_type: 'project',
            icon: 'scope',
            color: '#B7F34A',
            parent_folder_id: parentFolderId || null,
            owner_id: user.id,
            status: 'active',
            default_playbook_id: selectedTemplateId || null,
            preparation_status: 'seeded',
            preparation_metadata: {
              seed_source: 'acquisition_workspace_creation_form',
              seeded_at: createdAt,
              product_model: 'Mandate -> Opportunity -> Screening -> Acquisition Workspace -> Coordination -> Decision',
              living_interface_state: 'pending_snapshot',
              buy_box: buyBox,
            },
          })
          .select('id')
          .single();

        if (error) throw error;

        const mandateResult = await supabase.from('acquisition_mandates').insert({
          workspace_id: createdWorkspace.id,
          user_id: user.id,
          title: name.trim(),
          status: 'active',
          buy_box_json: buyBox,
          target_locations_json: buyBox.districts.length ? buyBox.districts : [buyBox.city || 'Riyadh'],
          budget_range_json: {
            min: buyBox.budget_min_sar,
            max: buyBox.budget_max_sar,
            currency: 'SAR',
          },
          risk_appetite: buyBox.risk_appetite,
          excluded_criteria_json: buyBox.avoid,
          confidence_json: {
            intake_source: 'workspace_creation_form',
            basis_label: 'investor_provided',
          },
        });

        if (mandateResult.error) throw mandateResult.error;
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      <Card
        className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-hidden border-white/10 bg-[#05080d]/95 shadow-[0_32px_120px_rgba(0,0,0,0.55)] animate-slide-up"
        padding="none"
      >
        <div className="flex items-start justify-between border-b border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(183,243,74,0.13),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 sm:p-6">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              <Target className="h-3.5 w-3.5" />
              {isEditing ? tModal('editEyebrow') : tModal('eyebrow')}
            </div>
            <h2 className="text-2xl font-semibold text-text sm:text-3xl">
              {isEditing ? tModal('editWorkspace') : tModal('acquisitionTitle')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-soft">
              {isEditing ? tModal('editSubtitle') : tModal('acquisitionSubtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-text-soft transition-colors hover:bg-white/[0.08] hover:text-text"
            aria-label={tCommon('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[calc(92vh-145px)] overflow-y-auto p-5 sm:p-6">
          {isEditing ? (
            <EditWorkspaceFields
              folders={folders}
              name={name}
              description={description}
              workspaceType={workspaceType}
              iconEmoji={iconEmoji}
              parentFolderId={parentFolderId}
              setName={setName}
              setDescription={setDescription}
              setWorkspaceType={setWorkspaceType}
              setIconEmoji={setIconEmoji}
              setParentFolderId={setParentFolderId}
              tModal={tModal}
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5">
                <ObsidianSection icon={<Building2 className="h-4 w-4" />} title={tModal('sections.identity')}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label={tModal('name')}
                      placeholder={tModal('namePlaceholder')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <Input
                      label={tModal('city')}
                      placeholder={tModal('cityPlaceholder')}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <Input
                    label={tModal('districts')}
                    placeholder={tModal('districtsPlaceholder')}
                    value={districts}
                    onChange={(e) => setDistricts(e.target.value)}
                    hint={tModal('commaHint')}
                  />
                </ObsidianSection>

                <ObsidianSection icon={<Target className="h-4 w-4" />} title={tModal('sections.buyBox')}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField label={tModal('assetType')} value={assetType} onChange={(value) => setAssetType(value as typeof assetType)}>
                      {assetTypes.map((type) => (
                        <option key={type} value={type}>{tModal(`assetTypes.${type}`)}</option>
                      ))}
                    </SelectField>
                    <SelectField label={tModal('strategy')} value={strategy} onChange={(value) => setStrategy(value as typeof strategy)}>
                      {strategyTypes.map((type) => (
                        <option key={type} value={type}>{tModal(`strategies.${type}`)}</option>
                      ))}
                    </SelectField>
                    <Input
                      label={tModal('budgetMin')}
                      placeholder="1500000"
                      inputMode="numeric"
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(e.target.value)}
                    />
                    <Input
                      label={tModal('budgetMax')}
                      placeholder="5000000"
                      inputMode="numeric"
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(e.target.value)}
                    />
                  </div>
                </ObsidianSection>

                <ObsidianSection icon={<Hammer className="h-4 w-4" />} title={tModal('sections.conviction')}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <SelectField label={tModal('renovationAppetite')} value={renovationAppetite} onChange={(value) => setRenovationAppetite(value as typeof renovationAppetite)}>
                      {renovationAppetites.map((type) => (
                        <option key={type} value={type}>{tModal(`renovation.${type}`)}</option>
                      ))}
                    </SelectField>
                    <SelectField label={tModal('timeline')} value={timeline} onChange={(value) => setTimeline(value as typeof timeline)}>
                      {timelineOptions.map((type) => (
                        <option key={type} value={type}>{tModal(`timelines.${type}`)}</option>
                      ))}
                    </SelectField>
                    <SelectField label={tModal('riskAppetite')} value={riskAppetite} onChange={(value) => setRiskAppetite(value as typeof riskAppetite)}>
                      {riskOptions.map((type) => (
                        <option key={type} value={type}>{tModal(`risk.${type}`)}</option>
                      ))}
                    </SelectField>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label={tModal('targetReturn')}
                      placeholder={tModal('targetReturnPlaceholder')}
                      value={targetReturn}
                      onChange={(e) => setTargetReturn(e.target.value)}
                    />
                    <Input
                      label={tModal('financing')}
                      placeholder={tModal('financingPlaceholder')}
                      value={financing}
                      onChange={(e) => setFinancing(e.target.value)}
                    />
                  </div>
                </ObsidianSection>

                <ObsidianSection icon={<ShieldCheck className="h-4 w-4" />} title={tModal('sections.rules')}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label={tModal('mustHaves')}
                      placeholder={tModal('mustHavesPlaceholder')}
                      value={mustHaves}
                      onChange={(e) => setMustHaves(e.target.value)}
                      hint={tModal('commaHint')}
                    />
                    <Input
                      label={tModal('avoid')}
                      placeholder={tModal('avoidPlaceholder')}
                      value={avoidList}
                      onChange={(e) => setAvoidList(e.target.value)}
                      hint={tModal('commaHint')}
                    />
                  </div>
                  <TextAreaField
                    label={tModal('mandateNotes')}
                    placeholder={tModal('mandateNotesPlaceholder')}
                    value={mandateNotes}
                    onChange={setMandateNotes}
                  />
                </ObsidianSection>
              </div>

              <div className="space-y-5">
                <ObsidianSection icon={<MapPin className="h-4 w-4" />} title={tModal('sections.routing')}>
                  <SelectField label={tModal('folder')} value={parentFolderId} onChange={setParentFolderId}>
                    <option value="">{tModal('noFolder')}</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </SelectField>
                  <TemplatePicker
                    availableTemplates={availableTemplates}
                    loadingTemplates={loadingTemplates}
                    selectedTemplateId={selectedTemplateId}
                    setSelectedTemplateId={setSelectedTemplateId}
                    tModal={tModal}
                  />
                </ObsidianSection>

                <div className="rounded-[1.35rem] border border-accent/20 bg-[linear-gradient(145deg,rgba(183,243,74,0.12),rgba(47,215,255,0.05)_42%,rgba(255,255,255,0.035))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">{tModal('previewEyebrow')}</p>
                  <h3 className="mt-3 text-xl font-semibold text-text">{name.trim() || tModal('namePlaceholder')}</h3>
                  <p className="mt-2 text-sm leading-6 text-text-soft">{tModal('previewDescription')}</p>
                  <div className="mt-5 grid gap-3">
                    <SignalRow icon={<Wallet className="h-4 w-4" />} label={tModal('budget')} value={budgetMin || budgetMax ? `${budgetMin || '...'} - ${budgetMax || '...'} SAR` : tModal('notSet')} />
                    <SignalRow icon={<TrendingUp className="h-4 w-4" />} label={tModal('strategy')} value={tModal(`strategies.${strategy}`)} />
                    <SignalRow icon={<Hammer className="h-4 w-4" />} label={tModal('renovationAppetite')} value={tModal(`renovation.${renovationAppetite}`)} />
                    <SignalRow icon={<Clock3 className="h-4 w-4" />} label={tModal('timeline')} value={tModal(`timelines.${timeline}`)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-zohal border border-error/20 bg-error/10 p-3 text-sm text-error">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" isLoading={loading} disabled={!name.trim() || loading}>
              {isEditing ? tModal('saveChanges') : tModal('createWorkspace')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function ObsidianSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text">
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          {icon}
        </span>
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-text">{label}</span>
      <select
        className="min-h-[44px] w-full rounded-zohal border border-border bg-surface px-4 py-3 text-text transition-colors focus:border-[color:var(--button-primary-bg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)] focus:ring-offset-2 focus:ring-offset-background"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function TextAreaField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-text">{label}</span>
      <textarea
        className="min-h-28 w-full resize-none rounded-zohal border border-border bg-surface px-4 py-3 text-text placeholder:text-text-soft transition-colors focus:border-[color:var(--button-primary-bg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)] focus:ring-offset-2 focus:ring-offset-background"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function SignalRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <span className="text-highlight">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</p>
        <p className="truncate text-sm font-medium text-text">{value}</p>
      </div>
    </div>
  );
}

function TemplatePicker({
  availableTemplates,
  loadingTemplates,
  selectedTemplateId,
  setSelectedTemplateId,
  tModal,
}: {
  availableTemplates: PlaybookRecord[];
  loadingTemplates: boolean;
  selectedTemplateId: string | null;
  setSelectedTemplateId: (id: string | null) => void;
  tModal: ReturnType<typeof useTranslations>;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text">
        {tModal('template')} <span className="font-normal text-text-soft">({tModal('optional')})</span>
      </label>
      <p className="mb-2 text-xs text-text-soft">{tModal('templateHint')}</p>
      {loadingTemplates ? (
        <div className="text-xs text-text-soft">{tModal('loadingTemplates')}</div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedTemplateId(null)}
            className={cn(
              'flex w-16 flex-shrink-0 flex-col items-center gap-1 rounded-zohal border p-2 transition-all',
              selectedTemplateId === null ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'
            )}
          >
            <span className="text-lg">×</span>
            <span className="text-center text-[10px] leading-tight text-text-soft">{tModal('none')}</span>
          </button>

          {availableTemplates.map((tpl) => {
            const tplAny = tpl as Parameters<typeof getTemplateEmoji>[0];
            const emoji = getTemplateEmoji(tplAny);
            const isSelected = selectedTemplateId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                title={getTemplateDescription(tplAny, 'en')}
                onClick={() => setSelectedTemplateId(tpl.id)}
                className={cn(
                  'flex w-16 flex-shrink-0 flex-col items-center gap-1 rounded-zohal border p-2 transition-all',
                  isSelected ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'
                )}
              >
                <span className="text-lg">{emoji}</span>
                <span className="line-clamp-2 text-center text-[10px] leading-tight text-text-soft">{tpl.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditWorkspaceFields({
  folders,
  name,
  description,
  workspaceType,
  iconEmoji,
  parentFolderId,
  setName,
  setDescription,
  setWorkspaceType,
  setIconEmoji,
  setParentFolderId,
  tModal,
}: {
  folders: Folder[];
  name: string;
  description: string;
  workspaceType: WorkspaceType;
  iconEmoji: string;
  parentFolderId: string;
  setName: (value: string) => void;
  setDescription: (value: string) => void;
  setWorkspaceType: (value: WorkspaceType) => void;
  setIconEmoji: (value: string) => void;
  setParentFolderId: (value: string) => void;
  tModal: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-5">
      <Input label={tModal('name')} placeholder={tModal('namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} required />
      <div>
        <label className="mb-2 block text-sm font-medium text-text">{tModal('type')}</label>
        <div className="grid grid-cols-4 gap-2">
          {workspaceTypes.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setWorkspaceType(type.value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-zohal border p-3 transition-all',
                workspaceType === type.value ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'
              )}
            >
              <span className="text-xl">{type.icon}</span>
              <span className="text-xs capitalize text-text-soft">{type.value}</span>
            </button>
          ))}
        </div>
      </div>
      <Input label={tModal('customIcon')} placeholder={tModal('iconPlaceholder')} value={iconEmoji} onChange={(e) => setIconEmoji(e.target.value)} hint={tModal('iconHint')} />
      <SelectField label={tModal('folder')} value={parentFolderId} onChange={setParentFolderId}>
        <option value="">{tModal('noFolder')}</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>{folder.name}</option>
        ))}
      </SelectField>
      <TextAreaField label={tModal('description')} placeholder={tModal('descriptionPlaceholder')} value={description} onChange={setDescription} />
    </div>
  );
}
