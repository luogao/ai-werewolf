/**
 * 胜负判定 —— 对应原 Python 版 win_checker.py
 */
import type { PlayerState } from '../types';

export interface WinCheckResult {
  winner: 'wolf' | 'good' | null;
  reason: string;
}

export function checkWin(players: PlayerState[]): WinCheckResult {
  const aliveWolves = players.filter((p) => p.alive && p.role === 'werewolf').length;
  const aliveGood = players.filter((p) => p.alive && p.role !== 'werewolf').length;

  // 狼人全灭 → 好人胜
  if (aliveWolves === 0) {
    return { winner: 'good', reason: '所有狼人已被消灭，好人阵营获胜！' };
  }

  // 狼人数量 ≥ 好人数量 → 狼人胜
  if (aliveWolves >= aliveGood) {
    return {
      winner: 'wolf',
      reason: `狼人数量(${aliveWolves}) ≥ 好人数量(${aliveGood})，狼人阵营获胜！`,
    };
  }

  return { winner: null, reason: '' };
}

export function gameOverInfo(
  players: PlayerState[],
  winner: string,
  reason: string,
): string {
  const lines: string[] = [
    '='.repeat(50),
    '  游戏结束！',
    `  获胜方：${winner === 'wolf' ? '狼人阵营 🐺' : '好人阵营 🌟'}`,
    `  原因：${reason}`,
    '',
    '  最终身份揭晓：',
  ];
  for (const p of players) {
    const status = p.alive ? '存活' : '死亡';
    const role = p.role;
    const roleDisplay = ROLE_DISPLAY[p.role] ?? role;
    lines.push(`    [${p.playerId}] ${p.name} - ${roleDisplay} (${status})`);
  }
  lines.push('='.repeat(50));
  return lines.join('\n');
}

const ROLE_DISPLAY: Record<string, string> = {
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  guard: '守卫',
  villager: '村民',
};
