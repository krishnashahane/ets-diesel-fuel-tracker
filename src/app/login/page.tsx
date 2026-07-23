'use client';
import { Suspense, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { landingFor } from '@/lib/rbac';
import { getDevice, getGeo } from '@/lib/clientmeta';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const [device, geo] = await Promise.all([
        Promise.resolve(getDevice()),
        getGeo().catch(() => null),
      ]);
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, device, geo }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Login failed'); return; }
      const home = landingFor(data.user?.role);
      const next = params.get('next') || home;
      router.replace(next.startsWith('/') ? next : home);
      router.refresh();
    } catch { setErr('Network error. Please retry.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950">
      {/* Animated aurora background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[38rem] w-[38rem] rounded-full bg-brand-600/30 blur-[120px] animate-aurora" />
        <div className="absolute -right-40 top-1/3 h-[34rem] w-[34rem] rounded-full bg-brand-400/20 blur-[120px] animate-aurora-slow" />
        <div className="absolute -bottom-40 left-1/3 h-[30rem] w-[30rem] rounded-full bg-indigo-500/20 blur-[120px] animate-aurora" />
        <div className="absolute inset-0 bg-grid opacity-[0.15]" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        {/* Brand / product panel */}
        <div className="hidden flex-col justify-between p-12 lg:flex">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="SFM" width={52} height={39} priority className="h-11 w-auto drop-shadow-lg" />
            <span className="text-lg font-semibold tracking-tight text-white">SFM · Diesel Management</span>
          </div>
          <div className="max-w-lg">
            <h2 className="text-4xl font-bold leading-tight text-white">
              Fuel data,<br /><span className="text-brand-300">verified &amp; auditable.</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              Capture diesel filling in seconds. Rule-based validation, exception
              detection, live analytics and a full audit trail — built for scale.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                ['Validated', 'Every entry rule-checked'],
                ['Auditable', 'Immutable activity log'],
                ['Real-time', 'Live dashboards'],
                ['Secure', 'RBAC · encrypted sessions'],
              ].map(([t, d]) => (
                <div key={t} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <div className="text-sm font-semibold text-white">{t}</div>
                  <div className="mt-1 text-xs text-slate-400">{d}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} SFM Fleet. Authorized access only.</p>
        </div>

        {/* Auth card */}
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <Image src="/logo.png" alt="SFM" width={72} height={54} priority className="h-14 w-auto drop-shadow-lg" />
              <h1 className="mt-3 text-xl font-bold text-white">SFM Diesel Management</h1>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/95 p-8 shadow-2xl backdrop-blur-xl ring-1 ring-black/5">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h2>
              <p className="mt-1 text-sm text-slate-500">Sign in to continue to your dashboard.</p>

              {err && (
                <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
                  <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-5a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>
                  <span>{err}</span>
                </div>
              )}

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label className="label">Username</label>
                  <input
                    className="input" value={username} onChange={(e) => setU(e.target.value)}
                    autoComplete="username" autoFocus required placeholder="e.g. admin"
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <input
                      className="input pr-11" type={show ? 'text' : 'password'} value={password}
                      onChange={(e) => setP(e.target.value)} autoComplete="current-password" required placeholder="••••••••"
                    />
                    <button
                      type="button" onClick={() => setShow((s) => !s)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                      aria-label={show ? 'Hide password' : 'Show password'}
                    >
                      {show ? (
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A9.6 9.6 0 0112 4c5 0 9 4.5 10 8-.4 1.3-1.2 2.8-2.4 4M6.1 6.1C3.9 7.6 2.5 9.8 2 12c1 3.5 5 8 10 8 1.4 0 2.7-.3 3.9-.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      ) : (
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                <button className="btn-primary group w-full py-2.5 text-base" disabled={loading || !username || !password}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Signing in…</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">Sign in
                      <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.3 3.3a1 1 0 011.4 0l5 5a1 1 0 010 1.4l-5 5a1 1 0 01-1.4-1.4L13.6 11H4a1 1 0 110-2h9.6l-3.3-3.3a1 1 0 010-1.4z" clipRule="evenodd" /></svg>
                    </span>
                  )}
                </button>
              </form>
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
              Secured connection · Activity is logged &amp; audited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
