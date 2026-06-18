/**
 * GET  /api/presets       列出所有预设阵容
 * POST /api/presets       保存一个预设
 *
 * Body:
 *   { name, description?, layout, players: PlayerConfig[] }
 */
import { NextResponse } from 'next/server';
import * as db from '@/lib/db/queries';
import { ALL_LAYOUTS, type Layout } from '@/lib/engine/presets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const presets = db.listPresets();
  return NextResponse.json({ presets });
}

export async function POST(req: Request) {
  let body: {
    name?: string;
    description?: string;
    layout?: string;
    players?: Array<{ playerId: number; name: string; model: string; personality?: string }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.name || !body.layout || !Array.isArray(body.players)) {
    return NextResponse.json(
      { error: 'name, layout, players are required' },
      { status: 400 },
    );
  }
  if (!ALL_LAYOUTS.includes(body.layout as Layout)) {
    return NextResponse.json(
      { error: `invalid layout: ${body.layout}` },
      { status: 400 },
    );
  }
  const preset = db.createPreset({
    name: body.name,
    description: body.description,
    layout: body.layout as Layout,
    players: body.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      model: p.model,
      personality: p.personality ?? '',
    })),
  });
  return NextResponse.json(preset, { status: 201 });
}
