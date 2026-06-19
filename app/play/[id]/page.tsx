'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Radio, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { GameTable, type TablePlayer } from '@/components/GameTable';
import { PhaseIndicator, type PhaseKind } from '@/components/PhaseIndicator';
import { SpoilerToggle } from '@/components/SpoilerToggle';
import { Card, Badge } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useGameStream } from '@/lib/hooks/useGameStream';
import type { GameEvent } from '@/lib/events';
import type { Role, PlayerConfig } from '@/lib/types';

interface PlayerRuntimeState {
  config: PlayerConfig;
  role?: Role;
  alive: boolean;
  deathReason?: string;
}

interface PlayPageProps {
  params: Promise<{ id: string }>;
}

export default function PlayPage({ params }: PlayPageProps) {
  const [gameId, setGameId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<PlayerConfig[]>([]);
  const [layoutLabel, setLayoutLabel] = useState<string>('');

  useEffect(() => {
    params.then((p) => setGameId(p.id));
  }, [params]);

  // 拉取游戏元信息（阵容）
  useEffect(() => {
    if (!gameId) return;
    fetch(`/api/games/${gameId}`)
      .then((r) => r.json())
      .then((data) => {
        setConfigs(data.config ?? []);
        setLayoutLabel(data.layout ?? '');
      })
      .catch(() => {});
  }, [gameId]);

  const { visibleEvents, status, error, godView, setGodView, reconnect } = useGameStream(gameId);

  // 从事件流推导每个玩家的运行时状态
  const { players, currentPhase, currentDay, currentSpeakerId, currentVoterId, isWaitingLlm } =
    useMemo(() => deriveState(visibleEvents, configs, godView), [visibleEvents, configs, godView]);

  const tablePlayers: TablePlayer[] = useMemo(() => {
    return players.map((p, i) => ({
      playerId: p.config.playerId,
      position: i,
      name: p.config.name,
      model: p.config.model,
      role: p.role,
      alive: p.alive,
      deathReason: p.deathReason,
      isSpeaking: p.config.playerId === currentSpeakerId,
      isCurrent: p.config.playerId === currentSpeakerId,
    }));
  }, [players, currentSpeakerId]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-5">
        {/* 顶部 */}
        <header className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Radio className="h-5 w-5 text-rose-400" />
              实时直播
            </h1>
            <Badge color={status === 'live' ? 'red' : status === 'done' ? 'green' : 'slate'}>
              {status === 'connecting' && '连接中…'}
              {status === 'live' && 'LIVE'}
              {status === 'done' && '已结束'}
              {status === 'error' && '连接失败'}
            </Badge>
            {layoutLabel && (
              <span className="text-xs text-slate-500 font-mono">
                {layoutLabel.toUpperCase()} · {gameId?.slice(0, 8)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <SpoilerToggle godView={godView} onChange={setGodView} />
            {status === 'error' && (
              <Button variant="secondary" size="sm" onClick={reconnect}>
                <RefreshCw className="h-3.5 w-3.5" /> 重连
              </Button>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-400/40 text-rose-200 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">
          {/* 圆桌区 */}
          <Card className="p-6 flex items-center justify-center min-h-[640px]">
            <GameTable
              players={tablePlayers}
              isNight={
                currentPhase === 'wolf_kill' ||
                currentPhase === 'seer_check' ||
                currentPhase === 'witch_save' ||
                currentPhase === 'night_start' ||
                currentPhase === 'night_end' ||
                currentPhase === 'setup'
              }
              forceReveal={godView}
              center={
                currentPhase ? (
                  <PhaseIndicator
                    phase={currentPhase}
                    day={currentDay}
                    waiting={isWaitingLlm}
                  />
                ) : (
                  <div className="text-slate-500 text-sm">等待事件…</div>
                )
              }
            />
          </Card>

          {/* 事件日志 */}
          <Card className="p-4 max-h-[640px] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">事件流</h2>
              <span className="text-[10px] text-slate-500">
                {visibleEvents.length} 条事件
              </span>
            </div>
            <EventLog events={visibleEvents} godView={godView} />
          </Card>
        </div>
      </div>
    </main>
  );
}

// ─── 从事件推导状态 ───────────────────────────────────────

function deriveState(
  events: GameEvent[],
  configs: PlayerConfig[],
  godView: boolean,
) {
  const players: PlayerRuntimeState[] = configs.map((c) => ({
    config: c,
    alive: true,
  }));
  let currentPhase: PhaseKind | null = null;
  let currentDay = 0;
  let currentSpeakerId: number | null = null;
  let currentVoterId: number | null = null;
  let isWaitingLlm = false;
  const seenSpeakers = new Set<number>();

  for (const e of events) {
    switch (e.type) {
      case 'phase_change': {
        const p = e.payload.phase as PhaseKind;
        currentPhase = p;
        if (e.payload.day !== undefined) currentDay = e.payload.day as number;
        // 切阶段时重置说话者
        if (p !== 'speech') currentSpeakerId = null;
        if (p !== 'vote') currentVoterId = null;
        break;
      }
      case 'game_start': {
        // 上帝视角下从开局就揭示所有身份；玩家视角等到 game_over
        if (godView) {
          const arr = e.payload.players as Array<{ playerId: number; role: string }>;
          for (const item of arr) {
            const p = players.find((x) => x.config.playerId === item.playerId);
            if (p) p.role = item.role as Role;
          }
        }
        break;
      }
      case 'night_deaths':
      case 'day_announce': {
        const deaths = (e.payload.deaths ?? []) as Array<{
          playerId: number;
          reason: string;
        }>;
        for (const d of deaths) {
          const p = players.find((x) => x.config.playerId === d.playerId);
          if (p) {
            p.alive = false;
            p.deathReason = d.reason;
          }
        }
        break;
      }
      case 'hunter_shoot': {
        const targetId = e.payload.targetId as number | null;
        if (targetId != null) {
          const p = players.find((x) => x.config.playerId === targetId);
          if (p) {
            p.alive = false;
            p.deathReason = 'hunter_shoot';
          }
        }
        break;
      }
      case 'vote_result': {
        const eliminated = e.payload.eliminated as number | null;
        if (eliminated != null) {
          const p = players.find((x) => x.config.playerId === eliminated);
          if (p) {
            p.alive = false;
            p.deathReason = 'vote_out';
          }
        }
        break;
      }
      case 'speech': {
        const pid = e.payload.playerId as number;
        // 按出现顺序选当前发言者；同一个人多次发言时不切
        if (!seenSpeakers.has(pid)) {
          seenSpeakers.add(pid);
        }
        currentSpeakerId = pid;
        break;
      }
      case 'vote_cast': {
        currentVoterId = e.payload.voterId as number;
        break;
      }
      case 'game_over': {
        const finalPlayers = e.payload.finalPlayers as Array<{
          playerId: number;
          role: string;
          alive: boolean;
        }>;
        // 游戏结束：揭示所有身份
        for (const fp of finalPlayers) {
          const p = players.find((x) => x.config.playerId === fp.playerId);
          if (p) {
            p.role = fp.role as Role;
            p.alive = fp.alive;
          }
        }
        currentPhase = 'game_over';
        break;
      }
      case 'llm_call': {
        isWaitingLlm = false; // 收到 llm_call 表示调用已结束
        break;
      }
    }
  }

  // 末尾事件如果是 phase_change 但还没收到结果事件，认为在等待
  const last = events[events.length - 1];
  if (
    last &&
    (last.type === 'phase_change' || last.type === 'speech' || last.type === 'vote_cast')
  ) {
    isWaitingLlm = true;
  }

  return {
    players,
    currentPhase,
    currentDay,
    currentSpeakerId,
    currentVoterId,
    isWaitingLlm,
  };
}

// ─── 事件日志面板 ───────────────────────────────────────

function EventLog({ events, godView }: { events: GameEvent[]; godView: boolean }) {
  const reversed = [...events].reverse();
  return (
    <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 text-xs">
      {events.length === 0 && (
        <div className="text-slate-500 text-center py-8 flex flex-col items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
          等待事件…
        </div>
      )}
      <AnimatePresence initial={false}>
        {reversed.map((e) => (
          <EventRow key={e.seq} event={e} godView={godView} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function EventRow({ event, godView }: { event: GameEvent; godView: boolean }) {
  const text = formatEvent(event, godView);
  if (!text) return null;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      className={
        'rounded-lg px-2.5 py-1.5 border ' +
        (event.private
          ? 'bg-rose-500/5 border-rose-400/20 text-rose-200/90'
          : 'bg-slate-800/50 border-slate-700/40 text-slate-300')
      }
    >
      <div className="flex items-start gap-2">
        <span className="font-mono text-[9px] text-slate-500 mt-0.5 shrink-0">
          #{event.seq.toString().padStart(3, '0')}
        </span>
        <div className="flex-1 leading-snug">{text}</div>
        {event.private && (
          <span className="text-[9px] text-rose-400/70 shrink-0" title="私密事件">
            私
          </span>
        )}
      </div>
    </motion.div>
  );
}

function formatEvent(e: GameEvent, godView: boolean): string | null {
  switch (e.type) {
    case 'game_start':
      return `游戏开始 · ${e.payload.layout} · 种子 ${e.payload.seed ?? '随机'}`;
    case 'phase_change':
      return `${e.payload.label}`;
    case 'speech':
      return `${e.payload.playerName}：${e.payload.content}`;
    case 'vote_cast': {
      const target = e.payload.targetName;
      return target ? `${e.payload.voterName} 投给 ${target}` : `${e.payload.voterName} 弃票`;
    }
    case 'vote_result': {
      const name = e.payload.eliminatedName;
      return name
        ? `${name} 被放逐${e.payload.isTie ? '（平票）' : ''}`
        : `本轮无人出局${e.payload.isTie ? '（平票）' : ''}`;
    }
    case 'night_deaths':
    case 'day_announce': {
      const deaths = e.payload.deaths as Array<{ name: string }> | undefined;
      if (!deaths || deaths.length === 0) return '昨夜平安夜';
      return `昨夜死亡：${deaths.map((d) => d.name).join('、')}`;
    }
    case 'hunter_shoot':
      return e.payload.targetName
        ? `猎人 ${e.payload.hunterName} 带走了 ${e.payload.targetName}`
        : `猎人 ${e.payload.hunterName} 没有开枪`;
    case 'guard_protect':
      return godView && e.payload.targetName
        ? `守卫守护了 ${e.payload.targetName}`
        : null;
    case 'wolf_kill_decision':
      return godView && e.payload.targetName
        ? `🐺 ${e.payload.playerName} 选择刀 ${e.payload.targetName}`
        : null;
    case 'wolf_kill_result':
      return godView && e.payload.targetName
        ? `狼人最终刀：${e.payload.targetName}`
        : godView
          ? '狼人本夜未出刀'
          : null;
    case 'seer_check':
      return godView
        ? `🔮 ${e.payload.seerName} 查验 ${e.payload.targetName}：${e.payload.result === 'wolf' ? '狼人' : '好人'}`
        : null;
    case 'witch_action':
      return godView
        ? `🧪 ${e.payload.witchName}` +
            (e.payload.saved ? ` 救了 ${e.payload.savedTargetName}` : '') +
            (e.payload.poisonTargetName ? ` 毒了 ${e.payload.poisonTargetName}` : '') +
            (!e.payload.saved && !e.payload.poisonTargetName ? ' 没有行动' : '')
        : null;
    case 'game_over':
      return `游戏结束：${e.payload.winner === 'wolf' ? '狼人' : e.payload.winner === 'good' ? '好人' : '平局'}胜利 · ${e.payload.reason}`;
    case 'llm_call':
      return null; // 不在 UI 显示
    default:
      return null;
  }
}
