import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { permsFor } from '@/lib/rbac';

export const runtime = 'nodejs';

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    user: { id: s.sub, username: s.username, name: s.name, role: s.role },
    permissions: permsFor(s.role),
  });
}
