'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar, FileSearch, Check, Loader2, Link2, ExternalLink } from 'lucide-react';
import { Badge, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
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
  documentId: string;
  effectiveDate?: string | null;
  endDate?: string | null;
  noticeDeadline?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
}

type CalItemState = 'idle' | 'loading' | 'done' | 'error' | 'needs-google';

export function DeadlinesTab({
  items,
  documentId,
  effectiveDate,
  endDate,
  noticeDeadline,
  emptyTitle = 'No Deadlines',
  emptyDescription = 'No deadlines found for this contract.',
}: DeadlinesTabProps) {
  const [calendarState, setCalendarState] = useState<Record<string, CalItemState>>({});
  const [calendarLinks, setCalendarLinks] = useState<Record<string, string>>({});
  // If any request returns 409/401/403, show the connect banner for all items
  const [needsGoogle, setNeedsGoogle] = useState(false);
  const [connecting, setConnecting] = useState(false);

  async function connectGoogle() {
    setConnecting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?integration=google_drive&popup=1`,
          scopes:
            'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/calendar.events',
          queryParams: { access_type: 'offline', prompt: 'consent' },
          skipBrowserRedirect: true,
        },
      });
      if (error || !data?.url) {
        console.error('[DeadlinesTab] Google OAuth error:', error);
        setConnecting(false);
        return;
      }

      // Open OAuth in a centered popup so the user never leaves the page
      const w = 500;
      const h = 620;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        data.url,
        'zohal-google-auth',
        `width=${w},height=${h},left=${left},top=${top},popup=yes`,
      );

      // Listen for the callback page to signal success via postMessage
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === 'zohal:oauth-done') {
          window.removeEventListener('message', onMessage);
          clearInterval(checkClosed);
          setNeedsGoogle(false);
          setConnecting(false);
          // Reset all "needs-google" items back to idle so user can click again
          setCalendarState((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (next[key] === 'needs-google') next[key] = 'idle';
            }
            return next;
          });
        }
      };
      window.addEventListener('message', onMessage);

      // Poll for popup closed (user may close without completing OAuth)
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', onMessage);
          setConnecting(false);
        }
      }, 500);
    } catch (err) {
      console.error('[DeadlinesTab] connectGoogle error:', err);
      setConnecting(false);
    }
  }

  async function addToGoogleCalendar(item: DeadlineItem) {
    const current = calendarState[item.key];
    if (current === 'loading' || current === 'done') return;

    setCalendarState((prev) => ({ ...prev, [item.key]: 'loading' }));
    try {
      const res = await fetch('/google-calendar/add-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, key: item.key }),
      });
      const body = await res.json().catch(() => ({ error: 'Unknown error' }));
      if (!res.ok) {
        // Google not connected or token expired — show connect prompt
        if (res.status === 409 || res.status === 401 || res.status === 403) {
          setNeedsGoogle(true);
          setCalendarState((prev) => ({ ...prev, [item.key]: 'needs-google' }));
          return;
        }
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setCalendarState((prev) => ({ ...prev, [item.key]: 'done' }));
      // Prefer the day-view link so Google Calendar opens on the event's date
      const link = body.calendar_day_link || body.html_link;
      if (link) {
        setCalendarLinks((prev) => ({ ...prev, [item.key]: link }));
      }
    } catch (err) {
      console.error('[DeadlinesTab] Google Calendar error:', err);
      setCalendarState((prev) => ({ ...prev, [item.key]: 'error' }));
      setTimeout(() => setCalendarState((prev) => ({ ...prev, [item.key]: 'idle' })), 3000);
    }
  }

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

      {/* Google connect banner — shown when any calendar request needs auth */}
      {needsGoogle && (
        <div className="flex items-center gap-3 p-4 rounded-scholar border border-accent-alt/30 bg-accent-alt/5 animate-fadeInUp">
          <Link2 className="w-5 h-5 text-accent-alt flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text">Connect Google to add calendar events</p>
            <p className="text-xs text-text-soft mt-0.5">
              Grant calendar permissions so Zohal can create events directly in your Google Calendar.
            </p>
          </div>
          <button
            type="button"
            disabled={connecting}
            onClick={connectGoogle}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white bg-accent hover:bg-accent/90 transition-colors shadow-sm flex-shrink-0"
          >
            {connecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {connecting ? 'Connecting…' : 'Connect Google'}
          </button>
        </div>
      )}

      {/* Chronological vertical timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-3">
          {sorted.map((item, idx) => {
            const urgency = getDeadlineUrgency(item.dueDate);
            const calState = calendarState[item.key] || 'idle';

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
                    {item.dueDate && calState === 'done' ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-success bg-success/10 border border-success/30">
                          <Check className="w-3.5 h-3.5" />
                          Added!
                        </span>
                        {calendarLinks[item.key] && (
                          <a
                            href={calendarLinks[item.key]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/20 border border-accent/30 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open in Google Calendar
                          </a>
                        )}
                      </>
                    ) : item.dueDate ? (
                      <button
                        type="button"
                        disabled={calState === 'loading'}
                        onClick={() => {
                          if (needsGoogle) {
                            connectGoogle();
                          } else {
                            addToGoogleCalendar(item);
                          }
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
                          calState === 'needs-google'
                            ? 'text-accent-alt bg-accent-alt/10 border border-accent-alt/30 hover:bg-accent-alt/20'
                            : calState === 'error'
                              ? 'text-error bg-error/10 border border-error/30'
                              : 'text-accent-alt bg-accent-alt/10 hover:bg-accent-alt/20 border border-accent-alt/30',
                        )}
                      >
                        {calState === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {(calState === 'error' || calState === 'idle' || calState === 'needs-google') && <Calendar className="w-3.5 h-3.5" />}
                        {calState === 'needs-google'
                          ? 'Connect & Add'
                          : calState === 'error'
                            ? 'Failed — retry?'
                            : 'Add to Calendar'}
                      </button>
                    ) : null}
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
