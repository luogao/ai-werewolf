/**
 * 运行时注册表 —— 内存中保存正在跑/刚跑完的对局
 *
 * 设计：
 *   - 每个 game 一个 RuntimeEntry（emitter + 事件 buffer + 完成标志）
 *   - SSE 客户端连接时，先 replay 已 buffer 的事件，再订阅新事件
 *   - 引擎跑完后保存到 DB；entry 保留 5 分钟供晚到的客户端 replay
 *
 * ⚠️ 仅适用于单实例部署（本地 dev 或自托管）。生产若用 serverless，
 * 需替换为 Redis pub/sub 或类似机制。
 */
import type { GameEvent } from '../events';

export type GameStatus = 'pending' | 'running' | 'done' | 'failed';

export interface RuntimeEntry {
  gameId: string;
  events: GameEvent[];
  status: GameStatus;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  /** 订阅回调列表，SSE handler 注册/注销 */
  subscribers: Set<(event: GameEvent) => void>;
  /** 游戏结束回调（end event 触发后通知 SSE 关闭） */
  endSubscribers: Set<() => void>;
}

const TTL_MS = 5 * 60 * 1000; // 5 分钟
const registry = new Map<string, RuntimeEntry>();
let cleanupScheduled = false;

export function createEntry(gameId: string): RuntimeEntry {
  const entry: RuntimeEntry = {
    gameId,
    events: [],
    status: 'pending',
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    subscribers: new Set(),
    endSubscribers: new Set(),
  };
  registry.set(gameId, entry);
  scheduleCleanup();
  return entry;
}

export function getEntry(gameId: string): RuntimeEntry | undefined {
  return registry.get(gameId);
}

export function deleteEntry(gameId: string): void {
  registry.delete(gameId);
}

/**
 * 把一个事件推给 entry：
 *   - 加到 buffer
 *   - 转发给所有 SSE 订阅者
 */
export function pushEvent(entry: RuntimeEntry, event: GameEvent): void {
  entry.events.push(event);
  for (const cb of entry.subscribers) {
    try {
      cb(event);
    } catch (e) {
      console.error('[runtime] SSE subscriber threw:', e);
    }
  }
}

export function signalEnd(entry: RuntimeEntry, status: GameStatus, error: string | null = null): void {
  entry.status = status;
  entry.finishedAt = Date.now();
  entry.error = error;
  for (const cb of entry.endSubscribers) {
    try {
      cb();
    } catch (e) {
      console.error('[runtime] end subscriber threw:', e);
    }
  }
  // 清空订阅者集，避免回调悬挂
  entry.subscribers.clear();
  entry.endSubscribers.clear();
}

/** 周期性清理 TTL 过期的 entry，避免内存泄漏 */
function scheduleCleanup(): void {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setTimeout(() => {
    cleanupScheduled = false;
    const now = Date.now();
    for (const [id, entry] of registry) {
      if (entry.finishedAt && now - entry.finishedAt > TTL_MS) {
        registry.delete(id);
      }
    }
    if (registry.size > 0) {
      scheduleCleanup();
    }
  }, TTL_MS).unref?.();
}
