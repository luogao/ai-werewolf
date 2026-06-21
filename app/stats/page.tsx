'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { api, type ModelStat, type ModelRoleStat } from '@/lib/api/client';
import { WinRateChart } from '@/components/stats/WinRateChart';
import { FactionChart } from '@/components/stats/FactionChart';
import { LatencyTokenChart } from '@/components/stats/LatencyTokenChart';
import { RoleHeatmap } from '@/components/stats/RoleHeatmap';

interface StatsData {
  stats: ModelStat[];
  totalGames: number;
  byRole: ModelRoleStat[];
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getStats(1), api.getStatsByRole()])
      .then(([modelStats, roleStats]) => {
        setData({
          stats: modelStats.stats,
          totalGames: modelStats.totalGames,
          byRole: roleStats.stats,
        });
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
          <BarChart3 className="h-6 w-6 text-indigo-400" />
          统计面板
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {data ? `已聚合 ${data.totalGames} 局对局 · ${data.stats.length} 个模型` : '加载中…'}
        </p>
      </header>

      {loading && <Card className="p-6 text-slate-400">加载中…</Card>}
      {error && <Card className="p-6 text-rose-200">加载失败：{error}</Card>}
      {!loading && !error && data && data.totalGames === 0 && (
        <Card className="p-8 text-center text-slate-400">
          <Trophy className="h-8 w-8 mx-auto mb-2 opacity-40" />
          还没有已完成的对局
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

      {!loading && !error && data && data.totalGames > 0 && (
        <div className="space-y-5">
          <ChartCard title="模型胜率排行" subtitle="按胜率降序">
            <WinRateChart stats={data.stats} />
          </ChartCard>

          <ChartCard title="阵营胜率对比" subtitle="每个模型扮狼人 vs 好人的胜率">
            <FactionChart stats={data.stats} />
          </ChartCard>

          <ChartCard title="响应延迟 × token 消耗" subtitle="bar=平均延迟（左轴），line=平均 token（右轴）">
            <LatencyTokenChart stats={data.stats} />
          </ChartCard>

          <ChartCard title="模型 × 角色 胜率热力图" subtitle="颜色越深胜率越高；数字为 胜/总">
            <RoleHeatmap stats={data.byRole} />
          </ChartCard>
        </div>
      )}
    </main>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}
