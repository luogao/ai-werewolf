'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { ModelStat } from '@/lib/api/client';

export function FactionChart({ stats }: { stats: ModelStat[] }) {
  const data = stats
    .filter((s) => s.wolfGames > 0 || s.goodGames > 0)
    .map((s) => ({
      model: s.model.length > 12 ? s.model.slice(0, 11) + '…' : s.model,
      狼人胜率: s.wolfGames ? Math.round((s.wolfWins / s.wolfGames) * 1000) / 10 : 0,
      好人胜率: s.goodGames ? Math.round((s.goodWins / s.goodGames) * 1000) / 10 : 0,
    }));

  if (data.length === 0) {
    return <EmptyHint text="暂无阵营对局数据" />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ left: 0, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
        <XAxis dataKey="model" tick={{ fill: '#cbd5e1', fontSize: 10 }} angle={-15} height={50} textAnchor="end" />
        <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} unit="%" />
        <Tooltip
          contentStyle={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            fontSize: 12,
          }}
          cursor={{ fill: '#1e293b' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="狼人胜率" fill="#ef4444" radius={[4, 4, 0, 0]} unit="%" />
        <Bar dataKey="好人胜率" fill="#10b981" radius={[4, 4, 0, 0]} unit="%" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="h-[300px] flex items-center justify-center text-sm text-slate-500">
      {text}
    </div>
  );
}
