'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { ModelStat } from '@/lib/api/client';

export function LatencyTokenChart({ stats }: { stats: ModelStat[] }) {
  const data = stats
    .filter((s) => s.callCount > 0)
    .map((s) => ({
      model: s.model.length > 12 ? s.model.slice(0, 11) + '…' : s.model,
      avgDurationMs: Math.round(s.totalDurationMs / s.callCount),
      avgTokens: Math.round(s.totalTokens / s.callCount),
    }));

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-sm text-slate-500">
        暂无 LLM 调用数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ left: 0, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
        <XAxis dataKey="model" tick={{ fill: '#cbd5e1', fontSize: 10 }} angle={-15} height={50} textAnchor="end" />
        <YAxis
          yAxisId="left"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          label={{ value: 'ms', fill: '#94a3b8', fontSize: 11, position: 'insideTopLeft' }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          label={{ value: 'tokens', fill: '#94a3b8', fontSize: 11, position: 'insideTopRight' }}
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
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="avgDurationMs" name="平均延迟" fill="#f59e0b" radius={[4, 4, 0, 0]} unit="ms" />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="avgTokens"
          name="平均 token"
          stroke="#06b6d4"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
