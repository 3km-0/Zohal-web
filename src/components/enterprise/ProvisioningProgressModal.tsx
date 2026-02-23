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
    validating: 'Validating Workspace',
    creating_kms: 'Creating CMEK (KMS)',
    creating_bucket: 'Creating Regional Bucket',
    applying_iam: 'Applying IAM',
    updating_control_plane: 'Activating Workspace Routing',
    done: 'Completed',
    error: 'Error',
  };
  return mapping[step] || step;
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
            <p>{run.error_message || 'An unexpected error occurred while provisioning.'}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
