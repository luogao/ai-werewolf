/**
 * GET /api/games/:id/events   返回对局全部事件（一次性，回放用）
 *
 * 与 /stream 不同：这里返回 JSON 数组，适合客户端已经知道要拉全部数据
 * （比如回放页加载历史对局）。
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
  const events = db.listEvents(id);
  return NextResponse.json({ game, events });
}
