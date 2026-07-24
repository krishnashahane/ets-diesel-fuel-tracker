import { NextResponse } from 'next/server';
import { db, ensureDb } from '@/lib/store';
import { pgEnabled } from '@/lib/pg';
import { getSession } from '@/lib/session';
import { NO_STORE } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public liveness probe. Record counts are operational detail, so they go only to
// an authenticated caller — an anonymous probe gets liveness and nothing else.
export async function GET() {
  await ensureDb();
  const s = await getSession();
  const body: Record<string, unknown> = {
    status: 'ok',
    time: new Date().toISOString(),
    persistence: pgEnabled ? 'postgres' : 'memory',
  };
  if (s) {
    const d = db();
    body.counts = { transactions: d.transactions.length, vehicles: d.vehicles.length, users: d.users.length, audit: d.audit.length };
  }
  return NextResponse.json(body, { headers: NO_STORE });
}
