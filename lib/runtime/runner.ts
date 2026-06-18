/**
 * Game runner —— 启动引擎、桥接 EventEmitter 到 runtime registry
 *
 *   POST /api/games 调 startGame() 后立即返回；引擎在后台异步跑。
 *   引擎结束后事件落 DB（saveEvents），状态更新为 done。
 */
import { randomUUID } from 'node:crypto';
import { GameEngine } from '../engine/game';
import { EventEmitter, type GameEvent } from '../events';
import type { PlayerConfig } from '../types';
import type { Layout } from '../engine/presets';
import * as db from '../db/queries';
import {
  createEntry,
  getEntry,
  pushEvent,
  signalEnd,
  type RuntimeEntry,
} from './registry';

export interface StartGameInput {
  layout: Layout;
  playerConfigs: PlayerConfig[];
  seed?: number | null;
  dryRun?: boolean;
  verbose?: boolean;
  /** 可选显式 id（用于测试）；不传则随机 UUID */
  gameId?: string;
}

export interface StartGameResult {
  gameId: string;
  entry: RuntimeEntry;
}

/**
 * 创建 DB 记录 + 注册 runtime entry + 后台启动引擎。
 *
 * 不等待引擎跑完，立即返回 gameId。客户端用 GET /api/games/{id}/stream 订阅。
 */
export function startGame(input: StartGameInput): StartGameResult {
  const gameId = input.gameId ?? randomUUID();
  const dryRun = input.dryRun ?? false;

  // 1) DB 记录
  db.createGame({
    id: gameId,
    layout: input.layout,
    seed: input.seed ?? null,
    config: input.playerConfigs,
    dryRun,
  });

  // 2) runtime entry + emitter
  const entry = createEntry(gameId);
  const emitter = new EventEmitter();
  emitter.subscribe((event) => pushEvent(entry, event));

  // 3) 更新 DB 状态 → running
  db.updateGameStatus(gameId, 'running');

  // 4) 后台启动引擎（不 await）
  void runEngineInBackground(gameId, input, emitter, entry);

  return { gameId, entry };
}

async function runEngineInBackground(
  gameId: string,
  input: StartGameInput,
  emitter: EventEmitter,
  entry: RuntimeEntry,
): Promise<void> {
  try {
    const engine = new GameEngine({
      playerConfigs: input.playerConfigs,
      layout: input.layout,
      seed: input.seed ?? null,
      verbose: input.verbose ?? false,
      dryRun: input.dryRun ?? false,
      emitter,
      llmConfig: {
        maxRetries: 3,
        temperature: 0.7,
        maxTokens: 512,
      },
    });

    const log = await engine.run();

    // 落库：事件 + 终局状态
    db.saveEvents(gameId, entry.events);
    db.updateGameStatus(gameId, 'done', {
      winner: (log.winner ?? 'draw') as 'wolf' | 'good' | 'draw',
      reason: log.winnerReason,
    });

    signalEnd(entry, 'done');
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[runner] game ${gameId} failed:`, errMsg);
    // 即便失败，已经产生的事件也保存下来，便于调试
    try {
      db.saveEvents(gameId, entry.events);
    } catch {
      // ignore
    }
    db.updateGameStatus(gameId, 'failed');
    signalEnd(entry, 'failed', errMsg);
  }
}

/** 测试辅助：根据 game_id 等待结束 */
export async function waitForGameEnd(gameId: string, timeoutMs = 60_000): Promise<RuntimeEntry> {
  const entry = getEntry(gameId);
  if (!entry) throw new Error(`game ${gameId} not found`);
  if (entry.status === 'done' || entry.status === 'failed') return entry;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timeout waiting for game ${gameId}`));
    }, timeoutMs);

    entry.endSubscribers.add(() => {
      clearTimeout(timer);
      resolve(entry);
    });
  });
}
