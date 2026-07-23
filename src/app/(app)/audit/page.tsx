'use client';
import { useEffect, useState } from 'react';
import { PageHeader, Spinner } from '@/components/ui';

interface A {
  id: string; ts: string; username: string; action: string; entity: string; entityId: string; ip: string; detail?: string;
  geo?: { lat: number; lng: number; accuracy: number; status?: string } | null;
  device?: { browser: string; os: string; deviceType: string } | null;
}

export default function Audit() {
  const [items, setItems] = useState<A[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch('/api/audit?size=100').then((r) => r.json()).then((j) => setItems(j.items || [])).finally(() => setLoading(false)); }, []);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Immutable record of system actions" />
      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : (
          <table className="min-w-full">
            <thead className="border-b border-slate-100 bg-slate-50"><tr>{['Time', 'User', 'Action', 'Entity', 'IP', 'Location', 'Device', 'Detail'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b border-slate-50">
                  <td className="td">{new Date(a.ts).toLocaleString()}</td>
                  <td className="td font-medium">{a.username}</td>
                  <td className="td"><span className="badge bg-slate-100 text-slate-700">{a.action}</span></td>
                  <td className="td">{a.entity}</td>
                  <td className="td text-xs">{a.ip}</td>
                  <td className="td text-xs">
                    {a.geo?.status === 'ok'
                      ? <a className="text-brand-600 hover:underline" href={`https://www.openstreetmap.org/?mlat=${a.geo.lat}&mlon=${a.geo.lng}#map=16/${a.geo.lat}/${a.geo.lng}`} target="_blank" rel="noopener noreferrer">{a.geo.lat.toFixed(4)}, {a.geo.lng.toFixed(4)}</a>
                      : <span className="text-slate-400">{a.geo?.status === 'denied' ? 'denied' : '—'}</span>}
                  </td>
                  <td className="td text-xs text-slate-500">{a.device ? `${a.device.browser}/${a.device.os}` : '—'}</td>
                  <td className="td text-slate-500">{a.detail || '—'}</td>
                </tr>
              ))}
              {!items.length && <tr><td className="td py-8 text-center text-slate-400" colSpan={8}>No audit entries yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
