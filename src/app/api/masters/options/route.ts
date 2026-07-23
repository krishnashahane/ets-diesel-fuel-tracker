import { NextResponse } from 'next/server';
import { db } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requirePerm('tx:create');
    const d = db();
    return NextResponse.json({
      vehicles: d.vehicles.filter((v) => v.active).map((v) => ({ no: v.vehicleNo, fixAvg: v.fixedAvg ?? v.standardAvg ?? 0, costCenter: v.costCenter })),
      drivers: d.drivers.filter((x) => x.active).map((x) => x.name),
      pumps: d.pumps.filter((x) => x.active).map((x) => x.name),
      sites: d.sites.filter((x) => x.active).map((x) => x.name),
    });
  } catch (e) {
    return e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
