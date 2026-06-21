'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, History, Play, Pause, SkipBack, SkipForward, Rewind, FastForward } from 'lucide-react';
import { GameTable, type TablePlayer } from '@/components/GameTable';
import { PhaseIndicator } from '@/components/PhaseIndicator';
import { SpoilerToggle } from '@/components/SpoilerToggle';
import { EventLog } from '@/components/EventLog';
import { Card, Badge } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { api, type GameRecord, type GameEvent } from '@/lib/api/client';
import { useReplay, type ReplaySpeed } from '@/lib/hooks/useReplay';
import { deriveState } from '@/lib/game/deriveState';

interface ReplayPageProps {
  params: Promise<{ id: string }>;
}

const SPEEDS: ReplaySpeed[] = [1, 2, 4];

export default function ReplayPage({ params }: ReplayPageProps) {
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<GameRecord | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [godView, setGodView] = useState(true); // 回放默认上帝视角
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setGameId(p.id));
  }, [params]);

  useEffect(() => {
    if (!gameId) return;
    api
      .getGameEvents(gameId)
      .then(({ game, events }) => {
        setGame(game);
        setEvents(events);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : '加载失败');
      });
  }, [gameId]);

  if (!gameId) return null;

  if (loadError) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12">
        <Card className="p-6 text-rose-200">加载失败：{loadError}</Card>
      </main>
    );
  }

  if (!game || events.length === 0) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12">
        <Card className="p-6 text-slate-400">加载中…</Card>
      </main>
    );
  }

  return <ReplayView game={game} events={events} godView={godView} setGodView={setGodView} />;
}

function ReplayView({
  game,
  events,
  godView,
  setGodView,
}: {
  game: GameRecord;
  events: GameEvent[];
  godView: boolean;
  setGodView: (v: boolean) => void;
}) {
  const control = useReplay(events);
  const { visibleEvents, cursor, isPlaying, speed, atEnd } = control;

  const { players, currentPhase, currentDay, currentSpeakerId, isWaitingLlm } = useMemo(
    () => deriveState(visibleEvents, game.config, godView),
    [visibleEvents, game.config, godView],
  );

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

  const durationLabel = game.endedAt
    ? `${Math.round((game.endedAt - game.startedAt) / 1000)}s`
    : '—';

  const maxDay = useMemo(() => {
    let m = 0;
    for (const e of events) if ((e.day ?? 0) > m) m = e.day;
    return m;
  }, [events]);

  // 时间轴 tick：phase_change / night_deaths / vote_result / game_over
  const ticks = useMemo(() => {
    const keyTypes = new Set(['phase_change', 'night_deaths', 'vote_result', 'game_over']);
    return events
      .filter((e) => keyTypes.has(e.type))
      .map((e) => ({ seq: e.seq, label: tickLabel(e) }));
  }, [events]);

  return (
    <main className="min-h-[calc(100vh-3rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-5">
        {/* 顶部 */}
        <header className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/replay" className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <History className="h-5 w-5 text-indigo-400" />
              回放
            </h1>
            <Badge
              color={game.winner === 'wolf' ? 'red' : game.winner === 'good' ? 'green' : 'slate'}
            >
              {game.winner === 'wolf' ? '狼人胜' : game.winner === 'good' ? '好人胜' : '平局'}
            </Badge>
            <span className="text-xs text-slate-500 font-mono">
              {game.layout.toUpperCase()} · {durationLabel} · {game.id.slice(0, 8)}
            </span>
          </div>
          <SpoilerToggle godView={godView} onChange={setGodView} />
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">
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
                  <PhaseIndicator phase={currentPhase} day={currentDay} waiting={false} />
                ) : (
                  <div className="text-slate-500 text-sm">点击播放开始回放</div>
                )
              }
            />
          </Card>

          <Card className="p-4 max-h-[640px] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">事件流</h2>
              <span className="text-[10px] text-slate-500">
                {cursor}/{events.length}
              </span>
            </div>
            <EventLog
              events={visibleEvents}
              godView={godView}
              disableLayoutAnimation={events.length > 500}
            />
          </Card>
        </div>

        {/* 控制条 */}
        <Card className="mt-5 p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="sm" onClick={control.reset} title="回到开头">
                <Rewind className="h-3.5 w-3.5" />
              </Button>
              <Button variant="secondary" size="sm" onClick={control.stepBack} title="步退">
                <SkipBack className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={control.toggle}
                className="min-w-[80px]"
                title={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5" /> 暂停
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" /> 播放
                  </>
                )}
              </Button>
              <Button variant="secondary" size="sm" onClick={control.step} title="步进">
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
              <Button variant="secondary" size="sm" onClick={control.jumpToEnd} title="跳到结尾">
                <FastForward className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">速度</span>
              <div className="flex rounded-md border border-slate-700 overflow-hidden">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => control.setSpeed(s)}
                    className={
                      'px-2.5 py-1 text-xs font-mono ' +
                      (speed === s ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800')
                    }
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {maxDay > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">跳到第</span>
                <select
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) control.jumpToDay(parseInt(e.target.value, 10));
                  }}
                >
                  <option value="">选择天…</option>
                  {Array.from({ length: maxDay + 1 }, (_, i) => i).map((d) => (
                    <option key={d} value={d}>
                      Day {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="text-xs text-slate-500 font-mono">
              {cursor}/{events.length} · {atEnd ? '已结束' : isPlaying ? '播放中' : '已暂停'}
            </div>
          </div>

          {/* 时间轴 */}
          <div className="mt-4">
            <input
              type="range"
              min={0}
              max={events.length}
              value={cursor}
              onChange={(e) => {
                control.pause();
                // 同步 jumpToEvent 语义：slider 直接设 cursor
                const v = parseInt(e.target.value, 10);
                // jumpToEvent 用 seq，但这里我们要直接设 cursor —— 简单用 pause + 内部 setCursor
                // 通过 jumpToEvent(events[v-1].seq) 间接实现
                if (v === 0) {
                  control.reset();
                } else {
                  const target = events[v - 1];
                  if (target) control.jumpToEvent(target.seq);
                }
              }}
              className="w-full accent-indigo-500"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {ticks.map((t) => (
                <button
                  key={t.seq}
                  onClick={() => control.jumpToEvent(t.seq)}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 font-mono"
                  title={`${t.label} (seq=${t.seq})`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* waiting 隐藏在 PhaseIndicator 里，回放不显示 */}
        {isWaitingLlm && null}
      </div>
    </main>
  );
}

function tickLabel(e: GameEvent): string {
  switch (e.type) {
    case 'phase_change':
      return String(e.payload.label ?? e.payload.phase ?? '');
    case 'night_deaths':
      return `D${e.day}夜`;
    case 'vote_result':
      return `D${e.day}投`;
    case 'game_over':
      return '结束';
    default:
      return '';
  }
}
