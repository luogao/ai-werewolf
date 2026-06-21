'use client';

/**
 * SSR 安全的 localStorage 持久化 hook。
 *
 * 首次渲染返回 initial（保证服务端/客户端一致，不触发 hydration 警告）；
 * 挂载后读取 localStorage 并替换；之后任何 setValue 都会写回。
 *
 * `hydrated` 为 false 期间，调用方应避免渲染依赖真实值的内容（否则闪烁）。
 */
import { useCallback, useEffect, useState } from 'react';

export function useLocalStorage<T>(
  key: string,
  initial: T,
): [T, (v: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  // 挂载时读
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // 解析失败 / 隐私模式：忽略，继续用 initial
    }
    setHydrated(true);
  }, [key]);

  // 变化时写
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota 超限 / 隐私模式：吞错，不崩 UI
    }
  }, [key, value, hydrated]);

  const update = useCallback((v: T | ((prev: T) => T)) => {
    setValue(v);
  }, []);

  return [value, update, hydrated];
}
