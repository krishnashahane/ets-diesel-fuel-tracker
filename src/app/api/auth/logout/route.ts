import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, cookieOptions } from '@/lib/auth';
import { getSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { ensureDb } from '@/lib/store';
import { clientIp, NO_STORE } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (s) { await ensureDb(); await logAudit({ userId: s.sub, username: s.username, action: 'LOGOUT', entity: 'auth', entityId: s.sub, ip: clientIp(req) }); }
  const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
  // Clear with the same attributes it was set with, otherwise the browser keeps it.
  res.cookies.set(COOKIE_NAME, '', { ...cookieOptions, maxAge: 0 });
  return res;
}
