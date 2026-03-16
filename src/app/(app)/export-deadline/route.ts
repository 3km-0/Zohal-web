import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

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
  end.setDate(end.getDate() - Number(noticeDays));
  return end.toISOString();
}

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

  const { data: verificationObject, error: verificationObjectErr } = await supabase
    .from('verification_objects')
    .select('id, current_version_id')
    .eq('document_id', documentId)
    .eq('object_type', 'contract_analysis')
    .maybeSingle();
  if (verificationObjectErr) {
    return NextResponse.json({ error: verificationObjectErr.message }, { status: 500 });
  }
  if (!verificationObject?.current_version_id) {
    return NextResponse.json({ error: 'Analysis snapshot not found' }, { status: 404 });
  }

  const { data: version, error: versionErr } = await supabase
    .from('verification_object_versions')
    .select('snapshot_json')
    .eq('id', verificationObject.current_version_id)
    .maybeSingle();
  if (versionErr) {
    return NextResponse.json({ error: versionErr.message }, { status: 500 });
  }
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
    if (actionErr) {
      return NextResponse.json({ error: actionErr.message }, { status: 500 });
    }
    if (!action?.id) {
      return NextResponse.json({ error: 'Analysis action not found' }, { status: 404 });
    }
    dateIso = action.due_at ?? null;
    title = String(action.title || action.action_kind || 'Action');
    description = String(action.summary || action.action_text || 'Action deadline');
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

