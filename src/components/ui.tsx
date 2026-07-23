'use client';
import React from 'react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />{label}</div>;
}

export function riskBadge(risk: string) {
  const map: Record<string, string> = {
    low: 'bg-slate-100 text-slate-600', medium: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
  };
  return <span className={`badge ${map[risk] || map.low}`}>{risk}</span>;
}

export function statusBadge(status: string) {
  const map: Record<string, string> = {
    Draft: 'bg-slate-100 text-slate-600', Submitted: 'bg-blue-100 text-blue-700',
    Verified: 'bg-indigo-100 text-indigo-700', Approved: 'bg-emerald-100 text-emerald-700',
    Locked: 'bg-slate-800 text-white',
  };
  return <span className={`badge ${map[status] || map.Draft}`}>{status}</span>;
}

export const fmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);
export const money = (n: number) => '₹' + fmt(Math.round((n || 0) * 100) / 100);
