import { NextResponse } from 'next/server';
import { db, ensureDb } from '@/lib/store';
import { pgEnabled } from '@/lib/pg';

export const runtime = 'nodejs';

export async function GET() {
  await ensureDb();
  const d = db();
  return NextResponse.json({
    status: 'ok',
    time: new Date().toISOString(),
    persistence: pgEnabled ? 'postgres' : 'memory',
    counts: { transactions: d.transactions.length, vehicles: d.vehicles.length, users: d.users.length, audit: d.audit.length },
  });
}
