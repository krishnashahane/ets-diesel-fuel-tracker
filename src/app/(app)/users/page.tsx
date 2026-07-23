'use client';
import { useEffect, useState } from 'react';
import { PageHeader, Spinner } from '@/components/ui';

interface U { id: string; username: string; name: string; role: string; active: boolean; createdAt: string; }
const ROLES = ['operations', 'site_rep', 'supervisor', 'driver', 'admin', 'superadmin'];

export default function Users() {
  const [items, setItems] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: '', name: '', role: 'supervisor', password: '' });
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);

  function load() { setLoading(true); fetch('/api/users').then((r) => r.json()).then((j) => setItems(j.items || [])).finally(() => setLoading(false)); }
  useEffect(load, []);

  async function create() {
    setMsg(null);
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setMsg({ t: 'err', m: data.error || 'Failed' }); return; }
    setMsg({ t: 'ok', m: `Created ${data.user.username}` }); setForm({ username: '', name: '', role: 'supervisor', password: '' }); load();
  }
  async function toggle(u: U) { await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id, active: !u.active }) }); load(); }
  async function reset(u: U) { const p = prompt(`New password for ${u.username} (min 8)`); if (!p) return; const r = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id, password: p }) }); setMsg(r.ok ? { t: 'ok', m: 'Password reset' } : { t: 'err', m: 'Failed (min 8 chars)' }); }

  return (
    <div>
      <PageHeader title="User Management" subtitle={`${items.length} users`} />
      <div className="card mb-5 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Create user</h3>
        <div className="grid gap-3 sm:grid-cols-5">
          <input className="input" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="input" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <input className="input" type="password" placeholder="Password (min 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button className="btn-primary" onClick={create}>Create</button>
        </div>
        {msg && <p className={`mt-2 text-sm ${msg.t === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{msg.m}</p>}
      </div>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : (
          <table className="min-w-full">
            <thead className="border-b border-slate-100 bg-slate-50"><tr>{['Username', 'Name', 'Role', 'Status', 'Created', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-slate-50">
                  <td className="td font-medium">{u.username}</td>
                  <td className="td">{u.name}</td>
                  <td className="td capitalize">{u.role.replace('_', ' ')}</td>
                  <td className="td"><span className={`badge ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
                  <td className="td">{u.createdAt?.slice(0, 10)}</td>
                  <td className="td"><div className="flex gap-2">
                    <button className="text-xs text-brand-600 hover:underline" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="text-xs text-slate-500 hover:underline" onClick={() => reset(u)}>Reset PW</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
