import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { permsFor } from '@/lib/rbac';
import { NO_STORE } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  return NextResponse.json({
    user: { id: s.sub, username: s.username, name: s.name, role: s.role },
    permissions: permsFor(s.role),
  }, { headers: NO_STORE });
}
