'use client';

import { cn } from '@/lib/utils';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

const severityConfig: Record<SeverityLevel, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: 'text-error', bg: 'bg-error/10', border: 'border-l-error', label: 'Critical' },
  high: { color: 'text-error', bg: 'bg-error/10', border: 'border-l-error', label: 'High' },
  medium: { color: 'text-highlight', bg: 'bg-highlight/10', border: 'border-l-highlight', label: 'Medium' },
  low: { color: 'text-success', bg: 'bg-success/10', border: 'border-l-success', label: 'Low' },
  unknown: { color: 'text-text-soft', bg: 'bg-surface-alt', border: 'border-l-border', label: 'Unknown' },
};

export function getSeverityConfig(severity?: string | null): (typeof severityConfig)[SeverityLevel] {
  const s = String(severity || '').toLowerCase().trim() as SeverityLevel;
  return severityConfig[s] || severityConfig.unknown;
}

export function getSeverityBorderClass(severity?: string | null): string {
  return getSeverityConfig(severity).border;
}

export function getDeadlineUrgency(dateStr: string | null | undefined): {
  daysRemaining: number | null;
  urgencyLevel: 'safe' | 'approaching' | 'urgent' | 'overdue';
  color: string;
  bgColor: string;
  label: string;
} {
  if (!dateStr) return { daysRemaining: null, urgencyLevel: 'safe', color: 'text-text-soft', bgColor: 'bg-surface-alt', label: '' };
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return { daysRemaining: null, urgencyLevel: 'safe', color: 'text-text-soft', bgColor: 'bg-surface-alt', label: '' };
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) return { daysRemaining: days, urgencyLevel: 'overdue', color: 'text-error', bgColor: 'bg-error/10', label: `${Math.abs(days)}d overdue` };
  if (days <= 7) return { daysRemaining: days, urgencyLevel: 'urgent', color: 'text-error', bgColor: 'bg-error/10', label: `${days}d remaining` };
  if (days <= 30) return { daysRemaining: days, urgencyLevel: 'approaching', color: 'text-highlight', bgColor: 'bg-highlight/10', label: `${days}d remaining` };
  if (days <= 60) return { daysRemaining: days, urgencyLevel: 'approaching', color: 'text-highlight', bgColor: 'bg-highlight/10', label: `${days}d remaining` };
  return { daysRemaining: days, urgencyLevel: 'safe', color: 'text-success', bgColor: 'bg-success/10', label: `${days}d remaining` };
}

export interface SeverityIndicatorProps {
  severity?: string | null;
  showLabel?: boolean;
  className?: string;
}

export function SeverityIndicator({ severity, showLabel = false, className }: SeverityIndicatorProps) {
  const config = getSeverityConfig(severity);
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('w-2 h-2 rounded-full', config.color.replace('text-', 'bg-'))} />
      {showLabel && <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>}
    </span>
  );
}
