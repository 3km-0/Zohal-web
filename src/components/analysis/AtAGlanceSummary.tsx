'use client';

import { useMemo } from 'react';
import { ShieldAlert, BarChart3, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDeadlineUrgency } from './SeverityIndicator';

export interface AtAGlanceSummaryProps {
  risks: Array<{ severity?: string; resolved?: boolean }>;
  confidences: Array<{ confidence?: string }>;
  noticeDeadline?: string | null;
  className?: string;
}

export function AtAGlanceSummary({ risks, confidences, noticeDeadline, className }: AtAGlanceSummaryProps) {
  const riskDistribution = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of risks) {
      if (r.resolved) continue;
      const s = String(r.severity || '').toLowerCase();
      if (s === 'critical') counts.critical++;
      else if (s === 'high') counts.high++;
      else if (s === 'medium') counts.medium++;
      else counts.low++;
    }
    return counts;
  }, [risks]);

  const totalOpenRisks = riskDistribution.critical + riskDistribution.high + riskDistribution.medium + riskDistribution.low;

  const confidenceDistribution = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const c of confidences) {
      const conf = String(c.confidence || 'medium').toLowerCase();
      if (conf === 'high') counts.high++;
      else if (conf === 'low') counts.low++;
      else counts.medium++;
    }
    return counts;
  }, [confidences]);

  const totalConfidence = confidenceDistribution.high + confidenceDistribution.medium + confidenceDistribution.low;

  const deadlineUrgency = useMemo(() => getDeadlineUrgency(noticeDeadline), [noticeDeadline]);

  if (totalOpenRisks === 0 && totalConfidence === 0 && !deadlineUrgency.daysRemaining) return null;

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-3 gap-3', className)}>
      {/* Risk Distribution - Mini Donut */}
      {totalOpenRisks > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-scholar border border-border bg-surface">
          <div className="relative w-12 h-12 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
              {(() => {
                const segments = [
                  { count: riskDistribution.critical, color: 'var(--error)' },
                  { count: riskDistribution.high, color: 'var(--error)' },
                  { count: riskDistribution.medium, color: 'var(--highlight)' },
                  { count: riskDistribution.low, color: 'var(--success)' },
                ].filter(s => s.count > 0);

                let offset = 0;
                const circumference = 2 * Math.PI * 15.9155;

                return segments.map((seg, i) => {
                  const pct = seg.count / totalOpenRisks;
                  const dash = pct * circumference;
                  const gap = circumference - dash;
                  const currentOffset = offset;
                  offset += pct * 100;

                  return (
                    <circle
                      key={i}
                      cx="18"
                      cy="18"
                      r="15.9155"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="3"
                      strokeDasharray={`${dash} ${gap}`}
                      strokeDashoffset={-currentOffset * circumference / 100}
                      className="transition-all duration-500"
                    />
                  );
                });
              })()}
              {/* Background ring */}
              <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--border)" strokeWidth="1" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-text">
              {totalOpenRisks}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
              <ShieldAlert className="w-3.5 h-3.5 text-error" />
              Open Risks
            </div>
            <div className="flex gap-2 mt-1 text-[10px] text-text-soft">
              {riskDistribution.critical > 0 && <span className="text-error">{riskDistribution.critical} critical</span>}
              {riskDistribution.high > 0 && <span className="text-error">{riskDistribution.high} high</span>}
              {riskDistribution.medium > 0 && <span className="text-highlight">{riskDistribution.medium} med</span>}
              {riskDistribution.low > 0 && <span className="text-success">{riskDistribution.low} low</span>}
            </div>
          </div>
        </div>
      )}

      {/* Confidence Breakdown - Stacked Bar */}
      {totalConfidence > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-scholar border border-border bg-surface">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text mb-2">
              <BarChart3 className="w-3.5 h-3.5 text-accent" />
              AI Confidence
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-surface-alt">
              {confidenceDistribution.high > 0 && (
                <div
                  className="bg-success transition-all duration-500"
                  style={{ width: `${(confidenceDistribution.high / totalConfidence) * 100}%` }}
                />
              )}
              {confidenceDistribution.medium > 0 && (
                <div
                  className="bg-highlight transition-all duration-500"
                  style={{ width: `${(confidenceDistribution.medium / totalConfidence) * 100}%` }}
                />
              )}
              {confidenceDistribution.low > 0 && (
                <div
                  className="bg-error transition-all duration-500"
                  style={{ width: `${(confidenceDistribution.low / totalConfidence) * 100}%` }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-text-soft">
              <span className="text-success">{confidenceDistribution.high} high</span>
              <span className="text-highlight">{confidenceDistribution.medium} med</span>
              <span className="text-error">{confidenceDistribution.low} low</span>
            </div>
          </div>
        </div>
      )}

      {/* Deadline Proximity */}
      {deadlineUrgency.daysRemaining !== null && (
        <div className={cn(
          'flex items-center gap-3 p-3 rounded-scholar border bg-surface',
          deadlineUrgency.urgencyLevel === 'urgent' || deadlineUrgency.urgencyLevel === 'overdue'
            ? 'border-error/30'
            : deadlineUrgency.urgencyLevel === 'approaching'
              ? 'border-highlight/30'
              : 'border-border',
        )}>
          <div className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
            deadlineUrgency.bgColor,
            deadlineUrgency.urgencyLevel === 'urgent' && 'animate-pulse',
          )}>
            <Clock className={cn('w-5 h-5', deadlineUrgency.color)} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-text">Notice Deadline</div>
            <div className={cn('text-sm font-bold', deadlineUrgency.color)}>
              {deadlineUrgency.label}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
