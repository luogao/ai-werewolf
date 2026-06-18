/**
 * Markdown 战报生成 —— 对应原 Python 版 report.py
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DeathRecord, GameLog, PlayerState, Role } from './types';
import { roleDisplayName } from './types';

export function generateReport(log: GameLog): string {
  const lines: string[] = [];
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);

  lines.push(`# 🐺 AI 狼人杀战报 — ${now}`);
  lines.push('');

  // 玩家阵容
  lines.push('## 📋 玩家阵容');
  lines.push('');
  lines.push('| 编号 | 名称 | 模型 | 角色 | 结果 |');
  lines.push('|:---:|:---:|:---:|:---:|:---:|');
  for (const p of log.players) {
    const death = deathInfo(log.deaths, p.playerId);
    const role = roleDisplayName(p.role);
    let result: string;
    if (death) {
      result = `第${death.day}天${death.details}`;
    } else {
      result = p.alive ? '存活' : '未知';
    }
    lines.push(`| ${p.playerId} | ${p.name} | ${p.model} | ${role} | ${result} |`);
  }
  lines.push('');

  // 每轮详情
  for (let i = 0; i < log.nights.length; i++) {
    const night = log.nights[i];
    const day = night.day;
    lines.push(`## 🌙 第 ${day} 夜`);
    lines.push('');

    // 狼人
    if (night.wolfTarget !== null) {
      const targetName = playerName(log.players, night.wolfTarget);
      lines.push(`- 🐺 狼人选择杀害：**${targetName}**（编号 ${night.wolfTarget}）`);
    } else {
      lines.push('- 🐺 狼人未行动');
    }

    // 守卫
    if (night.guardProtected !== null) {
      const name = playerName(log.players, night.guardProtected);
      lines.push(`- 🛡️  守卫守护了 **${name}**`);
    }

    // 预言家
    if (night.seerTarget !== null) {
      const seerName = findRoleName(log.players, 'seer');
      const targetName = playerName(log.players, night.seerTarget);
      const resultText = night.seerResult === 'wolf' ? '狼人' : '好人';
      lines.push(`- 🔮 预言家 **${seerName}** 查验了 **${targetName}** → **${resultText}**`);
    }

    // 女巫
    if (night.witchSaved) {
      lines.push('- 💊 女巫使用 **解药** 救人');
    }
    if (night.witchPoisoned !== null) {
      const poisonName = playerName(log.players, night.witchPoisoned);
      lines.push(`- ☠️ 女巫使用 **毒药** 毒杀了 **${poisonName}**`);
    }

    // 死亡结算
    if (night.deaths.length) {
      const names = night.deaths
        .map((d) => playerName(log.players, d.playerId))
        .join('、');
      lines.push(`- 💀 本轮死亡：**${names}**`);
    } else {
      lines.push('- ✨ 平安夜，无人死亡');
    }
    lines.push('');

    // 白天
    lines.push(`## ☀️ 第 ${day} 天 — 白天讨论`);
    lines.push('');

    if (i < log.speeches.length) {
      const speeches = log.speeches[i];
      lines.push('### 🎤 发言记录');
      lines.push('');
      for (const s of speeches) {
        lines.push(`**[${s.playerId}] ${s.name}**：${s.content}`);
        lines.push('');
      }
    }

    if (i < log.votes.length) {
      const vr = log.votes[i];
      lines.push('### 🗳️ 投票结果');
      lines.push('');
      lines.push('| 投票人 | 投票目标 |');
      lines.push('|:---:|:---:|');
      for (const [voterStr, targetId] of Object.entries(vr.votes)) {
        const voterId = parseInt(voterStr, 10);
        const voterName = playerName(log.players, voterId);
        const targetName = playerName(log.players, targetId);
        lines.push(`| ${voterName} | ${targetName} |`);
      }
      lines.push('');

      if (vr.eliminated !== null) {
        const elimName = playerName(log.players, vr.eliminated);
        const voteCount = vr.tally[vr.eliminated] ?? 0;
        lines.push(`⚖️ **${elimName}** 以 ${voteCount} 票被投票放逐。`);
      } else {
        lines.push('⚖️ 平票，无人被放逐。');
      }
      lines.push('');
    }
  }

  // 最终结果
  lines.push('## 🏆 最终结果');
  lines.push('');
  if (log.winner === 'wolf') {
    lines.push('🐺 **狼人阵营胜利！**');
  } else if (log.winner === 'good') {
    lines.push('🎉 **好人阵营胜利！**');
  } else if (log.winner === 'draw') {
    lines.push('🤝 **平局！**');
  } else {
    lines.push(`结果：${log.winner}`);
  }
  lines.push('');
  lines.push(`> ${log.winnerReason}`);
  lines.push('');

  if (log.seed !== null) {
    lines.push('---');
    lines.push(`*随机种子: ${log.seed}*`);
  }

  return lines.join('\n');
}

export function saveReport(report: string, reportsDir = 'reports'): string {
  fs.mkdirSync(reportsDir, { recursive: true });
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filePath = path.join(reportsDir, `werewolf_${ts}.md`);
  fs.writeFileSync(filePath, report, 'utf-8');
  return filePath;
}

// ─── 辅助 ─────────────────────────────────────────────────────

function playerName(players: PlayerState[], pid: number): string {
  return players.find((p) => p.playerId === pid)?.name ?? `未知(${pid})`;
}

function findRoleName(players: PlayerState[], role: Role): string {
  return players.find((p) => p.role === role)?.name ?? '未知';
}

function deathInfo(deaths: DeathRecord[], pid: number): DeathRecord | null {
  return deaths.find((d) => d.playerId === pid) ?? null;
}
