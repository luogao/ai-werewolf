'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import type { ModelStat } from '@/lib/api/client';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444'];

export function WinRateChart({ stats }: { stats: ModelStat[] }) {
  const data = [...stats]
    .map((s) => ({
      model: s.model.length > 12 ? s.model.slice(0, 11) + '…' : s.model,
      winRate: Math.round(s.winRate * 1000) / 10,
      games: s.gamesPlayed,
    }))
    .sort((a, b) => b.winRate - a.winRate);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} unit="%" />
        <YAxis
          type="category"
          dataKey="model"
          tick={{ fill: '#cbd5e1', fontSize: 11 }}
          width={100}
        />
        <Tooltip
          contentStyle={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            fontSize: 12,
          }}
          cursor={{ fill: '#1e293b' }}
        />
        <Bar dataKey="winRate" radius={[0, 4, 4, 0]} unit="%">
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
