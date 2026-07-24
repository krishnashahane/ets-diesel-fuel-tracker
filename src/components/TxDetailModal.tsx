'use client';
import { useEffect, useState } from 'react';
import { Spinner, money, fmt } from '@/components/ui';
import type { Transaction } from '@/lib/types';

const PHOTO_LABELS: Record<string, string> = {
  plate: 'Number Plate', bill: 'Bill / Slip', meter: 'Diesel Meter', odometer: 'Odometer', register: 'Register Page',
};

interface RegisterPageInfo { image: string; text: string; ocrConfidence: number; rowCount: number; createdBy: string; createdAt: string }

export default function TxDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [tx, setTx] = useState<Transaction | null>(null);
  const [reg, setReg] = useState<RegisterPageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setReg(null);
    fetch(`/api/transactions/${id}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      if (j.error) { setErr(j.error); return; }
      setTx(j.transaction);
      // The register scan is stored once per import batch, so fetch it separately.
      const batch = j.transaction?.registerRef?.batchId;
      if (batch) {
        fetch(`/api/register/${batch}`).then((r) => r.json())
          .then((p) => { if (alive && !p.error) setReg(p); }).catch(() => {});
      }
    }).catch(() => alive && setErr('Failed to load')).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const photos = tx?.photos ? Object.entries(tx.photos).filter(([, v]) => v) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <h3 className="text-lg font-semibold text-slate-800">Entry Details</h3>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="p-5">
          {loading ? <Spinner /> : err ? <p className="text-sm text-red-600">{err}</p> : tx && (
            <div className="space-y-6">
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <Info k="Entry ID" v={tx.id} />
                <Info k="Punching Date" v={tx.date} />
                <Info k="Cost Center" v={tx.co} />
                <Info k="Pump / Filling Location" v={tx.pump || tx.fillingLocation || '—'} />
                <Info k="Bus Number" v={tx.vehicleNo} />
                <Info k="Driver" v={tx.driverName} />
                <Info k="Diesel Qty" v={`${fmt(tx.diesel)} L`} />
                <Info k="Rate" v={money(tx.rate)} />
                <Info k="Amount" v={money(tx.amount)} />
                <Info k="Odometer" v={tx.currentReading ? fmt(tx.currentReading) : '—'} />
                <Info k="Validation" v={tx.validationStatus || '—'} />
                <Info k="Entry Mode" v={tx.entryMode === 'register' ? 'Register upload' : 'In-app capture'} />
                <Info k="OCR Confidence" v={tx.ocrConfidence ? `${tx.ocrConfidence}%` : '—'} />
                <Info k="Submitted By" v={tx.createdBy || '—'} />
                <Info k="Submitted At" v={tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '—'} />
              </div>

              {tx.exceptions && tx.exceptions.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-700">Exceptions</h4>
                  {tx.exceptions.map((e, i) => <p key={i} className="text-sm text-amber-700">• {e.message} ({e.risk})</p>)}
                </div>
              )}

              {tx.registerRef && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-700">Source Register Page</h4>
                  <p className="text-xs text-slate-500">
                    Batch {tx.registerRef.batchId} · line {tx.registerRef.lineNo} · scan confidence {tx.registerRef.ocrConfidence}%
                    {tx.registerRef.edited ? ' · corrected by the operator before import' : ' · imported as read'}
                  </p>
                  {tx.registerRef.rawLine && (
                    <p className="mt-1 rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200">{tx.registerRef.rawLine}</p>
                  )}
                  {reg?.image && (
                    <a href={reg.image} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={reg.image} alt="Register page" className="max-h-72 w-full rounded-lg object-contain ring-1 ring-slate-200" />
                      <span className="mt-1 block text-center text-xs text-brand-600">Open full register page ↗</span>
                    </a>
                  )}
                </div>
              )}

              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">Location &amp; Device</h4>
                {tx.geo?.status === 'ok' ? (
                  <div className="text-sm text-slate-600">
                    <p>Coordinates: {tx.geo.lat}, {tx.geo.lng} (±{tx.geo.accuracy}m)</p>
                    <p className="text-xs text-slate-400">Captured {new Date(tx.geo.ts).toLocaleString()}</p>
                    <a className="text-brand-600 hover:underline" href={`https://www.openstreetmap.org/?mlat=${tx.geo.lat}&mlon=${tx.geo.lng}#map=17/${tx.geo.lat}/${tx.geo.lng}`} target="_blank" rel="noopener noreferrer">Open map ↗</a>
                  </div>
                ) : <p className="text-sm text-slate-400">Location {tx.geo?.status === 'denied' ? 'permission denied' : 'unavailable'}.</p>}
                {tx.device && <p className="mt-1 text-xs text-slate-400">{tx.device.browser} · {tx.device.os} · {tx.device.deviceType}{tx.ip ? ` · IP ${tx.ip}` : ''}</p>}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">Photos ({photos.length}/4)</h4>
                {photos.length ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {photos.map(([k, url]) => (
                      <a key={k} href={url as string} target="_blank" rel="noopener noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url as string} alt={PHOTO_LABELS[k] || k} className="h-24 w-full rounded-lg object-cover ring-1 ring-slate-200" />
                        <span className="mt-1 block text-center text-xs text-slate-500">{PHOTO_LABELS[k] || k}</span>
                      </a>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-400">No photos attached.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 border-b border-slate-50 py-1"><dt className="text-sm text-slate-500">{k}</dt><dd className="text-sm font-medium text-slate-800">{v}</dd></div>;
}
