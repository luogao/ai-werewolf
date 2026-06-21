/**
 * 浏览器端 API client —— 类型安全的 fetch 封装
 *
 * 所有方法返回 Promise<T>，错误时抛 ApiError。
 * 服务端不要用这个（直接调 lib/db/queries）。
 */
import type { PlayerConfig } from '../types';
import type { Layout } from '../engine/presets';
import type { GameEvent } from '../events';
import type { ProviderInfo } from '../llm/providers';
export type { ProviderInfo, GameEvent };

// ─── 类型（与 API 返回结构对齐） ──────────────────────────────

export interface PlayerRecord {
  id: number;
  name: string;
  model: string;
  personality: string;
  createdAt: number;
}

export interface PresetRecord {
  id: number;
  name: string;
  description: string;
  layout: Layout;
  players: PlayerConfig[];
  createdAt: number;
}

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

export type Role = 'werewolf' | 'seer' | 'witch' | 'hunter' | 'guard' | 'villager';

export interface ModelRoleStat {
  model: string;
  role: Role;
  games: number;
  wins: number;
}

export interface CreateGameResponse {
  gameId: string;
  streamUrl: string;
  eventsUrl: string;
}

// ─── 错误 ─────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.json);
  } else if (init?.body !== undefined && init.body !== null) {
    body = init.body;
  }
  const resp = await fetch(url, { ...init, headers, body });
  const text = await resp.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!resp.ok) {
    const msg =
      (parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : null) ?? resp.statusText;
    throw new ApiError(resp.status, msg, parsed);
  }
  return parsed as T;
}

// ─── Players ──────────────────────────────────────────────────

export const api = {
  listPlayers: () => request<{ players: PlayerRecord[] }>('/api/players'),
  createPlayer: (input: { name: string; model: string; personality?: string }) =>
    request<PlayerRecord>('/api/players', { method: 'POST', json: input }),
  updatePlayer: (id: number, patch: Partial<Pick<PlayerRecord, 'name' | 'model' | 'personality'>>) =>
    request<PlayerRecord>(`/api/players/${id}`, { method: 'PUT', json: patch }),
  deletePlayer: (id: number) =>
    request<{ ok: boolean }>(`/api/players/${id}`, { method: 'DELETE' }),

  // ─── Presets ────────────────────────────────────────────
  listPresets: () => request<{ presets: PresetRecord[] }>('/api/presets'),
  createPreset: (input: {
    name: string;
    description?: string;
    layout: Layout;
    players: PlayerConfig[];
  }) => request<PresetRecord>('/api/presets', { method: 'POST', json: input }),
  deletePreset: (id: number) =>
    request<{ ok: boolean }>(`/api/presets/${id}`, { method: 'DELETE' }),

  // ─── Models ─────────────────────────────────────────────
  listProviders: () => request<{ providers: ProviderInfo[] }>('/api/models'),

  // ─── Games ──────────────────────────────────────────────
  listGames: () => request<{ games: GameRecord[] }>('/api/games'),
  getGame: (id: string) => request<GameRecord>(`/api/games/${id}`),
  getGameEvents: (id: string) =>
    request<{ game: GameRecord; events: GameEvent[] }>(`/api/games/${id}/events`),
  createGame: (input: {
    layout: Layout;
    players: PlayerConfig[];
    seed?: number | null;
    dryRun?: boolean;
  }) => request<CreateGameResponse>('/api/games', { method: 'POST', json: input }),

  // ─── Stats ──────────────────────────────────────────────
  getStats: (minGames = 1) =>
    request<{ stats: ModelStat[]; totalGames: number }>(
      `/api/stats?minGames=${minGames}`,
    ),
  getStatsByRole: () =>
    request<{ stats: ModelRoleStat[] }>(`/api/stats/byRole`),
};
