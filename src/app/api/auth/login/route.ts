import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, ensureDb } from '@/lib/store';
import { signSession, COOKIE_NAME, cookieOptions } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { logAudit } from '@/lib/audit';
import { clientIp, NO_STORE } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
  geo: z.object({
    lat: z.number(), lng: z.number(), accuracy: z.number(),
    ts: z.string(), status: z.enum(['ok', 'denied', 'unavailable']).optional(),
  }).nullable().optional(),
  device: z.object({
    ua: z.string().max(400), browser: z.string().max(40),
    os: z.string().max(40), deviceType: z.enum(['mobile', 'tablet', 'desktop']),
  }).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const addr = clientIp(req);
  // Per-IP budget stops password spraying from one source…
  const rl = rateLimit(`login:${addr}`, 8, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rl.retryAfter) } });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: NO_STORE }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid username or password' }, { status: 400, headers: NO_STORE });

  const { username, password, geo, device } = parsed.data;

  // …and a per-account budget stops a distributed attack on one known account.
  const acct = rateLimit(`login-acct:${username.toLowerCase()}`, 10, 15 * 60_000);
  if (!acct.ok) return NextResponse.json({ error: 'Too many attempts for this account. Try again later.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(acct.retryAfter) } });

  await ensureDb();
  const user = db().users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  // Constant-ish time: always run a compare.
  // A real bcrypt hash of a random value, so the compare cost is identical for
  // unknown users — no timing signal that reveals which usernames exist.
  const hash = user?.passwordHash || '$2a$12$C6UzMDM.H6dfI/f/IKcEe.9tPmpEEhcOZfVfvzHqAaFvyj0OTOEBu';
  const valid = await bcrypt.compare(password, hash);

  if (!user || !user.active || !valid) {
    await logAudit({ userId: user?.id || 'unknown', username, action: 'LOGIN_FAIL', entity: 'auth', entityId: '', ip: addr, geo: geo ?? null, device: device ?? null });
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401, headers: NO_STORE });
  }

  const token = await signSession({ sub: user.id, username: user.username, name: user.name, role: user.role });
  await logAudit({ userId: user.id, username: user.username, action: 'LOGIN', entity: 'auth', entityId: user.id, ip: addr, geo: geo ?? null, device: device ?? null });

  const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, name: user.name, role: user.role } }, { headers: NO_STORE });
  res.cookies.set(COOKIE_NAME, token, cookieOptions);
  return res;
}
