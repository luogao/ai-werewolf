/**
 * Drizzle schema —— SQLite 4 张表
 *
 *   players   玩家配置（name/model/personality），跨游戏复用
 *   presets   预设阵容（保存的玩家组合 + layout）
 *   games     对局元数据
 *   events    对局事件流（直播 + 回放）
 *
 * 不用 drizzle-kit migrations；首次连接时 lib/db/client.ts 直接 CREATE TABLE IF NOT EXISTS。
 */
import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  model: text('model').notNull(),
  personality: text('personality').default('').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
});

export const presets = sqliteTable('presets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').default('').notNull(),
  layout: text('layout').notNull(),
  /** JSON 数组：PlayerConfig[]（不引用 players.id，因为是独立的快照） */
  playersJson: text('players_json').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
});

export const games = sqliteTable('games', {
  id: text('id').primaryKey(), // UUID
  layout: text('layout').notNull(),
  seed: integer('seed'),
  winner: text('winner'), // 'wolf' | 'good' | 'draw' | null
  reason: text('reason').default('').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  /** JSON 快照：游戏开始时的 PlayerConfig[] */
  configJson: text('config_json').notNull(),
  status: text('status').notNull().default('pending'), // pending | running | done | failed
  dryRun: integer('dry_run').notNull().default(0),
});

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameId: text('game_id')
    .notNull()
    .references(() => games.id),
  seq: integer('seq').notNull(),
  type: text('type').notNull(),
  day: integer('day').notNull(),
  phase: text('phase').notNull(),
  payloadJson: text('payload_json').notNull(),
  private: integer('private').notNull().default(0),
  timestamp: integer('timestamp').notNull(),
});

export type PlayerRow = typeof players.$inferSelect;
export type PresetRow = typeof presets.$inferSelect;
export type GameRow = typeof games.$inferSelect;
export type EventRow = typeof events.$inferSelect;

// ─── 索引 ─────────────────────────────────────────────────────

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  personality TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL,
  players_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  layout TEXT NOT NULL,
  seed INTEGER,
  winner TEXT,
  reason TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  dry_run INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id),
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  day INTEGER NOT NULL,
  phase TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  private INTEGER NOT NULL DEFAULT 0,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_game_seq ON events(game_id, seq);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_started ON games(started_at DESC);
`;
