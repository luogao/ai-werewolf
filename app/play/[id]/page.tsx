'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Radio, AlertTriangle, RefreshCw } from 'lucide-react';
import { GameTable, type TablePlayer } from '@/components/GameTable';
import { PhaseIndicator } from '@/components/PhaseIndicator';
import { SpoilerToggle } from '@/components/SpoilerToggle';
import { EventLog } from '@/components/EventLog';
import { Card, Badge } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useGameStream } from '@/lib/hooks/useGameStream';
import { deriveState } from '@/lib/game/deriveState';
import type { PlayerConfig } from '@/lib/types';

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

  const { players, currentPhase, currentDay, currentSpeakerId, isWaitingLlm } = useMemo(
    () => deriveState(visibleEvents, configs, godView),
    [visibleEvents, configs, godView],
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-5">
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

          <Card className="p-4 max-h-[640px] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">事件流</h2>
              <span className="text-[10px] text-slate-500">
                {visibleEvents.length} 条事件
              </span>
            </div>
            <EventLog
              events={visibleEvents}
              godView={godView}
              disableLayoutAnimation={visibleEvents.length > 500}
            />
          </Card>
        </div>
      </div>
    </main>
  );
}
