'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { invokeZohalBackendJson } from '@/lib/zohal-backend';
import { DataLocalityMap, type DataLocalityRegion } from '@/components/enterprise/DataLocalityMap';
import { ProvisioningProgressModal, type ProvisioningRun } from '@/components/enterprise/ProvisioningProgressModal';

interface CurrentPlane {
  mode: 'shared_supabase' | 'enterprise_firebase';
  region: string | null;
  tenant_id: string | null;
  documents_bucket_uri: string | null;
  exports_bucket_uri: string | null;
}

interface RegionsResponse {
  eligible: boolean;
  eligibility_reason?: string;
  org_id: string;
  workspace_count?: number;
  current_plane: CurrentPlane;
  regions: DataLocalityRegion[];
}

interface OrgDataLocalityPanelProps {
  orgId: string;
  orgName?: string;
}

export function OrgDataLocalityPanel({ orgId, orgName }: OrgDataLocalityPanelProps) {
  const t = useTranslations('dataLocalityPage');
  const supabase = createClient();

  const [loadingRegions, setLoadingRegions] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [eligibilityReason, setEligibilityReason] = useState('');
  const [regions, setRegions] = useState<DataLocalityRegion[]>([]);
  const [currentPlane, setCurrentPlane] = useState<CurrentPlane | null>(null);
  const [workspaceCount, setWorkspaceCount] = useState<number>(0);

  const [selectedRegion, setSelectedRegion] = useState<DataLocalityRegion | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [run, setRun] = useState<ProvisioningRun | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [error, setError] = useState('');

  const currentRegionCode = currentPlane?.region || null;
  const regionLocked = Boolean(currentRegionCode);
  const canSelectRegion = eligible && !regionLocked;
  const ineligibleMessage = useMemo(() => {
    const reason = (eligibilityReason || '').toLowerCase();
    if (reason === 'org_admin_required') return t('reasonOrgAdminRequired');
    if (reason === 'org_not_eligible' || reason === 'org_data_locality_disabled' || reason === 'org_multi_user_disabled') {
      return t('reasonTeamRequired');
    }
    return t('orgIneligibleBody');
  }, [eligibilityReason, t]);

  const invokeFunction = useCallback(async (route: string, payload: Record<string, unknown>) => {
    return invokeZohalBackendJson(supabase, route, payload);
  }, [supabase]);

  const loadRegions = useCallback(async () => {
    if (!orgId) return;

    setLoadingRegions(true);
    setError('');
    try {
      const json = (await invokeFunction('enterprise/data-locality/regions', {
        org_id: orgId,
      })) as RegionsResponse;

      setEligible(!!json.eligible);
      setEligibilityReason(json.eligibility_reason || '');
      setRegions(Array.isArray(json.regions) ? json.regions : []);
      setCurrentPlane(json.current_plane || null);
      setWorkspaceCount(Number(json.workspace_count || 0));
    } catch (e) {
      setError((e as Error)?.message || t('errors.loadFailed'));
      setEligible(false);
      setRegions([]);
      setCurrentPlane(null);
      setWorkspaceCount(0);
    } finally {
      setLoadingRegions(false);
    }
  }, [invokeFunction, orgId, t]);

  const startProvisioning = useCallback(async () => {
    if (!orgId || !selectedRegion || regionLocked) return;

    setProvisioning(true);
    setError('');
    try {
      const json = (await invokeFunction('enterprise/provision-region', {
        org_id: orgId,
        region_code: selectedRegion.region_code,
      })) as { run_id: string };

      if (!json?.run_id) throw new Error(t('errors.missingRunId'));

      setRun({
        id: json.run_id,
        region_code: selectedRegion.region_code,
        status: 'queued',
        step: 'queued',
        progress: 0,
      });
      setShowProgress(true);
      setSelectedRegion(null);
    } catch (e) {
      setError((e as Error)?.message || t('errors.provisionFailed'));
    } finally {
      setProvisioning(false);
    }
  }, [invokeFunction, orgId, regionLocked, selectedRegion, t]);

  useEffect(() => {
    if (!orgId) return;
    loadRegions();
  }, [loadRegions, orgId]);

  useEffect(() => {
    if (!showProgress || !run?.id) return;

    const poll = async () => {
      try {
        const json = (await invokeFunction('enterprise/provisioning-status', {
          run_id: run.id,
        })) as { run: ProvisioningRun };

        if (!json?.run) return;
        setRun((prev) => ({
          ...(prev || json.run),
          ...json.run,
        }));

        if (['succeeded', 'failed', 'cancelled'].includes(json.run.status)) {
          await loadRegions();
        }
      } catch (e) {
        setError((e as Error)?.message || t('errors.statusFailed'));
      }
    };

    poll();
    const id = window.setInterval(poll, 2000);
    return () => window.clearInterval(id);
  }, [invokeFunction, loadRegions, run?.id, showProgress, t]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium text-text">{t('title')}</div>
        <div className="text-xs text-text-soft">
          {orgName ? `${orgName} · ` : ''}
          {t('orgAppliesAllWorkspaces', { count: workspaceCount })}
        </div>
      </div>

      {loadingRegions ? (
        <div className="flex items-center gap-2 text-text-soft">
          <Spinner size="sm" /> {t('loading')}
        </div>
      ) : (
        <>
          <div className="rounded-zohal border border-border bg-surface-alt p-3 text-sm text-text-soft">
            {currentPlane?.mode === 'enterprise_firebase'
              ? t('currentRegion', { region: currentPlane.region || '-' })
              : t('sharedMode')}
          </div>

          <div className="rounded-zohal border border-border bg-surface-alt p-3 text-xs text-text-soft">
            {regionLocked ? t('regionLockedBody') : t('noMigrationBody')}
          </div>

          {eligible ? (
            <DataLocalityMap
              regions={regions}
              selectedRegionCode={selectedRegion?.region_code || null}
              currentRegionCode={currentRegionCode}
              interactive={canSelectRegion}
              onSelectRegion={setSelectedRegion}
            />
          ) : (
            <div className="rounded-zohal border border-warning/40 bg-warning/10 p-4 text-sm text-text">
              <p className="mb-2 font-medium">{t('ineligibleTitle')}</p>
              <p className="text-text-soft">{ineligibleMessage}</p>
              {eligibilityReason && (
                <p className="mt-2 text-xs text-text-soft">{t('reason')}: {eligibilityReason}</p>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <Card padding="md" className="border-error/40 bg-error/10">
          <p className="text-sm text-error">{error}</p>
        </Card>
      )}

      {selectedRegion && canSelectRegion && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <Card padding="lg" className="w-full max-w-lg border-border bg-surface">
            <h3 className="mb-2 text-lg font-semibold text-text">{t('confirmTitle', { region: selectedRegion.region_code })}</h3>
            <p className="mb-4 text-sm text-text-soft">
              {t('confirmBody', { city: selectedRegion.city, country: selectedRegion.country_code })}
            </p>

            <div className="mb-4 rounded-zohal border border-border bg-surface-alt p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-text-soft">{t('compliance')}</div>
              <div className="flex flex-wrap gap-2">
                {(selectedRegion.compliance || []).map((item) => (
                  <span key={item} className="rounded bg-accent/15 px-2 py-1 text-xs text-text">{item}</span>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelectedRegion(null)}>{t('cancel')}</Button>
              <Button onClick={startProvisioning} isLoading={provisioning}>{t('confirmProvision')}</Button>
            </div>
          </Card>
        </div>
      )}

      <ProvisioningProgressModal
        open={showProgress}
        run={run}
        onClose={() => setShowProgress(false)}
      />
    </div>
  );
}
