'use client';

/**
 * useGameStream —— SSE 订阅 hook
 *
 * 接收 gameId，自动连接 /api/games/{id}/stream，把事件累积返回。
 * 支持视角切换：godView=false 时，过滤 private 事件（玩家视角）。
 *
 * 用法：
 *   const { events, status, error, godView, setGodView } = useGameStream(gameId);
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameEvent } from '../events';

export type StreamStatus = 'connecting' | 'live' | 'done' | 'error';

export interface UseGameStreamResult {
  events: GameEvent[];
  visibleEvents: GameEvent[];
  status: StreamStatus;
  error: string | null;
  godView: boolean;
  setGodView: (v: boolean) => void;
  reconnect: () => void;
}

export function useGameStream(gameId: string | null): UseGameStreamResult {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [godView, setGodView] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTokenRef = useRef(0);

  const connect = useCallback(() => {
    if (!gameId) return;
    // 关闭旧连接
    sourceRef.current?.close();

    setStatus('connecting');
    setError(null);
    // 注意：重连时不要清空 events，否则已经收到的事件会丢失
    // 后端在 replay 模式下会重发全部历史事件，前端按 seq 去重即可

    const source = new EventSource(`/api/games/${gameId}/stream`);
    sourceRef.current = source;

    source.onopen = () => {
      setStatus('live');
    };

    source.onmessage = (e) => {
      try {
        const event: GameEvent = JSON.parse(e.data);
        setEvents((prev) => {
          // 按 seq 去重（防止重连时重发）
          if (prev.some((p) => p.seq === event.seq)) return prev;
          return [...prev, event];
        });
      } catch (err) {
        console.error('failed to parse SSE event:', err, e.data);
      }
    };

    // 监听 end 事件
    source.addEventListener('end', () => {
      setStatus('done');
      source.close();
    });

    source.addEventListener('error', (e) => {
      // EventSource error 事件可能是网络中断或后端发的 error
      const msg = (e as MessageEvent).data
        ? (() => {
            try {
              return JSON.parse((e as MessageEvent).data).message;
            } catch {
              return 'stream error';
            }
          })()
        : 'connection lost';
      setStatus('error');
      setError(msg);
    });

    source.onerror = () => {
      // 浏览器自动重连；只在 readyState=CONNECTING 才标记 error
      if (source.readyState === EventSource.CLOSED) {
        setStatus('error');
        setError('connection closed');
      }
    };
  }, [gameId]);

  useEffect(() => {
    reconnectTokenRef.current += 1;
    connect();
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    reconnectTokenRef.current += 1;
    connect();
  }, [connect]);

  // 客户端按视角过滤
  const visibleEvents = godView ? events : events.filter((e) => !e.private);

  return {
    events,
    visibleEvents,
    status,
    error,
    godView,
    setGodView,
    reconnect,
  };
}
