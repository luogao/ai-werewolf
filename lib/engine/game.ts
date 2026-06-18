/**
 * GameEngine —— 状态机驱动的游戏主循环
 *
 * 对应原 Python 版 game.py:GameEngine，加：
 *   - async run()：LLM 调用天然异步
 *   - EventEmitter 注入：关键节点发事件，供 SSE / DB / 统计消费
 *   - recordLlmCall：每次 LLM 调用记录指标
 *   - seeded RNG（mulberry32）：dry-run 时结果可复现
 */
import type {
  GameLog,
  LlmUsage,
  NightAction,
  PlayerConfig,
  PlayerState,
  Role,
} from '../types';
import { createEmptyGameLog, createPlayerState, DEATH_REASON } from '../types';
import type { AIPlayerConfig } from '../llm/player';
import { AIPlayer } from '../llm/player';
import { EventEmitter, type EventType } from '../events';
import { checkWin, gameOverInfo } from './winChecker';
import { ROLE_TEMPLATES, validateLayout, type Layout } from './presets';
import * as prompts from '../prompts';
import * as phases from './phases';

export interface GameEngineOptions {
  playerConfigs: PlayerConfig[];
  layout?: Layout;
  seed?: number | null;
  verbose?: boolean;
  dryRun?: boolean;
  llmConfig?: AIPlayerConfig;
  emitter?: EventEmitter;
}

const PHASE_LABELS: Record<string, string> = {
  setup: '准备阶段',
  night_start: '夜幕降临',
  wolf_kill: '狼人行动',
  seer_check: '预言家查验',
  witch_save: '女巫决策',
  night_end: '夜晚结算',
  day_announce: '黎明到来',
  hunter_shoot: '猎人开枪',
  speech: '白天讨论',
  vote: '投票环节',
  vote_result: '投票结果',
  game_over: '游戏结束',
};

export class GameEngine {
  readonly verbose: boolean;
  readonly dryRun: boolean;
  readonly seed: number | null;
  readonly layout: Layout;
  readonly players: AIPlayer[] = [];
  readonly log: GameLog;
  readonly emitter: EventEmitter;
  currentNight: NightAction | null = null;
  seerResults: Array<{ id: number; name: string; isWolf: boolean }> = [];
  private rng: () => number;

  constructor(opts: GameEngineOptions) {
    this.verbose = opts.verbose ?? false;
    this.dryRun = opts.dryRun ?? false;
    this.seed = opts.seed ?? null;
    this.layout = opts.layout ?? '9p';
    this.emitter = opts.emitter ?? new EventEmitter();
    this.rng = createRng(this.seed);

    validateLayout(this.layout, opts.playerConfigs.length);

    const llmConfig = opts.llmConfig ?? {};
    for (const cfg of opts.playerConfigs) {
      const state = createPlayerState(cfg, 'villager'); // 临时角色，setup() 中分配
      const player = new AIPlayer(state, {
        ...llmConfig,
        dryRun: this.dryRun,
        verbose: this.verbose,
      });
      this.players.push(player);
    }

    this.log = createEmptyGameLog(
      this.players.map((p) => p.state),
      this.seed,
    );
  }

  setup(): void {
    const roles = [...ROLE_TEMPLATES[this.layout]];
    fisherYatesShuffle(roles, this.rng);

    for (const [i, player] of this.players.entries()) {
      const role = roles[i];
      player.state.role = role;
      // 守卫/女巫/猎人初始化状态
      if (role === 'witch') {
        player.state.witchHasAntidote = true;
        player.state.witchHasPoison = true;
      }
      if (role === 'hunter') {
        player.state.hunterCanShoot = true;
      }
    }

    this.log.phase = 'setup';

    this.emit(
      'game_start',
      {
        players: this.players.map((p) => ({
          playerId: p.id,
          name: p.name,
          model: p.state.model,
          role: p.role,
          personality: p.state.personality,
        })),
        layout: this.layout,
        seed: this.seed,
      },
      false,
    );

    if (this.verbose) {
      for (const p of this.players) {
        console.info(`  角色分配: [${p.id}] ${p.name} → ${p.role}`);
      }
    }

    // 给每个玩家发身份提示（不调 LLM，仅记录到历史）
    for (const player of this.players) {
      let teammates: PlayerState[] = [];
      if (player.role === 'werewolf') {
        teammates = this.players
          .filter((p) => p.role === 'werewolf' && p.id !== player.id)
          .map((p) => p.state);
      }
      const prompt = prompts.roleRevealPrompt(
        player.state,
        teammates,
        player.state.personality,
      );
      player.state.speechHistory.push({
        type: 'role_reveal',
        content: prompt,
      });
    }
  }

  async run(): Promise<GameLog> {
    this.setup();

    const maxDays = 20;
    for (let day = 1; day <= maxDays; day++) {
      this.log.day = day;

      if (this.verbose) {
        console.info(`\n${'='.repeat(50)}`);
        console.info(`  第 ${day} 天 — 夜晚阶段`);
        console.info('='.repeat(50));
      }

      // ─── 夜晚 ───
      this.currentNight = null;
      this.emitPhaseChange('night_start', day);

      await phases.phaseGuardProtect(this);
      this.emitPhaseChange('wolf_kill', day);
      await phases.phaseWolfKill(this);
      this.emitPhaseChange('seer_check', day);
      await phases.phaseSeerCheck(this);
      this.emitPhaseChange('witch_save', day);
      await phases.phaseWitchAction(this);
      this.emitPhaseChange('night_end', day);
      const deaths = phases.phaseNightResolve(this);

      // 胜负判定
      const win = checkWin(this.allStates());
      if (win.winner) {
        this.finishGame(win.winner, win.reason);
        return this.log;
      }

      // ─── 白天 ───
      if (this.verbose) {
        console.info(`\n${'='.repeat(50)}`);
        console.info(`  第 ${day} 天 — 白天阶段`);
        console.info('='.repeat(50));
      }

      this.emitPhaseChange('day_announce', day);
      const deathsInfo = phases.phaseDayAnnounce(this, deaths);

      // 猎人开枪（夜晚死亡触发）
      if (deaths.length) {
        this.emitPhaseChange('hunter_shoot', day);
        const hunterShot = await phases.phaseHunterShoot(this, deaths);
        if (hunterShot !== null) {
          const w2 = checkWin(this.allStates());
          if (w2.winner) {
            this.finishGame(w2.winner, w2.reason);
            return this.log;
          }
        }
      }

      // 发言
      this.emitPhaseChange('speech', day);
      const speeches = await phases.phaseSpeech(this, day, deathsInfo);

      // 投票
      this.emitPhaseChange('vote', day);
      const voteResult = await phases.phaseVote(this, day, speeches);

      // 被投票放逐若是猎人，开枪
      if (voteResult.eliminated !== null) {
        const elimPlayer = this.getPlayerStateById(voteResult.eliminated);
        if (elimPlayer && elimPlayer.role === 'hunter') {
          this.emitPhaseChange('hunter_shoot', day);
          const voteDeath = {
            playerId: voteResult.eliminated,
            reason: DEATH_REASON.VOTE_OUT,
            day,
            details: '被投票放逐',
          };
          const hunterShot = await phases.phaseHunterShoot(this, [voteDeath]);
          if (hunterShot !== null) {
            const w3 = checkWin(this.allStates());
            if (w3.winner) {
              this.finishGame(w3.winner, w3.reason);
              return this.log;
            }
          }
        }
      }

      // 胜负判定
      const w4 = checkWin(this.allStates());
      if (w4.winner) {
        this.finishGame(w4.winner, w4.reason);
        return this.log;
      }
    }

    // 超过最大天数
    this.finishGame('draw', `游戏超过 ${maxDays} 天，判定平局。`);
    return this.log;
  }

  private finishGame(winner: 'wolf' | 'good' | 'draw', reason: string): void {
    this.log.phase = 'game_over';
    this.log.winner = winner;
    this.log.winnerReason = reason;
    this.emitPhaseChange('game_over', this.log.day);
    this.emit(
      'game_over',
      {
        winner,
        reason,
        finalPlayers: this.allStates().map((p) => ({
          playerId: p.playerId,
          name: p.name,
          role: p.role,
          alive: p.alive,
        })),
      },
      false,
    );
    if (this.verbose) {
      console.info(gameOverInfo(this.allStates(), winner, reason));
    }
  }

  // ─── 事件 / 指标辅助 ──────────────────────────────────────

  emit(type: EventType, payload: Record<string, unknown>, isPrivate = false) {
    this.emitter.emit(type, this.log.day, this.log.phase, payload, isPrivate);
  }

  private emitPhaseChange(phase: string, day: number) {
    this.log.phase = phase as GameLog['phase'];
    this.emit(
      'phase_change',
      { phase, label: PHASE_LABELS[phase] ?? phase },
      false,
    );
  }

  recordLlmCall(player: AIPlayer, usage: LlmUsage | null) {
    if (!usage) return;
    this.emit(
      'llm_call',
      {
        playerId: player.id,
        playerName: player.name,
        model: player.state.model,
        usage,
      },
      true, // 统计事件标 private，UI 默认不显示
    );
  }

  // ─── 玩家/状态查询 ────────────────────────────────────────

  allStates(): PlayerState[] {
    return this.players.map((p) => p.state);
  }

  getPlayerStateById(pid: number): PlayerState | null {
    return this.players.find((p) => p.id === pid)?.state ?? null;
  }

  getPlayerName(pid: number): string {
    const p = this.getPlayerStateById(pid);
    return p ? p.name : `未知(${pid})`;
  }

  ensureCurrentNight(day: number): NightAction {
    if (!this.currentNight) {
      this.currentNight = {
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
    return this.currentNight;
  }

  nightHistorySummary(): prompts.NightHistoryEntry[] {
    return this.log.nights.map((n) => ({
      day: n.day,
      deaths: n.deaths.map((d) => ({ name: this.getPlayerName(d.playerId) })),
    }));
  }
}

// ─── RNG / shuffle ───────────────────────────────────────────

/**
 * Mulberry32 — 简单快速的 seeded PRNG。
 * 给定相同 seed，输出序列确定；不传 seed 则用 Math.random。
 */
function createRng(seed: number | null): () => number {
  if (seed === null) return Math.random;
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYatesShuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
