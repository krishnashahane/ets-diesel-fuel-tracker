import { cookies } from 'next/headers';
import { COOKIE_NAME, verifySession, type SessionPayload } from './auth';
import { can, type Permission } from './rbac';
import { ensureDb } from './store';

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

/**
 * Authorise a request. Beyond the signature check this re-reads the user record,
 * so a deactivated account or a role change takes effect immediately instead of
 * lingering until the 8h token expires.
 */
export async function requirePerm(perm: Permission): Promise<SessionPayload> {
  const s = await requireSession();
  const d = await ensureDb();
  const user = d.users.find((u) => u.id === s.sub);
  if (!user || !user.active) throw new AuthError('Unauthorized', 401);
  // The stored role is authoritative; a stale token cannot retain lost privileges.
  if (!can(user.role, perm)) throw new AuthError('Forbidden', 403);
  return { ...s, role: user.role, username: user.username, name: user.name };
}

export class AuthError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
