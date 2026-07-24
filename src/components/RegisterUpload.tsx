'use client';
// Register-sheet bulk entry. An operator photographs the manually maintained
// diesel register, the app extracts every row, and the operator confirms/corrects
// before import. Extraction is assistive — nothing is imported unread, and the
// four mandatory fields are enforced per row before the Import button unlocks.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui';
import { getDevice, getGeo, fileToDataURL } from '@/lib/clientmeta';
import { runRegisterOcr, terminateOcr } from '@/lib/ocr';
import { parseRegisterText, missingRequired, type RegisterRow } from '@/lib/register';
import type { GeoPoint } from '@/lib/types';

interface Options { vehicles: { no: string; fixAvg: number; costCenter: string }[]; drivers: string[]; pumps: string[]; sites: string[]; }

interface Draft {
  key: string;
  lineNo: number;
  rawLine: string;
  date: string;
  vehicleNo: string;
  driverName: string;
  pump: string;
  co: string;
  diesel: string;
  rate: string;
  currentReading: string;
  prevReading: string;
  billNo: string;
  remarks: string;
  confidence: number;
  notes: string[];
  edited: boolean;
  keep: boolean;
  result?: { ok: boolean; id?: string; message: string };
}

interface Defaults { date: string; co: string; pump: string; rate: string; source: 'pump' | 'tanker' }

const today = () => new Date().toISOString().slice(0, 10);
const numOf = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
const str = (v: number | undefined) => (v === undefined || v === null ? '' : String(v));

function toDraft(r: RegisterRow, i: number, d: Defaults): Draft {
  return {
    key: `r${r.lineNo}-${i}`,
    lineNo: r.lineNo,
    rawLine: r.raw,
    date: r.date || d.date,
    vehicleNo: r.vehicleNo || '',
    driverName: r.driverName || '',
    pump: r.pump || d.pump,
    co: d.co,
    diesel: str(r.diesel),
    rate: str(r.rate ?? (d.rate ? numOf(d.rate) : undefined)),
    currentReading: str(r.currentReading),
    prevReading: '',
    billNo: r.billNo || '',
    remarks: '',
    confidence: r.confidence,
    notes: r.notes,
    edited: false,
    keep: true,
  };
}

export default function RegisterUpload() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrConf, setOcrConf] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [showText, setShowText] = useState(false);
  const [rows, setRows] = useState<Draft[]>([]);
  const [defs, setDefs] = useState<Defaults>({ date: today(), co: '', pump: '', rate: '', source: 'tanker' });
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [needsForce, setNeedsForce] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { fetch('/api/masters/options').then((r) => r.json()).then((j) => !j.error && setOpts(j)).catch(() => {}); }, []);
  useEffect(() => { getGeo().then(setGeo).catch(() => setGeo(null)); }, []);
  useEffect(() => () => { terminateOcr(); }, []);

  const ctx = useMemo(() => ({
    vehicles: opts?.vehicles.map((v) => v.no) ?? [],
    drivers: opts?.drivers ?? [],
    pumps: opts?.pumps ?? [],
  }), [opts]);

  const reparse = useCallback((text: string, d: Defaults) => {
    const parsed = parseRegisterText(text, ctx, { defaultDate: d.date, defaultPump: d.pump || undefined });
    setRows(parsed.map((r, i) => toDraft(r, i, d)));
    return parsed.length;
  }, [ctx]);

  async function onFile(file?: File) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setMsg({ type: 'err', text: 'Please select an image of the register page.' }); return; }
    setScanning(true); setMsg({ type: 'info', text: 'Reading the register page…' }); setRows([]); setNeedsForce(false);
    try {
      // Stored copy is downscaled; OCR internally works on a sharpened upscale.
      const stored = await fileToDataURL(file, 1800, 0.75);
      setImage(stored);
      const { text, confidence } = await runRegisterOcr(stored);
      setOcrText(text); setOcrConf(confidence);
      const n = reparse(text, defs);
      setMsg(n
        ? { type: n >= 1 ? 'ok' : 'err', text: `Extracted ${n} row(s) at ${confidence}% OCR confidence. Check every value against the photo before importing.` }
        : { type: 'err', text: 'No entries could be read. Retake the photo straight-on in good light, or add rows manually below.' });
    } catch {
      setMsg({ type: 'err', text: 'Could not process that image. Try another photo.' });
    } finally { setScanning(false); }
  }

  function setDefault<K extends keyof Defaults>(k: K, v: Defaults[K]) {
    const next = { ...defs, [k]: v };
    setDefs(next);
    // Apply the new default to rows that are still blank in that column.
    setRows((prev) => prev.map((r) => {
      if (k === 'co') return r.co ? r : { ...r, co: v as string };
      if (k === 'pump') return r.pump ? r : { ...r, pump: v as string };
      if (k === 'date') return r.date ? r : { ...r, date: v as string };
      if (k === 'rate') return r.rate ? r : { ...r, rate: v as string };
      return r;
    }));
  }

  function applyToAll(k: 'co' | 'pump' | 'date' | 'rate') {
    const v = defs[k];
    if (!v) return;
    setRows((prev) => prev.map((r) => ({ ...r, [k]: v, edited: true })));
  }

  type TextField = 'date' | 'vehicleNo' | 'driverName' | 'pump' | 'co' | 'diesel' | 'rate' | 'currentReading' | 'prevReading' | 'billNo' | 'remarks';
  function edit(key: string, field: TextField, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value, edited: true, result: undefined } : r)));
    setNeedsForce(false);
  }
  function toggleKeep(key: string, keep: boolean) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, keep } : r)));
    setNeedsForce(false);
  }

  function addBlankRow() {
    setRows((prev) => [...prev, {
      key: `m${Date.now()}${prev.length}`, lineNo: 0, rawLine: '(added manually)',
      date: defs.date, vehicleNo: '', driverName: '', pump: defs.pump, co: defs.co,
      diesel: '', rate: defs.rate, currentReading: '', prevReading: '', billNo: '', remarks: '',
      confidence: 100, notes: [], edited: true, keep: true,
    }]);
  }

  function reset() {
    setImage(null); setOcrText(''); setOcrConf(0); setRows([]); setMsg(null); setNeedsForce(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  const kept = rows.filter((r) => r.keep);
  const invalid = kept.filter((r) => missingRequired({
    diesel: numOf(r.diesel), currentReading: numOf(r.currentReading), vehicleNo: r.vehicleNo, pump: r.pump,
  }).length > 0);
  const unknownVehicle = kept.filter((r) => r.vehicleNo && ctx.vehicles.length > 0 && !ctx.vehicles.includes(r.vehicleNo.toUpperCase().replace(/\s+/g, '')));
  const canImport = kept.length > 0 && invalid.length === 0 && !importing && !scanning;

  async function doImport(force = false) {
    setImporting(true); setMsg(null);
    try {
      const payload = {
        registerPhoto: image ?? undefined,
        ocrText: ocrText.slice(0, 50_000),
        ocrConfidence: ocrConf,
        geo, device: getDevice(), force,
        rows: kept.map((r) => ({
          lineNo: r.lineNo, rawLine: r.rawLine.slice(0, 400), edited: r.edited,
          source: defs.source, fuelType: 'Diesel' as const,
          date: r.date, billNo: r.billNo, co: r.co,
          pump: r.pump, fillingLocation: r.pump,
          vehicleNo: r.vehicleNo, driverName: r.driverName,
          diesel: numOf(r.diesel), rate: numOf(r.rate),
          currentReading: numOf(r.currentReading), prevReading: numOf(r.prevReading),
          remarks: r.remarks,
        })),
      };
      const res = await fetch('/api/transactions/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'err', text: data.error || 'Import failed.' });
        return;
      }
      const byLine = new Map<number, { ok: boolean; id?: string; errors: { message: string }[]; exceptions: { message: string }[]; needsForce?: boolean }>();
      (data.results || []).forEach((x: { lineNo: number; ok: boolean; id?: string; errors: { message: string }[]; exceptions: { message: string }[]; needsForce?: boolean }, i: number) => {
        byLine.set(i, x);
      });
      setRows((prev) => {
        let i = 0;
        return prev.map((r) => {
          if (!r.keep) return r;
          const res2 = byLine.get(i++);
          if (!res2) return r;
          return {
            ...r,
            keep: !res2.ok,      // successfully imported rows drop out of the pending list
            result: {
              ok: res2.ok,
              id: res2.id,
              message: res2.ok
                ? `Imported as ${res2.id}`
                : (res2.errors?.map((e) => e.message).join('; ') || 'Rejected'),
            },
          };
        });
      });
      const anyForce = (data.results || []).some((x: { needsForce?: boolean }) => x.needsForce);
      setNeedsForce(!!anyForce);
      setMsg({
        type: data.imported > 0 ? 'ok' : 'err',
        text: `${data.imported} entry(ies) imported for review. ${data.failed} row(s) not imported${anyForce ? ' — high-risk exceptions need confirmation.' : '.'}`,
      });
    } catch {
      setMsg({ type: 'err', text: 'Network error. Please retry.' });
    } finally { setImporting(false); }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Register Upload — Bulk Diesel Entry"
        subtitle="For tanker / off-site filling. Photograph the manual diesel register page; the app reads every row, you confirm the values, and the entries are created in one go."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className={`badge ring-1 ${geo?.status === 'ok' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
          {geo?.status === 'ok' ? `📍 Location captured (±${geo.accuracy}m)` : geo?.status === 'denied' ? '📍 Location permission denied' : '📍 Location unavailable'}
        </span>
        {ocrConf > 0 && <span className={`badge ring-1 ${ocrConf >= 70 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>OCR confidence {ocrConf}%</span>}
        {rows.length > 0 && <span className="badge bg-slate-100 text-slate-600 ring-1 ring-slate-200">{kept.length} row(s) pending</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* ---------------------------------------------------------- capture */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">1 · Register Page Photo</h3>
            <input
              ref={fileRef}
              className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-brand-700"
              type="file" accept="image/*" capture="environment"
              onChange={(e) => onFile(e.target.files?.[0])} disabled={scanning || importing}
            />
            <p className="mt-2 text-xs text-slate-400">Shoot straight-on, fill the frame with the table, avoid shadows and glare.</p>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Register page" className="mt-3 max-h-72 w-full rounded-lg object-contain ring-1 ring-slate-200" />
            )}
            {scanning && <p className="mt-2 text-xs text-brand-600">Scanning the page… this can take 10–30 seconds.</p>}
            {ocrText && (
              <button className="mt-3 text-xs text-brand-600 underline" onClick={() => setShowText((v) => !v)}>
                {showText ? 'Hide' : 'Show'} raw scanned text
              </button>
            )}
            {showText && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 ring-1 ring-slate-200">{ocrText}</pre>}
          </div>

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">2 · Page Defaults</h3>
            <p className="mb-3 text-xs text-slate-400">Applied to rows the scan left blank. “Apply to all” overwrites every row.</p>
            <DefaultField label="Filling Date" onApply={() => applyToAll('date')}>
              <input className="input" type="date" max={today()} value={defs.date} onChange={(e) => setDefault('date', e.target.value)} />
            </DefaultField>
            <DefaultField label="Pump Name / Filling Location *" onApply={() => applyToAll('pump')}>
              <input className="input" list="ru-pumps" value={defs.pump} onChange={(e) => setDefault('pump', e.target.value)} placeholder="e.g. Tanker – Chakan Yard" />
              <datalist id="ru-pumps">{opts?.pumps.map((p) => <option key={p} value={p} />)}</datalist>
            </DefaultField>
            <DefaultField label="Cost Center / Site" onApply={() => applyToAll('co')}>
              <input className="input" list="ru-sites" value={defs.co} onChange={(e) => setDefault('co', e.target.value)} placeholder="Select cost center" />
              <datalist id="ru-sites">{opts?.sites.map((p) => <option key={p} value={p} />)}</datalist>
            </DefaultField>
            <DefaultField label="Rate (₹/L)" onApply={() => applyToAll('rate')}>
              <input className="input" type="number" min="0" step="0.01" value={defs.rate} onChange={(e) => setDefault('rate', e.target.value)} placeholder="Day rate" />
            </DefaultField>
            <div className="mt-3">
              <span className="label">Filling Source</span>
              <select className="input" value={defs.source} onChange={(e) => setDefault('source', e.target.value as 'pump' | 'tanker')}>
                <option value="tanker">Tanker (off-site)</option>
                <option value="pump">Pump</option>
              </select>
            </div>
            {ocrText && (
              <button className="btn-ghost mt-4 w-full" disabled={scanning} onClick={() => { const n = reparse(ocrText, defs); setMsg({ type: 'info', text: `Re-read the scan — ${n} row(s).` }); }}>
                Re-read scan with these defaults
              </button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------ grid */}
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700">3 · Review &amp; Correct Every Row</h3>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={addBlankRow} disabled={importing}>+ Add row</button>
              <button className="btn-ghost" onClick={reset} disabled={importing || scanning}>Clear</button>
            </div>
          </div>

          {rows.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">
              {scanning ? 'Reading the register…' : 'Upload a register photo to begin, or add rows manually.'}
            </p>
          )}

          {rows.length > 0 && (
            <>
              <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                Values were read from a photograph of handwriting. <strong>Check each one against the page.</strong> Diesel quantity, odometer reading, bus number and pump / filling location are mandatory — rows missing any of them cannot be imported.
              </div>
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[1120px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 w-8"></th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Bus Number *</th>
                      <th className="px-2 py-2">Diesel (L) *</th>
                      <th className="px-2 py-2">Odometer *</th>
                      <th className="px-2 py-2">Pump / Location *</th>
                      <th className="px-2 py-2">Rate</th>
                      <th className="px-2 py-2">Driver</th>
                      <th className="px-2 py-2">Cost Center</th>
                      <th className="px-2 py-2">Bill No.</th>
                      <th className="px-2 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const miss = missingRequired({
                        diesel: numOf(r.diesel), currentReading: numOf(r.currentReading), vehicleNo: r.vehicleNo, pump: r.pump,
                      });
                      const bad = r.keep && miss.length > 0;
                      const unknown = !!r.vehicleNo && ctx.vehicles.length > 0 && !ctx.vehicles.includes(r.vehicleNo.toUpperCase().replace(/\s+/g, ''));
                      return (
                        <tr key={r.key} className={`border-b border-slate-100 align-top ${!r.keep ? 'opacity-45' : bad ? 'bg-red-50/60' : ''}`}>
                          <td className="px-2 py-1.5">
                            <input type="checkbox" checked={r.keep} onChange={(e) => toggleKeep(r.key, e.target.checked)} title="Include this row" />
                          </td>
                          <td className="px-2 py-1.5"><input className="input !py-1 !text-xs w-[120px]" type="date" max={today()} value={r.date} onChange={(e) => edit(r.key, 'date', e.target.value)} /></td>
                          <td className="px-2 py-1.5">
                            <input className={`input !py-1 !text-xs w-[120px] ${!r.vehicleNo ? 'ring-red-300' : unknown ? 'ring-amber-300' : ''}`} list="ru-vehicles"
                              value={r.vehicleNo} onChange={(e) => edit(r.key, 'vehicleNo', e.target.value.toUpperCase())} placeholder="MH14LB9060" />
                            {unknown && <span className="mt-0.5 block text-[10px] text-amber-600">Not in master</span>}
                          </td>
                          <td className="px-2 py-1.5"><input className={`input !py-1 !text-xs w-[86px] ${numOf(r.diesel) <= 0 ? 'ring-red-300' : ''}`} type="number" min="0" step="0.01" value={r.diesel} onChange={(e) => edit(r.key, 'diesel', e.target.value)} /></td>
                          <td className="px-2 py-1.5"><input className={`input !py-1 !text-xs w-[104px] ${numOf(r.currentReading) <= 0 ? 'ring-red-300' : ''}`} type="number" min="0" step="1" value={r.currentReading} onChange={(e) => edit(r.key, 'currentReading', e.target.value)} /></td>
                          <td className="px-2 py-1.5"><input className={`input !py-1 !text-xs w-[150px] ${!r.pump ? 'ring-red-300' : ''}`} list="ru-pumps" value={r.pump} onChange={(e) => edit(r.key, 'pump', e.target.value)} /></td>
                          <td className="px-2 py-1.5"><input className="input !py-1 !text-xs w-[76px]" type="number" min="0" step="0.01" value={r.rate} onChange={(e) => edit(r.key, 'rate', e.target.value)} /></td>
                          <td className="px-2 py-1.5"><input className="input !py-1 !text-xs w-[130px]" list="ru-drivers" value={r.driverName} onChange={(e) => edit(r.key, 'driverName', e.target.value)} /></td>
                          <td className="px-2 py-1.5"><input className="input !py-1 !text-xs w-[130px]" list="ru-sites" value={r.co} onChange={(e) => edit(r.key, 'co', e.target.value)} /></td>
                          <td className="px-2 py-1.5"><input className="input !py-1 !text-xs w-[90px]" value={r.billNo} onChange={(e) => edit(r.key, 'billNo', e.target.value)} /></td>
                          <td className="px-2 py-1.5 text-xs">
                            {r.result
                              ? <span className={r.result.ok ? 'text-emerald-600' : 'text-red-600'}>{r.result.message}</span>
                              : bad
                                ? <span className="text-red-600">Missing: {miss.join(', ')}</span>
                                : <span className={r.confidence >= 70 ? 'text-emerald-600' : 'text-amber-600'}>Read {r.confidence}%{r.edited ? ' · edited' : ''}</span>}
                            {r.notes.length > 0 && !r.result && <span className="mt-0.5 block text-[10px] text-slate-400">{r.notes.join(' · ')}</span>}
                            {r.rawLine && r.rawLine !== '(added manually)' && <span className="mt-0.5 block max-w-[240px] truncate text-[10px] text-slate-300" title={r.rawLine}>“{r.rawLine}”</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="ru-vehicles">{opts?.vehicles.slice(0, 1500).map((v) => <option key={v.no} value={v.no} />)}</datalist>
                <datalist id="ru-drivers">{opts?.drivers.map((v) => <option key={v} value={v} />)}</datalist>
              </div>
            </>
          )}

          {msg && <div className={`mt-4 rounded-lg px-3 py-2 text-sm ring-1 ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : msg.type === 'info' ? 'bg-blue-50 text-blue-700 ring-blue-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>{msg.text}</div>}

          {rows.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!needsForce
                ? <button className="btn-primary" disabled={!canImport} onClick={() => doImport(false)}>{importing ? 'Importing…' : `Import ${kept.length} Entry(ies)`}</button>
                : <button className="btn-danger" disabled={importing} onClick={() => doImport(true)}>{importing ? 'Importing…' : 'Confirm & Import Despite Exceptions'}</button>}
              {invalid.length > 0 && <span className="text-xs text-red-600">{invalid.length} row(s) missing a mandatory field.</span>}
              {invalid.length === 0 && unknownVehicle.length > 0 && <span className="text-xs text-amber-600">{unknownVehicle.length} bus number(s) not in master data — they will be rejected on import.</span>}
              <span className="text-xs text-slate-400">Imported entries are created with status <strong>Submitted / Review</strong> for verifier sign-off.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DefaultField({ label, onApply, children }: { label: string; onApply: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <button className="text-[11px] text-brand-600 underline" onClick={onApply} type="button">Apply to all</button>
      </div>
      {children}
    </div>
  );
}
