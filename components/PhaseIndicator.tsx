'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, Eye, Skull, Crosshair, Vote, MessageCircle, ShieldCheck, Sunrise } from 'lucide-react';
import clsx from 'clsx';

export type PhaseKind =
  | 'setup'
  | 'night_start'
  | 'wolf_kill'
  | 'seer_check'
  | 'witch_save'
  | 'night_end'
  | 'day_announce'
  | 'hunter_shoot'
  | 'speech'
  | 'vote'
  | 'vote_result'
  | 'game_over';

export interface PhaseIndicatorProps {
  phase: PhaseKind;
  day: number;
  /** 状态文案，如「狼人正在商议…」 */
  statusText?: string;
  /** 是否显示等待骨架（LLM 调用中） */
  waiting?: boolean;
  className?: string;
}

const PHASE_META: Record<
  PhaseKind,
  { icon: typeof Moon; label: string; subtitle: string; night: boolean }
> = {
  setup: { icon: ShieldCheck, label: '准备', subtitle: '座位就绪', night: true },
  night_start: { icon: Moon, label: '夜幕降临', subtitle: '所有人闭眼', night: true },
  wolf_kill: { icon: Skull, label: '狼人行动', subtitle: '请睁眼', night: true },
  seer_check: { icon: Eye, label: '预言家查验', subtitle: '请睁眼', night: true },
  witch_save: { icon: Crosshair, label: '女巫行动', subtitle: '请睁眼', night: true },
  night_end: { icon: Moon, label: '夜晚结算', subtitle: '', night: true },
  day_announce: { icon: Sunrise, label: '天亮', subtitle: '公布昨夜死讯', night: false },
  hunter_shoot: { icon: Crosshair, label: '猎人开枪', subtitle: '带走一人', night: false },
  speech: { icon: MessageCircle, label: '白天发言', subtitle: '依次陈述', night: false },
  vote: { icon: Vote, label: '投票放逐', subtitle: '指认目标', night: false },
  vote_result: { icon: Vote, label: '投票结算', subtitle: '', night: false },
  game_over: { icon: Sun, label: '游戏结束', subtitle: '', night: false },
};

export function PhaseIndicator({
  phase,
  day,
  statusText,
  waiting = false,
  className,
}: PhaseIndicatorProps) {
  const meta = PHASE_META[phase] ?? PHASE_META.setup;
  const Icon = meta.icon;
  const isNight = meta.night;

  return (
    <motion.div
      className={clsx(
        'relative flex flex-col items-center justify-center gap-2 w-48 h-48',
        className,
      )}
      animate={{
        background: isNight
          ? 'radial-gradient(circle, rgba(30,58,138,0.6) 0%, rgba(15,23,42,0.85) 100%)'
          : 'radial-gradient(circle, rgba(245,158,11,0.35) 0%, rgba(120,53,15,0.6) 100%)',
      }}
      transition={{ duration: 0.6 }}
      style={{ borderRadius: '50%' }}
    >
      {/* 外环装饰 */}
      <motion.div
        className="absolute inset-2 rounded-full border-2"
        animate={{
          borderColor: isNight ? 'rgba(96,165,250,0.3)' : 'rgba(251,191,36,0.4)',
        }}
      />
      <motion.div
        className="absolute inset-4 rounded-full border"
        animate={{
          borderColor: isNight ? 'rgba(96,165,250,0.2)' : 'rgba(251,191,36,0.25)',
        }}
      />

      {/* 天数 */}
      <div
        className={clsx(
          'absolute top-5 text-[10px] font-mono tracking-wider uppercase',
          isNight ? 'text-blue-300/80' : 'text-amber-300/80',
        )}
      >
        Day {day}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ scale: 0.4, opacity: 0, rotate: -90 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.6, opacity: 0, rotate: 90 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          className="flex flex-col items-center"
        >
          <Icon
            className={clsx(
              'h-10 w-10',
              isNight ? 'text-blue-200' : 'text-amber-200',
            )}
            strokeWidth={1.5}
          />
          <div
            className={clsx(
              'mt-1.5 text-sm font-semibold',
              isNight ? 'text-blue-100' : 'text-amber-100',
            )}
          >
            {meta.label}
          </div>
          {meta.subtitle && (
            <div className="text-[10px] text-slate-400">{meta.subtitle}</div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 状态文案 / 等待指示 */}
      <div className="absolute bottom-5 h-4">
        <AnimatePresence mode="wait">
          {waiting ? (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-[10px] text-slate-300"
            >
              <motion.span
                className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              等待响应
            </motion.div>
          ) : statusText ? (
            <motion.div
              key={statusText}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-[10px] text-slate-300/90 max-w-[10rem] truncate"
              title={statusText}
            >
              {statusText}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
