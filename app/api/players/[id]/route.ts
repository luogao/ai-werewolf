/**
 * GET    /api/players/:id
 * PUT    /api/players/:id     更新
 * DELETE /api/players/:id
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
  const player = db.getPlayer(id);
  if (!player) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(player);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  let body: { name?: string; model?: string; personality?: string; baseUrl?: string; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const player = db.updatePlayer(id, body);
  if (!player) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(player);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const ok = db.deletePlayer(id);
  if (!ok) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
