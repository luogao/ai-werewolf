'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import clsx from 'clsx';
import { PlayerCard, type PlayerCardProps } from './PlayerCard';

export interface TablePlayer extends Omit<PlayerCardProps, 'forceReveal'> {
  playerId: number;
  position: number; // 0..n-1，座位编号
}

export interface GameTableProps {
  players: TablePlayer[];
  /** 中心区域（PhaseIndicator） */
  center?: React.ReactNode;
  /** 当前夜晚/白天 */
  isNight?: boolean;
  /** 桌面直径，单位 px */
  size?: number;
  /** 强制揭示所有身份（上帝视角） */
  forceReveal?: boolean;
  className?: string;
}

export function GameTable({
  players,
  center,
  isNight = false,
  size = 560,
  forceReveal = false,
  className,
}: GameTableProps) {
  const n = players.length;
  // 圆周半径：留出卡片空间
  const radius = size / 2 - 90;

  const placements = useMemo(() => {
    return players.map((p) => {
      // 顶部为第一个玩家（angle=-90°）；顺时针排布
      const angle = (p.position / n) * 2 * Math.PI - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return { ...p, x, y };
    });
  }, [players, n, radius]);

  return (
    <div
      className={clsx('relative mx-auto', className)}
      style={{ width: size, height: size }}
    >
      {/* 桌面 */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          background: isNight
            ? 'radial-gradient(circle at center, rgba(30,58,138,0.35) 0%, rgba(15,23,42,0.6) 50%, rgba(2,6,23,0.9) 100%)'
            : 'radial-gradient(circle at center, rgba(180,83,9,0.25) 0%, rgba(60,30,10,0.5) 50%, rgba(20,15,10,0.85) 100%)',
          boxShadow: isNight
            ? '0 0 80px rgba(59,130,246,0.15) inset, 0 0 60px rgba(30,58,138,0.3)'
            : '0 0 80px rgba(245,158,11,0.15) inset, 0 0 60px rgba(180,83,9,0.3)',
        }}
        transition={{ duration: 0.8 }}
      />

      {/* 桌沿装饰 */}
      <div className="absolute inset-0 rounded-full border-2 border-amber-700/20 pointer-events-none" />
      <div
        className="absolute rounded-full border border-amber-500/10 pointer-events-none"
        style={{ inset: '24px' }}
      />

      {/* 中心区域 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">{center}</div>
      </div>

      {/* 玩家卡座 */}
      <div className="absolute inset-0">
        {placements.map((p) => (
          <motion.div
            key={p.playerId}
            className="absolute top-1/2 left-1/2"
            style={{ transform: `translate(-50%, -50%)` }}
            animate={{
              x: p.x,
              y: p.y,
            }}
            transition={{ type: 'spring', stiffness: 100, damping: 15 }}
          >
            <PlayerCard
              name={p.name}
              model={p.model}
              role={p.role}
              alive={p.alive}
              deathReason={p.deathReason}
              isSpeaking={p.isSpeaking}
              isCurrent={p.isCurrent}
              voteTarget={p.voteTarget}
              size="sm"
              forceReveal={forceReveal}
            />
          </motion.div>
        ))}
      </div>

      {/* 投票连线（待外层传入） */}
      <AnimatePresence />
    </div>
  );
}
