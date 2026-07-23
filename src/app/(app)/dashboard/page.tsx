'use client';
import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PageHeader, Spinner, fmt, money } from '@/components/ui';

interface Data {
  kpis: Record<string, number>;
  topVehicles: { vehicleNo: string; diesel: number; cost: number }[];
  topSites: { site: string; diesel: number }[];
  lowMileage: { vehicleNo: string; mileage: number }[];
  trend: { date: string; diesel: number }[];
}

function Kpi({ label, value, tone = 'slate' }: { label: string; value: string; tone?: string }) {
  const tones: Record<string, string> = { slate: 'text-slate-800', red: 'text-red-600', amber: 'text-amber-600', green: 'text-emerald-600', brand: 'text-brand-700' };
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/dashboard').then((r) => r.json()).then((j) => j.error ? setErr(j.error) : setD(j)).catch(() => setErr('Failed to load'));
  }, []);

  if (err) return <div className="card p-6 text-red-600">{err}</div>;
  if (!d) return <Spinner />;
  const k = d.kpis;

  return (
    <div>
      <PageHeader title="Executive Dashboard" subtitle="Fuel consumption, exceptions and financial leakage overview" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Transactions" value={fmt(k.transactions)} tone="brand" />
        <Kpi label="Diesel (L)" value={fmt(k.totalDiesel)} />
        <Kpi label="Fuel Cost" value={money(k.totalCost)} />
        <Kpi label="Avg Mileage" value={`${fmt(k.avgMileage)} km/l`} tone="green" />
        <Kpi label="Open Exceptions" value={fmt(k.openExceptions)} tone="amber" />
        <Kpi label="Pending Approvals" value={fmt(k.pendingApprovals)} tone="amber" />
        <Kpi label="Excess Diesel (L)" value={fmt(k.excessDiesel)} tone="red" />
        <Kpi label="Leakage Amount" value={money(k.leakageAmount)} tone="red" />
        <Kpi label="Leakage %" value={`${fmt(k.financialLeakagePct)}%`} tone="red" />
        <Kpi label="Vehicles" value={fmt(k.vehicles)} />
        <Kpi label="Drivers" value={fmt(k.drivers)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Daily Diesel Consumption Trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.trend} margin={{ left: -10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="diesel" stroke="#1b6ff5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Top Consuming Vehicles</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.topVehicles} margin={{ left: -10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="vehicleNo" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="diesel" fill="#1b6ff5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Top Consuming Sites</h3>
          <table className="w-full"><tbody>
            {d.topSites.map((s) => (
              <tr key={s.site} className="border-b border-slate-50">
                <td className="td">{s.site}</td>
                <td className="td text-right font-medium">{fmt(s.diesel)} L</td>
              </tr>
            ))}
          </tbody></table>
        </div>
        <div className="card overflow-hidden">
          <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Lowest Mileage Vehicles</h3>
          <table className="w-full"><tbody>
            {d.lowMileage.map((s) => (
              <tr key={s.vehicleNo} className="border-b border-slate-50">
                <td className="td">{s.vehicleNo}</td>
                <td className="td text-right font-medium text-red-600">{fmt(s.mileage)} km/l</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
