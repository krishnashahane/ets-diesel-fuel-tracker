import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDb } from '@/lib/store';
import { requirePerm, AuthError } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await requirePerm('audit:view');
    await ensureDb();
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('size') || '50', 10) || 50));
    const all = db().audit;
    return NextResponse.json({ items: all.slice((page - 1) * size, (page - 1) * size + size), total: all.length, page, size });
  } catch (e) {
    return e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
