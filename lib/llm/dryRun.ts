/**
 * dry-run 模拟响应 —— 对应原 Python 版 player.py:_dry_run_response
 *
 * 不调用真实 LLM，按 prompt 类型返回格式合法的 JSON 字符串。
 * 用于跑通流程、调试 UI、做集成测试。
 */
import { randomInt } from 'crypto';

function pickRandom<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length)];
}

function extractValidIds(userPrompt: string): number[] {
  const matches = [...userPrompt.matchAll(/\[(\d+)\]/g)];
  return matches.map((m) => parseInt(m[1], 10));
}

function extractMyId(userPrompt: string): number {
  const m = userPrompt.match(/编号\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function dryRunResponse(userPrompt: string): string {
  const validIds = extractValidIds(userPrompt);

  // 按优先级判断
  if (userPrompt.includes('发言') || userPrompt.toLowerCase().includes('speech')) {
    const speeches = [
      '我觉得昨晚的死讯很蹊跷，需要仔细分析一下每个人的表现。',
      '我是好人，请大家相信我。我建议大家关注一下发言异常的人。',
      '有没有人要跳预言家？我觉得现在应该分享一些信息了。',
      '我观察了一下，有些人的发言比较模糊，可能是在隐藏什么。',
      '昨晚的死亡顺序值得深思，我觉得狼人可能在故意引导方向。',
      '根据我的分析，目前局势比较复杂，我们需要谨慎投票。',
    ];
    return JSON.stringify({ speech: pickRandom(speeches) });
  }

  if (userPrompt.includes('投票') || userPrompt.toLowerCase().includes('vote')) {
    const myId = extractMyId(userPrompt);
    const choices = validIds.filter((x) => x !== myId);
    const pool = choices.length ? choices : [1];
    return JSON.stringify({ vote: pickRandom(pool) });
  }

  if (userPrompt.includes('守护') || userPrompt.toLowerCase().includes('protect')) {
    const pool = validIds.length ? validIds : [1];
    return JSON.stringify({ protect: pickRandom(pool) });
  }

  if (userPrompt.includes('狼人') && userPrompt.includes('杀')) {
    const pool = validIds.length ? validIds : [1];
    return JSON.stringify({ kill: pickRandom(pool) });
  }

  if (userPrompt.includes('查验')) {
    const pool = validIds.length ? validIds : [2];
    return JSON.stringify({ check: pickRandom(pool) });
  }

  if (userPrompt.includes('女巫')) {
    return JSON.stringify({ save: Math.random() > 0.5, poison: null });
  }

  if (userPrompt.includes('猎人') && (userPrompt.includes('开枪') || userPrompt.includes('射击'))) {
    const pool = validIds.length ? validIds : [1];
    return JSON.stringify({ shoot: pickRandom(pool) });
  }

  return JSON.stringify({ action: 'pass' });
}
