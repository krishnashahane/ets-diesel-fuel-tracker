// Bulk import of diesel entries extracted from a photo of the manually maintained
// diesel register. Every row runs through the SAME validation, calculation and
// exception engines as a single in-app entry — the register path is a different
// input channel, never a weaker one.
import { NextRequest, NextResponse } from 'next/server';
import { db, nextId, ensureDb, saveTransaction, saveRegisterPage } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';
import { validateEntry, norm, hasMandatory, type EntryInput } from '@/lib/rules/validation';
import { calculate } from '@/lib/rules/calculations';
import { detectExceptions, overallRisk } from '@/lib/rules/exceptions';
import { logAudit } from '@/lib/audit';
import { bulkEntrySchema, type BulkEntryPayload } from '@/lib/schemas';
import { clientIp, NO_STORE } from '@/lib/security';
import type { Transaction } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: NO_STORE });
const handle = (e: unknown) =>
  e instanceof AuthError ? json({ error: e.message }, e.status) : json({ error: 'Server error' }, 500);

export interface BulkRowResult {
  lineNo: number;
  vehicleNo: string;
  ok: boolean;
  id?: string;
  status?: Transaction['status'];
  validationStatus?: Transaction['validationStatus'];
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
  exceptions: { code: string; message: string; risk: string }[];
  risk?: string | null;
  needsForce?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const s = await requirePerm('tx:create');
    await ensureDb();

    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const parsed = bulkEntrySchema.safeParse(body);
    if (!parsed.success) return json({ error: 'Validation failed', issues: parsed.error.flatten() }, 400);

    const payload = parsed.data as unknown as BulkEntryPayload;
    const { rows, registerPhoto, ocrText, ocrConfidence, geo, device, force } = payload;
    const batchId = payload.batchId || nextId('RB');
    const d = db();
    const ip = clientIp(req);

    // Store the scan ONCE for the whole batch; rows reference it by batchId.
    if (registerPhoto) {
      await saveRegisterPage({
        id: batchId, image: registerPhoto, text: ocrText || '',
        ocrConfidence, rowCount: rows.length,
        createdAt: new Date().toISOString(), createdBy: s.username,
      });
    }

    const results: BulkRowResult[] = [];
    let imported = 0;

    // Sequential on purpose: each row must see the transactions written by the
    // previous one, so duplicate/double-fill detection works within a batch.
    for (const row of rows) {
      const vehicleNo = norm(row.vehicleNo);
      const base: BulkRowResult = { lineNo: row.lineNo, vehicleNo, ok: false, errors: [], warnings: [], exceptions: [] };

      // Mandatory business fields — refuse the row outright, never import a partial.
      if (!hasMandatory({ ...row, vehicleNo })) {
        base.errors.push({ field: 'mandatory', message: 'Diesel quantity, odometer reading, bus number and pump / filling location are all required' });
        results.push(base);
        continue;
      }

      const veh = d.vehicles.find((v) => v.vehicleNo === vehicleNo);
      const fixAvg = veh?.fixedAvg || veh?.standardAvg || 0;
      const e: EntryInput = {
        source: row.source,
        fuelType: row.fuelType,
        date: row.date,
        billNo: row.billNo,
        // Fall back to the vehicle's cost centre when the register omits the site.
        co: row.co || veh?.costCenter || '',
        pump: row.pump,
        vehicleNo,
        driverName: row.driverName,
        diesel: row.diesel,
        rate: row.rate,
        currentReading: row.currentReading,
        prevReading: row.prevReading,
        fixAvg,
        hasReceipt: !!registerPhoto,   // the register page IS the source document
        remarks: row.remarks,
        fillingLocation: row.fillingLocation || row.pump,
      };

      const result = validateEntry(e, { vehicles: d.vehicles, drivers: d.drivers, transactions: d.transactions });
      base.warnings = result.warnings;
      if (!result.ok) { base.errors = result.errors; results.push(base); continue; }

      const calc = calculate(e);
      const exceptions = detectExceptions(e, calc, { vehicle: veh, transactions: d.transactions });
      base.exceptions = exceptions;
      const blocking = exceptions.some((x) => x.risk === 'critical' || x.risk === 'high');
      if (blocking && !force) {
        base.needsForce = true;
        base.errors.push({ field: 'exceptions', message: 'High-risk exceptions — review and confirm to record' });
        results.push(base);
        continue;
      }

      // Register-sourced records ALWAYS land in Review. The values originate from a
      // photograph of handwriting, so a verifier signs them off regardless of how
      // clean the extraction looked.
      const validationStatus: Transaction['validationStatus'] = 'Review';

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
        // Register imports never auto-verify — they enter the approval workflow.
        status: 'Submitted',
        createdBy: s.username,
        createdAt: new Date().toISOString(),
        exceptions,
        // The scan lives in app_register_pages keyed by batchId — see registerRef.
        photos: {},
        geo: geo ?? null,
        device: device ?? null,
        ocrConfidence,
        validationStatus,
        ip,
        entryMode: 'register',
        registerRef: { batchId, lineNo: row.lineNo, rawLine: row.rawLine, ocrConfidence, edited: row.edited },
      };

      await saveTransaction(tx);
      imported++;
      Object.assign(base, { ok: true, id: tx.id, status: tx.status, validationStatus, risk: overallRisk(exceptions) });
      results.push(base);
    }

    await logAudit({
      userId: s.sub, username: s.username, action: 'TX_REGISTER_IMPORT',
      entity: 'transaction', entityId: batchId, ip,
      detail: `batch=${batchId} rows=${rows.length} imported=${imported} ocr=${ocrConfidence}%`,
      geo: geo ?? null, device: device ?? null,
    });

    return json({ ok: true, batchId, imported, failed: rows.length - imported, results });
  } catch (e) { return handle(e); }
}
