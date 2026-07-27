'use client';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui';
import { getDevice, getGeo, fileToDataURL } from '@/lib/clientmeta';
import { runOcr, terminateOcr, type OcrFields } from '@/lib/ocr';
import { MANDATORY_FIELDS } from '@/lib/rules/validation';
import type { GeoPoint, AppSettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';

interface Options { vehicles: { no: string; fixAvg: number; costCenter: string }[]; drivers: string[]; pumps: string[]; sites: string[]; }
type PhotoKey = 'plate' | 'bill' | 'meter' | 'odometer';
const PHOTO_FIELDS: { key: PhotoKey; label: string; hint: string }[] = [
  { key: 'plate', label: 'Vehicle Number Plate', hint: 'Clear photo of the number plate' },
  { key: 'bill', label: 'Diesel Slip / Challan / Bill', hint: 'Full bill with amount & date' },
  { key: 'meter', label: 'Diesel Filled Meter', hint: 'Pump meter reading' },
  { key: 'odometer', label: 'Vehicle Odometer', hint: 'Dashboard odometer reading' },
];
const today = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };

export default function DieselEntryForm() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [cfg, setCfg] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [photos, setPhotos] = useState<Partial<Record<PhotoKey, string>>>({});
  const [busy, setBusy] = useState<Partial<Record<PhotoKey, boolean>>>({});
  const [ocr, setOcr] = useState<Partial<Record<PhotoKey, number>>>({});
  const [f, setF] = useState({
    date: today(), co: '', pump: '', vehicleNo: '', driverName: '',
    diesel: '', rate: '', prevReading: '', currentReading: '', remarks: '',
  });
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsForce, setNeedsForce] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { fetch('/api/masters/options').then((r) => r.json()).then((j) => !j.error && setOpts(j)).catch(() => {}); }, []);
  useEffect(() => { fetch('/api/settings').then((r) => r.json()).then((j) => j.settings && setCfg(j.settings)).catch(() => {}); }, []);
  useEffect(() => { getGeo().then(setGeo).catch(() => setGeo(null)); }, []);
  useEffect(() => () => { terminateOcr(); }, []);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })); setNeedsForce(false); }
  function pickVehicle(no: string) {
    const v = opts?.vehicles.find((x) => x.no === no);
    setF((p) => ({ ...p, vehicleNo: no, co: p.co || v?.costCenter || '' }));
  }

  // Fill only empty fields from OCR — never overwrite user input (manual correction wins).
  function applyOcr(key: PhotoKey, fields: OcrFields) {
    setF((p) => {
      const n = { ...p };
      const fillNum = (k: keyof typeof f, v?: number) => { if (v && v > 0 && !n[k]) n[k] = String(v) as never; };
      if (key === 'bill') { fillNum('rate', fields.rate); fillNum('diesel', fields.qty); }
      if (key === 'meter') fillNum('diesel', fields.qty ?? fields.reading);
      if (key === 'odometer') fillNum('currentReading', fields.reading ?? fields.numbers.sort((a, b) => b - a)[0]);
      if (key === 'plate' && fields.plate && !n.vehicleNo) {
        const match = opts?.vehicles.find((v) => v.no === fields.plate);
        if (match) { n.vehicleNo = match.no; if (!n.co) n.co = match.costCenter; }
      }
      return n;
    });
  }

  async function onPhoto(key: PhotoKey, file?: File) {
    if (!file) return;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const url = await fileToDataURL(file);
      setPhotos((p) => ({ ...p, [key]: url }));
      // Best-effort OCR — never blocks submission. Skipped if disabled in settings.
      if (cfg.ocrEnabled) {
        runOcr(url).then((r) => {
          setOcr((o) => ({ ...o, [key]: r.confidence }));
          if (r.confidence > 0) applyOcr(key, r.fields);
        }).catch(() => {});
      }
    } catch { setMsg({ type: 'err', text: `Could not process ${key} photo.` }); }
    finally { setBusy((b) => ({ ...b, [key]: false })); }
  }

  const ocrValues = Object.values(ocr).filter((c): c is number => typeof c === 'number' && c > 0);
  const avgOcr = ocrValues.length ? Math.round(ocrValues.reduce((a, b) => a + b, 0) / ocrValues.length) : 0;

  const photoCount = Object.values(photos).filter(Boolean).length;
  const photosOk = !cfg.requirePhotos || photoCount === 4;
  // The four business-mandatory fields, shown to the operator as a live checklist.
  const missing = MANDATORY_FIELDS.filter(({ field }) => {
    if (field === 'diesel') return !(num(f.diesel) > 0);
    if (field === 'currentReading') return !(num(f.currentReading) > 0);
    if (field === 'prevReading') return !(num(f.prevReading) > 0);
    if (field === 'vehicleNo') return !f.vehicleNo.trim();
    return !f.pump.trim();
  });
  const ready = !!(f.co && f.driverName && num(f.rate) > 0 && photosOk) && missing.length === 0;

  async function submit(force = false) {
    setSubmitting(true); setMsg(null);
    try {
      const device = getDevice();
      const payload = {
        source: 'pump' as const, fuelType: 'Diesel' as const, entryMode: 'manual' as const, date: f.date, billNo: '',
        co: f.co, pump: f.pump, fillingLocation: f.pump, vehicleNo: f.vehicleNo, driverName: f.driverName,
        diesel: num(f.diesel), rate: num(f.rate), prevReading: num(f.prevReading),
        currentReading: num(f.currentReading), fixAvg: 0, hasReceipt: !!photos.bill,
        remarks: f.remarks, photos, geo, device, ocrConfidence: avgOcr, force,
      };
      const res = await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.status === 409 && data.needsForce) { setNeedsForce(true); setMsg({ type: 'err', text: 'Exceptions detected. Review, then confirm to record.' }); return; }
      if (!res.ok) {
        const e = data.errors?.map((x: { message: string }) => x.message).join('; ') || data.error || 'Submission failed';
        setMsg({ type: 'err', text: e }); return;
      }
      setMsg({ type: 'ok', text: `Submitted ✓ Entry ${data.transaction.id} recorded (${data.transaction.validationStatus}).` });
      setF({ date: today(), co: '', pump: '', vehicleNo: '', driverName: '', diesel: '', rate: '', prevReading: '', currentReading: '', remarks: '' });
      setPhotos({}); setOcr({}); setNeedsForce(false);
      Object.values(fileRefs.current).forEach((el) => { if (el) el.value = ''; });
    } catch { setMsg({ type: 'err', text: 'Network error. Please retry.' }); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Diesel Filling Entry" subtitle="Fill the details, capture the 4 required photos, then submit. Validation runs automatically." />

      <div className="mb-4 flex items-center gap-2 text-xs">
        <span className={`badge ${geo?.status === 'ok' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>
          {geo?.status === 'ok' ? `📍 Location captured (±${geo.accuracy}m)` : geo?.status === 'denied' ? '📍 Location permission denied' : '📍 Location unavailable'}
        </span>
      </div>

      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Entry Details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Punching Date *">
            <input className="input" type="date" max={today()} value={f.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Cost Center *">
            <input className="input" list="dc-sites" value={f.co} onChange={(e) => set('co', e.target.value)} placeholder="Select cost center" />
            <datalist id="dc-sites">{opts?.sites.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Pump Name / Filling Location *">
            <input className="input" list="dc-pumps" value={f.pump} onChange={(e) => set('pump', e.target.value)} placeholder="Select pump / filling location" />
            <datalist id="dc-pumps">{opts?.pumps.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Bus Number *">
            <input className="input" list="dc-vehicles" value={f.vehicleNo} onChange={(e) => pickVehicle(e.target.value.toUpperCase())} placeholder="e.g. MH14LB9060" />
            <datalist id="dc-vehicles">{opts?.vehicles.slice(0, 1500).map((v) => <option key={v.no} value={v.no} />)}</datalist>
          </Field>
          <Field label="Driver *">
            <input className="input" list="dc-drivers" value={f.driverName} onChange={(e) => set('driverName', e.target.value)} placeholder="Driver name" />
            <datalist id="dc-drivers">{opts?.drivers.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Diesel Quantity (L) *">
            <input className="input" type="number" min="0" step="0.01" value={f.diesel} onChange={(e) => set('diesel', e.target.value)} />
          </Field>
          <Field label="Rate (₹/L) *">
            <input className="input" type="number" min="0" step="0.01" value={f.rate} onChange={(e) => set('rate', e.target.value)} />
          </Field>
          <Field label="Odometer Reading *">
            <input className="input" type="number" min="0" step="1" value={f.currentReading} onChange={(e) => set('currentReading', e.target.value)} placeholder="Current km reading" />
          </Field>
          <Field label="Previous Odometer *">
            <input className="input" type="number" min="0" step="1" value={f.prevReading} onChange={(e) => set('prevReading', e.target.value)} placeholder="Last km reading" />
          </Field>
          <Field label="Remarks">
            <input className="input" value={f.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Optional" />
          </Field>
        </div>

        <div className="mb-3 mt-6 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Required Photos ({photoCount}/4)</h3>
          {avgOcr > 0 && <span className={`badge ring-1 ${avgOcr >= cfg.ocrThreshold ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>OCR auto-fill · {avgOcr}% confidence{avgOcr < cfg.ocrThreshold ? ' — verify fields' : ''}</span>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {PHOTO_FIELDS.map(({ key, label, hint }) => (
            <div key={key} className="rounded-xl border border-dashed border-slate-300 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{label} *</span>
                {photos[key] && <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">✓ {typeof ocr[key] === 'number' ? `OCR ${ocr[key]}%` : 'Captured'}</span>}
              </div>
              <p className="mb-2 text-xs text-slate-400">{hint}</p>
              {photos[key] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[key]} alt={label} className="mb-2 h-32 w-full rounded-lg object-cover ring-1 ring-slate-200" />
              ) : null}
              <input
                ref={(el) => { fileRefs.current[key] = el; }}
                className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-brand-700"
                type="file" accept="image/*" capture="environment"
                onChange={(e) => onPhoto(key, e.target.files?.[0])} disabled={busy[key]}
              />
              {busy[key] && <p className="mt-1 text-xs text-brand-600">Processing…</p>}
              {photos[key] && typeof ocr[key] !== 'number' && !busy[key] && <p className="mt-1 text-xs text-slate-400">Scanning text…</p>}
            </div>
          ))}
        </div>

        {missing.length > 0 && (
          <div className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            Mandatory for every diesel entry — still missing: <strong>{missing.map((m) => m.label).join(', ')}</strong>
          </div>
        )}

        {msg && <div className={`mt-5 rounded-lg px-3 py-2 text-sm ring-1 ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>{msg.text}</div>}

        <div className="mt-5 flex gap-3">
          {!needsForce
            ? <button className="btn-primary" disabled={submitting || !ready} onClick={() => submit(false)}>{submitting ? 'Submitting…' : 'Submit Entry'}</button>
            : <button className="btn-danger" disabled={submitting} onClick={() => submit(true)}>{submitting ? 'Submitting…' : 'Confirm & Record'}</button>}
          {!ready && !submitting && <span className="self-center text-xs text-slate-400">Fill all required fields{cfg.requirePhotos ? ' and 4 photos' : ''} to submit.</span>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className="label">{label}</span>{children}</div>;
}
