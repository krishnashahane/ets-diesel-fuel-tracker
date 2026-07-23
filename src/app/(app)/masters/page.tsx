'use client';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Spinner, fmt } from '@/components/ui';

const TABS = [
  { key: 'vehicles', label: 'Vehicles' }, { key: 'drivers', label: 'Drivers' },
  { key: 'pumps', label: 'Pumps' }, { key: 'sites', label: 'Sites' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function Masters() {
  const [tab, setTab] = useState<TabKey>('vehicles');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVeh, setNewVeh] = useState({ vehicleNo: '', costCenter: '', fixedAvg: '', make: '' });
  const [msg, setMsg] = useState('');
  const size = 25;

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ type: tab, page: String(page), size: String(size) });
    if (q) p.set('q', q);
    fetch(`/api/masters?${p}`).then((r) => r.json()).then((j) => { setItems(j.items || []); setTotal(j.total || 0); }).finally(() => setLoading(false));
  }, [tab, page, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch('/api/auth/me').then((r) => r.json()).then((j) => setCanManage((j.permissions || []).includes('master:manage'))); }, []);

  async function add() {
    setMsg('');
    const body = tab === 'vehicles'
      ? { type: 'vehicles', vehicleNo: newVeh.vehicleNo, costCenter: newVeh.costCenter, make: newVeh.make, fixedAvg: newVeh.fixedAvg ? Number(newVeh.fixedAvg) : null, standardAvg: newVeh.fixedAvg ? Number(newVeh.fixedAvg) : null }
      : { type: tab, name: newName };
    const res = await fetch('/api/masters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setMsg(data.error || 'Failed'); return; }
    setAdding(false); setNewName(''); setNewVeh({ vehicleNo: '', costCenter: '', fixedAvg: '', make: '' }); setPage(1); load();
  }

  const cols = items.length ? Object.keys(items[0]).filter((k) => k !== 'id') : [];
  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <div>
      <PageHeader title="Master Data" subtitle={`${fmt(total)} ${tab}`}
        action={canManage && <button className="btn-primary" onClick={() => setAdding((v) => !v)}>{adding ? 'Close' : `Add ${tab.slice(0, -1)}`}</button>} />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setPage(1); setQ(''); setAdding(false); }}
            className={`btn ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{t.label}</button>
        ))}
      </div>

      {adding && (
        <div className="card mb-4 p-4">
          {tab === 'vehicles' ? (
            <div className="grid gap-3 sm:grid-cols-4">
              <input className="input" placeholder="Vehicle No *" value={newVeh.vehicleNo} onChange={(e) => setNewVeh({ ...newVeh, vehicleNo: e.target.value.toUpperCase() })} />
              <input className="input" placeholder="Cost Center" value={newVeh.costCenter} onChange={(e) => setNewVeh({ ...newVeh, costCenter: e.target.value })} />
              <input className="input" placeholder="Make" value={newVeh.make} onChange={(e) => setNewVeh({ ...newVeh, make: e.target.value })} />
              <input className="input" type="number" placeholder="Std Avg km/l" value={newVeh.fixedAvg} onChange={(e) => setNewVeh({ ...newVeh, fixedAvg: e.target.value })} />
            </div>
          ) : (
            <input className="input max-w-sm" placeholder="Name *" value={newName} onChange={(e) => setNewName(e.target.value)} />
          )}
          {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
          <button className="btn-primary mt-3" onClick={add}>Save</button>
        </div>
      )}

      <div className="card mb-4 p-4"><input className="input max-w-sm" placeholder="Search…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} /></div>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : (
          <table className="min-w-full">
            <thead className="border-b border-slate-100 bg-slate-50"><tr>{cols.map((c) => <th key={c} className="th">{c}</th>)}</tr></thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={i} className="border-b border-slate-50">
                  {cols.map((c) => <td key={c} className="td">{String(row[c] ?? '—') || '—'}</td>)}
                </tr>
              ))}
              {!items.length && <tr><td className="td py-8 text-center text-slate-400" colSpan={cols.length || 1}>No records.</td></tr>}
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
    </div>
  );
}
