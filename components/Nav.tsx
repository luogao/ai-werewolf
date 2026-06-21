'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Skull, Home, Users, History, BarChart3, Shuffle } from 'lucide-react';
import clsx from 'clsx';

const LINKS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/config', label: '配置', icon: Users },
  { href: '/randomize', label: '随机', icon: Shuffle },
  { href: '/replay', label: '回放', icon: History },
  { href: '/stats', label: '统计', icon: BarChart3 },
];

export function Nav() {
  const pathname = usePathname();
  // /play/[id] 全屏沉浸，不显示顶栏
  if (pathname?.startsWith('/play/')) return null;

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-950/70 border-b border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-slate-100 font-bold">
          <Skull className="h-4 w-4 text-rose-400" />
          AI 狼人杀
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const Icon = l.icon;
            const active =
              l.href === '/' ? pathname === '/' : pathname?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
