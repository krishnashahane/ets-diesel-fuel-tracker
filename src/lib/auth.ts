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

export const COOKIE_NAME = 'sfm_session';
const MAX_AGE = 60 * 60 * 8; // 8h

export interface SessionPayload {
  sub: string;
  username: string;
  name: string;
  role: Role;
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ username: p.username, name: p.name, role: p.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (!payload.sub || !payload.role) return null;
    return {
      sub: payload.sub,
      username: String(payload.username ?? ''),
      name: String(payload.name ?? ''),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: MAX_AGE,
};
