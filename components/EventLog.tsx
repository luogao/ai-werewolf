'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { GameEvent } from '@/lib/events';
import { formatEvent } from '@/lib/game/formatEvent';

export interface EventLogProps {
  events: GameEvent[];
  godView: boolean;
  /** 关闭 framer-motion layout 动画（事件量大时降级用） */
  disableLayoutAnimation?: boolean;
}

export function EventLog({ events, godView, disableLayoutAnimation = false }: EventLogProps) {
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
          <EventRow
            key={e.seq}
            event={e}
            godView={godView}
            disableLayoutAnimation={disableLayoutAnimation}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function EventRow({
  event,
  godView,
  disableLayoutAnimation,
}: {
  event: GameEvent;
  godView: boolean;
  disableLayoutAnimation?: boolean;
}) {
  const text = formatEvent(event, godView);
  if (!text) return null;
  return (
    <motion.div
      layout={!disableLayoutAnimation}
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
