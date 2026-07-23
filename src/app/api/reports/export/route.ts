import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDb } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';
import { toCSV } from '@/lib/csv';
import { logAudit } from '@/lib/audit';
import { norm } from '@/lib/rules/validation';

export const runtime = 'nodejs';

const COLS = ['id', 'date', 'billNo', 'vehicleNo', 'driverName', 'co', 'pump', 'fuelType', 'diesel', 'rate', 'amount', 'prevReading', 'currentReading', 'totalKm', 'recdAvg', 'actualQty', 'excessDiesel', 'debitToDriver', 'status', 'validationStatus', 'ocrConfidence', 'photoCount', 'lat', 'lng', 'locAccuracy', 'device', 'ip', 'submittedBy', 'submittedAt', 'remarks'];

export async function GET(req: NextRequest) {
  try {
    const s = await requirePerm('tx:export');
    await ensureDb();
    const sp = req.nextUrl.searchParams;
    const vehicle = norm(sp.get('vehicle') || '');
    const site = (sp.get('site') || '').trim();
    const from = sp.get('from') || '', to = sp.get('to') || '';
    const onlyExceptions = sp.get('exceptions') === '1';

    let rows = db().transactions;
    if (vehicle) rows = rows.filter((t) => t.vehicleNo === vehicle);
    if (site) rows = rows.filter((t) => t.co === site);
    if (from) rows = rows.filter((t) => t.date >= from);
    if (to) rows = rows.filter((t) => t.date <= to);
    if (onlyExceptions) rows = rows.filter((t) => t.exceptions && t.exceptions.length > 0);

    const flat = rows.map((t) => ({
      ...t,
      validationStatus: t.validationStatus ?? '',
      ocrConfidence: t.ocrConfidence ?? '',
      photoCount: t.photos ? Object.values(t.photos).filter(Boolean).length : 0,
      lat: t.geo?.status === 'ok' ? t.geo.lat : '',
      lng: t.geo?.status === 'ok' ? t.geo.lng : '',
      locAccuracy: t.geo?.status === 'ok' ? t.geo.accuracy : '',
      device: t.device ? `${t.device.browser}/${t.device.os}/${t.device.deviceType}` : '',
      submittedBy: t.createdBy ?? '',
      submittedAt: t.createdAt ?? '',
    }));
    const csv = toCSV(flat as unknown as Record<string, unknown>[], COLS);
    await logAudit({ userId: s.sub, username: s.username, action: 'EXPORT', entity: 'report', entityId: 'transactions', ip: 'session', detail: `${rows.length} rows` });
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="diesel_transactions_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
