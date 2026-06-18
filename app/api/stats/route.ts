/**
 * GET /api/stats   按模型聚合的胜率、token、耗时统计
 *
 * Query:
 *   ?minGames=1   过滤少于 N 局的模型（默认 1）
 */
import { NextResponse } from 'next/server';
import * as db from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const minGames = Math.max(1, parseInt(url.searchParams.get('minGames') ?? '1', 10));

  const all = db.getModelStats();
  const filtered = all.filter((s) => s.gamesPlayed >= minGames);
  return NextResponse.json({
    stats: filtered,
    totalGames: filtered.reduce((sum, s) => sum + s.gamesPlayed, 0),
  });
}
