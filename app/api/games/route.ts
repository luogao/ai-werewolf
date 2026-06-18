/**
 * GET  /api/games            列出历史对局（最近 50 条）
 * POST /api/games            创建并启动一局
 *
 * POST Body:
 *   {
 *     layout: '6p' | '9p' | '12p',
 *     players: PlayerConfig[],     // 直接传玩家（绕过 players 表）
 *     seed?: number,
 *     dryRun?: boolean,
 *     verbose?: boolean
 *   }
 *
 * 返回:
 *   { gameId, streamUrl }
 */
import { NextResponse } from 'next/server';
import * as db from '@/lib/db/queries';
import { startGame } from '@/lib/runtime/runner';
import { ALL_LAYOUTS, ROLE_TEMPLATES, type Layout } from '@/lib/engine/presets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const games = db.listGames(50);
  return NextResponse.json({ games });
}

export async function POST(req: Request) {
  let body: {
    layout?: string;
    players?: Array<{ playerId?: number; name?: string; model?: string; personality?: string }>;
    seed?: number | null;
    dryRun?: boolean;
    verbose?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.layout || !ALL_LAYOUTS.includes(body.layout as Layout)) {
    return NextResponse.json(
      { error: `layout required, one of: ${ALL_LAYOUTS.join(', ')}` },
      { status: 400 },
    );
  }
  const layout = body.layout as Layout;
  const expectedCount = ROLE_TEMPLATES[layout].length;

  if (!Array.isArray(body.players)) {
    return NextResponse.json({ error: 'players array required' }, { status: 400 });
  }
  if (body.players.length !== expectedCount) {
    return NextResponse.json(
      {
        error: `layout ${layout} needs ${expectedCount} players, got ${body.players.length}`,
      },
      { status: 400 },
    );
  }

  // 规范化玩家配置
  const playerConfigs = body.players.map((p, i) => ({
    playerId: p.playerId ?? i + 1,
    name: p.name ?? `玩家${i + 1}`,
    model: p.model ?? 'gpt-4o-mini',
    personality: p.personality ?? '',
  }));

  // 校验 model 字段非空
  for (const p of playerConfigs) {
    if (!p.model) {
      return NextResponse.json(
        { error: `player ${p.playerId} (${p.name}) has empty model` },
        { status: 400 },
      );
    }
  }

  const { gameId } = startGame({
    layout,
    playerConfigs,
    seed: body.seed ?? null,
    dryRun: body.dryRun ?? false,
    verbose: body.verbose ?? false,
  });

  return NextResponse.json(
    {
      gameId,
      streamUrl: `/api/games/${gameId}/stream`,
      eventsUrl: `/api/games/${gameId}/events`,
    },
    { status: 201 },
  );
}
