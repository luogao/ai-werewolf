/**
 * CRUD helpers —— 把 Drizzle 表操作包装成领域函数
 *
 * 输入/输出用领域类型（PlayerConfig / GameLog / GameEvent），
 * 内部做 row ↔ domain 转换，让上层 API 路由不直接碰 Drizzle。
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from './client';
import {
  players as playersTable,
  presets as presetsTable,
  games as gamesTable,
  events as eventsTable,
  type GameRow,
  type EventRow,
} from './schema';
import type { GameEvent, EventType } from '../events';
import type { PlayerConfig } from '../types';
import type { Layout } from '../engine/presets';

// ─── Players ──────────────────────────────────────────────────

export interface PlayerRecord {
  id: number;
  name: string;
  model: string;
  personality: string;
  createdAt: number;
}

export function listPlayers(): PlayerRecord[] {
  const db = getDb();
  const rows = db.select().from(playersTable).orderBy(playersTable.id).all();
  return rows.map(rowToPlayer);
}

export function createPlayer(input: {
  name: string;
  model: string;
  personality?: string;
}): PlayerRecord {
  const db = getDb();
  const row = db
    .insert(playersTable)
    .values({
      name: input.name,
      model: input.model,
      personality: input.personality ?? '',
    })
    .returning()
    .get();
  return rowToPlayer(row);
}

export function updatePlayer(
  id: number,
  input: Partial<Pick<PlayerRecord, 'name' | 'model' | 'personality'>>,
): PlayerRecord | null {
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.model !== undefined) patch.model = input.model;
  if (input.personality !== undefined) patch.personality = input.personality;
  if (Object.keys(patch).length === 0) {
    const existing = getPlayer(id);
    return existing;
  }
  const [row] = db
    .update(playersTable)
    .set(patch)
    .where(eq(playersTable.id, id))
    .returning()
    .all();
  return row ? rowToPlayer(row) : null;
}

export function deletePlayer(id: number): boolean {
  const db = getDb();
  const result = db.delete(playersTable).where(eq(playersTable.id, id)).run();
  return result.changes > 0;
}

export function getPlayer(id: number): PlayerRecord | null {
  const db = getDb();
  const row = db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, id))
    .get();
  return row ? rowToPlayer(row) : null;
}

export function bulkCreatePlayers(
  configs: Array<{ name: string; model: string; personality?: string }>,
): PlayerRecord[] {
  const db = getDb();
  return db.transaction((tx) => {
    const results: PlayerRecord[] = [];
    for (const c of configs) {
      const row = tx
        .insert(playersTable)
        .values({
          name: c.name,
          model: c.model,
          personality: c.personality ?? '',
        })
        .returning()
        .get();
      results.push(rowToPlayer(row));
    }
    return results;
  });
}

function rowToPlayer(row: {
  id: number;
  name: string;
  model: string;
  personality: string;
  createdAt: number;
}): PlayerRecord {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    personality: row.personality,
    createdAt: row.createdAt,
  };
}

// ─── Presets ──────────────────────────────────────────────────

export interface PresetRecord {
  id: number;
  name: string;
  description: string;
  layout: Layout;
  players: PlayerConfig[];
  createdAt: number;
}

export function listPresets(): PresetRecord[] {
  const db = getDb();
  const rows = db.select().from(presetsTable).orderBy(desc(presetsTable.createdAt)).all();
  return rows.map(rowToPreset);
}

export function createPreset(input: {
  name: string;
  description?: string;
  layout: Layout;
  players: PlayerConfig[];
}): PresetRecord {
  const db = getDb();
  const row = db
    .insert(presetsTable)
    .values({
      name: input.name,
      description: input.description ?? '',
      layout: input.layout,
      playersJson: JSON.stringify(input.players),
    })
    .returning()
    .get();
  return rowToPreset(row);
}

export function getPreset(id: number): PresetRecord | null {
  const db = getDb();
  const row = db
    .select()
    .from(presetsTable)
    .where(eq(presetsTable.id, id))
    .get();
  return row ? rowToPreset(row) : null;
}

export function deletePreset(id: number): boolean {
  const db = getDb();
  const result = db.delete(presetsTable).where(eq(presetsTable.id, id)).run();
  return result.changes > 0;
}

function rowToPreset(row: {
  id: number;
  name: string;
  description: string;
  layout: string;
  playersJson: string;
  createdAt: number;
}): PresetRecord {
  let players: PlayerConfig[] = [];
  try {
    players = JSON.parse(row.playersJson);
  } catch {
    players = [];
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    layout: row.layout as Layout,
    players,
    createdAt: row.createdAt,
  };
}

// ─── Games ────────────────────────────────────────────────────

export interface GameRecord {
  id: string;
  layout: Layout;
  seed: number | null;
  winner: 'wolf' | 'good' | 'draw' | null;
  reason: string;
  startedAt: number;
  endedAt: number | null;
  config: PlayerConfig[];
  status: 'pending' | 'running' | 'done' | 'failed';
  dryRun: boolean;
}

export function createGame(input: {
  id: string;
  layout: Layout;
  seed?: number | null;
  config: PlayerConfig[];
  dryRun?: boolean;
}): GameRecord {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.insert(gamesTable)
    .values({
      id: input.id,
      layout: input.layout,
      seed: input.seed ?? null,
      startedAt: now,
      configJson: JSON.stringify(input.config),
      status: 'pending',
      dryRun: input.dryRun ? 1 : 0,
    })
    .run();
  return getGame(input.id)!;
}

export function getGame(id: string): GameRecord | null {
  const db = getDb();
  const row = db.select().from(gamesTable).where(eq(gamesTable.id, id)).get();
  return row ? rowToGame(row) : null;
}

export function listGames(limit = 50): GameRecord[] {
  const db = getDb();
  const rows = db
    .select()
    .from(gamesTable)
    .orderBy(desc(gamesTable.startedAt))
    .limit(limit)
    .all();
  return rows.map(rowToGame);
}

export function updateGameStatus(
  id: string,
  status: GameRecord['status'],
  extras: { winner?: GameRecord['winner']; reason?: string } = {},
): void {
  const db = getDb();
  const patch: Record<string, unknown> = { status };
  if (extras.winner !== undefined) patch.winner = extras.winner;
  if (extras.reason !== undefined) patch.reason = extras.reason;
  if (status === 'done' || status === 'failed') {
    patch.endedAt = Math.floor(Date.now() / 1000);
  }
  db.update(gamesTable).set(patch).where(eq(gamesTable.id, id)).run();
}

function rowToGame(row: GameRow): GameRecord {
  let config: PlayerConfig[] = [];
  try {
    config = JSON.parse(row.configJson);
  } catch {
    config = [];
  }
  return {
    id: row.id,
    layout: row.layout as Layout,
    seed: row.seed,
    winner: (row.winner as GameRecord['winner']) ?? null,
    reason: row.reason,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    config,
    status: row.status as GameRecord['status'],
    dryRun: Boolean(row.dryRun),
  };
}

// ─── Events ───────────────────────────────────────────────────

export function saveEvents(gameId: string, events: GameEvent[]): void {
  if (!events.length) return;
  const db = getDb();
  const rows = events.map((e) => ({
    gameId,
    seq: e.seq,
    type: e.type,
    day: e.day,
    phase: e.phase,
    payloadJson: JSON.stringify(e.payload),
    private: e.private ? 1 : 0,
    timestamp: e.timestamp,
  }));
  db.transaction((tx) => {
    for (const r of rows) {
      tx.insert(eventsTable).values(r).run();
    }
  });
}

export function listEvents(gameId: string): GameEvent[] {
  const db = getDb();
  const rows = db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.gameId, gameId))
    .orderBy(eventsTable.seq)
    .all();
  return rows.map(rowToEvent);
}

function rowToEvent(row: EventRow): GameEvent {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payloadJson);
  } catch {
    payload = {};
  }
  return {
    seq: row.seq,
    type: row.type as EventType,
    day: row.day,
    phase: row.phase,
    timestamp: row.timestamp,
    private: Boolean(row.private),
    payload,
  };
}

// ─── Stats ────────────────────────────────────────────────────

export interface ModelStat {
  model: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  wolfGames: number;
  wolfWins: number;
  goodGames: number;
  goodWins: number;
  totalTokens: number;
  totalDurationMs: number;
  callCount: number;
}

/**
 * 聚合：每个模型参与的局数 + 胜率 + token 使用。
 *
 * - 模型参与的局：在该 game 的 config 中至少有一个 player 用了这个模型
 * - 胜：玩家所属阵营（按角色判定）== game.winner
 *   - 若该模型在局中既扮狼又扮好人（罕见），两个阵营都算参与
 * - token/耗时：聚合该模型所有 llm_call 事件
 *
 * 用 JS 而非 SQL，逻辑更清晰；局数级别数据量小，性能不是问题。
 */
export function getModelStats(): ModelStat[] {
  const db = getDb();

  const gameRows = db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.status, 'done'))
    .all();

  const eventRows = db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.type, 'llm_call'))
    .all();

  const stats = new Map<string, ModelStat>();

  function ensure(model: string): ModelStat {
    let s = stats.get(model);
    if (!s) {
      s = {
        model,
        gamesPlayed: 0,
        wins: 0,
        winRate: 0,
        wolfGames: 0,
        wolfWins: 0,
        goodGames: 0,
        goodWins: 0,
        totalTokens: 0,
        totalDurationMs: 0,
        callCount: 0,
      };
      stats.set(model, s);
    }
    return s;
  }

  // 按局聚合胜负
  for (const g of gameRows) {
    if (!g.winner) continue;
    let configs: PlayerConfig[] = [];
    try {
      // config_json 存的是 PlayerConfig[]，但 game_start 事件 payload 里
      // 也包含 role 信息。我们这里用 game_start 事件的 payload（含 role）。
      // 简化处理：从 games.config_json 读 PlayerConfig（不含 role），
      // 然后从 events 的 game_start 里取 role 分布。
      configs = JSON.parse(g.configJson);
    } catch {
      configs = [];
    }
    // 不直接用 config（无 role），而是查 game_start 事件拿带 role 的玩家
    const startEvent = db
      .select()
      .from(eventsTable)
      .where(
        and(eq(eventsTable.gameId, g.id), eq(eventsTable.type, 'game_start')),
      )
      .get();
    const playersWithRoles: Array<{ model: string; role: string }> = startEvent
      ? (JSON.parse(startEvent.payloadJson).players ?? [])
      : [];

    // 按模型分组，记录该模型在本局扮过哪些阵营
    const modelFactions = new Map<string, Set<'wolf' | 'good'>>();
    for (const p of playersWithRoles) {
      const faction: 'wolf' | 'good' = p.role === 'werewolf' ? 'wolf' : 'good';
      const set = modelFactions.get(p.model) ?? new Set();
      set.add(faction);
      modelFactions.set(p.model, set);
    }

    for (const [model, factions] of modelFactions) {
      const s = ensure(model);
      s.gamesPlayed += 1;
      const winner = g.winner as 'wolf' | 'good' | 'draw' | null;
      if (factions.has('wolf')) {
        s.wolfGames += 1;
        if (winner === 'wolf') {
          s.wolfWins += 1;
        }
      }
      if (factions.has('good')) {
        s.goodGames += 1;
        if (winner === 'good') {
          s.goodWins += 1;
        }
      }
    }
  }

  // 修正 wins：上面逻辑可能算多次，重算
  for (const s of stats.values()) {
    s.wins = s.wolfWins + s.goodWins;
    s.winRate = s.gamesPlayed ? s.wins / s.gamesPlayed : 0;
  }

  // 聚合 token / 耗时
  for (const e of eventRows) {
    let payload: { model?: string; usage?: { totalTokens?: number; durationMs?: number } } = {};
    try {
      payload = JSON.parse(e.payloadJson);
    } catch {
      continue;
    }
    if (!payload.model) continue;
    const s = ensure(payload.model);
    s.totalTokens += payload.usage?.totalTokens ?? 0;
    s.totalDurationMs += payload.usage?.durationMs ?? 0;
    s.callCount += 1;
  }

  return Array.from(stats.values()).sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}
