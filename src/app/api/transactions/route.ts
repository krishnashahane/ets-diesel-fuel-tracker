import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, nextId, ensureDb, saveTransaction, getSettings } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';
import { validateEntry, norm, type EntryInput } from '@/lib/rules/validation';
import { calculate } from '@/lib/rules/calculations';
import { detectExceptions, overallRisk } from '@/lib/rules/exceptions';
import { logAudit } from '@/lib/audit';
import type { Transaction } from '@/lib/types';

export const runtime = 'nodejs';

const handle = (e: unknown) =>
  e instanceof AuthError
    ? NextResponse.json({ error: e.message }, { status: e.status })
    : NextResponse.json({ error: 'Server error' }, { status: 500 });

const ipOf = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

export async function GET(req: NextRequest) {
  try {
    await requirePerm('tx:view');
    await ensureDb();
    const sp = req.nextUrl.searchParams;
    const q = (sp.get('q') || '').trim().toLowerCase();
    const vehicle = norm(sp.get('vehicle') || '');
    const site = (sp.get('site') || '').trim();
    const from = sp.get('from') || '';
    const to = sp.get('to') || '';
    const onlyExceptions = sp.get('exceptions') === '1';
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(sp.get('size') || '25', 10) || 25));

    let rows = db().transactions;
    if (q) rows = rows.filter((t) => `${t.vehicleNo} ${t.driverName} ${t.billNo} ${t.co} ${t.pump}`.toLowerCase().includes(q));
    if (vehicle) rows = rows.filter((t) => t.vehicleNo === vehicle);
    if (site) rows = rows.filter((t) => t.co === site);
    if (from) rows = rows.filter((t) => t.date >= from);
    if (to) rows = rows.filter((t) => t.date <= to);
    if (onlyExceptions) rows = rows.filter((t) => t.exceptions && t.exceptions.length > 0);

    const total = rows.length;
    const start = (page - 1) * size;
    // Exclude heavy photo data URLs from list payload; expose a light photoCount.
    const items = rows.slice(start, start + size).map(({ photos, ...t }) => ({
      ...t, photoCount: photos ? Object.values(photos).filter(Boolean).length : 0,
    }));
    return NextResponse.json({ items, total, page, size });
  } catch (e) { return handle(e); }
}

const entrySchema = z.object({
  source: z.enum(['pump', 'tanker']),
  fuelType: z.enum(['Diesel', 'CNG']).default('Diesel'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  billNo: z.string().max(64).default(''),
  co: z.string().min(1).max(120),
  pump: z.string().max(120).default(''),
  vehicleNo: z.string().min(1).max(40),
  driverName: z.string().min(1).max(120),
  diesel: z.number().finite().nonnegative(),
  rate: z.number().finite().nonnegative(),
  currentReading: z.number().finite().nonnegative().default(0),
  prevReading: z.number().finite().nonnegative().default(0),
  fixAvg: z.number().finite().nonnegative().default(0),
  hasReceipt: z.boolean().default(false),
  remarks: z.string().max(500).optional(),
  fillingLocation: z.string().max(120).optional(),
  force: z.boolean().default(false),
  photos: z.object({
    plate: z.string().max(700_000).optional(),
    bill: z.string().max(700_000).optional(),
    meter: z.string().max(700_000).optional(),
    odometer: z.string().max(700_000).optional(),
  }).partial().optional(),
  geo: z.object({
    lat: z.number(), lng: z.number(), accuracy: z.number(),
    ts: z.string(), status: z.enum(['ok', 'denied', 'unavailable']).optional(),
  }).nullable().optional(),
  device: z.object({
    ua: z.string().max(400), browser: z.string().max(40),
    os: z.string().max(40), deviceType: z.enum(['mobile', 'tablet', 'desktop']),
  }).nullable().optional(),
  ocrConfidence: z.number().min(0).max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const s = await requirePerm('tx:create');
    await ensureDb();
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const parsed = entrySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 400 });

    const d = db();
    const input = parsed.data as EntryInput & { force: boolean };
    const veh = d.vehicles.find((v) => v.vehicleNo === norm(input.vehicleNo));
    const fixAvg = input.fixAvg || veh?.fixedAvg || veh?.standardAvg || 0;
    const e: EntryInput = { ...input, vehicleNo: norm(input.vehicleNo), fixAvg };

    const result = validateEntry(e, { vehicles: d.vehicles, drivers: d.drivers, transactions: d.transactions });
    if (!result.ok) return NextResponse.json({ error: 'Validation failed', errors: result.errors, warnings: result.warnings }, { status: 422 });

    const calc = calculate(e);
    const exceptions = detectExceptions(e, calc, { vehicle: veh, transactions: d.transactions });
    const risk = overallRisk(exceptions);
    const hasBlocking = exceptions.some((x) => x.risk === 'critical' || x.risk === 'high');

    // High/critical exceptions require explicit override to submit.
    if (hasBlocking && !input.force)
      return NextResponse.json({ error: 'Exceptions require review', exceptions, calc, warnings: result.warnings, needsForce: true }, { status: 409 });

    const pd = parsed.data;
    const cfg = getSettings();
    const photos = pd.photos;
    const photoCount = photos ? Object.values(photos).filter(Boolean).length : 0;
    const ocrConfidence = pd.ocrConfidence ?? 0;
    // Workflow: flag records that need human review (threshold is super-admin configurable).
    const validationStatus: Transaction['validationStatus'] =
      exceptions.length || result.warnings.length || (cfg.requirePhotos && photoCount < 4) || (ocrConfidence > 0 && ocrConfidence < cfg.ocrThreshold)
        ? 'Review' : 'Valid';

    const tx: Transaction = {
      id: nextId('T'),
      billNo: e.billNo,
      srNo: d.transactions.length + 1,
      date: e.date,
      co: e.co,
      pump: e.pump,
      driverName: e.driverName,
      vehicleNo: e.vehicleNo,
      fixAvg,
      diesel: e.diesel,
      rate: e.rate,
      amount: calc.amount,
      currentReading: e.currentReading,
      prevReading: e.prevReading,
      totalKm: calc.totalKm,
      recdAvg: calc.recdAvg,
      actualQty: calc.actualQty,
      excessDiesel: calc.excessDiesel,
      debitToDriver: calc.debitToDriver,
      remarks: e.remarks || '',
      fillingLocation: e.fillingLocation || '',
      fuelType: e.fuelType,
      source: e.source,
      status: exceptions.length ? 'Submitted' : 'Verified',
      createdBy: s.username,
      createdAt: new Date().toISOString(),
      exceptions,
      photos: photos || {},
      geo: pd.geo ?? null,
      device: pd.device ?? null,
      ocrConfidence,
      validationStatus,
      ip: ipOf(req),
    };
    await saveTransaction(tx);
    await logAudit({ userId: s.sub, username: s.username, action: 'TX_CREATE', entity: 'transaction', entityId: tx.id, ip: ipOf(req), detail: `${tx.vehicleNo} ${tx.diesel}L risk=${risk ?? 'none'} photos=${photoCount}`, geo: pd.geo ?? null, device: pd.device ?? null });

    return NextResponse.json({ ok: true, transaction: tx, calc, exceptions, warnings: result.warnings });
  } catch (e) { return handle(e); }
}
