import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { getSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { ensureDb } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST() {
  const s = await getSession();
  if (s) { await ensureDb(); await logAudit({ userId: s.sub, username: s.username, action: 'LOGOUT', entity: 'auth', entityId: s.sub, ip: 'session' }); }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}
