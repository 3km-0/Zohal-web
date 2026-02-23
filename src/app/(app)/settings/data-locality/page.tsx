'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DataLocalityMap, type DataLocalityRegion } from '@/components/enterprise/DataLocalityMap';
import { ProvisioningProgressModal, type ProvisioningRun } from '@/components/enterprise/ProvisioningProgressModal';

interface WorkspaceLite {
  id: string;
  name: string;
}

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
  current_plane: CurrentPlane;
  regions: DataLocalityRegion[];
}

export default function DataLocalitySettingsPage() {
  const t = useTranslations('dataLocalityPage');
  const supabase = createClient();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceLite[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>('');

  const [eligible, setEligible] = useState(false);
  const [eligibilityReason, setEligibilityReason] = useState<string>('');
  const [regions, setRegions] = useState<DataLocalityRegion[]>([]);
  const [currentPlane, setCurrentPlane] = useState<CurrentPlane | null>(null);

  const [selectedRegion, setSelectedRegion] = useState<DataLocalityRegion | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [run, setRun] = useState<ProvisioningRun | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [error, setError] = useState<string>('');

  const currentRegionCode = currentPlane?.region || null;

  const functionBase = useMemo(() => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`, []);

  const invokeFunction = useCallback(async (name: string, payload: Record<string, unknown>) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) throw new Error('Not authenticated');

    const resp = await fetch(`${functionBase}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(json?.message || json?.error || `Request failed (${resp.status})`);
    }
    return json;
  }, [supabase, functionBase]);

  const loadWorkspaces = useCallback(async () => {
    if (!user) return;

    const { data: rpcWorkspaces } = await supabase.rpc('list_accessible_workspaces');
    const rows = (rpcWorkspaces || []) as Array<{ id: string; name: string }>;
    if (rows.length > 0) {
      const options = rows.map((w) => ({ id: w.id, name: w.name }));
      setWorkspaces(options);
      setWorkspaceId((prev) => prev || options[0].id);
      return;
    }

    const { data: owned } = await supabase
      .from('workspaces')
      .select('id, name')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    const fallback = ((owned || []) as Array<{ id: string; name: string }>).map((w) => ({
      id: w.id,
      name: w.name,
    }));

    setWorkspaces(fallback);
    setWorkspaceId((prev) => prev || fallback[0]?.id || '');
  }, [supabase, user]);

  const loadRegions = useCallback(async (targetWorkspaceId: string) => {
    if (!targetWorkspaceId) return;

    setLoadingRegions(true);
    setError('');
    try {
      const json = (await invokeFunction('enterprise-data-locality-regions', {
        workspace_id: targetWorkspaceId,
      })) as RegionsResponse;

      setEligible(!!json.eligible);
      setEligibilityReason(json.eligibility_reason || '');
      setRegions(Array.isArray(json.regions) ? json.regions : []);
      setCurrentPlane(json.current_plane || null);
    } catch (e) {
      setError((e as Error)?.message || t('errors.loadFailed'));
      setEligible(false);
      setRegions([]);
      setCurrentPlane(null);
    } finally {
      setLoadingRegions(false);
    }
  }, [invokeFunction, t]);

  const startProvisioning = useCallback(async () => {
    if (!workspaceId || !selectedRegion) return;

    setProvisioning(true);
    setError('');
    try {
      const json = (await invokeFunction('enterprise-provision-region', {
        workspace_id: workspaceId,
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
  }, [invokeFunction, selectedRegion, t, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadWorkspaces();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!workspaceId) return;
    loadRegions(workspaceId);
  }, [loadRegions, workspaceId]);

  useEffect(() => {
    if (!showProgress || !run?.id) return;

    const poll = async () => {
      try {
        const json = (await invokeFunction('enterprise-provisioning-status', {
          run_id: run.id,
        })) as { run: ProvisioningRun };

        if (!json?.run) return;
        setRun((prev) => ({
          ...(prev || json.run),
          ...json.run,
        }));

        if (['succeeded', 'failed', 'cancelled'].includes(json.run.status)) {
          await loadRegions(workspaceId);
        }
      } catch (e) {
        setError((e as Error)?.message || t('errors.statusFailed'));
      }
    };

    poll();
    const id = window.setInterval(poll, 2000);
    return () => window.clearInterval(id);
  }, [invokeFunction, loadRegions, run?.id, showProgress, t, workspaceId]);

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
        <div className="mx-auto max-w-5xl space-y-6">
          <Card padding="lg">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text">{t('workspaceLabel')}</h2>
                <p className="text-sm text-text-soft">{t('workspaceHint')}</p>
              </div>

              <div className="w-full sm:w-80">
                <select
                  className="w-full rounded-scholar border border-border bg-surface px-3 py-2 text-sm text-text"
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {loadingRegions ? (
              <div className="flex items-center gap-2 text-text-soft">
                <Spinner size="sm" /> {t('loading')}
              </div>
            ) : (
              <>
                <div className="mb-4 rounded-scholar border border-border bg-surface-alt p-3 text-sm text-text-soft">
                  {currentPlane?.mode === 'enterprise_firebase'
                    ? t('currentRegion', { region: currentPlane.region || '-' })
                    : t('sharedMode')}
                </div>

                {eligible ? (
                  <DataLocalityMap
                    regions={regions}
                    selectedRegionCode={selectedRegion?.region_code || null}
                    currentRegionCode={currentRegionCode}
                    onSelectRegion={setSelectedRegion}
                  />
                ) : (
                  <div className="rounded-scholar border border-warning/40 bg-warning/10 p-4 text-sm text-text">
                    <p className="mb-2 font-medium">{t('ineligibleTitle')}</p>
                    <p className="text-text-soft">{t('ineligibleBody')}</p>
                    {eligibilityReason && (
                      <p className="mt-2 text-xs text-text-soft">{t('reason')}: {eligibilityReason}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>

          {error && (
            <Card padding="md" className="border-error/40 bg-error/10">
              <p className="text-sm text-error">{error}</p>
            </Card>
          )}
        </div>
      </div>

      {selectedRegion && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <Card padding="lg" className="w-full max-w-lg border-border bg-surface">
            <h3 className="mb-2 text-lg font-semibold text-text">{t('confirmTitle', { region: selectedRegion.region_code })}</h3>
            <p className="mb-4 text-sm text-text-soft">
              {t('confirmBody', { city: selectedRegion.city, country: selectedRegion.country_code })}
            </p>

            <div className="mb-4 rounded-scholar border border-border bg-surface-alt p-3">
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
