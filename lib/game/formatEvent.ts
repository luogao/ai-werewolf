/**
 * 把单个事件格式化为一行人类可读文本 —— 直播页和回放页共用。
 *
 * 私密事件在非上帝视角下返回 null（由调用方决定是否渲染）。
 */
import type { GameEvent } from '../events';

export function formatEvent(e: GameEvent, godView: boolean): string | null {
  switch (e.type) {
    case 'game_start':
      return `游戏开始 · ${e.payload.layout} · 种子 ${e.payload.seed ?? '随机'}`;
    case 'phase_change':
      return `${e.payload.label}`;
    case 'speech':
      return `${e.payload.playerName}：${e.payload.content}`;
    case 'vote_cast': {
      const target = e.payload.targetName;
      return target ? `${e.payload.voterName} 投给 ${target}` : `${e.payload.voterName} 弃票`;
    }
    case 'vote_result': {
      const name = e.payload.eliminatedName;
      return name
        ? `${name} 被放逐${e.payload.isTie ? '（平票）' : ''}`
        : `本轮无人出局${e.payload.isTie ? '（平票）' : ''}`;
    }
    case 'night_deaths':
    case 'day_announce': {
      const deaths = e.payload.deaths as Array<{ name: string }> | undefined;
      if (!deaths || deaths.length === 0) return '昨夜平安夜';
      return `昨夜死亡：${deaths.map((d) => d.name).join('、')}`;
    }
    case 'hunter_shoot':
      return e.payload.targetName
        ? `猎人 ${e.payload.hunterName} 带走了 ${e.payload.targetName}`
        : `猎人 ${e.payload.hunterName} 没有开枪`;
    case 'guard_protect':
      return godView && e.payload.targetName
        ? `守卫守护了 ${e.payload.targetName}`
        : null;
    case 'wolf_kill_decision':
      return godView && e.payload.targetName
        ? `🐺 ${e.payload.playerName} 选择刀 ${e.payload.targetName}`
        : null;
    case 'wolf_kill_result':
      return godView && e.payload.targetName
        ? `狼人最终刀：${e.payload.targetName}`
        : godView
          ? '狼人本夜未出刀'
          : null;
    case 'seer_check':
      return godView
        ? `🔮 ${e.payload.seerName} 查验 ${e.payload.targetName}：${e.payload.result === 'wolf' ? '狼人' : '好人'}`
        : null;
    case 'witch_action':
      return godView
        ? `🧪 ${e.payload.witchName}` +
            (e.payload.saved ? ` 救了 ${e.payload.savedTargetName}` : '') +
            (e.payload.poisonTargetName ? ` 毒了 ${e.payload.poisonTargetName}` : '') +
            (!e.payload.saved && !e.payload.poisonTargetName ? ' 没有行动' : '')
        : null;
    case 'game_over':
      return `游戏结束：${e.payload.winner === 'wolf' ? '狼人' : e.payload.winner === 'good' ? '好人' : '平局'}胜利 · ${e.payload.reason}`;
    case 'llm_call':
      return null; // 不在 UI 显示
    default:
      return null;
  }
}
