/**
 * GET    /api/presets/:id
 * DELETE /api/presets/:id
 */
import { NextResponse } from 'next/server';
import * as db from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const preset = db.getPreset(id);
  if (!preset) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(preset);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const ok = db.deletePreset(id);
  if (!ok) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
