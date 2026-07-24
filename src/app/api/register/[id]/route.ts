// Serves the scanned register page behind a transaction. Stored once per import
// batch, so N entries from one sheet share a single image instead of N copies.
import { NextRequest, NextResponse } from 'next/server';
import { ensureDb, getRegisterPage } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';
import { NO_STORE } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePerm('tx:view');
    await ensureDb();
    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400, headers: NO_STORE });
    const page = await getRegisterPage(id);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
    return NextResponse.json({
      id: page.id, image: page.image, text: page.text,
      ocrConfidence: page.ocrConfidence, rowCount: page.rowCount,
      createdAt: page.createdAt, createdBy: page.createdBy,
    }, { headers: NO_STORE });
  } catch (e) {
    return e instanceof AuthError
      ? NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE })
      : NextResponse.json({ error: 'Server error' }, { status: 500, headers: NO_STORE });
  }
}
