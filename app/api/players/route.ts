/**
 * GET  /api/players        列出所有玩家配置
 * POST /api/players        创建一个玩家配置
 */
import { NextResponse } from 'next/server';
import * as db from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const players = db.listPlayers();
  return NextResponse.json({ players });
}

export async function POST(req: Request) {
  let body: { name?: string; model?: string; personality?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.name || !body.model) {
    return NextResponse.json(
      { error: 'name and model are required' },
      { status: 400 },
    );
  }
  const player = db.createPlayer({
    name: body.name,
    model: body.model,
    personality: body.personality,
  });
  return NextResponse.json(player, { status: 201 });
}
