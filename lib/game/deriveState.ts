/**
 * 从事件流推导玩家运行时状态 —— 直播页和回放页共用。
 *
 * 纯函数：输入事件列表 + 阵容配置 + 是否上帝视角，输出每个玩家的存活/身份等。
 */
import type { GameEvent } from '../events';
import type { Role, PlayerConfig } from '../types';
import type { PhaseKind } from '../../components/PhaseIndicator';

export interface PlayerRuntimeState {
  config: PlayerConfig;
  role?: Role;
  alive: boolean;
  deathReason?: string;
}

export interface DerivedState {
  players: PlayerRuntimeState[];
  currentPhase: PhaseKind | null;
  currentDay: number;
  currentSpeakerId: number | null;
  currentVoterId: number | null;
  isWaitingLlm: boolean;
}

export function deriveState(
  events: GameEvent[],
  configs: PlayerConfig[],
  godView: boolean,
): DerivedState {
  const players: PlayerRuntimeState[] = configs.map((c) => ({
    config: c,
    alive: true,
  }));
  let currentPhase: PhaseKind | null = null;
  let currentDay = 0;
  let currentSpeakerId: number | null = null;
  let currentVoterId: number | null = null;
  let isWaitingLlm = false;
  const seenSpeakers = new Set<number>();

  for (const e of events) {
    switch (e.type) {
      case 'phase_change': {
        const p = e.payload.phase as PhaseKind;
        currentPhase = p;
        if (e.payload.day !== undefined) currentDay = e.payload.day as number;
        if (p !== 'speech') currentSpeakerId = null;
        if (p !== 'vote') currentVoterId = null;
        break;
      }
      case 'game_start': {
        // 上帝视角下从开局就揭示所有身份；玩家视角等到 game_over
        if (godView) {
          const arr = e.payload.players as Array<{ playerId: number; role: string }>;
          for (const item of arr) {
            const p = players.find((x) => x.config.playerId === item.playerId);
            if (p) p.role = item.role as Role;
          }
        }
        break;
      }
      case 'night_deaths':
      case 'day_announce': {
        const deaths = (e.payload.deaths ?? []) as Array<{
          playerId: number;
          reason: string;
        }>;
        for (const d of deaths) {
          const p = players.find((x) => x.config.playerId === d.playerId);
          if (p) {
            p.alive = false;
            p.deathReason = d.reason;
          }
        }
        break;
      }
      case 'hunter_shoot': {
        const targetId = e.payload.targetId as number | null;
        if (targetId != null) {
          const p = players.find((x) => x.config.playerId === targetId);
          if (p) {
            p.alive = false;
            p.deathReason = 'hunter_shoot';
          }
        }
        break;
      }
      case 'vote_result': {
        const eliminated = e.payload.eliminated as number | null;
        if (eliminated != null) {
          const p = players.find((x) => x.config.playerId === eliminated);
          if (p) {
            p.alive = false;
            p.deathReason = 'vote_out';
          }
        }
        break;
      }
      case 'speech': {
        const pid = e.payload.playerId as number;
        if (!seenSpeakers.has(pid)) {
          seenSpeakers.add(pid);
        }
        currentSpeakerId = pid;
        break;
      }
      case 'vote_cast': {
        currentVoterId = e.payload.voterId as number;
        break;
      }
      case 'game_over': {
        const finalPlayers = e.payload.finalPlayers as Array<{
          playerId: number;
          role: string;
          alive: boolean;
        }>;
        // 游戏结束：揭示所有身份
        for (const fp of finalPlayers) {
          const p = players.find((x) => x.config.playerId === fp.playerId);
          if (p) {
            p.role = fp.role as Role;
            p.alive = fp.alive;
          }
        }
        currentPhase = 'game_over';
        break;
      }
      case 'llm_call': {
        isWaitingLlm = false; // 收到 llm_call 表示调用已结束
        break;
      }
    }
  }

  // 末尾事件如果是 phase_change 但还没收到结果事件，认为在等待
  const last = events[events.length - 1];
  if (
    last &&
    (last.type === 'phase_change' || last.type === 'speech' || last.type === 'vote_cast')
  ) {
    isWaitingLlm = true;
  }

  return {
    players,
    currentPhase,
    currentDay,
    currentSpeakerId,
    currentVoterId,
    isWaitingLlm,
  };
}
