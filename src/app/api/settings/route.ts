import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureDb, getSettings, updateSettings } from '@/lib/store';
import { requireSession, requirePerm, AuthError } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { clientIp } from '@/lib/security';

export const runtime = 'nodejs';

const err = (e: unknown) => e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });

// Any authenticated user may read settings (the entry form needs them).
export async function GET() {
  try {
    await requireSession();
    await ensureDb();
    return NextResponse.json({ settings: getSettings() });
  } catch (e) { return err(e); }
}

const schema = z.object({
  ocrEnabled: z.boolean().optional(),
  ocrThreshold: z.number().int().min(0).max(100).optional(),
  requirePhotos: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const s = await requirePerm('settings:manage');
    await ensureDb();
    const p = schema.safeParse(await req.json().catch(() => ({})));
    if (!p.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    const settings = await updateSettings(p.data);
    await logAudit({ userId: s.sub, username: s.username, action: 'SETTINGS_UPDATE', entity: 'settings', entityId: 'app', ip: clientIp(req), detail: JSON.stringify(p.data) });
    return NextResponse.json({ ok: true, settings });
  } catch (e) { return err(e); }
}
