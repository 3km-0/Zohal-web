import { createHash, createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

function cookieNameForToken(token: string): string {
  const normalized = token.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return `zohal_share_unlock_${normalized}`;
}

function signUnlockToken(token: string, passwordHash: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createHmac('sha256', secret).update(`${token}:${passwordHash}`).digest('hex');
}

function hashPassword(salt: string, password: string): string {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const body = await request.json().catch(() => null);
  const password = String(body?.password || '').trim();
  if (!token || !password) {
    return NextResponse.json({ ok: false, message: 'Missing token or password' }, { status: 400 });
  }

  const supabase = await createServiceClient();

  const { data: reportRaw, error: reportError } = await supabase
    .from('generated_reports')
    .select('id, is_password_protected, password_salt, password_hash, failed_attempts, locked_until')
    .eq('share_token', token)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const report = (reportRaw as {
    id: string;
    is_password_protected?: boolean | null;
    password_salt?: string | null;
    password_hash?: string | null;
    failed_attempts?: number | null;
    locked_until?: string | null;
  } | null);

  if (reportError || !report) {
    return NextResponse.json({ ok: false, message: 'Share link not found' }, { status: 404 });
  }

  if (report.is_password_protected !== true) {
    return NextResponse.json({ ok: true, unlocked: true });
  }

  const lockedUntil = report.locked_until ? new Date(String(report.locked_until)) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return NextResponse.json(
      { ok: false, message: `Too many attempts. Try again after ${lockedUntil.toLocaleTimeString()}.` },
      { status: 429 }
    );
  }

  const salt = String(report.password_salt || '');
  const expectedHash = String(report.password_hash || '');
  if (!salt || !expectedHash) {
    return NextResponse.json({ ok: false, message: 'Password configuration is invalid' }, { status: 500 });
  }

  const matches = hashPassword(salt, password) === expectedHash;
  if (!matches) {
    const attempts = Number(report.failed_attempts || 0) + 1;
    const shouldLock = attempts >= 5;
    await supabase
      .from('generated_reports')
      .update({
        failed_attempts: attempts,
        locked_until: shouldLock ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
      })
      .eq('id', report.id);

    return NextResponse.json(
      {
        ok: false,
        message: shouldLock ? 'Too many attempts. Try again in 15 minutes.' : 'Invalid access code.',
      },
      { status: 401 }
    );
  }

  await supabase
    .from('generated_reports')
    .update({ failed_attempts: 0, locked_until: null })
    .eq('id', report.id);

  const response = NextResponse.json({ ok: true, unlocked: true });
  response.cookies.set({
    name: cookieNameForToken(token),
    value: signUnlockToken(token, expectedHash),
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60,
    path: `/share/verification/${token}`,
  });
  return response;
}
