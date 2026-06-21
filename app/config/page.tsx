'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Save, Play, Download, Dices, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Label } from '@/components/ui/Input';
import { Card, Badge } from '@/components/ui/Card';
import { ModelPicker } from '@/components/ModelPicker';
import { api, ApiError, type PlayerRecord, type PresetRecord } from '@/lib/api/client';
import { LAYOUT_LABELS, ROLE_TEMPLATES, ALL_LAYOUTS, type Layout } from '@/lib/engine/presets';
import type { Role, PlayerConfig } from '@/lib/types';
import { ROLE_DISPLAY_NAMES } from '@/lib/types';

interface PlayerSlot {
  /** 临时本地 id；保存到后端后才有真 id */
  localId: string;
  record?: PlayerRecord;
  name: string;
  model: string;
  personality: string;
  /** 自定义 OpenAI 兼容端点（Azure / vLLM / 多台 Ollama / 代理等） */
  baseUrl: string;
  /** 用户输入的 key（明文）；空串表示"不改/不填" */
  apiKeyInput: string;
}

const DEFAULT_NAMES_BY_POS: Record<number, string> = {};
const NAME_POOL = [
  '艾伦', '贝拉', '陈', '丹尼尔', '艾娃', '芬恩', '葛雷', '霍普', '伊万', '朱蒂',
  '凯尔', '莉莉', '迈克', '诺亚', '奥利维亚', '派珀', '昆西', '萝丝', '萨姆', '蒂娜',
];

let _localIdCounter = 0;
function newLocalId(): string {
  _localIdCounter += 1;
  return `local-${Date.now()}-${_localIdCounter}`;
}

function randomName(pos: number): string {
  return NAME_POOL[pos % NAME_POOL.length];
}

function emptySlot(pos: number, model = 'gpt-4o-mini'): PlayerSlot {
  return {
    localId: newLocalId(),
    name: DEFAULT_NAMES_BY_POS[pos] ?? randomName(pos),
    model,
    personality: '',
    baseUrl: '',
    apiKeyInput: '',
  };
}

export default function ConfigPage() {
  const router = useRouter();
  const [layout, setLayout] = useState<Layout>('9p');
  const [slots, setSlots] = useState<PlayerSlot[]>(() =>
    ROLE_TEMPLATES['9p'].map((_, i) => emptySlot(i + 1)),
  );
  const [seed, setSeed] = useState<string>('');
  const [dryRun, setDryRun] = useState(true);
  const [presets, setPresets] = useState<PresetRecord[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPresetModal, setShowPresetModal] = useState<'save' | 'load' | null>(null);
  const [presetName, setPresetName] = useState('');

  const targetCount = ROLE_TEMPLATES[layout].length;
  const rolesForLayout = ROLE_TEMPLATES[layout];

  // 拉取预设
  useEffect(() => {
    api.listPresets()
      .then((r) => setPresets(r.presets))
      .catch(() => setPresets([]));
  }, []);

  // 切换 layout 时调整 slots 数量
  const changeLayout = useCallback((next: Layout) => {
    const nextCount = ROLE_TEMPLATES[next].length;
    setLayout(next);
    setSlots((prev) => {
      if (prev.length === nextCount) return prev;
      if (prev.length < nextCount) {
        const appended = Array.from({ length: nextCount - prev.length }, (_, i) =>
          emptySlot(prev.length + i + 1, prev[0]?.model ?? 'gpt-4o-mini'),
        );
        return [...prev, ...appended];
      }
      return prev.slice(0, nextCount);
    });
  }, []);

  const updateSlot = (localId: string, patch: Partial<PlayerSlot>) => {
    setSlots((prev) => prev.map((s) => (s.localId === localId ? { ...s, ...patch } : s)));
  };

  const randomizeSeed = () => {
    setSeed(String(Math.floor(Math.random() * 1000000)));
  };

  const startGame = async () => {
    setError(null);
    if (slots.length !== targetCount) {
      setError(`阵容人数不匹配：${layout} 需要 ${targetCount} 人，当前 ${slots.length} 人`);
      return;
    }
    for (const s of slots) {
      if (!s.name.trim() || !s.model.trim()) {
        setError('所有玩家的名字和模型都必须填写');
        return;
      }
    }

    setStarting(true);
    try {
      // 1. 同步玩家到后端（无 id 的创建，有 id 的更新）
      const synced: PlayerConfig[] = [];
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const baseUrl = s.baseUrl.trim();
        const apiKeyInput = s.apiKeyInput;
        // 已有记录时：apiKey 空输入 = 不改（undefined）；新记录时：apiKey 空 = 不设
        const apiKey =
          apiKeyInput === '' ? (s.record?.id ? undefined : '') : apiKeyInput;
        const input: {
          name: string;
          model: string;
          personality: string;
          baseUrl?: string;
          apiKey?: string;
        } = {
          name: s.name.trim(),
          model: s.model.trim(),
          personality: s.personality.trim(),
          baseUrl: baseUrl || undefined,
          apiKey,
        };
        let rec: PlayerRecord;
        if (s.record?.id) {
          // 已有记录：baseUrl 显式传（可能清空），apiKey undefined=不改
          rec = await api.updatePlayer(s.record.id, {
            name: input.name,
            model: input.model,
            personality: input.personality,
            baseUrl: input.baseUrl ?? '',
            apiKey,
          });
        } else {
          rec = await api.createPlayer(input);
        }
        slots[i].record = rec;
        slots[i].apiKeyInput = ''; // 保存后清空明文输入框
        synced.push({
          playerId: rec.id,
          name: rec.name,
          model: rec.model,
          personality: rec.personality,
          baseUrl: rec.baseUrl,
        });
      }

      // 2. 启动游戏
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

  const savePreset = async () => {
    setError(null);
    if (!presetName.trim()) {
      setError('请填写预设名称');
      return;
    }
    try {
      const players: PlayerConfig[] = slots.map((s, i) => ({
        playerId: i + 1,
        name: s.name.trim(),
        model: s.model.trim(),
        personality: s.personality.trim(),
      }));
      await api.createPreset({
        name: presetName.trim(),
        layout,
        players,
      });
      const r = await api.listPresets();
      setPresets(r.presets);
      setShowPresetModal(null);
      setPresetName('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '保存失败');
    }
  };

  const loadPreset = (preset: PresetRecord) => {
    if (preset.layout !== layout) {
      changeLayout(preset.layout);
    }
    setSlots(
      preset.players.map((p, i) => ({
        localId: newLocalId(),
        name: p.name,
        model: p.model,
        personality: p.personality ?? '',
        baseUrl: p.baseUrl ?? '',
        apiKeyInput: '',
      })),
    );
    setShowPresetModal(null);
  };

  const deletePreset = async (id: number) => {
    try {
      await api.deletePreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '删除失败');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* 顶部导航 */}
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-amber-400" />
              配置阵容
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPresetModal('load')}
            >
              <Download className="h-3.5 w-3.5" /> 加载预设
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPresetModal('save')}
            >
              <Save className="h-3.5 w-3.5" /> 保存预设
            </Button>
          </div>
        </header>

        {/* 全局参数 */}
        <Card className="mb-5 p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <Label>阵容规模</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_LAYOUTS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => changeLayout(l)}
                    className={
                      'px-3 py-1.5 text-xs rounded-lg border transition ' +
                      (layout === l
                        ? 'bg-amber-500/20 text-amber-200 border-amber-400/50'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600')
                    }
                  >
                    {l.toUpperCase()}
                    <span className="ml-1.5 text-slate-500">
                      ({ROLE_TEMPLATES[l].length}人)
                    </span>
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-slate-500 mt-1.5">
                {LAYOUT_LABELS[layout]}
              </div>
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
              <div className="text-[10px] text-slate-500 mt-1">
                {dryRun ? '不消耗 token，用于演示' : '将真实调用每个模型 API'}
              </div>
            </div>
          </div>
        </Card>

        {/* 玩家列表 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          {slots.map((slot, i) => {
            const role = rolesForLayout[i];
            return (
              <PlayerSlotEditor
                key={slot.localId}
                slot={slot}
                role={role}
                position={i + 1}
                onChange={(patch) => updateSlot(slot.localId, patch)}
              />
            );
          })}
        </div>

        {/* 错误提示 */}
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

        {/* 启动栏 */}
        <div className="sticky bottom-4 flex justify-center">
          <Button
            variant="gold"
            size="lg"
            onClick={startGame}
            loading={starting}
            disabled={slots.length !== targetCount}
            className="shadow-2xl shadow-amber-900/40"
          >
            <Play className="h-5 w-5" />
            开始游戏（{slots.length}/{targetCount} 人就位）
          </Button>
        </div>
      </div>

      {/* 预设弹窗 */}
      <AnimatePresence>
        {showPresetModal && (
          <PresetModal
            mode={showPresetModal}
            presets={presets}
            presetName={presetName}
            onPresetNameChange={setPresetName}
            onSave={savePreset}
            onLoad={loadPreset}
            onDelete={deletePreset}
            onClose={() => setShowPresetModal(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

// ─── 单个玩家编辑卡片 ──────────────────────────────────────

function PlayerSlotEditor({
  slot,
  role,
  position,
  onChange,
}: {
  slot: PlayerSlot;
  role: Role;
  position: number;
  onChange: (patch: Partial<PlayerSlot>) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasEndpointConfigured =
    (slot.baseUrl && slot.baseUrl.length > 0) || slot.record?.hasApiKey;
  return (
    <Card className="p-4 relative" style={{ zIndex: 50 - position }}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="h-10 w-10 rounded-full bg-gradient-to-b from-slate-700 to-slate-900 border border-slate-600 flex items-center justify-center text-sm font-bold text-slate-100">
            {position}
          </div>
          <Badge
            color={
              role === 'werewolf'
                ? 'red'
                : role === 'seer'
                  ? 'indigo'
                  : role === 'witch'
                    ? 'green'
                    : role === 'hunter'
                      ? 'amber'
                      : role === 'guard'
                        ? 'violet'
                        : 'slate'
            }
          >
            {ROLE_DISPLAY_NAMES[role]}
          </Badge>
        </div>

        <div className="flex-1 space-y-2">
          <div>
            <Label htmlFor={`name-${slot.localId}`}>玩家名字</Label>
            <Input
              id={`name-${slot.localId}`}
              value={slot.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="例如：艾伦"
            />
          </div>
          <div>
            <Label>模型</Label>
            <ModelPicker
              value={slot.model}
              onChange={(model) => onChange({ model })}
            />
          </div>
          <div>
            <Label htmlFor={`pers-${slot.localId}`}>人格设定（可选）</Label>
            <Textarea
              id={`pers-${slot.localId}`}
              value={slot.personality}
              onChange={(e) => onChange({ personality: e.target.value })}
              placeholder="例如：冷静理性，喜欢分析投票模式"
              rows={2}
              className="text-xs"
            />
          </div>

          {/* 高级：自定义端点 */}
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
              {hasEndpointConfigured && (
                <span className="text-emerald-400 text-[10px]">● 已配置</span>
              )}
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
                      <Label htmlFor={`url-${slot.localId}`}>Base URL</Label>
                      <Input
                        id={`url-${slot.localId}`}
                        value={slot.baseUrl}
                        onChange={(e) => onChange({ baseUrl: e.target.value })}
                        placeholder="https://api.openai.com/v1（留空用全局）"
                        className="font-mono text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`key-${slot.localId}`}>API Key</Label>
                      <Input
                        id={`key-${slot.localId}`}
                        type="password"
                        value={slot.apiKeyInput}
                        onChange={(e) => onChange({ apiKeyInput: e.target.value })}
                        placeholder={
                          slot.record?.hasApiKey
                            ? '••••••（已配置，留空保留）'
                            : '留空使用全局环境变量'
                        }
                        className="font-mono text-xs"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      所有自定义端点走 OpenAI 兼容协议。
                      原生 Claude / DeepSeek 不受此配置影响。
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── 预设保存/加载弹窗 ──────────────────────────────────────

function PresetModal({
  mode,
  presets,
  presetName,
  onPresetNameChange,
  onSave,
  onLoad,
  onDelete,
  onClose,
}: {
  mode: 'save' | 'load';
  presets: PresetRecord[];
  presetName: string;
  onPresetNameChange: (v: string) => void;
  onSave: () => void;
  onLoad: (p: PresetRecord) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-semibold">
            {mode === 'save' ? '保存为预设' : '加载预设'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {mode === 'save' ? (
            <div className="space-y-3">
              <Input
                value={presetName}
                onChange={(e) => onPresetNameChange(e.target.value)}
                placeholder="给这个预设起个名字…"
                autoFocus
              />
              <Button variant="gold" onClick={onSave} className="w-full">
                <Save className="h-4 w-4" /> 保存
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {presets.length === 0 ? (
                <div className="text-center text-slate-500 text-sm py-8">
                  还没有保存的预设
                </div>
              ) : (
                presets.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50"
                  >
                    <button
                      onClick={() => onLoad(p)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {p.layout.toUpperCase()} · {p.players.length} 人 · {p.description || '无描述'}
                      </div>
                    </button>
                    <button
                      onClick={() => onDelete(p.id)}
                      className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
