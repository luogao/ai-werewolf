'use client';

import { useEffect, useState, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { api, type ProviderInfo } from '@/lib/api/client';

interface ModelPickerProps {
  value: string;
  onChange: (model: string) => void;
  className?: string;
}

const PROVIDER_DOT: Record<string, string> = {
  openai: 'bg-emerald-400',
  anthropic: 'bg-orange-400',
  deepseek: 'bg-blue-400',
  openrouter: 'bg-pink-400',
  ollama: 'bg-slate-300',
  unknown: 'bg-slate-500',
};

function providerKey(modelId: string): string {
  if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) return 'openai';
  if (modelId.startsWith('claude')) return 'anthropic';
  if (modelId.startsWith('deepseek')) return 'deepseek';
  if (modelId.startsWith('openrouter/')) return 'openrouter';
  if (modelId.startsWith('ollama/')) return 'ollama';
  return 'unknown';
}

export function ModelPicker({ value, onChange, className }: ModelPickerProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const listId = useId();

  useEffect(() => {
    api.listProviders()
      .then((r) => setProviders(r.providers))
      .catch(() => setProviders([]));
  }, []);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-picker="${listId}"]`)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, listId]);

  const submitCustom = () => {
    const v = customValue.trim();
    if (!v) return;
    onChange(v);
    setCustomMode(false);
    setOpen(false);
    setCustomValue('');
  };

  return (
    <div className={clsx('relative', className)} data-picker={listId}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setCustomMode(false);
        }}
        className="w-full flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100 hover:border-slate-600 focus:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition"
      >
        <span className="flex items-center gap-2 truncate">
          <span className={clsx('h-2 w-2 rounded-full', PROVIDER_DOT[providerKey(value)] || 'bg-slate-500')} />
          <span className="truncate">{value || '选择模型'}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 p-1">
          {!customMode ? (
            <>
              {providers.map((p) => (
                <div key={p.id} className="mb-1">
                  <div className="px-2 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    {p.label}
                  </div>
                  {p.sampleModels.map((m: string) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        onChange(m);
                        setOpen(false);
                      }}
                      className={clsx(
                        'w-full text-left px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition flex items-center gap-2',
                        m === value && 'bg-amber-500/10 text-amber-200',
                      )}
                    >
                      <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', PROVIDER_DOT[p.id])} />
                      <span className="truncate">{m}</span>
                    </button>
                  ))}
                </div>
              ))}
              <div className="border-t border-slate-800 mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => setCustomMode(true)}
                  className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
                >
                  + 自定义模型 ID...
                </button>
              </div>
            </>
          ) : (
            <div className="p-2">
              <input
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitCustom();
                  if (e.key === 'Escape') {
                    setCustomMode(false);
                    setOpen(false);
                  }
                }}
                placeholder="例如：gpt-4o 或 ollama/llama3"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500/60"
              />
              <div className="flex gap-1 mt-1.5">
                <button
                  type="button"
                  onClick={submitCustom}
                  className="flex-1 text-xs bg-amber-500/90 hover:bg-amber-400 text-amber-950 font-medium rounded py-1"
                >
                  确定
                </button>
                <button
                  type="button"
                  onClick={() => setCustomMode(false)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded px-3 py-1"
                >
                  返回
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
