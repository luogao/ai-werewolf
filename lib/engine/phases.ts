/**
 * 各阶段处理逻辑 —— 对应原 Python 版 phases.py
 *
 * 流程：
 *   夜晚: guard_protect → wolf_kill → seer_check → witch_action → night_resolve
 *   白天: day_announce → hunter_shoot(若触发) → speech → vote → hunter_shoot(若被投)
 *
 * 所有函数都是 async，phase 内多次 await LLM 调用。
 * 关键节点通过 engine.emitter 发射事件，供 SSE / DB / 统计消费。
 */
import type { GameEngine } from './game';
import type {
  DeathRecord,
  NightAction,
  PlayerState,
  VoteResult,
} from '../types';
import { DEATH_REASON } from '../types';
import type { AIPlayer } from '../llm/player';
import {
  parseAction,
  parseSpeech,
  parseWitchAction,
} from '../parser';
import * as prompts from '../prompts';

// ─── 夜晚阶段 ──────────────────────────────────────────────────

/**
 * 守卫守护。每晚先于狼人行动。
 * 不能连续两晚守同一人（player.guardLastProtected 记录）。
 */
export async function phaseGuardProtect(engine: GameEngine): Promise<void> {
  const log = engine.log;
  const guard = findAlivePlayer(engine, 'guard');
  if (!guard) return;

  // 守卫先于其他角色行动，需要先初始化当晚记录
  engine.ensureCurrentNight(log.day);

  // 守卫可以守任何人（包括自己），但不能守上一次守的
  const allIds = engine.players
    .filter((p) => p.alive && p.id !== guard.state.guardLastProtected)
    .map((p) => p.state.playerId);

  if (!allIds.length) return;

  const nightHistory = engine.nightHistorySummary();
  const { sys, user } = splitPrompt(
    prompts.guardProtectPrompt(
      guard.state,
      engine.allStates(),
      nightHistory,
      guard.state.personality,
    ),
  );

  const { text, usage } = await guard.chatWithUsage(sys, user);
  engine.recordLlmCall(guard, usage);

  let target = parseAction(text, 'protect', allIds);
  if (target === null && engine.dryRun) {
    target = allIds[Math.floor(Math.random() * allIds.length)];
  }

  if (target !== null) {
    engine.currentNight!.guardProtected = target;
    guard.state.guardLastProtected = target;
    const targetName = engine.getPlayerName(target);
    engine.emit('guard_protect', {
      playerId: guard.id,
      playerName: guard.name,
      targetId: target,
      targetName,
    }, true);

    if (engine.verbose) {
      console.info(`  🛡️  守卫${guard.name}守护: ${targetName}(${target})`);
    }
  }
}

export async function phaseWolfKill(engine: GameEngine): Promise<void> {
  const log = engine.log;
  const day = log.day;
  const night = engine.ensureCurrentNight(day);

  const wolves = engine.players.filter(
    (p) => p.alive && p.role === 'werewolf',
  );
  if (!wolves.length) return;

  const aliveIds = engine.players
    .filter((p) => p.alive && p.role !== 'werewolf')
    .map((p) => p.state.playerId);
  if (!aliveIds.length) return;

  const nightHistory = engine.nightHistorySummary();
  const votes = new Map<number, number>();

  for (const wolf of wolves) {
    const { sys, user } = splitPrompt(
      prompts.wolfKillPrompt(
        wolf.state,
        engine.allStates(),
        nightHistory,
        wolf.state.personality,
      ),
    );
    const { text, usage } = await wolf.chatWithUsage(sys, user);
    engine.recordLlmCall(wolf, usage);

    let target = parseAction(text, 'kill', aliveIds);
    if (target === null && engine.dryRun) {
      target = aliveIds[Math.floor(Math.random() * aliveIds.length)];
    }

    if (target !== null) {
      votes.set(wolf.id, target);
      engine.emit(
        'wolf_kill_decision',
        {
          playerId: wolf.id,
          playerName: wolf.name,
          targetId: target,
          targetName: engine.getPlayerName(target),
        },
        true,
      );
    }

    if (engine.verbose) {
      console.info(`  🐺 ${wolf.name} 选择杀: ${target}`);
    }
  }

  // 多数决（平局随机）
  if (votes.size > 0) {
    const tally = new Map<number, number>();
    for (const target of votes.values()) {
      tally.set(target, (tally.get(target) ?? 0) + 1);
    }
    const maxCount = Math.max(...tally.values());
    const candidates = [...tally.entries()]
      .filter(([, c]) => c === maxCount)
      .map(([t]) => t);
    night.wolfTarget = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    night.wolfTarget = aliveIds[Math.floor(Math.random() * aliveIds.length)];
  }

  engine.emit(
    'wolf_kill_result',
    {
      targetId: night.wolfTarget,
      targetName: engine.getPlayerName(night.wolfTarget!),
    },
    true,
  );

  if (engine.verbose) {
    const name = engine.getPlayerName(night.wolfTarget!);
    console.info(`  🌙 第${day}夜 狼人决定杀害: ${name}(${night.wolfTarget})`);
  }
}

export async function phaseSeerCheck(engine: GameEngine): Promise<void> {
  const night = engine.currentNight;
  if (!night) return;

  const seer = findAlivePlayer(engine, 'seer');
  if (!seer) return;

  const aliveIds = engine.players
    .filter((p) => p.alive && p.id !== seer.id)
    .map((p) => p.state.playerId);

  const { sys, user } = splitPrompt(
    prompts.seerCheckPrompt(
      seer.state,
      engine.allStates(),
      engine.seerResults,
      [],
      seer.state.personality,
    ),
  );
  const { text, usage } = await seer.chatWithUsage(sys, user);
  engine.recordLlmCall(seer, usage);

  let target = parseAction(text, 'check', aliveIds);
  if (target === null && engine.dryRun && aliveIds.length) {
    target = aliveIds[Math.floor(Math.random() * aliveIds.length)];
  }

  if (target !== null) {
    night.seerTarget = target;
    const targetPlayer = engine.getPlayerStateById(target);
    if (targetPlayer) {
      const isWolf = targetPlayer.role === 'werewolf';
      const result = isWolf ? 'wolf' : 'good';
      night.seerResult = result;
      engine.seerResults.push({
        id: target,
        name: targetPlayer.name,
        isWolf,
      });

      engine.emit(
        'seer_check',
        {
          seerId: seer.id,
          seerName: seer.name,
          targetId: target,
          targetName: targetPlayer.name,
          result,
        },
        true,
      );

      if (engine.verbose) {
        console.info(
          `  🔮 预言家${seer.name}查验: ${targetPlayer.name}(${target}) → ${isWolf ? '狼人' : '好人'}`,
        );
      }
    }
  }
}

export async function phaseWitchAction(engine: GameEngine): Promise<void> {
  const night = engine.currentNight;
  if (!night) return;

  const witch = findAlivePlayer(engine, 'witch');
  if (!witch) return;

  const hasAntidote = witch.state.witchHasAntidote;
  const hasPoison = witch.state.witchHasPoison;
  if (!hasAntidote && !hasPoison) return;

  const killedId = night.wolfTarget;
  const killedName = killedId !== null ? engine.getPlayerName(killedId) : '未知';

  const { sys, user } = splitPrompt(
    prompts.witchActionPrompt(
      witch.state,
      engine.allStates(),
      killedName,
      killedId,
      hasAntidote,
      hasPoison,
      [],
      witch.state.personality,
    ),
  );
  const { text, usage } = await witch.chatWithUsage(sys, user);
  engine.recordLlmCall(witch, usage);

  const action = parseWitchAction(text);

  let savedTargetId: number | null = null;
  let savedTargetName: string | null = null;
  let poisonTargetId: number | null = null;
  let poisonTargetName: string | null = null;

  // 救人
  if (action.save && hasAntidote && killedId !== null) {
    night.witchSaved = true;
    witch.state.witchHasAntidote = false;
    savedTargetId = killedId;
    savedTargetName = killedName;
    if (engine.verbose) {
      console.info(`  💊 女巫${witch.name}使用解药救了 ${killedName}`);
    }
  }

  // 毒人
  const aliveIds = engine.players
    .filter((p) => p.alive && p.id !== witch.id)
    .map((p) => p.state.playerId);
  const poisonRaw = action.poison;
  if (poisonRaw !== null && hasPoison && aliveIds.includes(poisonRaw)) {
    night.witchPoisoned = poisonRaw;
    witch.state.witchHasPoison = false;
    poisonTargetId = poisonRaw;
    poisonTargetName = engine.getPlayerName(poisonRaw);
    if (engine.verbose) {
      console.info(`  ☠️ 女巫${witch.name}使用毒药毒了 ${poisonTargetName}`);
    }
  }

  engine.emit(
    'witch_action',
    {
      witchId: witch.id,
      witchName: witch.name,
      saved: action.save && !!savedTargetId,
      savedTargetId,
      savedTargetName,
      poisonTargetId,
      poisonTargetName,
    },
    true,
  );
}

export function phaseNightResolve(engine: GameEngine): DeathRecord[] {
  const night = engine.currentNight;
  if (!night) return [];

  const deaths: DeathRecord[] = [];

  // 狼人杀人（除非被守卫挡 / 被女巫救）
  if (night.wolfTarget !== null && !night.witchSaved) {
    const protectedByGuard = night.guardProtected === night.wolfTarget;
    if (!protectedByGuard) {
      const target = engine.getPlayerStateById(night.wolfTarget);
      if (target && target.alive) {
        target.alive = false;
        deaths.push({
          playerId: night.wolfTarget,
          reason: DEATH_REASON.WOLF_KILL,
          day: night.day,
          details: '被狼人杀害',
        });
      }
    } else if (engine.verbose) {
      console.info(
        `  🛡️  守卫成功守护了 ${engine.getPlayerName(night.wolfTarget)}`,
      );
    }
  }

  // 女巫毒杀
  if (night.witchPoisoned !== null) {
    const target = engine.getPlayerStateById(night.witchPoisoned);
    if (target && target.alive) {
      target.alive = false;
      deaths.push({
        playerId: night.witchPoisoned,
        reason: DEATH_REASON.WITCH_POISON,
        day: night.day,
        details: '被女巫毒杀',
      });
    }
  }

  night.deaths = deaths;
  engine.log.nights.push(night);
  engine.log.deaths.push(...deaths);

  engine.emit(
    'night_deaths',
    {
      deaths: deaths.map((d) => ({
        playerId: d.playerId,
        name: engine.getPlayerName(d.playerId),
        reason: d.reason,
        details: d.details,
      })),
    },
    false,
  );

  return deaths;
}

// ─── 白天阶段 ──────────────────────────────────────────────────

export function phaseDayAnnounce(
  engine: GameEngine,
  deaths: DeathRecord[],
): string {
  let msg: string;
  if (deaths.length) {
    const names = deaths
      .map((d) => `${engine.getPlayerName(d.playerId)}(${d.details})`)
      .join('、');
    msg = `昨晚，${names}。`;
  } else {
    msg = '昨晚是平安夜，没有人死亡。';
  }

  engine.emit('day_announce', { deathsInfo: msg }, false);

  if (engine.verbose) {
    console.info(`  ☀️  ${msg}`);
  }
  return msg;
}

export async function phaseHunterShoot(
  engine: GameEngine,
  deaths: DeathRecord[],
): Promise<number | null> {
  for (const death of deaths) {
    const player = engine.getPlayerStateById(death.playerId);
    if (player && player.role === 'hunter' && player.hunterCanShoot) {
      const hunterPlayer = findPlayerById(engine, death.playerId);
      if (!hunterPlayer) continue;

      // 被女巫毒杀的猎人不能开枪
      if (death.reason === DEATH_REASON.WITCH_POISON) {
        if (engine.verbose) {
          console.info(`  🔫 猎人${player.name} 被毒杀，无法开枪`);
        }
        continue;
      }

      const aliveIds = engine.players.filter((p) => p.alive).map((p) => p.state.playerId);
      const reasonStr = death.details;

      const { sys, user } = splitPrompt(
        prompts.hunterShootPrompt(
          hunterPlayer.state,
          engine.allStates(),
          reasonStr,
          [],
          hunterPlayer.state.personality,
        ),
      );
      const { text, usage } = await hunterPlayer.chatWithUsage(sys, user);
      engine.recordLlmCall(hunterPlayer, usage);

      const target = parseAction(text, 'shoot', aliveIds);
      if (target !== null) {
        const targetPlayer = engine.getPlayerStateById(target);
        if (targetPlayer && targetPlayer.alive) {
          targetPlayer.alive = false;
          engine.log.deaths.push({
            playerId: target,
            reason: DEATH_REASON.HUNTER_SHOOT,
            day: engine.log.day,
            details: `被猎人${player.name}开枪射杀`,
          });
          engine.emit(
            'hunter_shoot',
            {
              hunterId: hunterPlayer.id,
              hunterName: hunterPlayer.name,
              targetId: target,
              targetName: targetPlayer.name,
            },
            false,
          );
          if (engine.verbose) {
            console.info(
              `  🔫 猎人${player.name}开枪射杀了 ${targetPlayer.name}(${target})`,
            );
          }
          return target;
        }
      }
    }
  }
  return null;
}

export async function phaseSpeech(
  engine: GameEngine,
  day: number,
  deathsInfo: string,
): Promise<Array<{ playerId: number; name: string; content: string }>> {
  const speeches: Array<{ playerId: number; name: string; content: string }> = [];
  const alivePlayers = engine.players.filter((p) => p.alive);

  for (const player of alivePlayers) {
    let personalInfo = '';
    if (player.role === 'seer') {
      personalInfo = prompts.seerPersonalInfo(engine.seerResults);
    } else if (player.role === 'werewolf') {
      const teammates = engine.players
        .filter(
          (p) =>
            p.role === 'werewolf' &&
            p.id !== player.id &&
            p.alive,
        )
        .map((p) => p.state);
      personalInfo = prompts.wolfPersonalInfo(teammates);
    }

    const { sys, user } = splitPrompt(
      prompts.speechPrompt(
        player.state,
        engine.allStates(),
        day,
        deathsInfo,
        speeches,
        personalInfo,
        player.state.personality,
      ),
    );
    const { text, usage } = await player.chatWithUsage(sys, user);
    engine.recordLlmCall(player, usage);

    const speechText = parseSpeech(text);
    speeches.push({
      playerId: player.id,
      name: player.name,
      content: speechText,
    });

    engine.emit(
      'speech',
      {
        playerId: player.id,
        playerName: player.name,
        content: speechText,
      },
      false,
    );

    if (engine.verbose) {
      console.info(
        `  🎤 [${player.id}] ${player.name}: ${speechText.slice(0, 80)}...`,
      );
    }
  }

  engine.log.speeches.push(speeches);
  return speeches;
}

export async function phaseVote(
  engine: GameEngine,
  day: number,
  speeches: Array<{ playerId: number; name: string; content: string }>,
): Promise<VoteResult> {
  const alivePlayers = engine.players.filter((p) => p.alive);
  const aliveIds = alivePlayers.map((p) => p.state.playerId);

  const votes: Record<number, number> = {};
  for (const player of alivePlayers) {
    let personalInfo = '';
    if (player.role === 'seer') {
      personalInfo = prompts.seerPersonalInfo(engine.seerResults);
    } else if (player.role === 'werewolf') {
      const teammates = engine.players
        .filter(
          (p) =>
            p.role === 'werewolf' &&
            p.id !== player.id &&
            p.alive,
        )
        .map((p) => p.state);
      personalInfo = prompts.wolfPersonalInfo(teammates);
    }

    const { sys, user } = splitPrompt(
      prompts.votePrompt(
        player.state,
        engine.allStates(),
        day,
        speeches,
        personalInfo,
        player.state.personality,
      ),
    );
    const { text, usage } = await player.chatWithUsage(sys, user);
    engine.recordLlmCall(player, usage);

    const validTargets = aliveIds.filter((pid) => pid !== player.id);
    let target = parseAction(text, 'vote', validTargets);
    if (target === null && engine.dryRun) {
      target = validTargets[Math.floor(Math.random() * validTargets.length)];
    }

    if (target !== null) {
      votes[player.id] = target;
      engine.emit(
        'vote_cast',
        {
          voterId: player.id,
          voterName: player.name,
          targetId: target,
          targetName: engine.getPlayerName(target),
        },
        false,
      );
    }

    if (engine.verbose) {
      const targetName = target !== null ? engine.getPlayerName(target) : '无效';
      console.info(`  🗳️  [${player.id}] ${player.name} → 投票给 ${targetName}`);
    }
  }

  // 计票
  const tally: Record<number, number> = {};
  for (const target of Object.values(votes)) {
    tally[target] = (tally[target] ?? 0) + 1;
  }

  let eliminated: number | null = null;
  let isTie = false;
  const tallyValues = Object.values(tally);
  if (tallyValues.length) {
    const maxCount = Math.max(...tallyValues);
    const candidates = Object.entries(tally)
      .filter(([, c]) => c === maxCount)
      .map(([t]) => parseInt(t, 10));
    if (candidates.length === 1) {
      eliminated = candidates[0];
    } else {
      isTie = true;
      eliminated = candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  // 执行放逐
  let eliminatedName: string | null = null;
  if (eliminated !== null) {
    const targetPlayer = engine.getPlayerStateById(eliminated);
    if (targetPlayer) {
      targetPlayer.alive = false;
      const count = tally[eliminated] ?? 0;
      engine.log.deaths.push({
        playerId: eliminated,
        reason: DEATH_REASON.VOTE_OUT,
        day,
        details: `被投票放逐(${count}票)`,
      });
      eliminatedName = targetPlayer.name;
      if (engine.verbose) {
        console.info(
          `  ⚖️  ${eliminatedName}(${eliminated}) 被投票放逐 (${count}票)`,
        );
      }
    }
  }

  const result: VoteResult = {
    day,
    votes,
    tally,
    eliminated,
    isTie,
  };
  engine.log.votes.push(result);

  engine.emit(
    'vote_result',
    {
      tally,
      votes,
      eliminated,
      eliminatedName,
      isTie,
    },
    false,
  );

  return result;
}

// ─── 辅助 ─────────────────────────────────────────────────────

function findAlivePlayer(engine: GameEngine, role: string): AIPlayer | null {
  return engine.players.find((p) => p.alive && p.role === role) ?? null;
}

function findPlayerById(engine: GameEngine, pid: number): AIPlayer | null {
  return engine.players.find((p) => p.id === pid) ?? null;
}

function splitPrompt(p: { system: string; user: string }): { sys: string; user: string } {
  return { sys: p.system, user: p.user };
}
