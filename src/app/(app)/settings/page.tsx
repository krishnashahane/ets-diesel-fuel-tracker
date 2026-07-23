'use client';
import { useEffect, useRef, useState } from 'react';
import { PageHeader, Spinner } from '@/components/ui';
import type { AppSettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';

export default function SettingsPage() {
  const [cfg, setCfg] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((j) => j.settings && setCfg(j.settings)).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
      const j = await res.json();
      if (!res.ok) { setMsg({ type: 'err', text: j.error || 'Save failed' }); return; }
      setCfg(j.settings); setMsg({ type: 'ok', text: 'Settings saved.' });
    } catch { setMsg({ type: 'err', text: 'Network error' }); }
    finally { setSaving(false); }
  }

  function backup() { window.location.href = '/api/backup'; }

  async function restore(file?: File) {
    if (!file) return;
    if (!confirm('Restore will merge this backup into the live database. Continue?')) return;
    setRestoring(true); setMsg(null);
    try {
      const text = await file.text();
      const res = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
      const j = await res.json();
      if (!res.ok) { setMsg({ type: 'err', text: j.error || 'Restore failed' }); return; }
      setMsg({ type: 'ok', text: `Restored ${j.restored.transactions} transactions, ${j.restored.users} users, ${j.restored.masters} masters.` });
    } catch { setMsg({ type: 'err', text: 'Invalid backup file' }); }
    finally { setRestoring(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="System Settings" subtitle="OCR configuration, data backup and restore. Super Admin only." />

      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ring-1 ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>{msg.text}</div>}

      <div className="card mb-5 p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">OCR Configuration</h3>
        <label className="mb-4 flex items-center justify-between">
          <span className="text-sm text-slate-700">Enable OCR auto-fill<span className="block text-xs text-slate-400">Read photos and pre-fill fields automatically.</span></span>
          <input type="checkbox" checked={cfg.ocrEnabled} onChange={(e) => setCfg({ ...cfg, ocrEnabled: e.target.checked })} className="h-5 w-5" />
        </label>
        <label className="mb-4 flex items-center justify-between">
          <span className="text-sm text-slate-700">Require all 4 photos<span className="block text-xs text-slate-400">Block submission until every photo is captured.</span></span>
          <input type="checkbox" checked={cfg.requirePhotos} onChange={(e) => setCfg({ ...cfg, requirePhotos: e.target.checked })} className="h-5 w-5" />
        </label>
        <div className="mb-2">
          <label className="label">OCR confidence threshold: {cfg.ocrThreshold}%</label>
          <input type="range" min={0} max={100} step={5} value={cfg.ocrThreshold}
            onChange={(e) => setCfg({ ...cfg, ocrThreshold: Number(e.target.value) })} className="w-full accent-brand-600" />
          <p className="text-xs text-slate-400">Entries below this OCR confidence are flagged for manual review.</p>
        </div>
        <div className="mt-4">
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Backup &amp; Restore</h3>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-ghost" onClick={backup}>⬇ Download Backup (JSON)</button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={restoring}>{restoring ? 'Restoring…' : '⬆ Restore from Backup'}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
        </div>
        <p className="mt-3 text-xs text-slate-400">Backup exports all users, transactions, master data and audit history. Restore merges a backup file into the live database.</p>
      </div>
    </div>
  );
}
