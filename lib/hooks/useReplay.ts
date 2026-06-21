'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameEvent } from '../events';

export type ReplaySpeed = 1 | 2 | 4;

export interface ReplayControl {
  /** 下一条要显示的事件 index；visibleEvents = events.slice(0, cursor) */
  cursor: number;
  visibleEvents: GameEvent[];
  isPlaying: boolean;
  speed: ReplaySpeed;
  atEnd: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  step: () => void;
  stepBack: () => void;
  reset: () => void;
  jumpToEnd: () => void;
  setSpeed: (s: ReplaySpeed) => void;
  jumpToEvent: (seq: number) => void;
  jumpToDay: (day: number) => void;
}

/**
 * 回放控制器：基于事件数组的 cursor 状态机。
 *
 * - 不订阅 SSE，事件来自外部传入（由 getGameEvents 一次性拉取）
 * - speed 决定 setInterval 间隔（1000/speed ms）
 * - 到末尾自动 pause
 */
export function useReplay(events: GameEvent[]): ReplayControl {
  const [cursor, setCursor] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState<ReplaySpeed>(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = events.length;
  const atEnd = cursor >= total;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (atEnd) {
      // 已到末尾，按播放视为从头开始
      setCursor(0);
    }
    setIsPlaying(true);
  }, [atEnd]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    setIsPlaying((p) => {
      if (!p && atEnd) setCursor(0);
      return !p;
    });
  }, [atEnd]);

  const step = useCallback(() => {
    setIsPlaying(false);
    setCursor((c) => Math.min(c + 1, total));
  }, [total]);

  const stepBack = useCallback(() => {
    setIsPlaying(false);
    setCursor((c) => Math.max(c - 1, 0));
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCursor(0);
  }, []);

  const jumpToEnd = useCallback(() => {
    setIsPlaying(false);
    setCursor(total);
  }, [total]);

  const setSpeed = useCallback((s: ReplaySpeed) => {
    setSpeedState(s);
  }, []);

  const jumpToEvent = useCallback(
    (seq: number) => {
      setIsPlaying(false);
      // cursor 表示「展示到第 cursor 条」，点击 seq=N 的事件要显示它本身
      const idx = events.findIndex((e) => e.seq === seq);
      if (idx >= 0) setCursor(idx + 1);
    },
    [events],
  );

  const jumpToDay = useCallback(
    (day: number) => {
      setIsPlaying(false);
      // 跳到「day > target 的第一条事件」之前 —— 即目标 day 的最后一条
      let idx = total;
      for (let i = 0; i < total; i++) {
        if ((events[i].day ?? 0) > day) {
          idx = i;
          break;
        }
      }
      setCursor(idx);
    },
    [events, total],
  );

  // 主时钟：speed 改变时重建 interval
  useEffect(() => {
    if (!isPlaying) {
      clearTimer();
      return;
    }
    clearTimer();
    timerRef.current = setInterval(() => {
      setCursor((c) => {
        if (c >= total) {
          // 到末尾 —— 让 effect 自己清理
          return c;
        }
        return c + 1;
      });
    }, 1000 / speed);
    return clearTimer;
  }, [isPlaying, speed, total, clearTimer]);

  // 到末尾自动暂停
  useEffect(() => {
    if (atEnd && isPlaying) setIsPlaying(false);
  }, [atEnd, isPlaying]);

  // 事件数组切换时重置
  useEffect(() => {
    setCursor(0);
    setIsPlaying(false);
  }, [events]);

  const visibleEvents = useMemo(() => events.slice(0, cursor), [events, cursor]);

  return {
    cursor,
    visibleEvents,
    isPlaying,
    speed,
    atEnd,
    play,
    pause,
    toggle,
    step,
    stepBack,
    reset,
    jumpToEnd,
    setSpeed,
    jumpToEvent,
    jumpToDay,
  };
}
