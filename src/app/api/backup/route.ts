import { NextRequest, NextResponse } from 'next/server';
import { ensureDb, snapshot, restore } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const err = (e: unknown) => e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });

// Download a full JSON backup of all persisted data.
export async function GET() {
  try {
    const s = await requirePerm('backup:manage');
    await ensureDb();
    const snap = snapshot();
    await logAudit({ userId: s.sub, username: s.username, action: 'BACKUP', entity: 'system', entityId: 'snapshot', ip: 'session', detail: `${snap.transactions.length} tx, ${snap.users.length} users` });
    return new NextResponse(JSON.stringify(snap, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="sfm_backup_${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) { return err(e); }
}

// Restore from an uploaded JSON backup (superadmin only).
export async function POST(req: NextRequest) {
  try {
    const s = await requirePerm('backup:manage');
    await ensureDb();
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const snap = body as ReturnType<typeof snapshot>;
    if (!snap || typeof snap !== 'object' || !Array.isArray(snap.users) || !Array.isArray(snap.transactions)) {
      return NextResponse.json({ error: 'Invalid backup file' }, { status: 400 });
    }
    const result = await restore(snap);
    await logAudit({ userId: s.sub, username: s.username, action: 'RESTORE', entity: 'system', entityId: 'snapshot', ip: 'session', detail: `${result.transactions} tx, ${result.users} users, ${result.masters} masters` });
    return NextResponse.json({ ok: true, restored: result });
  } catch (e) { return err(e); }
}
