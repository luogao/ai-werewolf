/**
 * Prompt 模板 —— 对应原 Python 版 prompts.py
 *
 * 架构保持不变：
 *   System Prompt = 固定游戏规则（所有玩家、所有阶段共用）
 *   User Prompt   = 身份揭示 + 人格 + 当前局势 + 决策需求（每次不同）
 *
 * 严格信息隔离：好人 User Prompt 永远不泄露狼人身份。
 */
import type { PlayerState, Role } from './types';
import { roleDisplayName } from './types';

// ═══════════════════════════════════════════════════════════════
// 固定 System Prompt —— 游戏规则
// ═══════════════════════════════════════════════════════════════

export const SYSTEM_PROMPT = `你是一场狼人杀游戏的参与者。以下是完整的游戏规则，所有玩家都了解这些规则。

## 游戏规则

### 阵营与角色
- **好人阵营**：预言家、女巫、猎人、守卫、村民
- **狼人阵营**：狼人

### 角色能力
- **狼人**：每晚共同决定杀死一名玩家
- **预言家**：每晚可以查验一名玩家的阵营（好人/狼人）
- **女巫**：拥有一瓶解药（救被狼人杀死的人）和一瓶毒药（毒杀任意一人），各只能使用一次
- **猎人**：被杀死时（无论死因）可以开枪带走一名存活玩家
- **守卫**：每晚守护一名玩家，被守的人不会被狼人杀死；不能连续两晚守同一人
- **村民**：无特殊能力，但通过分析和投票发挥作用

### 游戏流程
1. **夜晚**：守卫守护 → 狼人选择杀人 → 预言家查验 → 女巫决定是否用药
2. **白天**：宣布死讯 → 所有存活玩家依次发言讨论 → 投票放逐一人

### 胜利条件
- **好人阵营胜利**：所有狼人被消灭
- **狼人阵营胜利**：狼人存活数量 ≥ 好人存活数量

### 重要规则
- 死亡玩家不能再发言或投票
- 被投票放逐的玩家不能发动技能（猎人除外，猎人可以开枪）
- 所有发言必须用中文
- 投票不能投自己

你现在会收到你的身份信息和当前局势，请根据你的角色做出合理的决策。`;

// ═══════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════

export function alivePlayersList(
  players: PlayerState[],
  excludeId: number | null = null,
): string {
  const lines: string[] = [];
  for (const p of players) {
    if (!p.alive) continue;
    if (p.playerId === excludeId) continue;
    lines.push(`  [${p.playerId}] ${p.name}`);
  }
  return lines.length ? lines.join('\n') : '  (无)';
}

export function deadPlayersList(players: PlayerState[]): string {
  const lines: string[] = [];
  for (const p of players) {
    if (!p.alive) {
      lines.push(`  [${p.playerId}] ${p.name} (已死亡)`);
    }
  }
  return lines.length ? lines.join('\n') : '  (无)';
}

export interface NightHistoryEntry {
  day: number;
  deaths: { name: string }[];
}

export function formatNightHistory(history: NightHistoryEntry[]): string {
  if (!history.length) return '  (第一夜，暂无历史)';
  return history
    .map((h) => {
      const day = h.day;
      if (h.deaths.length) {
        const names = h.deaths.map((d) => d.name).join('、');
        return `  第${day}夜: ${names} 死亡`;
      }
      return `  第${day}夜: 平安夜`;
    })
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════
// 身份揭示
// ═══════════════════════════════════════════════════════════════

export function roleRevealPrompt(
  player: PlayerState,
  teammates: PlayerState[] = [],
  personality = '',
): string {
  const role = player.role;
  const lines: string[] = [`你的身份是【${roleDisplayName(role)}】。`];

  if (role === 'werewolf') {
    const teammateNames = teammates.map((t) => t.name).join('、');
    lines.push(`你的狼人队友是：${teammateNames}`);
    lines.push('你们需要在夜晚商量杀谁，白天伪装成好人。');
  } else if (role === 'seer') {
    lines.push('你每晚可以查验一名玩家是好人还是狼人。');
  } else if (role === 'witch') {
    lines.push('你有一瓶解药（救人）和一瓶毒药（毒人），各只能用一次。');
  } else if (role === 'hunter') {
    lines.push('你被杀死时可以开枪带走一名玩家。');
  } else if (role === 'guard') {
    lines.push('你每晚可以守护一名玩家，被守的人不会被狼人杀死；不能连续两晚守同一人。');
  } else {
    lines.push('你没有特殊技能，但你的分析和投票至关重要。');
  }

  if (personality) {
    lines.push(`\n你的性格特点：${personality}`);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// 夜晚阶段
// ═══════════════════════════════════════════════════════════════

export interface PromptResult {
  system: string;
  user: string;
}

export function guardProtectPrompt(
  player: PlayerState,
  players: PlayerState[],
  nightHistory: NightHistoryEntry[],
  personality = '',
): PromptResult {
  const alive = alivePlayersList(players, null); // 守卫可以守自己
  const history = formatNightHistory(nightHistory);
  const lastProtected = player.guardLastProtected;
  const lastLine = lastProtected !== null
    ? `\n注意：上一晚你守了 [${lastProtected}]，今晚不能再守同一人。`
    : '';

  const user = `现在是夜晚阶段。

你是【${player.name}】(编号 ${player.playerId})，身份是【守卫】。
${personality ? `你的性格：${personality}\n` : ''}请选择今晚要守护的目标。被守的人即使被狼人攻击也不会死亡。
${lastProtected !== null ? `\n你不能连续两晚守同一人（上晚守了 [${lastProtected}]）。` : ''}

所有玩家：
${alive}

历史夜晚行动：
${history}
${lastLine}
请用以下 JSON 格式回复（选择一个玩家编号，可以守自己）：
{"protect": <玩家编号>}`;

  return { system: SYSTEM_PROMPT, user };
}

export function wolfKillPrompt(
  player: PlayerState,
  players: PlayerState[],
  nightHistory: NightHistoryEntry[],
  personality = '',
): PromptResult {
  const alive = alivePlayersList(players, player.playerId);
  const history = formatNightHistory(nightHistory);

  const user = `现在是夜晚阶段。

你是【${player.name}】(编号 ${player.playerId})，身份是【狼人】。
${personality ? `你的性格：${personality}\n` : ''}请选择今晚要杀害的目标。你的狼人队友会独立做出选择，最终取多数意见。

存活的其他玩家：
${alive}

历史夜晚行动：
${history}

请用以下 JSON 格式回复（只能选择一个存活玩家的编号）：
{"kill": <玩家编号>}`;

  return { system: SYSTEM_PROMPT, user };
}

export interface SeerKnownResult {
  id: number;
  name: string;
  isWolf: boolean;
}

export function seerCheckPrompt(
  player: PlayerState,
  players: PlayerState[],
  knownResults: SeerKnownResult[],
  nightHistory: NightHistoryEntry[],
  personality = '',
): PromptResult {
  const alive = alivePlayersList(players, player.playerId);
  let knownStr = '';
  if (knownResults.length) {
    knownStr = '你之前查验的结果：\n';
    for (const r of knownResults) {
      knownStr += `  - ${r.name}: ${r.isWolf ? '狼人' : '好人'}\n`;
    }
  }
  const history = formatNightHistory(nightHistory);

  const user = `现在是夜晚阶段。

你是【${player.name}】(编号 ${player.playerId})，身份是【预言家】。
${personality ? `你的性格：${personality}\n` : ''}请选择今晚要查验的玩家。

存活的其他玩家：
${alive}

${knownStr}
历史夜晚行动：
${history}

请用以下 JSON 格式回复（只能选择一个存活玩家的编号）：
{"check": <玩家编号>}`;

  return { system: SYSTEM_PROMPT, user };
}

export function witchActionPrompt(
  player: PlayerState,
  players: PlayerState[],
  killedName: string,
  killedId: number | null,
  hasAntidote: boolean,
  hasPoison: boolean,
  nightHistory: NightHistoryEntry[],
  personality = '',
): PromptResult {
  const alive = alivePlayersList(players, player.playerId);
  const history = formatNightHistory(nightHistory);

  const user = `现在是夜晚阶段。

你是【${player.name}】(编号 ${player.playerId})，身份是【女巫】。
${personality ? `你的性格：${personality}\n` : ''}今晚被狼人杀害的是：${killedName}${killedId !== null ? `（编号 ${killedId}）` : ''}。

你的状态：
- 解药：${hasAntidote ? '未使用（可以救人）' : '已使用'}
- 毒药：${hasPoison ? '未使用（可以毒人）' : '已使用'}

存活的其他玩家：
${alive}

历史夜晚行动：
${history}

请决定你的行动。你可以：
1. 用解药救被杀的人（仅当解药未使用时）
2. 用毒药毒杀某人（仅当毒药未使用时）
3. 什么都不做

请用以下 JSON 格式回复：
{"save": true/false, "poison": <玩家编号或null>}`;

  return { system: SYSTEM_PROMPT, user };
}

export function hunterShootPrompt(
  player: PlayerState,
  players: PlayerState[],
  reason: string,
  speechLog: { playerId: number; name: string; content: string }[],
  personality = '',
): PromptResult {
  const alive = alivePlayersList(players, player.playerId);

  const user = `你【${player.name}】(猎人) 被 ${reason} 杀死了！
${personality ? `你的性格：${personality}\n` : ''}根据猎人技能，你可以开枪带走一名玩家。

存活的其他玩家：
${alive}

请决定是否开枪，以及射击谁。如果不想开枪，设为 null。

请用以下 JSON 格式回复：
{"shoot": <玩家编号或null>}`;

  return { system: SYSTEM_PROMPT, user };
}

// ═══════════════════════════════════════════════════════════════
// 白天阶段
// ═══════════════════════════════════════════════════════════════

export function speechPrompt(
  player: PlayerState,
  players: PlayerState[],
  day: number,
  deathsInfo: string,
  speechHistory: { playerId: number; name: string; content: string }[],
  personalInfo = '',
  personality = '',
): PromptResult {
  const alive = alivePlayersList(players);
  const dead = deadPlayersList(players);

  let prevSpeeches = '';
  if (speechHistory.length) {
    prevSpeeches = '之前的发言记录：\n';
    for (const s of speechHistory) {
      prevSpeeches += `  [${s.playerId}] ${s.name}: ${s.content}\n`;
    }
  }

  const user = `第${day}天 白天讨论阶段

你是【${player.name}】，编号 ${player.playerId}，身份是【${roleDisplayName(player.role)}】。
${personality ? `你的性格：${personality}\n` : ''}昨晚的死亡情况：${deathsInfo || '平安夜，无人死亡。'}

当前存活玩家：
${alive}

已死亡玩家：
${dead}

${prevSpeeches}
${personalInfo}

请发表你的看法（50-150字）。你可以分析局势、怀疑某人、为自己辩护等。
注意：你不得在发言中直接暴露自己的角色技能使用细节（如"我昨晚查验了某人"需谨慎表述）。

请用以下 JSON 格式回复：
{"speech": "<你的发言内容>"}`;

  return { system: SYSTEM_PROMPT, user };
}

export function votePrompt(
  player: PlayerState,
  players: PlayerState[],
  day: number,
  speeches: { playerId: number; name: string; content: string }[],
  personalInfo = '',
  personality = '',
): PromptResult {
  const alive = alivePlayersList(players, player.playerId);

  let speechSummary = '';
  if (speeches.length) {
    speechSummary = '今天的发言摘要：\n';
    for (const s of speeches) {
      speechSummary += `  [${s.playerId}] ${s.name}: ${s.content.slice(0, 100)}\n`;
    }
  }

  const user = `第${day}天 投票环节

你是【${player.name}】，编号 ${player.playerId}，身份是【${roleDisplayName(player.role)}】。
${personality ? `你的性格：${personality}\n` : ''}你可以投票的玩家：
${alive}

${speechSummary}
${personalInfo}

请选择你认为是狼人的玩家进行投票。你不可以投自己。
请用以下 JSON 格式回复（只能选择一个存活玩家的编号）：
{"vote": <玩家编号>}`;

  return { system: SYSTEM_PROMPT, user };
}

// ═══════════════════════════════════════════════════════════════
// 私密信息（personal_info 片段）
// ═══════════════════════════════════════════════════════════════

export function dayAnnouncePrompt(day: number, deathsInfo: string): string {
  if (deathsInfo) {
    return `第${day}天早上，昨晚的死亡情况：${deathsInfo}`;
  }
  return `第${day}天早上，昨晚是平安夜，没有人死亡。`;
}

export function seerPersonalInfo(knownResults: SeerKnownResult[]): string {
  if (!knownResults.length) return '';
  const lines = ['【你的查验记录】（仅你可见）'];
  for (const r of knownResults) {
    lines.push(`  - ${r.name}(编号${r.id}): ${r.isWolf ? '🐺狼人' : '✅好人'}`);
  }
  return lines.join('\n');
}

export function wolfPersonalInfo(teammates: PlayerState[]): string {
  if (!teammates.length) return '';
  const names = teammates.map((t) => t.name).join('、');
  return `【你的狼人队友】（仅狼人可见）：${names}`;
}

export function witchPersonalInfo(
  killedName: string,
  killedId: number | null,
  hasAntidote: boolean,
  hasPoison: boolean,
): string {
  const lines = [`【女巫私密信息】今晚 ${killedName}${killedId !== null ? `(编号${killedId})` : ''} 被狼人杀害。`];
  lines.push(`  解药: ${hasAntidote ? '可用' : '已用'}`);
  lines.push(`  毒药: ${hasPoison ? '可用' : '已用'}`);
  return lines.join('\n');
}

export function roleToKey(role: Role): string {
  return role;
}
