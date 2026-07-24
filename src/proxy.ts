import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifySession } from '@/lib/auth';
import { can, landingFor, pagePermFor } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { MUTATING, clientIp, isSameOrigin, bodyLimitFor, declaredBodySize, writeBudget, NO_STORE } from '@/lib/security';

// Endpoints reachable without a session cookie.
const PUBLIC = ['/login', '/api/auth/login', '/api/health'];
// Read-only endpoints that may additionally authenticate with an export token
// (scheduled Excel/Power Query refresh). The handler validates the token itself.
const TOKEN_AUTH = ['/api/reports/export'];

const deny = (msg: string, status: number) =>
  NextResponse.json({ error: msg }, { status, headers: NO_STORE });

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const isApi = pathname.startsWith('/api/');
  const ip = clientIp(req);

  // ---- 1. CSRF: every state-changing request must be same-origin ----------
  // Runs before authentication so a forged cross-site write is rejected outright.
  if (MUTATING.has(method) && !isSameOrigin(req)) {
    return deny('Cross-origin request blocked', 403);
  }

  // ---- 2. Payload ceiling -------------------------------------------------
  if (MUTATING.has(method) && isApi) {
    const declared = declaredBodySize(req);
    const limit = bodyLimitFor(pathname);
    if (declared > limit) {
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413, headers: NO_STORE },
      );
    }
  }

  // ---- 3. Rate limiting ---------------------------------------------------
  if (MUTATING.has(method) && isApi) {
    const { limit, windowMs } = writeBudget(pathname);
    const family = pathname.split('/').slice(0, 4).join('/');
    const rl = rateLimit(`w:${family}:${ip}`, limit, windowMs);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rl.retryAfter) } },
      );
    }
  }

  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();

  // ---- 4. Authentication --------------------------------------------------
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    // Machine access to the export endpoint carries its own bearer token.
    const hasExportToken = TOKEN_AUTH.some((p) => pathname === p)
      && method === 'GET'
      && (req.nextUrl.searchParams.has('token') || req.headers.has('x-export-token'));
    if (hasExportToken) return NextResponse.next();

    if (isApi) return deny('Unauthorized', 401);

    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // Only relative in-app paths are echoed back, so ?next= cannot become an
    // open redirect to an attacker-controlled host.
    if (/^\/[A-Za-z0-9/_-]{0,120}$/.test(pathname)) url.searchParams.set('next', pathname);
    const res = NextResponse.redirect(url);
    // Clear a stale/expired cookie so the browser stops re-sending it.
    if (token) res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // ---- 5. Route gating (defence in depth; handlers re-check permissions) ---
  if (!isApi) {
    const perm = pagePermFor(pathname);
    if (perm && !can(session.role, perm)) {
      const url = req.nextUrl.clone();
      url.pathname = landingFor(session.role);
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next();
  // Authenticated responses must never be stored by shared caches.
  if (isApi) for (const [k, v] of Object.entries(NO_STORE)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|ocr/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|wasm|gz|js)$).*)'],
};
