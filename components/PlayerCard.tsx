'use client';

import { motion } from 'framer-motion';
import { Skull, Eye, FlaskConical, Crosshair, Shield, Users } from 'lucide-react';
import clsx from 'clsx';
import type { Role } from '@/lib/types';
import { ROLE_DISPLAY_NAMES } from '@/lib/types';

// ─── 角色视觉映射 ──────────────────────────────────────────────

const ROLE_ICON: Record<Role, typeof Skull> = {
  werewolf: Skull,
  seer: Eye,
  witch: FlaskConical,
  hunter: Crosshair,
  guard: Shield,
  villager: Users,
};

const ROLE_COLOR: Record<Role, string> = {
  werewolf: 'text-rose-300',
  seer: 'text-indigo-300',
  witch: 'text-emerald-300',
  hunter: 'text-amber-300',
  guard: 'text-sky-300',
  villager: 'text-slate-300',
};

const ROLE_BG: Record<Role, string> = {
  werewolf: 'from-rose-600/40 to-rose-900/60 border-rose-400/40',
  seer: 'from-indigo-600/40 to-indigo-900/60 border-indigo-400/40',
  witch: 'from-emerald-600/40 to-emerald-900/60 border-emerald-400/40',
  hunter: 'from-amber-600/40 to-amber-900/60 border-amber-400/40',
  guard: 'from-sky-600/40 to-sky-900/60 border-sky-400/40',
  villager: 'from-slate-600/40 to-slate-900/60 border-slate-400/40',
};

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

// ─── 组件 ──────────────────────────────────────────────────────

export interface PlayerCardProps {
  name: string;
  model: string;
  role?: Role; // 死亡后才揭示；undefined 表示未揭示
  alive: boolean;
  deathReason?: string;
  isSpeaking?: boolean;
  isCurrent?: boolean; // 当前发言者高亮
  voteTarget?: 'loading' | 'abstain' | string; // 投票时显示状态
  size?: 'sm' | 'md' | 'lg';
  /** 强制揭示身份（上帝视角用）；无视存活状态 */
  forceReveal?: boolean;
}

const SIZES = {
  sm: { box: 'w-20', avatar: 'h-12 w-12 text-base', name: 'text-[11px]', model: 'text-[9px]' },
  md: { box: 'w-28', avatar: 'h-16 w-16 text-xl', name: 'text-xs', model: 'text-[10px]' },
  lg: { box: 'w-36', avatar: 'h-20 w-20 text-2xl', name: 'text-sm', model: 'text-[11px]' },
};

export function PlayerCard({
  name,
  model,
  role,
  alive,
  deathReason,
  isSpeaking = false,
  isCurrent = false,
  voteTarget,
  size = 'md',
  forceReveal = false,
}: PlayerCardProps) {
  const sz = SIZES[size];
  const revealed = (!!role && forceReveal) || (!alive && !!role);
  const Icon = role ? ROLE_ICON[role] : Users;
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const provider = providerKey(model);

  return (
    <motion.div
      layout
      className={clsx('relative flex flex-col items-center gap-1.5', sz.box)}
      animate={isSpeaking ? { y: -6 } : { y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* 头像容器（3D 翻转） */}
      <div
        className="relative"
        style={{ perspective: '600px' }}
      >
        <motion.div
          className="relative"
          style={{ transformStyle: 'preserve-3d' }}
          initial={false}
          animate={{ rotateY: revealed ? 180 : 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
        >
          {/* 正面：玩家信息 */}
          <div
            className={clsx(
              'relative rounded-full border-2 bg-gradient-to-b shadow-lg',
              'flex items-center justify-center font-bold text-white select-none',
              sz.avatar,
              alive
                ? 'from-slate-700/80 to-slate-900 border-slate-500/50'
                : 'from-slate-800 to-slate-950 border-slate-700/60 grayscale',
              isSpeaking && 'ring-4 ring-amber-400/60 ring-offset-2 ring-offset-slate-950',
              isCurrent && 'ring-4 ring-indigo-400/70 ring-offset-2 ring-offset-slate-950',
            )}
          >
            {/* 供应商小点 */}
            <span
              className={clsx(
                'absolute top-0 right-0 h-3 w-3 rounded-full border border-slate-950/80',
                PROVIDER_DOT[provider] || 'bg-slate-500',
              )}
              title={provider}
            />

            <span className={clsx(alive ? 'text-slate-100' : 'text-slate-500')}>
              {initial}
            </span>

            {/* 死亡覆盖层 */}
            {!alive && !revealed && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Skull className="h-2/3 w-2/3 text-slate-500/80" strokeWidth={1.5} />
              </div>
            )}

            {/* 说话呼吸光晕 */}
            {isSpeaking && alive && (
              <motion.span
                className="absolute inset-0 rounded-full border-2 border-amber-300/50"
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.2, 0.6] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>

          {/* 背面：身份揭示（翻转后显示） */}
          <div
            className={clsx(
              'absolute inset-0 rounded-full border-2 bg-gradient-to-b shadow-lg',
              'flex flex-col items-center justify-center text-white backface-hidden',
              sz.avatar,
              role ? ROLE_BG[role] : 'from-slate-700 to-slate-900',
            )}
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <Icon className={clsx('h-1/2 w-1/2', role ? ROLE_COLOR[role] : 'text-slate-300')} strokeWidth={1.5} />
          </div>
        </motion.div>

        {/* 投票状态徽章 */}
        {voteTarget && (
          <div className="absolute -bottom-1 -right-1 bg-slate-950 border border-slate-700 rounded-full px-1.5 py-0.5 text-[9px] text-slate-300 shadow">
            {voteTarget === 'loading' ? (
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                投票中
              </motion.span>
            ) : (
              '弃票'
            )}
          </div>
        )}
      </div>

      {/* 名字 */}
      <div className="text-center leading-tight">
        <div
          className={clsx(
            sz.name,
            'font-medium truncate max-w-full',
            alive ? 'text-slate-200' : 'text-slate-500 line-through',
          )}
        >
          {name}
        </div>
        <div className={clsx(sz.model, 'text-slate-500 truncate max-w-full')} title={model}>
          {model}
        </div>
      </div>

      {/* 死亡信息 / 角色揭示 */}
      {revealed && role && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: forceReveal ? 0 : 0.5 }}
          className="flex flex-col items-center gap-0.5"
        >
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border bg-gradient-to-b',
              ROLE_BG[role],
              ROLE_COLOR[role],
            )}
          >
            <Icon className="h-2.5 w-2.5" />
            {ROLE_DISPLAY_NAMES[role]}
          </span>
          {!alive && deathReason && (
            <span className="text-[9px] text-slate-500">
              {DEATH_REASON_LABEL[deathReason] ?? deathReason}
            </span>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

const DEATH_REASON_LABEL: Record<string, string> = {
  wolf_kill: '夜被狼咬',
  witch_poison: '被毒杀',
  vote_out: '被投出',
  hunter_shoot: '被猎人带走',
};
