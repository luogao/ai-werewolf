'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, Trophy, Clock, Layers } from 'lucide-react';
import { Card, Badge } from '@/components/ui/Card';
import { api, type GameRecord } from '@/lib/api/client';

export default function ReplayListPage() {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listGames()
      .then(({ games }) => {
        setGames(games.filter((g) => g.status === 'done'));
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : '加载失败');
        setLoading(false);
      });
  }, []);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 text-indigo-400" />
          历史回放
        </h1>
        <p className="text-sm text-slate-400 mt-1">{games.length} 场已完成对局</p>
      </header>

      {loading && <Card className="p-6 text-slate-400">加载中…</Card>}
      {error && <Card className="p-6 text-rose-200">加载失败：{error}</Card>}
      {!loading && !error && games.length === 0 && (
        <Card className="p-8 text-center text-slate-400">
          <Trophy className="h-8 w-8 mx-auto mb-2 opacity-40" />
          还没有对局记录
          <div className="mt-3">
            <Link
              href="/config"
              className="text-indigo-400 hover:text-indigo-300 text-sm underline"
            >
              去配置并开始一局 →
            </Link>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {games.map((g) => (
          <GameRow key={g.id} game={g} />
        ))}
      </div>
    </main>
  );
}

function GameRow({ game }: { game: GameRecord }) {
  const duration = game.endedAt ? Math.round((game.endedAt - game.startedAt) / 1000) : null;
  const startedAt = formatTime(game.startedAt);
  const lineup = game.config.slice(0, 6).map((p) => p.model);
  const overflow = Math.max(0, game.config.length - 6);

  return (
    <Link href={`/replay/${game.id}`} className="block">
      <Card className="p-4 hover:bg-slate-800/50 transition-colors cursor-pointer">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex flex-col items-start min-w-[140px]">
            <span className="text-xs text-slate-500 font-mono">{startedAt}</span>
            <Badge color="indigo">
              <Layers className="h-3 w-3" />
              {game.layout.toUpperCase()}
            </Badge>
          </div>

          <div className="flex-1 min-w-[200px]">
            <div className="flex flex-wrap gap-1 mb-1">
              {lineup.map((m, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono"
                  title={m}
                >
                  {truncate(m, 14)}
                </span>
              ))}
              {overflow > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                  +{overflow}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 line-clamp-1">{game.reason}</div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <WinnerBadge winner={game.winner} />
            <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {duration !== null ? `${duration}s` : '—'}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function WinnerBadge({ winner }: { winner: GameRecord['winner'] }) {
  if (winner === 'wolf') return <Badge color="red">🐺 狼人胜</Badge>;
  if (winner === 'good') return <Badge color="green">👥 好人胜</Badge>;
  if (winner === 'draw') return <Badge color="slate">平局</Badge>;
  return <Badge color="slate">未结束</Badge>;
}

function formatTime(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return fmt.format(d);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
