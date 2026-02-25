'use client';

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface ProvisioningRun {
  id: string;
  region_code: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  step: string;
  progress: number;
  error_code?: string | null;
  error_message?: string | null;
}

interface ProvisioningProgressModalProps {
  open: boolean;
  run: ProvisioningRun | null;
  onClose: () => void;
}

const STEP_ORDER = [
  'queued',
  'validating',
  'creating_kms',
  'creating_bucket',
  'applying_iam',
  'updating_control_plane',
  'done',
];

function humanStep(step: string): string {
  const mapping: Record<string, string> = {
    queued: 'Queued',
    validating: 'Validating Organization',
    creating_kms: 'Creating CMEK (KMS)',
    creating_bucket: 'Creating Regional Bucket',
    applying_iam: 'Applying IAM',
    updating_control_plane: 'Activating Organization Routing',
    done: 'Completed',
    error: 'Error',
  };
  return mapping[step] || step;
}

function userFacingProvisioningError(run: ProvisioningRun): string {
  const code = String(run.error_code || '').toLowerCase();
  const raw = String(run.error_message || '').toLowerCase();

  if (code === 'kms_api_disabled') return 'Cloud KMS is not enabled for this project. Please enable it and retry.';
  if (code === 'kms_permission_denied') return 'Provisioning service account lacks Cloud KMS permissions.';
  if (code === 'storage_permission_denied') return 'Provisioning service account lacks Cloud Storage permissions.';
  if (code === 'kms_key_not_ready') return 'Cloud KMS key was not ready in time. Please retry in 1-2 minutes.';
  if (code === 'not_eligible') return 'Your organization is not eligible to configure data locality.';
  if (code === 'region_unavailable') return 'The selected region is currently unavailable. Please choose a different region.';
  if (code === 'control_plane_update_failed') return 'Provisioning completed partially but routing activation failed. Please contact support.';
  if (code === 'service_account_config_invalid' || code === 'service_account_auth_failed') {
    return 'Provisioning credentials are not configured correctly. Please contact support.';
  }
  if (code === 'provisioning_failed') return 'Provisioning failed due to a cloud configuration issue. Please contact support.';
  if (code === 'transient_error') return 'Temporary provisioning issue. Please retry shortly.';

  if (raw.includes('<!doctype html>') || raw.includes('<html')) {
    return 'Provisioning failed due to a cloud configuration issue. Please retry, and contact support if it continues.';
  }
  if (raw.includes('data_locality_kms_')) {
    return 'Cloud KMS provisioning failed. Please verify KMS API and permissions, then retry.';
  }
  if (raw.includes('data_locality_bucket_')) {
    return 'Cloud Storage provisioning failed due to permissions. Please verify service account roles and retry.';
  }

  return 'Provisioning failed due to a cloud configuration issue. Please contact support.';
}

export function ProvisioningProgressModal({ open, run, onClose }: ProvisioningProgressModalProps) {
  if (!open || !run) return null;

  const stepIndex = STEP_ORDER.indexOf(run.step);
  const terminal = run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card padding="lg" className="w-full max-w-lg border-border bg-surface shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-text">Provisioning Region: {run.region_code}</h3>
            <p className="text-sm text-text-soft">Status: {run.status}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-alt">
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.max(0, Math.min(100, run.progress || 0))}%` }} />
        </div>

        <div className="space-y-2">
          {STEP_ORDER.map((step, idx) => {
            const complete = step === 'done' ? run.status === 'succeeded' : idx < stepIndex;
            const active = !terminal && idx === stepIndex;
            const failed = run.status === 'failed' && (step === run.step || (run.step === 'error' && idx === stepIndex));

            return (
              <div key={step} className={cn('flex items-center gap-2 rounded-scholar border px-3 py-2', active ? 'border-accent bg-accent/10' : 'border-border')}>
                {complete ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : failed ? (
                  <XCircle className="h-4 w-4 text-error" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-border" />
                )}
                <span className={cn('text-sm', complete ? 'text-text' : 'text-text-soft')}>{humanStep(step)}</span>
              </div>
            );
          })}
        </div>

        {run.status === 'failed' && (
          <div className="mt-4 rounded-scholar border border-error/40 bg-error/10 p-3 text-sm text-error">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" /> Provisioning failed
            </div>
            <p>{userFacingProvisioningError(run)}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
