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

    // Resolve the clicked deadline from the canonical contract/obligation records.
    const { data: contract, error: contractErr } = await supabase
      .from('legal_contracts')
      .select('id, counterparty_name, effective_date, end_date, notice_period_days, auto_renewal')
      .eq('document_id', documentId)
      .maybeSingle();
    if (contractErr) return NextResponse.json({ error: contractErr.message }, { status: 500 });
    if (!contract?.id) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

    let title = 'Deadline';
    let description = 'Deadline';
    let dateIso: string | null = null;

    if (key === 'contract_end') {
      dateIso = contract.end_date ?? null;
      title = 'Contract End Date';
      description = `Contract term ends${contract.counterparty_name ? ` • ${contract.counterparty_name}` : ''}`;
    } else if (key === 'renewal') {
      dateIso = contract.end_date ?? null;
      title = 'Auto-Renewal Date';
      description = `Contract renews automatically unless notice is given${contract.counterparty_name ? ` • ${contract.counterparty_name}` : ''}`;
    } else if (key === 'notice_deadline') {
      if (contract.end_date && contract.notice_period_days != null) {
        const end = new Date(contract.end_date);
        if (!Number.isNaN(end.getTime())) {
          const d = addDays(end, -Number(contract.notice_period_days));
          dateIso = d.toISOString();
        }
      }
      title = 'Notice Deadline';
      description = `Last day to provide ${contract.notice_period_days ?? ''}-day notice`;
    } else if (key.startsWith('ob_')) {
      const obligationId = key.slice(3);
      const { data: ob, error: obErr } = await supabase
        .from('legal_obligations')
        .select('id, due_at, summary, action, obligation_type')
        .eq('id', obligationId)
        .eq('contract_id', contract.id)
        .maybeSingle();
      if (obErr) return NextResponse.json({ error: obErr.message }, { status: 500 });
      if (!ob?.id) return NextResponse.json({ error: 'Obligation not found' }, { status: 404 });

      dateIso = ob.due_at ?? null;
      title = String(ob.summary || ob.obligation_type || 'Obligation');
      description = String(ob.action || ob.summary || 'Obligation deadline');
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

