/**
 * 角色模板（布局）—— 不同人数的狼人杀配置
 *
 * 对应原 Python 版 game.py 中的 ROLE_TEMPLATE，扩展为 6/9/12 人局。
 */
import type { Role } from '../types';

export type Layout = '6p' | '9p' | '12p';

export const LAYOUT_LABELS: Record<Layout, string> = {
  '6p': '6 人局（2 狼 + 1 预言家 + 1 女巫 + 2 村民）',
  '9p': '9 人局（3 狼 + 1 预言家 + 1 女巫 + 1 猎人 + 3 村民）',
  '12p': '12 人局（4 狼 + 1 预言家 + 1 女巫 + 1 猎人 + 1 守卫 + 4 村民）',
};

export const ROLE_TEMPLATES: Record<Layout, Role[]> = {
  '6p': ['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager'],
  '9p': [
    'werewolf', 'werewolf', 'werewolf',
    'seer',
    'witch',
    'hunter',
    'villager', 'villager', 'villager',
  ],
  '12p': [
    'werewolf', 'werewolf', 'werewolf', 'werewolf',
    'seer',
    'witch',
    'hunter',
    'guard',
    'villager', 'villager', 'villager', 'villager',
  ],
};

export const ALL_LAYOUTS: Layout[] = ['6p', '9p', '12p'];

export function validateLayout(layout: Layout, playerCount: number): void {
  const expected = ROLE_TEMPLATES[layout].length;
  if (playerCount !== expected) {
    throw new Error(`Layout ${layout} requires ${expected} players, got ${playerCount}`);
  }
}
