'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  Play,
  Dices,
  Shuffle,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ModelPicker } from '@/components/ModelPicker';
import { api, ApiError, type PlayerRecord } from '@/lib/api/client';
import { LAYOUT_LABELS, ROLE_TEMPLATES, ALL_LAYOUTS, type Layout } from '@/lib/engine/presets';
import type { PlayerConfig } from '@/lib/types';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { samplePool, type PoolEntry } from '@/lib/game/samplePool';

const STORAGE_KEY = 'ai-ww:randomize-pool:v1';

// 与 /config 共享的名字池（复制以避免跨页面耦合）
const NAME_POOL = [
  '艾伦', '贝拉', '陈', '丹尼尔', '艾娃', '芬恩', '葛雷', '霍普', '伊万', '朱蒂',
  '凯尔', '莉莉', '迈克', '诺亚', '奥利维亚',
];

let _entryIdCounter = 0;
function newEntryId(): string {
  _entryIdCounter += 1;
  return `pool-${Date.now()}-${_entryIdCounter}`;
}

function emptyEntry(): PoolEntry {
  return { id: newEntryId(), model: '', baseUrl: '', apiKey: '', label: '' };
}

export default function RandomizePage() {
  const router = useRouter();
  const [layout, setLayout] = useState<Layout>('9p');
  const [seed, setSeed] = useState<string>('');
  const [dryRun, setDryRun] = useState(true);
  const [pool, setPool, hydrated] = useLocalStorage<PoolEntry[]>(STORAGE_KEY, []);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetCount = ROLE_TEMPLATES[layout].length;
  const validCount = pool.filter((p) => p.model.trim()).length;
  const canStart = validCount > 0 && !starting;

  const addEntry = () => {
    setPool((prev) => [...prev, emptyEntry()]);
  };
  const removeEntry = (id: string) => {
    setPool((prev) => prev.filter((p) => p.id !== id));
  };
  const updateEntry = (id: string, patch: Partial<PoolEntry>) => {
    setPool((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const clearPool = () => {
    if (confirm('清空整个模型池？')) setPool([]);
  };

  const randomizeSeed = () => setSeed(String(Math.floor(Math.random() * 1000000)));

  const startRandomGame = async () => {
    setError(null);
    if (validCount === 0) {
      setError('请至少添加一个模型');
      return;
    }
    setStarting(true);
    try {
      // 1) 采样 N 个 entry 到座位
      const sampled = samplePool(
        pool.filter((p) => p.model.trim()),
        targetCount,
        Math.random,
      );

      // 2) 每个座位 createPlayer（直接新建，player 表允许重复）
      const synced: PlayerConfig[] = [];
      for (let i = 0; i < sampled.length; i++) {
        const entry = sampled[i];
        const baseUrl = entry.baseUrl.trim();
        const apiKey = entry.apiKey.trim();
        const rec: PlayerRecord = await api.createPlayer({
          name: NAME_POOL[i % NAME_POOL.length],
          model: entry.model.trim(),
          baseUrl: baseUrl || undefined,
          apiKey: apiKey || undefined,
        });
        synced.push({
          playerId: rec.id,
          name: rec.name,
          model: rec.model,
          personality: '',
          baseUrl: rec.baseUrl,
        });
      }

      // 3) 开局
      const seedNum = seed.trim() ? parseInt(seed.trim(), 10) : null;
      const { gameId } = await api.createGame({
        layout,
        players: synced,
        seed: Number.isNaN(seedNum) ? null : seedNum,
        dryRun,
      });

      router.push(`/play/${gameId}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : '未知错误';
      setError(`启动失败：${msg}`);
    } finally {
      setStarting(false);
    }
  };

  // SSR/CSR 一致性：未 hydrate 前不渲染依赖 localStorage 的部分
  if (!hydrated) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center text-slate-500">加载中…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 顶部 */}
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shuffle className="h-6 w-6 text-violet-400" />
              模型池随机开局
            </h1>
          </div>
        </header>

        {/* 全局参数 */}
        <Card className="mb-5 p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>阵容规模</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_LAYOUTS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLayout(l)}
                    className={
                      'px-3 py-1.5 text-xs rounded-lg border transition ' +
                      (layout === l
                        ? 'bg-violet-500/20 text-violet-200 border-violet-400/50'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600')
                    }
                  >
                    {l.toUpperCase()}
                    <span className="ml-1.5 text-slate-500">({ROLE_TEMPLATES[l].length}人)</span>
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-slate-500 mt-1.5">{LAYOUT_LABELS[layout]}</div>
            </div>

            <div>
              <Label>随机种子（可空）</Label>
              <div className="flex gap-1.5">
                <Input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="留空 = 随机"
                  className="font-mono text-xs"
                />
                <Button variant="secondary" size="sm" onClick={randomizeSeed} type="button">
                  <Dices className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div>
              <Label>模拟模式</Label>
              <button
                type="button"
                onClick={() => setDryRun((v) => !v)}
                className={
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition ' +
                  (dryRun
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-400/40 text-rose-200')
                }
              >
                <span>{dryRun ? 'Dry-run（假 LLM）' : '真实 LLM 调用'}</span>
                <span
                  className={
                    'h-2 w-2 rounded-full ' + (dryRun ? 'bg-emerald-400' : 'bg-rose-400')
                  }
                />
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center gap-2">
            <span className="font-mono text-violet-300">{validCount}</span>
            <span>个有效模型 ·</span>
            <span className="font-mono text-violet-300">{targetCount}</span>
            <span>座位 →</span>
            {validCount === 0 ? (
              <span className="text-slate-500">请先添加模型</span>
            ) : validCount >= targetCount ? (
              <span className="text-slate-500">每个模型最多用一次（无放回采样）</span>
            ) : (
              <span className="text-slate-500">
                模型会重复出场（每个保底一次，剩余随机）
              </span>
            )}
          </div>
        </Card>

        {/* 模型池 */}
        <Card className="mb-5 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-200">模型池</div>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={addEntry} type="button">
                <Plus className="h-3.5 w-3.5" /> 添加模型
              </Button>
              {pool.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearPool} type="button">
                  <Trash2 className="h-3.5 w-3.5" /> 清空
                </Button>
              )}
            </div>
          </div>

          {pool.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              <Shuffle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              模型池为空。点击「添加模型」开始配置。
            </div>
          ) : (
            <div className="space-y-3">
              {pool.map((entry, i) => (
                <PoolEntryEditor
                  key={entry.id}
                  entry={entry}
                  index={i}
                  onChange={(patch) => updateEntry(entry.id, patch)}
                  onRemove={() => removeEntry(entry.id)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* 错误 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-400/40 text-rose-200 text-sm"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 安全提示 */}
        <div className="mb-4 flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            API Key 保存在浏览器本地（localStorage），下次访问仍可用。
            请勿在公共/共享设备上配置；换浏览器需要重填。
          </span>
        </div>

        {/* 启动栏 */}
        <div className="sticky bottom-4 flex justify-center">
          <Button
            variant="gold"
            size="lg"
            onClick={startRandomGame}
            loading={starting}
            disabled={!canStart}
            className="shadow-2xl shadow-amber-900/40"
          >
            <Play className="h-5 w-5" />
            随机分配 + 开始游戏
          </Button>
        </div>
      </div>
    </main>
  );
}

// ─── 单条池子 entry 编辑器 ─────────────────────────────────────

function PoolEntryEditor({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: PoolEntry;
  index: number;
  onChange: (patch: Partial<PoolEntry>) => void;
  onRemove: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasEndpoint = entry.baseUrl.trim().length > 0 || entry.apiKey.trim().length > 0;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
      <div className="flex items-start gap-2">
        <div className="shrink-0 mt-1 h-6 w-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] font-mono text-slate-400">
          {index + 1}
        </div>
        <div className="flex-1 space-y-2">
          <ModelPicker
            value={entry.model}
            onChange={(model) => onChange({ model })}
          />
          <Input
            value={entry.label ?? ''}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="备注（可选，如「公司代理」「本地 Ollama」）"
            className="text-xs"
          />

          {/* 折叠的高级区：自定义端点 */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition"
            >
              <ChevronRight
                className={
                  'h-3 w-3 transition-transform ' + (showAdvanced ? 'rotate-90' : '')
                }
              />
              自定义端点（Azure / vLLM / 多台 Ollama / 代理）
              {hasEndpoint && <span className="text-emerald-400 text-[10px]">● 已配置</span>}
            </button>
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 space-y-2">
                    <div>
                      <Label htmlFor={`url-${entry.id}`}>Base URL</Label>
                      <Input
                        id={`url-${entry.id}`}
                        value={entry.baseUrl}
                        onChange={(e) => onChange({ baseUrl: e.target.value })}
                        placeholder="https://api.openai.com/v1（留空用全局）"
                        className="font-mono text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`key-${entry.id}`}>API Key</Label>
                      <Input
                        id={`key-${entry.id}`}
                        type="password"
                        value={entry.apiKey}
                        onChange={(e) => onChange({ apiKey: e.target.value })}
                        placeholder="留空使用全局环境变量"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 p-1.5 rounded text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition"
          aria-label="移除"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
