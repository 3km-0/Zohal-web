'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Input, Card } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Workspace } from '@/types/database';

interface WorkspaceModalProps {
  workspace?: Workspace | null;
  initialParentFolderId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

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
  const tModal = useTranslations('workspaceModal');
  const tCommon = useTranslations('common');
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState(workspace?.name || '');
  const [description, setDescription] = useState(workspace?.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const buyBox = useMemo(() => ({
    city: city.trim() || null,
    districts: splitList(districts),
    asset_type: assetType,
    strategy,
    budget_min_sar: optionalNumber(budgetMin),
    budget_max_sar: optionalNumber(budgetMax),
    target_return: targetReturn.trim() || null,
    renovation_appetite: renovationAppetite,
    timeline,
    risk_appetite: riskAppetite,
    financing: financing.trim() || null,
    must_haves: splitList(mustHaves),
    avoid: splitList(avoidList),
    notes: mandateNotes.trim() || null,
  }), [
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
            parent_folder_id: initialParentFolderId || null,
            owner_id: user.id,
            status: 'active',
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
        className="relative z-10 max-h-[92vh] w-full max-w-4xl overflow-hidden border-white/10 bg-[#05080d]/95 shadow-[0_32px_120px_rgba(0,0,0,0.55)] animate-slide-up"
        padding="none"
      >
        <div className="flex items-start justify-between border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 sm:p-6">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              {isEditing ? tModal('editEyebrow') : tModal('eyebrow')}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-text sm:text-3xl">
              {isEditing ? tModal('editWorkspace') : tModal('acquisitionTitle')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-soft">
              {isEditing ? tModal('editSubtitle') : tModal('acquisitionSubtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-text-soft transition-colors hover:bg-white/[0.08] hover:text-text"
            aria-label={tCommon('close')}
          >
            {tCommon('close')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[calc(92vh-145px)] overflow-y-auto p-5 sm:p-6">
          {isEditing ? (
            <div className="space-y-5">
              <Input
                label={tModal('name')}
                placeholder={tModal('namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <TextAreaField
                label={tModal('description')}
                placeholder={tModal('descriptionPlaceholder')}
                value={description}
                onChange={setDescription}
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
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

              <div className="space-y-4 rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4 sm:p-5">
                <div>
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    {tModal('sections.buyBox')}
                  </p>
                  <p className="mt-1 text-sm text-text-soft">{tModal('buyBoxSubtitle')}</p>
                </div>

                <Input
                  label={tModal('districts')}
                  placeholder={tModal('districtsPlaceholder')}
                  value={districts}
                  onChange={(e) => setDistricts(e.target.value)}
                  hint={tModal('commaHint')}
                />

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
                  <SelectField label={tModal('renovationAppetite')} value={renovationAppetite} onChange={(value) => setRenovationAppetite(value as typeof renovationAppetite)}>
                    {renovationAppetites.map((type) => (
                      <option key={type} value={type}>{tModal(`renovation.${type}`)}</option>
                    ))}
                  </SelectField>
                  <SelectField label={tModal('riskAppetite')} value={riskAppetite} onChange={(value) => setRiskAppetite(value as typeof riskAppetite)}>
                    {riskOptions.map((type) => (
                      <option key={type} value={type}>{tModal(`risk.${type}`)}</option>
                    ))}
                  </SelectField>
                  <SelectField label={tModal('timeline')} value={timeline} onChange={(value) => setTimeline(value as typeof timeline)}>
                    {timelineOptions.map((type) => (
                      <option key={type} value={type}>{tModal(`timelines.${type}`)}</option>
                    ))}
                  </SelectField>
                  <Input
                    label={tModal('mustHaves')}
                    placeholder={tModal('mustHavesPlaceholder')}
                    value={mustHaves}
                    onChange={(e) => setMustHaves(e.target.value)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={tModal('avoid')}
                    placeholder={tModal('avoidPlaceholder')}
                    value={avoidList}
                    onChange={(e) => setAvoidList(e.target.value)}
                  />
                  <TextAreaField
                    label={tModal('mandateNotes')}
                    placeholder={tModal('mandateNotesPlaceholder')}
                    value={mandateNotes}
                    onChange={setMandateNotes}
                  />
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
        className="min-h-[44px] w-full resize-none rounded-zohal border border-border bg-surface px-4 py-3 text-text placeholder:text-text-soft transition-colors focus:border-[color:var(--button-primary-bg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)] focus:ring-offset-2 focus:ring-offset-background"
        rows={3}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
