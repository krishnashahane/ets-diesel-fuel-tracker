import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, nextId, ensureDb, saveMaster } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { norm } from '@/lib/rules/validation';

export const runtime = 'nodejs';

const TYPES = ['vehicles', 'drivers', 'pumps', 'sites'] as const;
type MType = (typeof TYPES)[number];

const list = (t: MType) => {
  const d = db();
  return t === 'vehicles' ? d.vehicles : t === 'drivers' ? d.drivers : t === 'pumps' ? d.pumps : d.sites;
};

export async function GET(req: NextRequest) {
  try {
    await requirePerm('master:view');
    const type = (req.nextUrl.searchParams.get('type') || 'vehicles') as MType;
    if (!TYPES.includes(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('size') || '25', 10) || 25));
    let rows: Record<string, unknown>[] = list(type) as unknown as Record<string, unknown>[];
    if (q) rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    const total = rows.length;
    const items = rows.slice((page - 1) * size, (page - 1) * size + size);
    return NextResponse.json({ items, total, page, size });
  } catch (e) { return err(e); }
}

const vehicleSchema = z.object({
  type: z.literal('vehicles'),
  vehicleNo: z.string().min(1), seatingCap: z.number().nullable().default(null), ac: z.string().default(''),
  fuel: z.string().default('Diesel'), make: z.string().default(''), ownership: z.string().default(''),
  costCenter: z.string().default(''), standardAvg: z.number().nullable().default(null), fixedAvg: z.number().nullable().default(null),
  active: z.boolean().default(true),
});
const namedSchema = z.object({ type: z.enum(['drivers', 'pumps', 'sites']), name: z.string().min(1), licenseNo: z.string().optional(), active: z.boolean().default(true) });

export async function POST(req: NextRequest) {
  try {
    const s = await requirePerm('master:manage');
    await ensureDb();
    const body = await req.json().catch(() => ({}));
    if (body?.type === 'vehicles') {
      const p = vehicleSchema.safeParse(body);
      if (!p.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
      const d = db();
      const vehicleNo = norm(p.data.vehicleNo);
      if (d.vehicles.some((v) => v.vehicleNo === vehicleNo)) return NextResponse.json({ error: 'Duplicate vehicle' }, { status: 409 });
      const rec = { ...p.data, vehicleNo }; delete (rec as Record<string, unknown>).type;
      d.vehicles.unshift(rec as never);
      await saveMaster('vehicles', rec as Record<string, unknown>);
      await logAudit({ userId: s.sub, username: s.username, action: 'MASTER_CREATE', entity: 'vehicle', entityId: vehicleNo, ip: 'session' });
      return NextResponse.json({ ok: true });
    }
    const p = namedSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    const d = db();
    const arr = p.data.type === 'drivers' ? d.drivers : p.data.type === 'pumps' ? d.pumps : d.sites;
    if (arr.some((x: { name: string }) => x.name.toLowerCase() === p.data.name.toLowerCase())) return NextResponse.json({ error: 'Duplicate entry' }, { status: 409 });
    const rec: Record<string, unknown> = { id: nextId('M'), name: p.data.name, active: p.data.active };
    if (p.data.type === 'drivers') rec.licenseNo = p.data.licenseNo || '';
    (arr as unknown[]).unshift(rec);
    await saveMaster(p.data.type, rec);
    await logAudit({ userId: s.sub, username: s.username, action: 'MASTER_CREATE', entity: p.data.type, entityId: p.data.name, ip: 'session' });
    return NextResponse.json({ ok: true });
  } catch (e) { return err(e); }
}

const err = (e: unknown) => e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
