import { NextResponse } from 'next/server';
import { db, ensureDb } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';

export const runtime = 'nodejs';

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET() {
  try {
    await requirePerm('dashboard:view');
    await ensureDb();
    const d = db();
    const tx = d.transactions;

    let totalDiesel = 0, totalCost = 0, totalKm = 0, mileageSum = 0, mileageN = 0, leakage = 0, excessLtr = 0;
    const byVehicle = new Map<string, { diesel: number; cost: number; km: number }>();
    const bySite = new Map<string, number>();
    const byDay = new Map<string, number>();
    let openExceptions = 0, pending = 0;

    for (const t of tx) {
      totalDiesel += t.diesel; totalCost += t.amount; totalKm += t.totalKm;
      if (t.recdAvg > 0) { mileageSum += t.recdAvg; mileageN++; }
      leakage += t.debitToDriver; if (t.excessDiesel > 0) excessLtr += t.excessDiesel;
      if (t.exceptions && t.exceptions.length) openExceptions++;
      if (t.status === 'Submitted' || t.status === 'Verified') pending++;
      const v = byVehicle.get(t.vehicleNo) || { diesel: 0, cost: 0, km: 0 };
      v.diesel += t.diesel; v.cost += t.amount; v.km += t.totalKm; byVehicle.set(t.vehicleNo, v);
      if (t.co) bySite.set(t.co, (bySite.get(t.co) || 0) + t.diesel);
      if (t.date) byDay.set(t.date, (byDay.get(t.date) || 0) + t.diesel);
    }

    const topVehicles = [...byVehicle.entries()].map(([k, v]) => ({ vehicleNo: k, diesel: r2(v.diesel), cost: r2(v.cost) }))
      .sort((a, b) => b.diesel - a.diesel).slice(0, 10);
    const topSites = [...bySite.entries()].map(([k, v]) => ({ site: k, diesel: r2(v) })).sort((a, b) => b.diesel - a.diesel).slice(0, 10);
    const lowMileage = [...byVehicle.entries()].filter(([, v]) => v.diesel > 20)
      .map(([k, v]) => ({ vehicleNo: k, mileage: r2(v.km / v.diesel) })).filter((x) => x.mileage > 0).sort((a, b) => a.mileage - b.mileage).slice(0, 10);
    const trend = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, diesel]) => ({ date, diesel: r2(diesel) }));

    const financialLeakagePct = totalCost > 0 ? r2((leakage / totalCost) * 100) : 0;

    return NextResponse.json({
      kpis: {
        transactions: tx.length,
        totalDiesel: r2(totalDiesel),
        totalCost: r2(totalCost),
        avgMileage: mileageN ? r2(mileageSum / mileageN) : 0,
        openExceptions,
        pendingApprovals: pending,
        excessDiesel: r2(excessLtr),
        leakageAmount: r2(leakage),
        financialLeakagePct,
        vehicles: d.vehicles.length,
        drivers: d.drivers.length,
      },
      topVehicles, topSites, lowMileage, trend,
    });
  } catch (e) {
    return e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
