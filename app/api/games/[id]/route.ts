/**
 * GET /api/games/:id   返回对局元数据（不含事件）
 */
import { NextResponse } from 'next/server';
import * as db from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = db.getGame(id);
  if (!game) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(game);
}
