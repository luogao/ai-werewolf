'use client';

import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import clsx from 'clsx';

export interface SpoilerToggleProps {
  /** true = god view（显示私密细节），false = player view */
  godView: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}

export function SpoilerToggle({ godView, onChange, className }: SpoilerToggleProps) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <span className="text-xs text-slate-400">视角</span>
      <motion.button
        type="button"
        onClick={() => onChange(!godView)}
        whileTap={{ scale: 0.95 }}
        className={clsx(
          'relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
          godView
            ? 'bg-rose-500/20 text-rose-200 border-rose-400/50 shadow-lg shadow-rose-900/30'
            : 'bg-slate-800/80 text-slate-300 border-slate-600/50',
        )}
      >
        {godView ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
        {godView ? (
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> 上帝视角
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <EyeOff className="h-3 w-3" /> 玩家视角
          </span>
        )}
      </motion.button>
    </div>
  );
}
