'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader, riskBadge, fmt, money } from '@/components/ui';
import { MANDATORY_FIELDS } from '@/lib/rules/validation';

type Source = 'pump' | 'tanker';
interface Options { vehicles: { no: string; fixAvg: number; costCenter: string }[]; drivers: string[]; pumps: string[]; sites: string[]; }
interface Preview {
  validation: { ok: boolean; errors: { field: string; message: string }[]; warnings: { field: string; message: string }[] };
  calc: { amount: number; totalKm: number; recdAvg: number; actualQty: number; excessDiesel: number; debitToDriver: number; costPerKm: number };
  exceptions: { code: string; message: string; risk: string }[];
  fixAvg: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function EntryForm({ source }: { source: Source }) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [f, setF] = useState({
    date: today(), billNo: '', co: '', pump: '', fillingLocation: '', vehicleNo: '', driverName: '',
    diesel: '', rate: '', prevReading: '', currentReading: '', fixAvg: '', hasReceipt: false, remarks: '',
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsForce, setNeedsForce] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetch('/api/masters/options').then((r) => r.json()).then((j) => !j.error && setOpts(j)); }, []);

  const payload = useMemo(() => ({
    source, fuelType: 'Diesel' as const, entryMode: 'manual' as const,
    date: f.date, billNo: f.billNo, co: f.co, pump: f.pump,
    fillingLocation: f.fillingLocation || f.pump,
    vehicleNo: f.vehicleNo, driverName: f.driverName, diesel: num(f.diesel), rate: num(f.rate),
    prevReading: num(f.prevReading), currentReading: num(f.currentReading), fixAvg: num(f.fixAvg),
    hasReceipt: f.hasReceipt, remarks: f.remarks,
  }), [f, source]);

  // The four business-mandatory fields, enforced identically on the server.
  const missing = MANDATORY_FIELDS.filter(({ field }) => {
    if (field === 'diesel') return !(num(f.diesel) > 0);
    if (field === 'currentReading') return !(num(f.currentReading) > 0);
    if (field === 'prevReading') return !(num(f.prevReading) > 0);
    if (field === 'vehicleNo') return !f.vehicleNo.trim();
    return !(f.pump.trim() || f.fillingLocation.trim());
  });

  useEffect(() => {
    if (!f.vehicleNo && !f.diesel) { setPreview(null); return; }
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      fetch('/api/transactions/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then((r) => r.json()).then((j) => !j.error && setPreview(j)).catch(() => {});
    }, 350);
  }, [payload, f.vehicleNo, f.diesel]);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })); setNeedsForce(false); }
  function pickVehicle(no: string) {
    const v = opts?.vehicles.find((x) => x.no === no);
    setF((p) => ({ ...p, vehicleNo: no, fixAvg: v?.fixAvg ? String(v.fixAvg) : p.fixAvg, co: p.co || v?.costCenter || '' }));
  }

  async function submit(force = false) {
    setSubmitting(true); setMsg(null);
    try {
      const res = await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, force }) });
      const data = await res.json();
      if (res.status === 409 && data.needsForce) { setNeedsForce(true); setMsg({ type: 'err', text: 'Exceptions detected — review below, then confirm to record.' }); return; }
      if (!res.ok) {
        const e = data.errors?.map((x: { message: string }) => x.message).join('; ') || data.error || 'Failed';
        setMsg({ type: 'err', text: e }); return;
      }
      setMsg({ type: 'ok', text: `Saved ${data.transaction.vehicleNo} — status ${data.transaction.status}.` });
      setNeedsForce(false);
      setF((p) => ({ ...p, billNo: '', diesel: '', prevReading: '', currentReading: '', remarks: '', hasReceipt: false }));
      setPreview(null);
    } catch { setMsg({ type: 'err', text: 'Network error' }); }
    finally { setSubmitting(false); }
  }

  const c = preview?.calc;
  const errFor = (field: string) => preview?.validation.errors.find((e) => e.field === field)?.message;

  return (
    <div>
      <PageHeader title={source === 'pump' ? 'Pump Diesel Filling' : 'Tanker Diesel Filling'}
        subtitle="Enter details or use OCR-extracted values; validation and calculations run automatically." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client / Site *" error={errFor('co')}>
              <input className="input" list="sites" value={f.co} onChange={(e) => set('co', e.target.value)} placeholder="e.g. VW Chakan" />
              <datalist id="sites">{opts?.sites.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Bus Number *" error={errFor('vehicleNo')}>
              <input className="input" list="vehicles" value={f.vehicleNo} onChange={(e) => pickVehicle(e.target.value.toUpperCase())} placeholder="MH14LB9060" />
              <datalist id="vehicles">{opts?.vehicles.slice(0, 1000).map((v) => <option key={v.no} value={v.no} />)}</datalist>
            </Field>
            <Field label="Driver *" error={errFor('driverName')}>
              <input className="input" list="drivers" value={f.driverName} onChange={(e) => set('driverName', e.target.value)} placeholder="Driver name" />
              <datalist id="drivers">{opts?.drivers.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Pump Name / Diesel Filling Location *" error={errFor('pump')}>
              <input className="input" list="pumps" value={f.pump} onChange={(e) => set('pump', e.target.value)} placeholder={source === 'pump' ? 'JAYHIND' : 'Tanker / site location'} />
              <datalist id="pumps">{opts?.pumps.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label={source === 'pump' ? 'Filling Location (optional)' : 'Tanker / Supervisor'}>
              <input className="input" value={f.fillingLocation} onChange={(e) => set('fillingLocation', e.target.value)} placeholder={source === 'pump' ? 'Site / bay' : 'Tanker no.'} />
            </Field>
            <Field label="Transaction Date *" error={errFor('date')}>
              <input className="input" type="date" max={today()} value={f.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field label={source === 'pump' ? 'Receipt / Bill No.' : 'Register No.'} error={errFor('billNo')}>
              <input className="input" value={f.billNo} onChange={(e) => set('billNo', e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Diesel Quantity (L) *" error={errFor('diesel')}>
              <input className="input" type="number" min="0" step="0.01" value={f.diesel} onChange={(e) => set('diesel', e.target.value)} />
            </Field>
            <Field label="Rate (₹/L) *" error={errFor('rate')}>
              <input className="input" type="number" min="0" step="0.01" value={f.rate} onChange={(e) => set('rate', e.target.value)} />
            </Field>
            <Field label="Previous Odometer *" error={errFor('prevReading')}>
              <input className="input" type="number" min="0" step="1" value={f.prevReading} onChange={(e) => set('prevReading', e.target.value)} placeholder="Last km reading" />
            </Field>
            <Field label="Odometer Reading *" error={errFor('currentReading')}>
              <input className="input" type="number" min="0" step="1" value={f.currentReading} onChange={(e) => set('currentReading', e.target.value)} />
            </Field>
            <Field label="Standard Avg (km/L)">
              <input className="input" type="number" min="0" step="0.01" value={f.fixAvg} onChange={(e) => set('fixAvg', e.target.value)} placeholder="Auto from master" />
            </Field>
            <Field label="Remarks">
              <input className="input" value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={f.hasReceipt} onChange={(e) => set('hasReceipt', e.target.checked)} />
            Receipt / register image attached
          </label>

          {missing.length > 0 && (
            <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Mandatory for every diesel entry — still missing: <strong>{missing.map((m) => m.label).join(', ')}</strong>
            </div>
          )}

          {msg && <div className={`mt-4 rounded-lg px-3 py-2 text-sm ring-1 ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>{msg.text}</div>}

          <div className="mt-5 flex gap-3">
            {!needsForce
              ? <button className="btn-primary" disabled={submitting || missing.length > 0} onClick={() => submit(false)}>{submitting ? 'Saving…' : 'Validate & Save'}</button>
              : <button className="btn-danger" disabled={submitting} onClick={() => submit(true)}>{submitting ? 'Saving…' : 'Confirm & Record with Exceptions'}</button>}
            <button className="btn-ghost" onClick={() => { setF({ date: today(), billNo: '', co: '', pump: '', fillingLocation: '', vehicleNo: '', driverName: '', diesel: '', rate: '', prevReading: '', currentReading: '', fixAvg: '', hasReceipt: false, remarks: '' }); setPreview(null); setMsg(null); setNeedsForce(false); }}>Reset</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Business Calculations</h3>
            <dl className="space-y-2 text-sm">
              <Row k="Amount" v={money(c?.amount || 0)} />
              <Row k="Distance" v={`${fmt(c?.totalKm || 0)} km`} />
              <Row k="Achieved Mileage" v={`${fmt(c?.recdAvg || 0)} km/l`} />
              <Row k="Required Diesel" v={`${fmt(c?.actualQty || 0)} L`} />
              <Row k="Excess Diesel" v={`${fmt(c?.excessDiesel || 0)} L`} danger={(c?.excessDiesel || 0) > 0} />
              <Row k="Debit to Driver" v={money(c?.debitToDriver || 0)} danger={(c?.debitToDriver || 0) > 0} />
              <Row k="Cost / km" v={money(c?.costPerKm || 0)} />
            </dl>
          </div>
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Validation & Exceptions</h3>
            {!preview && <p className="text-sm text-slate-400">Enter details to see live checks.</p>}
            {preview?.validation.errors.map((e, i) => <p key={`e${i}`} className="mb-1 text-sm text-red-600">✕ {e.message}</p>)}
            {preview?.validation.warnings.map((e, i) => <p key={`w${i}`} className="mb-1 text-sm text-amber-600">! {e.message}</p>)}
            {preview?.exceptions.map((e, i) => (
              <div key={`x${i}`} className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-700">{e.message}</span>{riskBadge(e.risk)}
              </div>
            ))}
            {preview && preview.validation.ok && !preview.exceptions.length && <p className="text-sm text-emerald-600">✓ All checks passed.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><span className="label">{label}</span>{children}{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</div>;
}
function Row({ k, v, danger }: { k: string; v: string; danger?: boolean }) {
  return <div className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className={`font-medium ${danger ? 'text-red-600' : 'text-slate-800'}`}>{v}</dd></div>;
}
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
