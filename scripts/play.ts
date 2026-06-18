#!/usr/bin/env tsx
/**
 * CLI 入口 —— 对应原 Python 版 main.py
 *
 * 用法:
 *   npm run play -- --dry-run --verbose --seed 42
 *   npm run play -- --layout 9p --seed 42
 *   npm run play -- --verbose
 */
import argparse from 'node:util';
import { GameEngine } from '../lib/engine/game';
import type { PlayerConfig } from '../lib/types';
import { ALL_LAYOUTS, LAYOUT_LABELS, type Layout } from '../lib/engine/presets';
import { generateReport, saveReport } from '../lib/report';
import { EventEmitter, type GameEvent } from '../lib/events';

// ─── 默认阵容（对应原 config.yaml） ──────────────────────────

const DEFAULT_PLAYERS: PlayerConfig[] = [
  { playerId: 1, model: 'gpt-4o', name: '阿波罗', personality: '冷静理性，擅长逻辑推理，喜欢用数据说话，发言克制精准' },
  { playerId: 2, model: 'gpt-4o', name: '雅典娜', personality: '智慧果断，善于观察细节，喜欢引导讨论方向，有领导力' },
  { playerId: 3, model: 'claude-sonnet-4-5', name: '赫耳墨斯', personality: '机智灵活，善于言辞，喜欢煽动气氛，擅长转移话题和制造混乱' },
  { playerId: 4, model: 'claude-sonnet-4-5', name: '阿瑞斯', personality: '强势激进，喜欢主动出击，发言犀利直接，不怕得罪人' },
  { playerId: 5, model: 'deepseek-chat', name: '李白', personality: '随性洒脱，发言天马行空，喜欢用比喻和典故，不按常理出牌' },
  { playerId: 6, model: 'deepseek-chat', name: '杜甫', personality: '沉稳谨慎，注重证据链，发言有条理，不轻易下结论' },
  { playerId: 7, model: 'openrouter/qwen/qwen-2.5-72b-instruct', name: '孔明', personality: '运筹帷幄，善于分析全局局势，喜欢长线布局，发言高瞻远瞩' },
  { playerId: 8, model: 'ollama/qwen3:8b', name: '宝玉', personality: '感性多疑，容易受情绪影响，发言优柔寡断但观察力敏锐' },
  { playerId: 9, model: 'ollama/qwen3:8b', name: '黛玉', personality: '敏感细腻，善于捕捉他人话语中的矛盾，发言犀利但含蓄' },
];

function playersForLayout(layout: Layout): PlayerConfig[] {
  return DEFAULT_PLAYERS.slice(0, layout === '6p' ? 6 : layout === '9p' ? 9 : 12);
}

function pad(n: number): PlayerConfig[] {
  // 12 人局补 3 个默认村民位
  const extras: PlayerConfig[] = [
    { playerId: 10, model: 'gpt-4o-mini', name: '陆逊', personality: '深思熟虑，善于反间，发言克制' },
    { playerId: 11, model: 'gpt-4o-mini', name: '小乔', personality: '机敏灵巧，喜欢观察情绪变化' },
    { playerId: 12, model: 'deepseek-chat', name: '曹操', personality: '雄才大略，气势凌人，喜欢主导局面' },
  ];
  return extras;
}

function buildPlayers(layout: Layout): PlayerConfig[] {
  const base = playersForLayout(layout);
  if (layout === '12p') {
    return [...base.slice(0, 9), ...pad(12)];
  }
  return base;
}

// ─── CLI ──────────────────────────────────────────────────────

async function main() {
  const { values } = argparse.parseArgs({
    options: {
      layout: { type: 'string', default: '9p' },
      seed: { type: 'string', default: '' },
      verbose: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'print-events': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(`用法: npm run play -- [options]

选项:
  --layout <6p|9p|12p>   局型（默认 9p）
  --seed <number>        随机种子（默认随机）
  --verbose              实时打印游戏过程
  --dry-run              快速测试模式（不调用 LLM）
  --print-events         打印事件流（调试用）
  --help                 显示帮助`);
    process.exit(0);
  }

  const layout = (values.layout as Layout) ?? '9p';
  if (!ALL_LAYOUTS.includes(layout)) {
    console.error(`❌ 无效 layout: ${layout}，可选: ${ALL_LAYOUTS.join(', ')}`);
    process.exit(1);
  }

  const seed = values.seed ? parseInt(values.seed, 10) : null;
  const verbose = values.verbose ?? false;
  const dryRun = values['dry-run'] ?? false;
  const printEvents = values['print-events'] ?? false;

  const playerConfigs = buildPlayers(layout);

  console.log('🐺 AI 狼人杀');
  console.log(`   局型: ${layout} — ${LAYOUT_LABELS[layout]}`);
  console.log(`   模式: ${dryRun ? 'DRY-RUN（测试）' : '实战'}`);
  console.log(`   玩家: ${playerConfigs.length} 人`);
  console.log(`   种子: ${seed ?? '随机'}`);
  console.log('');

  const emitter = new EventEmitter();
  const events: GameEvent[] = [];
  emitter.subscribe((e) => {
    events.push(e);
    if (printEvents) {
      const tag = e.private ? ' [private]' : '';
      console.log(`  [event #${e.seq}] ${e.type}${tag} day=${e.day} phase=${e.phase}`);
    }
  });

  const engine = new GameEngine({
    playerConfigs,
    layout,
    seed,
    verbose,
    dryRun,
    emitter,
    llmConfig: {
      maxRetries: 3,
      temperature: 0.7,
      maxTokens: 512,
    },
  });

  const log = await engine.run();

  const report = generateReport(log);
  const reportPath = saveReport(report);

  console.log('');
  console.log('='.repeat(60));
  console.log(report);
  console.log('='.repeat(60));
  console.log(`\n📄 战报已保存: ${reportPath}`);
  console.log(`📊 事件总数: ${events.length}`);
}

main().catch((e) => {
  console.error('运行失败:', e);
  process.exit(1);
});
