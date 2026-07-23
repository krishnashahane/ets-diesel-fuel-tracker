import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDb, saveTransactionUpdate } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import type { TxStatus } from '@/lib/types';

export const runtime = 'nodejs';

const authErr = (e: unknown) =>
  e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });

// Full record incl. photos, location and device — for the admin detail view.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePerm('tx:view');
    await ensureDb();
    const { id } = await params;
    const tx = db().transactions.find((t) => t.id === id);
    if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ transaction: tx });
  } catch (e) { return authErr(e); }
}

const FLOW: Record<TxStatus, TxStatus | null> = {
  Draft: 'Submitted', Submitted: 'Verified', Verified: 'Approved', Approved: 'Locked', Locked: null,
};
const PERM: Record<string, 'tx:verify' | 'tx:approve'> = { Verified: 'tx:verify', Approved: 'tx:approve', Locked: 'tx:approve' };

const schema = z.object({ action: z.enum(['advance', 'reject']), to: z.string().optional(), reason: z.string().max(300).optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    await ensureDb();
    const d = db();
    const tx = d.transactions.find((t) => t.id === id);
    if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (parsed.data.action === 'reject') {
      const s = await requirePerm('tx:verify');
      tx.status = 'Draft';
      tx.remarks = `${tx.remarks || ''} [REJECTED: ${parsed.data.reason || 'n/a'}]`.trim();
      await saveTransactionUpdate(tx);
      await logAudit({ userId: s.sub, username: s.username, action: 'TX_REJECT', entity: 'transaction', entityId: id, ip: 'session' });
      return NextResponse.json({ ok: true, transaction: tx });
    }

    const next = FLOW[tx.status];
    if (!next) return NextResponse.json({ error: 'Transaction is locked' }, { status: 409 });
    const s = await requirePerm(PERM[next] ?? 'tx:verify');
    tx.status = next;
    await saveTransactionUpdate(tx);
    await logAudit({ userId: s.sub, username: s.username, action: `TX_${next.toUpperCase()}`, entity: 'transaction', entityId: id, ip: 'session' });
    return NextResponse.json({ ok: true, transaction: tx });
  } catch (e) {
    return e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
