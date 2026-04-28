import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

type AcquisitionVisitRequest = {
  workspace_id: string;
  opportunity_id: string;
  title?: string | null;
  description?: string | null;
  start_iso?: string | null;
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function defaultVisitStart(): Date {
  const d = addDays(new Date(), 2);
  d.setHours(12, 0, 0, 0);
  return d;
}

function googleDateTime(date: Date): string {
  return date.toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AcquisitionVisitRequest>;
    const workspaceId = String(body.workspace_id || '').trim();
    const opportunityId = String(body.opportunity_id || '').trim();

    if (!workspaceId || !opportunityId) {
      return NextResponse.json({ error: 'Missing workspace_id or opportunity_id' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: opportunity, error: opportunityErr } = await supabase
      .from('acquisition_opportunities')
      .select('id,workspace_id,title,summary,stage')
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (opportunityErr) return NextResponse.json({ error: opportunityErr.message }, { status: 500 });
    if (!opportunity?.id) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });

    const { data: integration } = await supabase
      .from('integration_accounts')
      .select('provider, status, access_token')
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

    const start = body.start_iso ? new Date(body.start_iso) : defaultVisitStart();
    if (Number.isNaN(start.getTime())) return NextResponse.json({ error: 'Invalid start_iso' }, { status: 400 });
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const event = {
      summary: body.title || `Property visit: ${opportunity.title || opportunity.summary || 'Acquisition opportunity'}`,
      description: [
        body.description || opportunity.summary || 'Zohal acquisition workspace visit.',
        `Workspace: ${workspaceId}`,
        `Opportunity: ${opportunityId}`,
      ].filter(Boolean).join('\n\n'),
      start: { dateTime: googleDateTime(start) },
      end: { dateTime: googleDateTime(end) },
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
      if (googleRes.status === 401) {
        return NextResponse.json({ error: 'Google auth expired. Please reconnect Google in Settings and try again.' }, { status: 401 });
      }
      if (googleRes.status === 403) {
        return NextResponse.json({ error: 'Google Calendar access denied. Reconnect Google with calendar permissions.' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Failed to create Google Calendar event', details: text }, { status: 502 });
    }

    const json = (await googleRes.json().catch(() => null)) as { id?: string; htmlLink?: string } | null;
    const { error: stageError } = await supabase
      .from('acquisition_opportunities')
      .update({ stage: 'visit_requested' })
      .eq('id', opportunityId);
    if (stageError) return NextResponse.json({ error: stageError.message }, { status: 500 });

    await supabase.from('acquisition_events').insert({
      opportunity_id: opportunityId,
      workspace_id: workspaceId,
      event_type: 'schedule_visit',
      event_direction: 'operator',
      body_text: 'Google Calendar visit created.',
      event_payload: {
        source: 'web_acquisition_action',
        action_id: 'schedule_visit',
        google_event_id: json?.id || null,
        html_link: json?.htmlLink || null,
        start_iso: start.toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      google_event_id: json?.id || null,
      html_link: json?.htmlLink || null,
      start_iso: start.toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to schedule visit' }, { status: 500 });
  }
}
