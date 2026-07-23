import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, ensureDb } from '@/lib/store';
import { signSession, COOKIE_NAME, cookieOptions } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

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

function ip(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

export async function POST(req: NextRequest) {
  const addr = ip(req);
  const rl = rateLimit(`login:${addr}`, 8, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });

  const { username, password, geo, device } = parsed.data;
  await ensureDb();
  const user = db().users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  // Constant-ish time: always run a compare.
  const hash = user?.passwordHash || '$2a$12$0000000000000000000000000000000000000000000000000000';
  const valid = await bcrypt.compare(password, hash);

  if (!user || !user.active || !valid) {
    await logAudit({ userId: user?.id || 'unknown', username, action: 'LOGIN_FAIL', entity: 'auth', entityId: '', ip: addr, geo: geo ?? null, device: device ?? null });
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const token = await signSession({ sub: user.id, username: user.username, name: user.name, role: user.role });
  await logAudit({ userId: user.id, username: user.username, action: 'LOGIN', entity: 'auth', entityId: user.id, ip: addr, geo: geo ?? null, device: device ?? null });

  const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  res.cookies.set(COOKIE_NAME, token, cookieOptions);
  return res;
}
