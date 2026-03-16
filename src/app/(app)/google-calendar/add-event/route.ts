import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

type AddEventRequest = {
  document_id: string;
  key: string;
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function getSnapshotVariableValue(snapshot: Record<string, unknown>, name: string): unknown {
  const variables = Array.isArray(snapshot.variables) ? snapshot.variables as Array<Record<string, unknown>> : [];
  return variables.find((variable) => String(variable?.name || '') === name)?.value;
}

function computeNoticeDeadlineIso(endDateValue: unknown, noticeDaysValue: unknown): string | null {
  const endDateIso = typeof endDateValue === 'string' ? endDateValue : null;
  const noticeDays = typeof noticeDaysValue === 'number'
    ? noticeDaysValue
    : typeof noticeDaysValue === 'string' && noticeDaysValue.trim()
      ? Number(noticeDaysValue)
      : null;
  if (!endDateIso || noticeDays == null || !Number.isFinite(noticeDays)) return null;
  const end = new Date(endDateIso);
  if (Number.isNaN(end.getTime())) return null;
  return addDays(end, -Number(noticeDays)).toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AddEventRequest>;
    const documentId = String(body.document_id || '').trim();
    const key = String(body.key || '').trim();

    if (!documentId || !key) {
      return NextResponse.json({ error: 'Missing document_id or key' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Require a connected Google integration (provider is google_drive in this system).
    const { data: integration } = await supabase
      .from('integration_accounts')
      .select('provider, status, access_token, token_expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'google_drive')
      .eq('status', 'active')
      .maybeSingle();

    const accessToken = integration?.access_token || null;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google is not connected (missing access token). Reconnect in Settings.' },
        { status: 409 }
      );
    }

    const { data: verificationObject, error: verificationObjectErr } = await supabase
      .from('verification_objects')
      .select('id, current_version_id')
      .eq('document_id', documentId)
      .eq('object_type', 'contract_analysis')
      .maybeSingle();
    if (verificationObjectErr) return NextResponse.json({ error: verificationObjectErr.message }, { status: 500 });
    if (!verificationObject?.current_version_id) return NextResponse.json({ error: 'Analysis snapshot not found' }, { status: 404 });

    const { data: version, error: versionErr } = await supabase
      .from('verification_object_versions')
      .select('snapshot_json')
      .eq('id', verificationObject.current_version_id)
      .maybeSingle();
    if (versionErr) return NextResponse.json({ error: versionErr.message }, { status: 500 });
    const snapshot = (version?.snapshot_json || {}) as Record<string, unknown>;

    let title = 'Deadline';
    let description = 'Deadline';
    let dateIso: string | null = null;
    const counterpartyName = typeof getSnapshotVariableValue(snapshot, 'counterparty_name') === 'string'
      ? String(getSnapshotVariableValue(snapshot, 'counterparty_name'))
      : null;
    const endDate = typeof getSnapshotVariableValue(snapshot, 'end_date') === 'string'
      ? String(getSnapshotVariableValue(snapshot, 'end_date'))
      : null;
    const noticePeriodDays = getSnapshotVariableValue(snapshot, 'notice_period_days');
    const autoRenewal = Boolean(getSnapshotVariableValue(snapshot, 'auto_renewal'));

    if (key === 'contract_end') {
      dateIso = endDate;
      title = 'Contract End Date';
      description = `Contract term ends${counterpartyName ? ` • ${counterpartyName}` : ''}`;
    } else if (key === 'renewal') {
      if (!autoRenewal) {
        return NextResponse.json({ error: 'Auto-renewal not available for this analysis' }, { status: 404 });
      }
      dateIso = endDate;
      title = 'Auto-Renewal Date';
      description = `Contract renews automatically unless notice is given${counterpartyName ? ` • ${counterpartyName}` : ''}`;
    } else if (key === 'notice_deadline') {
      dateIso = computeNoticeDeadlineIso(endDate, noticePeriodDays);
      title = 'Notice Deadline';
      description = `Last day to provide ${noticePeriodDays ?? ''}-day notice`;
    } else if (key.startsWith('ob_')) {
      const actionId = key.slice(3);
      const { data: action, error: actionErr } = await supabase
        .from('analysis_actions')
        .select('id, due_at, title, summary, action_text, action_kind')
        .eq('id', actionId)
        .eq('document_id', documentId)
        .maybeSingle();
      if (actionErr) return NextResponse.json({ error: actionErr.message }, { status: 500 });
      if (!action?.id) return NextResponse.json({ error: 'Analysis action not found' }, { status: 404 });

      dateIso = action.due_at ?? null;
      title = String(action.title || action.action_kind || 'Action');
      description = String(action.action_text || action.summary || 'Action deadline');
    } else {
      return NextResponse.json({ error: 'Unknown key' }, { status: 400 });
    }

    if (!dateIso) return NextResponse.json({ error: 'Missing due date for this item' }, { status: 400 });
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'Invalid due date' }, { status: 400 });

    // iOS creates all-day events for deadlines. Use date-only in Google Calendar.
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const end = addDays(new Date(`${dateStr}T00:00:00`), 1);
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    const event = {
      summary: title,
      description,
      start: { date: dateStr },
      end: { date: endStr },
      reminders: { useDefault: true },
    };

    const googleRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!googleRes.ok) {
      const text = await googleRes.text().catch(() => '');
      // Don’t leak tokens; return minimal info.
      const status = googleRes.status;
      if (status === 401) {
        return NextResponse.json(
          { error: 'Google auth expired. Please reconnect Google in Settings and try again.' },
          { status: 401 }
        );
      }
      if (status === 403) {
        return NextResponse.json(
          {
            error:
              'Google Calendar access denied. Ensure Calendar API is enabled and reconnect Google with calendar permissions.',
          },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Failed to create Google Calendar event', details: text }, { status: 502 });
    }

    const json = (await googleRes.json().catch(() => null)) as { id?: string; htmlLink?: string } | null;

    // Build a link that opens Google Calendar's day view at the event's date
    // so the user lands on the correct month/day instead of the current week.
    const calendarDayLink = `https://calendar.google.com/calendar/r/day/${yyyy}/${date.getMonth() + 1}/${date.getDate()}`;

    return NextResponse.json({
      ok: true,
      google_event_id: json?.id || null,
      html_link: json?.htmlLink || null,
      calendar_day_link: calendarDayLink,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to add event' },
      { status: 500 }
    );
  }
}

