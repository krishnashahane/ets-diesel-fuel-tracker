// Cross-cutting request hardening helpers. Used by the proxy (edge of the app)
// and by individual route handlers (defence in depth — never rely on one layer).
import type { NextRequest } from 'next/server';

export const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Client IP as seen by the platform. x-forwarded-for's FIRST hop is the client;
// later hops are proxies and must not be trusted for rate-limit keys.
export function clientIp(req: NextRequest | Request): string {
  const h = 'headers' in req ? req.headers : new Headers();
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first.slice(0, 64);
  }
  return (h.get('x-real-ip') || '').trim().slice(0, 64) || 'unknown';
}

/**
 * CSRF: same-origin enforcement for state-changing requests.
 * SameSite=Strict cookies already block the classic cross-site form post; this
 * closes the remaining gaps (browser bugs, non-cookie clients, subdomain drift).
 * A missing Origin AND missing Referer on a mutating request is rejected.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host');
  if (!host) return false;

  const allowed = new Set<string>([host.toLowerCase()]);
  const configured = process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (configured) { try { allowed.add(new URL(configured).host.toLowerCase()); } catch { /* ignore */ } }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) allowed.add(vercelUrl.toLowerCase());
  const branchUrl = process.env.VERCEL_BRANCH_URL;
  if (branchUrl) allowed.add(branchUrl.toLowerCase());

  const hostOf = (v: string | null): string | null => {
    if (!v) return null;
    try { return new URL(v).host.toLowerCase(); } catch { return null; }
  };

  const o = hostOf(origin);
  if (o) return allowed.has(o);
  const r = hostOf(referer);
  if (r) return allowed.has(r);
  return false; // No provenance header on a write — reject.
}

// Hard body ceilings by route family. Photo uploads are the only large payloads.
const BODY_LIMITS: { test: (p: string) => boolean; bytes: number }[] = [
  { test: (p) => p.startsWith('/api/transactions/bulk'), bytes: 12 * 1024 * 1024 },
  { test: (p) => p.startsWith('/api/transactions'), bytes: 8 * 1024 * 1024 },
  { test: (p) => p.startsWith('/api/backup'), bytes: 64 * 1024 * 1024 },
];
const DEFAULT_BODY_LIMIT = 256 * 1024;

export function bodyLimitFor(pathname: string): number {
  return BODY_LIMITS.find((b) => b.test(pathname))?.bytes ?? DEFAULT_BODY_LIMIT;
}

export function declaredBodySize(req: NextRequest): number {
  const n = Number(req.headers.get('content-length') || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Per-route-family write budgets (requests / window) applied per IP + session.
export function writeBudget(pathname: string): { limit: number; windowMs: number } {
  if (pathname.startsWith('/api/auth/login')) return { limit: 8, windowMs: 60_000 };
  if (pathname.startsWith('/api/transactions/bulk')) return { limit: 20, windowMs: 60_000 };
  if (pathname.startsWith('/api/transactions')) return { limit: 60, windowMs: 60_000 };
  if (pathname.startsWith('/api/backup')) return { limit: 5, windowMs: 60_000 };
  if (pathname.startsWith('/api/users')) return { limit: 30, windowMs: 60_000 };
  return { limit: 120, windowMs: 60_000 };
}

// Response headers applied to every API response: never cache authenticated data.
export const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
} as const;
