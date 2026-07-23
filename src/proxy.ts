import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifySession } from '@/lib/auth';
import { can, landingFor, pagePermFor } from '@/lib/rbac';

const PUBLIC = ['/login', '/api/auth/login', '/api/health'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Defense-in-depth route gating: block pages the role cannot access.
  if (!pathname.startsWith('/api/')) {
    const perm = pagePermFor(pathname);
    if (perm && !can(session.role, perm)) {
      const url = req.nextUrl.clone();
      url.pathname = landingFor(session.role);
      url.search = '';
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|ocr/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|wasm|gz|js)$).*)'],
};
