import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDb } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';
import { validateEntry, norm, type EntryInput } from '@/lib/rules/validation';
import { calculate } from '@/lib/rules/calculations';
import { detectExceptions, overallRisk } from '@/lib/rules/exceptions';

export const runtime = 'nodejs';

const schema = z.object({
  source: z.enum(['pump', 'tanker']).default('pump'),
  fuelType: z.enum(['Diesel', 'CNG']).default('Diesel'),
  date: z.string().default(''),
  billNo: z.string().default(''),
  co: z.string().default(''),
  pump: z.string().max(120).default(''),
  fillingLocation: z.string().max(120).default(''),
  vehicleNo: z.string().default(''),
  driverName: z.string().default(''),
  diesel: z.number().finite().nonnegative().default(0),
  rate: z.number().finite().nonnegative().default(0),
  currentReading: z.number().finite().nonnegative().default(0),
  prevReading: z.number().finite().nonnegative().default(0),
  fixAvg: z.number().finite().nonnegative().default(0),
  hasReceipt: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    await requirePerm('tx:create');
    await ensureDb();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    const d = db();
    const veh = d.vehicles.find((v) => v.vehicleNo === norm(parsed.data.vehicleNo));
    const fixAvg = parsed.data.fixAvg || veh?.fixedAvg || veh?.standardAvg || 0;
    const e: EntryInput = { ...parsed.data, vehicleNo: norm(parsed.data.vehicleNo), fixAvg } as EntryInput;
    const validation = validateEntry(e, { vehicles: d.vehicles, drivers: d.drivers, transactions: d.transactions });
    const calc = calculate(e);
    const exceptions = detectExceptions(e, calc, { vehicle: veh, transactions: d.transactions });
    return NextResponse.json({ validation, calc, exceptions, risk: overallRisk(exceptions), vehicle: veh ?? null, fixAvg });
  } catch (e) {
    return e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
