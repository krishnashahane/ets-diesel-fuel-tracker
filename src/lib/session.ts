import { cookies } from 'next/headers';
import { COOKIE_NAME, verifySession, type SessionPayload } from './auth';
import { can, type Permission } from './rbac';

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new AuthError('Unauthorized', 401);
  return s;
}

export async function requirePerm(perm: Permission): Promise<SessionPayload> {
  const s = await requireSession();
  if (!can(s.role, perm)) throw new AuthError('Forbidden', 403);
  return s;
}

export class AuthError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
