'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Role } from '@/lib/types';
import { can, type Permission } from '@/lib/rbac';

interface NavItem { href: string; label: string; icon: string; perm: Permission; }
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', perm: 'dashboard:view' },
  { href: '/entry', label: 'Diesel Entry', icon: '⛽', perm: 'tx:create' },
  { href: '/pump-entry', label: 'Pump Filling', icon: '🛢️', perm: 'tx:view' },
  { href: '/tanker-entry', label: 'Tanker Filling', icon: '🚚', perm: 'tx:view' },
  { href: '/transactions', label: 'Transactions', icon: '📋', perm: 'tx:view' },
  { href: '/exceptions', label: 'Exceptions', icon: '⚠️', perm: 'exception:view' },
  { href: '/masters', label: 'Master Data', icon: '🗂️', perm: 'master:view' },
  { href: '/users', label: 'Users', icon: '👤', perm: 'user:manage' },
  { href: '/audit', label: 'Audit Log', icon: '🛡️', perm: 'audit:view' },
  { href: '/settings', label: 'System', icon: '⚙️', perm: 'settings:manage' },
];

export default function Shell({ user, children }: { user: { name: string; role: Role; username: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => can(user.role, n.perm));

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-brand-950 text-brand-50 transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center gap-2 px-5 text-lg font-bold">
          <Image src="/logo.png" alt="SFM" width={32} height={24} className="h-7 w-auto rounded" /> SFM Diesel
        </div>
        <nav className="mt-2 space-y-1 px-3">
          {items.map((n) => {
            const active = pathname === n.href;
            return (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? 'bg-brand-600 text-white' : 'text-brand-100 hover:bg-brand-900'}`}>
                <span>{n.icon}</span>{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 w-full border-t border-brand-900 p-4 text-xs text-brand-200">
          <div className="font-medium text-white">{user.name}</div>
          <div className="capitalize">{user.role.replace('_', ' ')}</div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <button className="rounded-lg p-2 ring-1 ring-slate-200 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">☰</button>
          <div className="hidden text-sm text-slate-500 lg:block">Diesel Filling Management System</div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:block">{user.username}</span>
            <button className="btn-ghost" onClick={logout}>Sign out</button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
