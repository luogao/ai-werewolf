/**
 * 核心数据结构 —— 对应原 Python 版 models.py
 *
 * 全栈共享类型：API、引擎、前端组件都从这里 import。
 */

// ─── 角色与阵营 ───────────────────────────────────────────────

export type Role = 'werewolf' | 'seer' | 'witch' | 'hunter' | 'guard' | 'villager';

export const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  guard: '守卫',
  villager: '村民',
};

export const ALL_ROLES: Role[] = ['werewolf', 'seer', 'witch', 'hunter', 'guard', 'villager'];

export function roleDisplayName(role: Role): string {
  return ROLE_DISPLAY_NAMES[role] ?? role;
}

export function roleFaction(role: Role): 'wolf' | 'good' {
  return role === 'werewolf' ? 'wolf' : 'good';
}

// ─── 阶段 ─────────────────────────────────────────────────────

export type Phase =
  | 'setup'
  | 'night_start'
  | 'wolf_kill'
  | 'seer_check'
  | 'witch_save'
  | 'night_end'
  | 'day_announce'
  | 'hunter_shoot'
  | 'speech'
  | 'vote'
  | 'vote_result'
  | 'game_over';

// ─── 死亡 ─────────────────────────────────────────────────────

export const DEATH_REASON = {
  WOLF_KILL: 'wolf_kill',
  WITCH_POISON: 'witch_poison',
  VOTE_OUT: 'vote_out',
  HUNTER_SHOOT: 'hunter_shoot',
} as const;

export type DeathReason = (typeof DEATH_REASON)[keyof typeof DEATH_REASON];

export interface DeathRecord {
  playerId: number;
  reason: DeathReason;
  day: number;
  details: string;
}

// ─── 玩家 ─────────────────────────────────────────────────────

export interface PlayerConfig {
  playerId: number;
  model: string;
  name: string;
  personality?: string;
  /** 自定义 OpenAI 兼容端点（Azure / vLLM / 多台 Ollama / 代理等）；留空走全局 env */
  baseUrl?: string;
  /** 自定义 API key（明文只在 server 内存留：DB players.api_key + 运行时 PlayerState） */
  apiKey?: string;
}

export interface PlayerState {
  playerId: number;
  name: string;
  model: string;
  role: Role;
  personality: string;
  alive: boolean;
  /** 透传自 PlayerConfig，AIPlayer 调 getModel 时用 */
  baseUrl?: string;
  apiKey?: string;
  // 女巫状态
  witchHasAntidote: boolean;
  witchHasPoison: boolean;
  // 猎人状态
  hunterCanShoot: boolean;
  // 守卫状态：上一次守卫的玩家 id（不能连续守同一人）
  guardLastProtected: number | null;
  // 记忆/历史
  speechHistory: SpeechRecord[];
  voteHistory: VoteRecord[];
}

export function playerFaction(p: Pick<PlayerState, 'role'>): 'wolf' | 'good' {
  return roleFaction(p.role);
}

export interface SpeechRecord {
  type: string;
  content: string;
}

export interface VoteRecord {
  day: number;
  target: number | null;
}

// ─── 夜晚行动 ─────────────────────────────────────────────────

export interface NightAction {
  day: number;
  wolfTarget: number | null;
  /** 守卫保护的目标（被守的人不会被狼人杀死） */
  guardProtected: number | null;
  seerTarget: number | null;
  seerResult: 'wolf' | 'good' | null;
  witchSaved: boolean;
  witchPoisoned: number | null;
  deaths: DeathRecord[];
}

// ─── 投票 ─────────────────────────────────────────────────────

export interface VoteResult {
  day: number;
  votes: Record<number, number>;
  tally: Record<number, number>;
  eliminated: number | null;
  isTie: boolean;
}

// ─── 游戏日志 ─────────────────────────────────────────────────

export interface GameLog {
  players: PlayerState[];
  day: number;
  phase: Phase;
  nights: NightAction[];
  votes: VoteResult[];
  deaths: DeathRecord[];
  speeches: SpeechEntry[][];
  winner: 'wolf' | 'good' | 'draw' | null;
  winnerReason: string;
  seed: number | null;
}

export interface SpeechEntry {
  playerId: number;
  name: string;
  content: string;
}

// ─── LLM 调用指标 ────────────────────────────────────────────

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  model: string;
}

// ─── 工厂函数 ─────────────────────────────────────────────────

export function createPlayerState(config: PlayerConfig, role: Role): PlayerState {
  return {
    playerId: config.playerId,
    name: config.name,
    model: config.model,
    role,
    personality: config.personality ?? '',
    alive: true,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    witchHasAntidote: role === 'witch',
    witchHasPoison: role === 'witch',
    hunterCanShoot: role === 'hunter',
    guardLastProtected: null,
    speechHistory: [],
    voteHistory: [],
  };
}

export function createEmptyNightAction(day: number): NightAction {
  return {
    day,
    wolfTarget: null,
    guardProtected: null,
    seerTarget: null,
    seerResult: null,
    witchSaved: false,
    witchPoisoned: null,
    deaths: [],
  };
}

export function createEmptyGameLog(players: PlayerState[], seed: number | null): GameLog {
  return {
    players,
    day: 0,
    phase: 'setup',
    nights: [],
    votes: [],
    deaths: [],
    speeches: [],
    winner: null,
    winnerReason: '',
    seed,
  };
}
