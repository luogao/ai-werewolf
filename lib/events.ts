/**
 * 事件系统 —— 用于直播流（SSE）、回放（持久化）、统计聚合
 *
 * 设计：
 *   - 引擎在关键节点调用 engine.emit(type, payload, { private })
 *   - EventEmitter 同步派发给所有订阅者
 *   - 每个事件带 seq（游戏内自增序号），便于回放排序
 *   - private=true 的事件在直播模式下可被前端过滤（实现玩家/上帝视角切换）
 */
import type { LlmUsage } from './types';

export type EventType =
  | 'game_start'
  | 'phase_change'
  | 'guard_protect' // 守卫守护（私）
  | 'wolf_kill_decision' // 单只狼的投票（私）
  | 'wolf_kill_result' // 多数决后的最终目标（私）
  | 'seer_check' // 预言家查验（私）
  | 'witch_action' // 女巫救/毒（私）
  | 'night_deaths' // 夜晚结算的死亡
  | 'day_announce' // 白天宣布死讯
  | 'hunter_shoot' // 猎人开枪
  | 'speech' // 白天发言
  | 'vote_cast' // 投票
  | 'vote_result' // 投票结果
  | 'game_over'
  | 'llm_call'; // LLM 调用指标（用于统计）

export interface BaseEventPayload {
  [key: string]: unknown;
}

export interface GameEvent<T extends BaseEventPayload = BaseEventPayload> {
  seq: number;
  type: EventType;
  day: number;
  phase: string;
  timestamp: number;
  private: boolean;
  payload: T;
}

export type EventSubscriber = (event: GameEvent) => void;

export class EventEmitter {
  private subscribers: EventSubscriber[] = [];
  private seq = 0;

  subscribe(fn: EventSubscriber): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== fn);
    };
  }

  emit(
    type: EventType,
    day: number,
    phase: string,
    payload: BaseEventPayload,
    isPrivate = false,
  ): GameEvent {
    this.seq += 1;
    const event: GameEvent = {
      seq: this.seq,
      type,
      day,
      phase,
      timestamp: Date.now(),
      private: isPrivate,
      payload,
    };
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch (e) {
        console.error('[EventEmitter] subscriber threw:', e);
      }
    }
    return event;
  }

  reset(): void {
    this.seq = 0;
  }
}

// ─── 事件 payload 工厂（类型友好） ──────────────────────────

export interface GameStartPayload extends BaseEventPayload {
  players: Array<{
    playerId: number;
    name: string;
    model: string;
    role: string;
    personality: string;
  }>;
  layout: string;
  seed: number | null;
}

export interface PhaseChangePayload extends BaseEventPayload {
  phase: string;
  label: string;
}

export interface PlayerTargetPayload extends BaseEventPayload {
  playerId: number;
  playerName: string;
  targetId: number | null;
  targetName: string | null;
}

export interface WolfKillResultPayload extends BaseEventPayload {
  targetId: number | null;
  targetName: string | null;
}

export interface SeerCheckPayload extends BaseEventPayload {
  seerId: number;
  seerName: string;
  targetId: number;
  targetName: string;
  result: 'wolf' | 'good';
}

export interface WitchActionPayload extends BaseEventPayload {
  witchId: number;
  witchName: string;
  saved: boolean;
  savedTargetId: number | null;
  savedTargetName: string | null;
  poisonTargetId: number | null;
  poisonTargetName: string | null;
}

export interface DeathsPayload extends BaseEventPayload {
  deaths: Array<{
    playerId: number;
    name: string;
    reason: string;
    details: string;
  }>;
}

export interface DayAnnouncePayload extends BaseEventPayload {
  deathsInfo: string;
}

export interface HunterShootPayload extends BaseEventPayload {
  hunterId: number;
  hunterName: string;
  targetId: number | null;
  targetName: string | null;
}

export interface SpeechPayload extends BaseEventPayload {
  playerId: number;
  playerName: string;
  content: string;
}

export interface VoteCastPayload extends BaseEventPayload {
  voterId: number;
  voterName: string;
  targetId: number | null;
  targetName: string | null;
}

export interface VoteResultPayload extends BaseEventPayload {
  tally: Record<number, number>;
  votes: Record<number, number>;
  eliminated: number | null;
  eliminatedName: string | null;
  isTie: boolean;
}

export interface GameOverPayload extends BaseEventPayload {
  winner: 'wolf' | 'good' | 'draw';
  reason: string;
  finalPlayers: Array<{
    playerId: number;
    name: string;
    role: string;
    alive: boolean;
  }>;
}

export interface LlmCallPayload extends BaseEventPayload {
  playerId: number;
  playerName: string;
  model: string;
  usage: LlmUsage | null;
}
