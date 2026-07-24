import type { Role } from './types';

export type Permission =
  | 'tx:create' | 'tx:view' | 'tx:verify' | 'tx:approve' | 'tx:export'
  | 'exception:view' | 'exception:manage'
  | 'master:view' | 'master:manage'
  | 'user:manage' | 'audit:view' | 'dashboard:view'
  | 'settings:manage' | 'backup:manage';

const MATRIX: Record<Role, Permission[]> = {
  superadmin: ['tx:create', 'tx:view', 'tx:verify', 'tx:approve', 'tx:export', 'exception:view', 'exception:manage', 'master:view', 'master:manage', 'user:manage', 'audit:view', 'dashboard:view', 'settings:manage', 'backup:manage'],
  admin: ['tx:create', 'tx:view', 'tx:verify', 'tx:approve', 'tx:export', 'exception:view', 'exception:manage', 'master:view', 'master:manage', 'user:manage', 'audit:view', 'dashboard:view'],
  // Workflow rule: Dashboard is restricted to Admin & Super Admin only.
  // Every other role is a "User" = Diesel Input Form only.
  operations: ['tx:create'],
  site_rep: ['tx:create'],
  supervisor: ['tx:create'],
  driver: ['tx:create'],
};

export function can(role: Role, perm: Permission): boolean {
  return MATRIX[role]?.includes(perm) ?? false;
}

export function permsFor(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}

// Landing page per role. Form-only users never reach the dashboard.
export function landingFor(role: Role): string {
  return can(role, 'dashboard:view') ? '/dashboard' : '/entry';
}

// Page-path -> required permission. Used for defense-in-depth route gating.
const PAGE_PERM: { prefix: string; perm: Permission }[] = [
  { prefix: '/dashboard', perm: 'dashboard:view' },
  { prefix: '/entry', perm: 'tx:create' },
  { prefix: '/register-upload', perm: 'tx:create' },
  { prefix: '/pump-entry', perm: 'tx:view' },
  { prefix: '/tanker-entry', perm: 'tx:view' },
  { prefix: '/transactions', perm: 'tx:view' },
  { prefix: '/exceptions', perm: 'exception:view' },
  { prefix: '/masters', perm: 'master:view' },
  { prefix: '/users', perm: 'user:manage' },
  { prefix: '/audit', perm: 'audit:view' },
  { prefix: '/settings', perm: 'settings:manage' },
];

export function pagePermFor(pathname: string): Permission | null {
  return PAGE_PERM.find((p) => pathname === p.prefix || pathname.startsWith(p.prefix + '/'))?.perm ?? null;
}
