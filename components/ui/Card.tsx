'use client';

import clsx from 'clsx';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** 玻璃拟态（毛玻璃） */
  glass?: boolean;
}

export function Card({ children, className, glass = true }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-2xl border',
        glass
          ? 'bg-slate-900/50 backdrop-blur-md border-white/10 shadow-xl shadow-black/30'
          : 'bg-slate-900 border-slate-800',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  color = 'slate',
  className,
}: {
  children: React.ReactNode;
  color?: 'slate' | 'green' | 'red' | 'amber' | 'indigo' | 'violet';
  className?: string;
}) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-700/50 text-slate-200 border-slate-500/30',
    green: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
    red: 'bg-rose-500/20 text-rose-200 border-rose-400/40',
    amber: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
    indigo: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40',
    violet: 'bg-violet-500/20 text-violet-200 border-violet-400/40',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        colors[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
