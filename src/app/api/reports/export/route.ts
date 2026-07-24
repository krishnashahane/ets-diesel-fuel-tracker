// Report export. One endpoint, two renderings:
//   ?format=csv (default)  -> UTF-8 CSV, formula-injection safe
//   ?format=xls            -> Excel workbook (Transactions + Summary sheets)
// The data is read live from the store on every request, so the downloaded sheet
// always reflects the current state — including entries just imported from a
// register photo. See EXPORT_TOKEN below for scheduled/auto-refresh access.
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db, ensureDb } from '@/lib/store';
import { getSession, AuthError } from '@/lib/session';
import { can } from '@/lib/rbac';
import { toCSV } from '@/lib/csv';
import { toWorkbook, XLS_CONTENT_TYPE, type XlsColumn } from '@/lib/xls';
import { logAudit } from '@/lib/audit';
import { norm } from '@/lib/rules/validation';
import { clientIp, NO_STORE } from '@/lib/security';
import { rateLimit } from '@/lib/ratelimit';
import type { Transaction } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FlatRow = Record<string, unknown>;

const BOM = '\ufeff'; // UTF-8 byte-order mark: makes Excel on Windows read the CSV as UTF-8

const COLS = ['id', 'date', 'billNo', 'vehicleNo', 'driverName', 'co', 'pump', 'fillingLocation', 'fuelType', 'source', 'entryMode', 'diesel', 'rate', 'amount', 'prevReading', 'currentReading', 'totalKm', 'fixAvg', 'recdAvg', 'actualQty', 'excessDiesel', 'debitToDriver', 'status', 'validationStatus', 'exceptionCodes', 'riskLevel', 'ocrConfidence', 'photoCount', 'registerBatch', 'registerLine', 'lat', 'lng', 'locAccuracy', 'device', 'ip', 'submittedBy', 'submittedAt', 'remarks'];

const SHEET_COLS: XlsColumn<FlatRow>[] = [
  { key: 'id', header: 'Entry ID', width: 110 },
  { key: 'date', header: 'Date', type: 'DateTime', width: 80 },
  { key: 'vehicleNo', header: 'Bus Number', width: 100 },
  { key: 'driverName', header: 'Driver', width: 130 },
  { key: 'co', header: 'Cost Center / Site', width: 130 },
  { key: 'pump', header: 'Pump Name', width: 120 },
  { key: 'fillingLocation', header: 'Filling Location', width: 120 },
  { key: 'entryMode', header: 'Entry Mode', width: 80 },
  { key: 'source', header: 'Source', width: 60 },
  { key: 'diesel', header: 'Diesel Qty (L)', type: 'Number', width: 85 },
  { key: 'rate', header: 'Rate (Rs/L)', type: 'Number', width: 75 },
  { key: 'amount', header: 'Amount (Rs)', type: 'Number', width: 90 },
  { key: 'prevReading', header: 'Prev Odometer', type: 'Number', width: 90 },
  { key: 'currentReading', header: 'Odometer Reading', type: 'Number', width: 100 },
  { key: 'totalKm', header: 'Distance (km)', type: 'Number', width: 85 },
  { key: 'fixAvg', header: 'Standard Avg (km/L)', type: 'Number', width: 100 },
  { key: 'recdAvg', header: 'Achieved Avg (km/L)', type: 'Number', width: 100 },
  { key: 'actualQty', header: 'Required Qty (L)', type: 'Number', width: 90 },
  { key: 'excessDiesel', header: 'Excess Diesel (L)', type: 'Number', width: 95 },
  { key: 'debitToDriver', header: 'Debit to Driver (Rs)', type: 'Number', width: 105 },
  { key: 'billNo', header: 'Bill / Slip No.', width: 95 },
  { key: 'status', header: 'Status', width: 80 },
  { key: 'validationStatus', header: 'Validation', width: 75 },
  { key: 'riskLevel', header: 'Risk', width: 60 },
  { key: 'exceptionCodes', header: 'Exceptions', width: 180 },
  { key: 'ocrConfidence', header: 'OCR %', type: 'Number', width: 55 },
  { key: 'photoCount', header: 'Photos', type: 'Number', width: 50 },
  { key: 'registerBatch', header: 'Register Batch', width: 110 },
  { key: 'registerLine', header: 'Register Line', type: 'Number', width: 75 },
  { key: 'lat', header: 'Latitude', type: 'Number', width: 80 },
  { key: 'lng', header: 'Longitude', type: 'Number', width: 80 },
  { key: 'device', header: 'Device', width: 130 },
  { key: 'ip', header: 'IP', width: 100 },
  { key: 'submittedBy', header: 'Submitted By', width: 100 },
  { key: 'submittedAt', header: 'Submitted At', width: 140 },
  { key: 'remarks', header: 'Remarks', width: 200 },
];

const RISK_ORDER = { low: 1, medium: 2, high: 3, critical: 4 } as const;

function flatten(t: Transaction): FlatRow {
  const risk = (t.exceptions || []).reduce<keyof typeof RISK_ORDER | ''>(
    (m, c) => (!m || RISK_ORDER[c.risk] > RISK_ORDER[m] ? c.risk : m), '');
  return {
    ...t,
    fillingLocation: t.fillingLocation ?? '',
    entryMode: t.entryMode ?? 'manual',
    validationStatus: t.validationStatus ?? '',
    ocrConfidence: t.ocrConfidence ?? '',
    exceptionCodes: (t.exceptions || []).map((x) => x.code).join(' | '),
    riskLevel: risk,
    photoCount: t.photos ? Object.values(t.photos).filter(Boolean).length : 0,
    registerBatch: t.registerRef?.batchId ?? '',
    registerLine: t.registerRef?.lineNo ?? '',
    lat: t.geo?.status === 'ok' ? t.geo.lat : '',
    lng: t.geo?.status === 'ok' ? t.geo.lng : '',
    locAccuracy: t.geo?.status === 'ok' ? t.geo.accuracy : '',
    device: t.device ? `${t.device.browser}/${t.device.os}/${t.device.deviceType}` : '',
    submittedBy: t.createdBy ?? '',
    submittedAt: t.createdAt ?? '',
    exceptions: undefined,
    photos: undefined,
    geo: undefined,
  };
}

// Per-vehicle roll-up so the workbook is usable for analysis without pivoting.
function summarise(rows: Transaction[]): FlatRow[] {
  const by = new Map<string, { vehicleNo: string; fills: number; diesel: number; amount: number; km: number; excess: number; debit: number; exceptions: number }>();
  for (const t of rows) {
    const k = t.vehicleNo;
    const cur = by.get(k) ?? { vehicleNo: k, fills: 0, diesel: 0, amount: 0, km: 0, excess: 0, debit: 0, exceptions: 0 };
    cur.fills++;
    cur.diesel += t.diesel || 0;
    cur.amount += t.amount || 0;
    cur.km += t.totalKm || 0;
    cur.excess += t.excessDiesel > 0 ? t.excessDiesel : 0;
    cur.debit += t.debitToDriver || 0;
    cur.exceptions += t.exceptions?.length ? 1 : 0;
    by.set(k, cur);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return [...by.values()]
    .map((v) => ({ ...v, diesel: r2(v.diesel), amount: r2(v.amount), km: r2(v.km), excess: r2(v.excess), debit: r2(v.debit), avgKmpl: v.diesel > 0 ? r2(v.km / v.diesel) : 0 }))
    .sort((a, b) => b.diesel - a.diesel);
}

const SUMMARY_COLS: XlsColumn<FlatRow>[] = [
  { key: 'vehicleNo', header: 'Bus Number', width: 110 },
  { key: 'fills', header: 'Fillings', type: 'Number', width: 70 },
  { key: 'diesel', header: 'Total Diesel (L)', type: 'Number', width: 100 },
  { key: 'amount', header: 'Total Amount (Rs)', type: 'Number', width: 110 },
  { key: 'km', header: 'Total Distance (km)', type: 'Number', width: 110 },
  { key: 'avgKmpl', header: 'Avg Mileage (km/L)', type: 'Number', width: 110 },
  { key: 'excess', header: 'Excess Diesel (L)', type: 'Number', width: 100 },
  { key: 'debit', header: 'Debit to Driver (Rs)', type: 'Number', width: 115 },
  { key: 'exceptions', header: 'Entries w/ Exceptions', type: 'Number', width: 125 },
];

// Optional machine access for scheduled refresh (Excel "Get Data > From Web",
// Power Query, cron). Disabled unless EXPORT_TOKEN is configured; read-only;
// compared in constant time; rate-limited and audit-logged like any other export.
function tokenOk(supplied: string | null): boolean {
  const expected = process.env.EXPORT_TOKEN || '';
  if (!expected || expected.length < 24 || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const ip = clientIp(req);

    // Auth: interactive session with tx:export, OR a valid export token.
    const supplied = sp.get('token') || req.headers.get('x-export-token');
    const viaToken = tokenOk(supplied);
    let actor = { sub: 'export-token', username: 'export-token' };
    if (!viaToken) {
      const s = await getSession();
      if (!s) throw new AuthError('Unauthorized', 401);
      if (!can(s.role, 'tx:export')) throw new AuthError('Forbidden', 403);
      actor = { sub: s.sub, username: s.username };
    } else {
      const rl = rateLimit(`export:${ip}`, 30, 60_000);
      if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
    }

    await ensureDb();
    const vehicle = norm(sp.get('vehicle') || '');
    const site = (sp.get('site') || '').trim();
    const from = sp.get('from') || '', to = sp.get('to') || '';
    const onlyExceptions = sp.get('exceptions') === '1';
    const mode = sp.get('mode') || '';
    const format = (sp.get('format') || 'csv').toLowerCase();

    let rows = db().transactions;
    if (vehicle) rows = rows.filter((t) => t.vehicleNo === vehicle);
    if (site) rows = rows.filter((t) => t.co === site);
    if (from) rows = rows.filter((t) => t.date >= from);
    if (to) rows = rows.filter((t) => t.date <= to);
    if (onlyExceptions) rows = rows.filter((t) => t.exceptions && t.exceptions.length > 0);
    if (mode === 'register' || mode === 'manual') rows = rows.filter((t) => (t.entryMode ?? 'manual') === mode);

    const flat = rows.map(flatten);
    const stamp = new Date().toISOString().slice(0, 10);
    await logAudit({
      userId: actor.sub, username: actor.username, action: 'EXPORT', entity: 'report',
      entityId: 'transactions', ip, detail: `${rows.length} rows format=${format}${viaToken ? ' via=token' : ''}`,
    });

    if (format === 'xls' || format === 'excel' || format === 'xlsx') {
      const xml = toWorkbook<FlatRow>([
        { name: 'Diesel Transactions', columns: SHEET_COLS, rows: flat },
        { name: 'Vehicle Summary', columns: SUMMARY_COLS, rows: summarise(rows) },
      ]);
      return new NextResponse(xml, {
        headers: {
          ...NO_STORE,
          'Content-Type': XLS_CONTENT_TYPE,
          'Content-Disposition': `attachment; filename="diesel_transactions_${stamp}.xls"`,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const csv = toCSV(flat, COLS);
    // UTF-8 BOM so Excel opens the CSV with correct encoding on Windows.
    return new NextResponse('﻿' + csv, {
      headers: {
        ...NO_STORE,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="diesel_transactions_${stamp}.csv"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return e instanceof AuthError
      ? NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE })
      : NextResponse.json({ error: 'Server error' }, { status: 500, headers: NO_STORE });
  }
}
