import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatIcsDateValue(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function buildAllDayIcs(opts: { uid: string; title: string; description: string; date: Date }) {
  const start = new Date(opts.date.getTime());
  const end = new Date(opts.date.getTime());
  end.setDate(end.getDate() + 1); // all-day is exclusive of DTEND

  const dtStamp = new Date();
  const dtStampValue = `${dtStamp.getUTCFullYear()}${pad2(dtStamp.getUTCMonth() + 1)}${pad2(dtStamp.getUTCDate())}T${pad2(
    dtStamp.getUTCHours()
  )}${pad2(dtStamp.getUTCMinutes())}${pad2(dtStamp.getUTCSeconds())}Z`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zohal//Deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${dtStampValue}`,
    `DTSTART;VALUE=DATE:${formatIcsDateValue(start)}`,
    `DTEND;VALUE=DATE:${formatIcsDateValue(end)}`,
    `SUMMARY:${escapeIcsText(opts.title)}`,
    `DESCRIPTION:${escapeIcsText(opts.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const documentId = url.searchParams.get('document_id');
  const key = url.searchParams.get('key');

  if (!documentId || !key) {
    return NextResponse.json({ error: 'Missing document_id or key' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Load contract to resolve contract-level dates and to scope obligations.
  const { data: contract, error: contractErr } = await supabase
    .from('legal_contracts')
    .select('id, counterparty_name, effective_date, end_date, notice_period_days, auto_renewal')
    .eq('document_id', documentId)
    .maybeSingle();
  if (contractErr) {
    return NextResponse.json({ error: contractErr.message }, { status: 500 });
  }
  if (!contract?.id) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

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
        const d = new Date(end.getTime());
        d.setDate(d.getDate() - Number(contract.notice_period_days));
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
    if (obErr) {
      return NextResponse.json({ error: obErr.message }, { status: 500 });
    }
    if (!ob?.id) {
      return NextResponse.json({ error: 'Obligation not found' }, { status: 404 });
    }
    dateIso = ob.due_at ?? null;
    title = String(ob.obligation_type || 'Obligation');
    description = String(ob.summary || ob.action || 'Obligation deadline');
  } else {
    return NextResponse.json({ error: 'Unknown key' }, { status: 400 });
  }

  if (!dateIso) {
    return NextResponse.json({ error: 'Missing due date for this item' }, { status: 400 });
  }

  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid due date' }, { status: 400 });
  }

  // Make it an all-day event, like iOS does for deadlines.
  const uid = `zohal-${documentId}-${key}-${Date.now()}@zohal.ai`;
  const ics = buildAllDayIcs({ uid, title, description, date });

  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  const filename = `${safe || 'deadline'}.ics`;

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

