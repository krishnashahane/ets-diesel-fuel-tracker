import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, nextId, ensureDb, saveNewUser, saveUserUpdate } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { clientIp } from '@/lib/security';
import type { Role, User } from '@/lib/types';

export const runtime = 'nodejs';

const safe = (u: User) => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt });
const err = (e: unknown) => e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });

export async function GET() {
  try {
    await requirePerm('user:manage');
    await ensureDb();
    return NextResponse.json({ items: db().users.map(safe) });
  } catch (e) { return err(e); }
}

const createSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  name: z.string().min(1).max(120),
  role: z.enum(['superadmin', 'admin', 'operations', 'site_rep', 'supervisor', 'driver']),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const s = await requirePerm('user:manage');
    await ensureDb();
    const p = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!p.success) return NextResponse.json({ error: 'Invalid input', issues: p.error.flatten() }, { status: 400 });
    if (p.data.role === 'superadmin' && s.role !== 'superadmin') return NextResponse.json({ error: 'Only superadmin can create superadmin' }, { status: 403 });
    const d = db();
    if (d.users.some((u) => u.username.toLowerCase() === p.data.username.toLowerCase())) return NextResponse.json({ error: 'Username exists' }, { status: 409 });
    const user: User = {
      id: nextId('U'), username: p.data.username, name: p.data.name, role: p.data.role as Role,
      passwordHash: await bcrypt.hash(p.data.password, 12), active: true, createdAt: new Date().toISOString(),
    };
    await saveNewUser(user);
    await logAudit({ userId: s.sub, username: s.username, action: 'USER_CREATE', entity: 'user', entityId: user.id, ip: clientIp(req), detail: user.username });
    return NextResponse.json({ ok: true, user: safe(user) });
  } catch (e) { return err(e); }
}

const patchSchema = z.object({ id: z.string(), active: z.boolean().optional(), password: z.string().min(8).max(200).optional() });

export async function PATCH(req: NextRequest) {
  try {
    const s = await requirePerm('user:manage');
    await ensureDb();
    const p = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!p.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    const d = db();
    const u = d.users.find((x) => x.id === p.data.id);
    if (!u) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (u.role === 'superadmin' && s.role !== 'superadmin') return NextResponse.json({ error: 'Cannot modify superadmin' }, { status: 403 });
    if (p.data.active !== undefined) {
      if (u.id === s.sub && !p.data.active) return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 400 });
      u.active = p.data.active;
    }
    if (p.data.password) u.passwordHash = await bcrypt.hash(p.data.password, 12);
    await saveUserUpdate(u);
    await logAudit({ userId: s.sub, username: s.username, action: 'USER_UPDATE', entity: 'user', entityId: u.id, ip: clientIp(req), detail: p.data.password ? 'password reset' : `active=${u.active}` });
    return NextResponse.json({ ok: true, user: safe(u) });
  } catch (e) { return err(e); }
}
