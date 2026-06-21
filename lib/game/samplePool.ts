/**
 * 模型池采样 —— 把用户配置的「模型池」随机分配到 N 个座位
 *
 * 引擎内部已经用 fisherYatesShuffle 根据 seed 洗牌角色，
 * 所以前端只需要保证「哪几个模型参与」+「座位顺序随机」即可。
 */

export interface PoolEntry {
  /** 本地 uuid，用作 React key */
  id: string;
  /** 模型 id，必填（如 'gpt-4o-mini'） */
  model: string;
  /** 自定义 OpenAI 兼容端点；空串表示走全局 env */
  baseUrl: string;
  /** 明文 apiKey（仅存 localStorage；启动对局时会经 POST /api/players 进 DB） */
  apiKey: string;
  /** 可选备注，如「公司代理」「本地 Ollama」 */
  label?: string;
}

/**
 * 从池子里随机采样 n 个 entry。
 *
 * - pool.length >= n：洗牌后取前 n（无放回，每个模型最多用一次）
 * - pool.length <  n：每个 entry 至少出现一次，剩余位置带放回补齐，最后整体打乱
 * - pool 为空 / 所有 entry 的 model 都空：抛错
 */
export function samplePool(pool: PoolEntry[], n: number, rng: () => number): PoolEntry[] {
  const valid = pool.filter((p) => p.model.trim());
  if (valid.length === 0) {
    throw new Error('池子里没有有效模型（model 字段不能为空）');
  }
  if (n <= 0) return [];

  if (valid.length >= n) {
    return shuffle(valid, rng).slice(0, n);
  }

  // 池子不够：保底每个一次
  const result: PoolEntry[] = [...valid];
  while (result.length < n) {
    result.push(valid[Math.floor(rng() * valid.length)]);
  }
  return shuffle(result, rng);
}

/** Fisher–Yates 原地洗牌，返回新数组（不修改入参） */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
