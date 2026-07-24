import { SignJWT, jwtVerify } from 'jose';
import type { Role } from './types';

const SECRET_STR = process.env.AUTH_SECRET;
if (!SECRET_STR || SECRET_STR.length < 32) {
  // Fail fast in production; allow a deterministic dev fallback locally.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET missing or too short (min 32 chars) in production');
  }
}
const secret = new TextEncoder().encode(SECRET_STR || 'dev-only-insecure-secret-change-me-please-32b');

const PROD = process.env.NODE_ENV === 'production';

// __Host- prefix: the browser itself then enforces Secure + Path=/ + no Domain,
// which blocks cookie fixation from a sibling subdomain. Only valid over HTTPS,
// so the plain name is used for local http development.
export const COOKIE_NAME = PROD ? '__Host-sfm_session' : 'sfm_session';

const ISSUER = 'sfm-diesel';
const AUDIENCE = 'sfm-diesel-app';
const MAX_AGE = 60 * 60 * 8; // 8h

export interface SessionPayload {
  sub: string;
  username: string;
  name: string;
  role: Role;
}

const ROLES: Role[] = ['superadmin', 'admin', 'operations', 'site_rep', 'supervisor', 'driver'];

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ username: p.username, name: p.name, role: p.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(p.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],      // pinned: never honour "alg" from the token header
      issuer: ISSUER,
      audience: AUDIENCE,
      clockTolerance: 5,
    });
    // Reject anything whose role is not one we recognise, rather than trusting
    // an arbitrary string to flow into the permission matrix.
    const role = payload.role as Role;
    if (!payload.sub || !ROLES.includes(role)) return null;
    return {
      sub: payload.sub,
      username: String(payload.username ?? ''),
      name: String(payload.name ?? ''),
      role,
    };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true as const,
  secure: PROD,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: MAX_AGE,
};
