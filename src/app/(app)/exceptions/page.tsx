'use client';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Spinner, statusBadge, riskBadge, fmt, money } from '@/components/ui';

interface Tx {
  id: string; date: string; vehicleNo: string; driverName: string; co: string; diesel: number; amount: number;
  excessDiesel: number; debitToDriver: number; status: string; exceptions?: { code: string; message: string; risk: string }[];
}

export default function Exceptions() {
  const [items, setItems] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<string[]>([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/transactions?exceptions=1&size=100').then((r) => r.json()).then((j) => setItems(j.items || [])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); fetch('/api/auth/me').then((r) => r.json()).then((j) => setPerms(j.permissions || [])); }, [load]);

  async function act(id: string, action: 'advance' | 'reject') {
    setBusy(id);
    const reason = action === 'reject' ? prompt('Reason for rejection?') || '' : undefined;
    await fetch(`/api/transactions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason }) });
    setBusy(''); load();
  }
  const canVerify = perms.includes('tx:verify');
  const canApprove = perms.includes('tx:approve');

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Exception Management" subtitle={`${items.length} flagged transactions requiring review`} />
      <div className="space-y-3">
        {items.map((t) => (
          <div key={t.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800">{t.vehicleNo} <span className="font-normal text-slate-400">·</span> <span className="font-normal text-slate-600">{t.co}</span></div>
                <div className="text-xs text-slate-500">{t.date} · {t.driverName} · {fmt(t.diesel)} L · {money(t.amount)}</div>
              </div>
              <div className="flex items-center gap-2">{statusBadge(t.status)}</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.exceptions?.map((e, i) => (
                <span key={i} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs ring-1 ring-slate-200">
                  {riskBadge(e.risk)} <span className="text-slate-600">{e.message}</span>
                </span>
              ))}
            </div>
            {(canVerify || canApprove) && t.status !== 'Locked' && (
              <div className="mt-3 flex gap-2">
                {canVerify && <button className="btn-primary" disabled={busy === t.id} onClick={() => act(t.id, 'advance')}>Advance ({nextStatus(t.status)})</button>}
                {canVerify && <button className="btn-ghost" disabled={busy === t.id} onClick={() => act(t.id, 'reject')}>Reject</button>}
              </div>
            )}
          </div>
        ))}
        {!items.length && <div className="card p-8 text-center text-slate-400">No open exceptions. 🎉</div>}
      </div>
    </div>
  );
}
const nextStatus = (s: string) => ({ Draft: 'Submitted', Submitted: 'Verified', Verified: 'Approved', Approved: 'Locked' }[s] || '—');
