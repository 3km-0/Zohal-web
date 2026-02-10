'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Calendar, Clock, FileSearch } from 'lucide-react';
import { Badge, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getDeadlineUrgency } from './SeverityIndicator';
import { RenewalTimeline } from './RenewalTimeline';

export interface DeadlineItem {
  key: string;
  title: string;
  dueDate: string | null;
  dueLabel: string;
  description: string;
  href?: string | null;
  isContractDate?: boolean;
}

export interface DeadlinesTabProps {
  items: DeadlineItem[];
  effectiveDate?: string | null;
  endDate?: string | null;
  noticeDeadline?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  onAddToCalendar?: (item: DeadlineItem) => void;
}

export function DeadlinesTab({
  items,
  effectiveDate,
  endDate,
  noticeDeadline,
  emptyTitle = 'No Deadlines',
  emptyDescription = 'No deadlines found for this contract.',
  onAddToCalendar,
}: DeadlinesTabProps) {
  // Sort by due date (chronological)
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [items]);

  if (sorted.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-4 animate-fadeInUp">
      {/* Compact timeline at top */}
      <RenewalTimeline
        effectiveDate={effectiveDate}
        noticeDeadline={noticeDeadline}
        endDate={endDate}
        compact
      />

      {/* Chronological vertical timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-3">
          {sorted.map((item, idx) => {
            const urgency = getDeadlineUrgency(item.dueDate);

            return (
              <div
                key={item.key}
                className="relative pl-12 animate-fadeInUp"
                style={{ animationDelay: `${Math.min(idx, 8) * 40}ms`, animationFillMode: 'both' }}
              >
                {/* Timeline dot */}
                <div className={cn(
                  'absolute left-3.5 top-4 w-3 h-3 rounded-full border-2 z-10',
                  urgency.urgencyLevel === 'overdue' || urgency.urgencyLevel === 'urgent'
                    ? 'bg-error border-error/30'
                    : urgency.urgencyLevel === 'approaching'
                      ? 'bg-highlight border-highlight/30'
                      : 'bg-success border-success/30',
                  urgency.urgencyLevel === 'urgent' && 'animate-pulse',
                )} />

                {/* Card */}
                <div className={cn(
                  'rounded-scholar border bg-surface p-4 shadow-[var(--shadowSm)] transition-all',
                  urgency.urgencyLevel === 'overdue' || urgency.urgencyLevel === 'urgent'
                    ? 'border-error/20'
                    : urgency.urgencyLevel === 'approaching'
                      ? 'border-highlight/20'
                      : 'border-border',
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-text">{item.title}</h4>
                      <p className="text-sm text-text-soft mt-0.5">{item.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <Badge size="sm">{item.dueLabel}</Badge>
                      {urgency.daysRemaining !== null && (
                        <span className={cn('text-xs font-bold', urgency.color)}>
                          {urgency.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    {item.href && (
                      <Link
                        href={item.href}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-accent hover:bg-accent/90 transition-colors shadow-sm"
                      >
                        <FileSearch className="w-3.5 h-3.5" />
                        View in PDF
                      </Link>
                    )}
                    {item.dueDate && onAddToCalendar && (
                      <button
                        type="button"
                        onClick={() => onAddToCalendar(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-accent-alt bg-accent-alt/10 hover:bg-accent-alt/20 border border-accent-alt/30 transition-colors"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Add to Calendar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
