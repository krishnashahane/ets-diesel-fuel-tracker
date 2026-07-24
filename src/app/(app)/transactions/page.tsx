'use client';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Spinner, statusBadge, riskBadge, fmt, money } from '@/components/ui';
import TxDetailModal from '@/components/TxDetailModal';

interface Tx {
  id: string; date: string; billNo: string; vehicleNo: string; driverName: string; co: string; pump: string;
  diesel: number; rate: number; amount: number; totalKm: number; recdAvg: number; excessDiesel: number;
  debitToDriver: number; status: string; validationStatus?: string; photoCount?: number;
  geo?: { status?: string } | null; exceptions?: { risk: string; message: string }[];
  entryMode?: string; currentReading?: number;
}

export default function Transactions() {
  const [items, setItems] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exc, setExc] = useState(false);
  const [mode, setMode] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const size = 25;

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), size: String(size) });
    if (q) p.set('q', q); if (from) p.set('from', from); if (to) p.set('to', to);
    if (exc) p.set('exceptions', '1'); if (mode) p.set('mode', mode);
    fetch(`/api/transactions?${p}`).then((r) => r.json()).then((j) => { setItems(j.items || []); setTotal(j.total || 0); }).finally(() => setLoading(false));
  }, [page, q, from, to, exc, mode]);

  useEffect(() => { load(); }, [load]);

  // The sheet is generated from live data on every click — no stale snapshot.
  function download(format: 'csv' | 'xls') {
    const p = new URLSearchParams({ format });
    if (from) p.set('from', from); if (to) p.set('to', to);
    if (exc) p.set('exceptions', '1'); if (mode) p.set('mode', mode);
    window.location.href = `/api/reports/export?${p}`;
  }

  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <div>
      <PageHeader title="Transactions" subtitle={`${fmt(total)} records · export reflects current data`}
        action={(
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => download('xls')}>Download Excel</button>
            <button className="btn-ghost" onClick={() => download('csv')}>CSV</button>
          </div>
        )} />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div><span className="label">Search</span><input className="input" placeholder="Bus / driver / bill" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} /></div>
        <div><span className="label">From</span><input className="input" type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} /></div>
        <div><span className="label">To</span><input className="input" type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} /></div>
        <div>
          <span className="label">Entry Mode</span>
          <select className="input" value={mode} onChange={(e) => { setPage(1); setMode(e.target.value); }}>
            <option value="">All</option>
            <option value="manual">In-app entry</option>
            <option value="register">Register upload</option>
          </select>
        </div>
        <label className="flex items-center gap-2 py-2 text-sm text-slate-600"><input type="checkbox" checked={exc} onChange={(e) => { setPage(1); setExc(e.target.checked); }} />Exceptions only</label>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : (
          <table className="min-w-full">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>{['Date', 'Bill', 'Bus No.', 'Driver', 'Site', 'Diesel', 'Odometer', 'Amount', 'KM', 'Mileage', 'Excess', 'Status', 'Check', 'Mode', 'Photos', 'Loc', 'Risk', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const risk = t.exceptions?.length ? t.exceptions.reduce((m, e) => rank(e.risk) > rank(m) ? e.risk : m, 'low') : null;
                return (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="td">{t.date}</td>
                    <td className="td">{t.billNo || '—'}</td>
                    <td className="td font-medium">{t.vehicleNo}</td>
                    <td className="td">{t.driverName}</td>
                    <td className="td">{t.co}</td>
                    <td className="td text-right">{fmt(t.diesel)}</td>
                    <td className="td text-right">{t.currentReading ? fmt(t.currentReading) : '—'}</td>
                    <td className="td text-right">{money(t.amount)}</td>
                    <td className="td text-right">{fmt(t.totalKm)}</td>
                    <td className="td text-right">{fmt(t.recdAvg)}</td>
                    <td className={`td text-right ${t.excessDiesel > 0 ? 'text-red-600' : ''}`}>{fmt(t.excessDiesel)}</td>
                    <td className="td">{statusBadge(t.status)}</td>
                    <td className="td">{vBadge(t.validationStatus)}</td>
                    <td className="td text-center" title={t.entryMode === 'register' ? 'Extracted from a register page photo' : 'Captured in the app'}>{t.entryMode === 'register' ? '📒' : '⛽'}</td>
                    <td className="td text-center">{t.photoCount ? `${t.photoCount}/4` : '—'}</td>
                    <td className="td text-center">{t.geo?.status === 'ok' ? '📍' : '—'}</td>
                    <td className="td">{risk ? riskBadge(risk) : '—'}</td>
                    <td className="td"><button className="text-brand-600 hover:underline" onClick={() => setDetailId(t.id)}>View</button></td>
                  </tr>
                );
              })}
              {!items.length && <tr><td className="td py-8 text-center text-slate-400" colSpan={18}>No transactions found.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>Page {page} of {pages}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {detailId && <TxDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
const rank = (r: string) => ({ low: 1, medium: 2, high: 3, critical: 4 }[r] || 0);
function vBadge(v?: string) {
  if (!v) return '—';
  const c = v === 'Valid' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : v === 'Invalid' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-amber-50 text-amber-700 ring-amber-200';
  return <span className={`badge ring-1 ${c}`}>{v}</span>;
}
