import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureDb, snapshot, restore } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { clientIp, NO_STORE } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const err = (e: unknown) => e instanceof AuthError
  ? NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE })
  : NextResponse.json({ error: 'Server error' }, { status: 500, headers: NO_STORE });

// Restoring writes straight into the durable store, so the payload is validated
// structurally rather than trusted. `.strip()` on every object also removes
// __proto__ / constructor keys, so a crafted backup cannot pollute prototypes.
const ROLES = ['superadmin', 'admin', 'operations', 'site_rep', 'supervisor', 'driver'] as const;
const restoreSchema = z.object({
  version: z.number().optional(),
  exportedAt: z.string().max(40).optional(),
  settings: z.object({
    ocrEnabled: z.boolean(),
    ocrThreshold: z.number().int().min(0).max(100),
    requirePhotos: z.boolean(),
  }).partial().optional(),
  users: z.array(z.object({
    id: z.string().min(1).max(64),
    username: z.string().min(1).max(64),
    name: z.string().max(120),
    role: z.enum(ROLES),
    passwordHash: z.string().min(10).max(200),
    active: z.boolean(),
    createdAt: z.string().max(40),
  })).max(10_000).default([]),
  transactions: z.array(z.object({ id: z.string().min(1).max(64) }).passthrough()).max(200_000).default([]),
  masters: z.object({
    vehicles: z.array(z.object({ vehicleNo: z.string().min(1).max(40) }).passthrough()).max(50_000).optional(),
    drivers: z.array(z.object({ id: z.string().min(1).max(64) }).passthrough()).max(50_000).optional(),
    pumps: z.array(z.object({ id: z.string().min(1).max(64) }).passthrough()).max(50_000).optional(),
    sites: z.array(z.object({ id: z.string().min(1).max(64) }).passthrough()).max(50_000).optional(),
  }).optional(),
  audit: z.array(z.unknown()).optional(),
});

// Download a full JSON backup of all persisted data.
export async function GET(req: NextRequest) {
  try {
    const s = await requirePerm('backup:manage');
    await ensureDb();
    const snap = snapshot();
    await logAudit({ userId: s.sub, username: s.username, action: 'BACKUP', entity: 'system', entityId: 'snapshot', ip: clientIp(req), detail: `${snap.transactions.length} tx, ${snap.users.length} users` });
    return new NextResponse(JSON.stringify(snap, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="sfm_backup_${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) { return err(e); }
}

// Restore from an uploaded JSON backup (superadmin only).
export async function POST(req: NextRequest) {
  try {
    const s = await requirePerm('backup:manage');
    await ensureDb();
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE }); }
    const parsed = restoreSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid backup file', issues: parsed.error.flatten() }, { status: 400, headers: NO_STORE });

    const result = await restore(parsed.data as unknown as ReturnType<typeof snapshot>);
    await logAudit({ userId: s.sub, username: s.username, action: 'RESTORE', entity: 'system', entityId: 'snapshot', ip: clientIp(req), detail: `${result.transactions} tx, ${result.users} users, ${result.masters} masters` });
    return NextResponse.json({ ok: true, restored: result }, { headers: NO_STORE });
  } catch (e) { return err(e); }
}
