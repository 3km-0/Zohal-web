'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getDeadlineUrgency } from './SeverityIndicator';

export interface RenewalTimelineProps {
  effectiveDate?: string | null;
  noticeDeadline?: string | null;
  endDate?: string | null;
  className?: string;
  compact?: boolean;
}

interface TimelinePoint {
  date: Date;
  label: string;
  sublabel: string;
  position: number; // 0-100%
  isPast: boolean;
  urgency?: ReturnType<typeof getDeadlineUrgency>;
}

export function RenewalTimeline({ effectiveDate, noticeDeadline, endDate, className, compact = false }: RenewalTimelineProps) {
  const points = useMemo(() => {
    const pts: TimelinePoint[] = [];
    const now = new Date();

    const parseDate = (s: string | null | undefined) => {
      if (!s) return null;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const eff = parseDate(effectiveDate);
    const notice = parseDate(noticeDeadline);
    const end = parseDate(endDate);

    // Need at least effective and end to show a timeline
    if (!eff || !end) return [];

    const rangeMs = end.getTime() - eff.getTime();
    if (rangeMs <= 0) return [];

    const toPercent = (d: Date) => {
      const offset = d.getTime() - eff.getTime();
      return Math.max(0, Math.min(100, (offset / rangeMs) * 100));
    };

    pts.push({
      date: eff,
      label: eff.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      sublabel: 'Effective',
      position: 0,
      isPast: now >= eff,
    });

    if (notice) {
      const noticeUrgency = getDeadlineUrgency(noticeDeadline);
      pts.push({
        date: notice,
        label: notice.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        sublabel: noticeUrgency.label ? `Notice (${noticeUrgency.label})` : 'Notice Deadline',
        position: toPercent(notice),
        isPast: now >= notice,
        urgency: noticeUrgency,
      });
    }

    pts.push({
      date: end,
      label: end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      sublabel: 'End Date',
      position: 100,
      isPast: now >= end,
    });

    return pts;
  }, [effectiveDate, noticeDeadline, endDate]);

  const todayPosition = useMemo(() => {
    if (points.length < 2) return null;
    const eff = points[0].date;
    const end = points[points.length - 1].date;
    const now = new Date();
    const rangeMs = end.getTime() - eff.getTime();
    if (rangeMs <= 0) return null;
    const pos = ((now.getTime() - eff.getTime()) / rangeMs) * 100;
    if (pos < -2 || pos > 102) return null;
    return Math.max(0, Math.min(100, pos));
  }, [points]);

  if (points.length < 2) return null;

  return (
    // This component renders several absolutely-positioned markers/labels that can
    // extend beyond the track container. Make it non-interactive so it never
    // intercepts pointer events for the content below (e.g., deadline action buttons).
    <div className={cn('relative pointer-events-none', compact ? 'py-6' : 'py-10', className)}>
      {/* Track */}
      <div className="relative mx-8 h-1 bg-border rounded-full">
        {/* Filled portion (past) */}
        {todayPosition !== null && (
          <div
            className="absolute top-0 left-0 h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${Math.min(todayPosition, 100)}%` }}
          />
        )}

        {/* Today marker */}
        {todayPosition !== null && todayPosition >= 0 && todayPosition <= 100 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 z-10"
            style={{ left: `${todayPosition}%` }}
          >
            <div className="relative -translate-x-1/2">
              <div className="w-3 h-3 rotate-45 bg-accent border-2 border-surface" />
              <span className="absolute top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-accent whitespace-nowrap">
                Today
              </span>
            </div>
          </div>
        )}

        {/* Points */}
        {points.map((pt, idx) => {
          const isNotice = pt.sublabel.includes('Notice');
          const dotColor = pt.isPast
            ? 'bg-success border-success/30'
            : isNotice && pt.urgency
              ? pt.urgency.urgencyLevel === 'urgent' || pt.urgency.urgencyLevel === 'overdue'
                ? 'bg-error border-error/30'
                : pt.urgency.urgencyLevel === 'approaching'
                  ? 'bg-highlight border-highlight/30'
                  : 'bg-accent border-accent/30'
              : 'bg-text-soft/40 border-border';

          return (
            <div
              key={idx}
              className="absolute top-1/2 -translate-y-1/2 z-10"
              style={{ left: `${pt.position}%` }}
            >
              <div className="relative -translate-x-1/2 flex flex-col items-center">
                <div className={cn(
                  'rounded-full border-2 transition-all',
                  compact ? 'w-3 h-3' : 'w-4 h-4',
                  dotColor,
                  pt.urgency?.urgencyLevel === 'urgent' && 'animate-pulse',
                )} />
                {/* Label above for even indices, below for odd (to avoid overlap) */}
                <div className={cn(
                  'absolute whitespace-nowrap text-center',
                  idx % 2 === 0
                    ? compact ? '-top-5' : '-top-7'
                    : compact ? 'top-5' : 'top-7',
                )}>
                  <div className={cn(
                    'font-semibold',
                    compact ? 'text-[10px]' : 'text-xs',
                    pt.isPast ? 'text-text-soft' : 'text-text',
                  )}>
                    {pt.label}
                  </div>
                  <div className={cn(
                    compact ? 'text-[9px]' : 'text-[10px]',
                    'uppercase tracking-wider',
                    isNotice && pt.urgency ? pt.urgency.color : 'text-text-soft',
                  )}>
                    {pt.sublabel}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
