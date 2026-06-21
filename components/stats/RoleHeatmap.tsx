'use client';

import type { ModelRoleStat, Role } from '@/lib/api/client';
import { ROLE_DISPLAY_NAMES } from '@/lib/types';

const ROLES: Role[] = ['werewolf', 'seer', 'witch', 'hunter', 'guard', 'villager'];

export function RoleHeatmap({ stats }: { stats: ModelRoleStat[] }) {
  // 行=model，列=role；格子颜色=胜率（绿深=高）
  const models = Array.from(new Set(stats.map((s) => s.model))).sort();
  const lookup = new Map<string, ModelRoleStat>();
  for (const s of stats) lookup.set(`${s.model}::${s.role}`, s);

  if (models.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-slate-500">
        暂无角色维度数据
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2 text-slate-400 font-medium sticky left-0 bg-slate-950">
              模型
            </th>
            {ROLES.map((r) => (
              <th key={r} className="p-2 text-slate-300 font-medium min-w-[64px]">
                {ROLE_DISPLAY_NAMES[r]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m}>
              <td
                className="p-2 text-slate-300 font-mono sticky left-0 bg-slate-950 truncate max-w-[140px]"
                title={m}
              >
                {m}
              </td>
              {ROLES.map((r) => {
                const s = lookup.get(`${m}::${r}`);
                if (!s || s.games === 0) {
                  return (
                    <td key={r} className="p-1 text-center">
                      <div className="h-9 rounded bg-slate-800/30 text-slate-600 flex items-center justify-center text-[10px]">
                        —
                      </div>
                    </td>
                  );
                }
                const winRate = s.wins / s.games;
                const alpha = Math.round(0.15 + winRate * 0.75);
                return (
                  <td key={r} className="p-1">
                    <div
                      className="h-9 rounded border border-emerald-500/20 flex flex-col items-center justify-center text-emerald-100"
                      style={{ backgroundColor: `rgba(16, 185, 129, ${alpha})` }}
                      title={`${m} 玩 ${ROLE_DISPLAY_NAMES[r]}：${s.wins}/${s.games} 胜`}
                    >
                      <div className="font-semibold leading-none">{Math.round(winRate * 100)}%</div>
                      <div className="text-[9px] text-emerald-200/70 leading-none mt-0.5">
                        {s.wins}/{s.games}
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
