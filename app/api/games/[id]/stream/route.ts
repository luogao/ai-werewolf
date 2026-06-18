/**
 * GET /api/games/:id/stream   SSE 实时事件流
 *
 * 行为：
 *   1. 若 game 在 runtime registry（正在跑/刚跑完），先 replay 已 buffer 的事件，
 *      再订阅新事件直到游戏结束。
 *   2. 若 game 不在 registry（重启后/旧的完成局），从 DB 读全部事件一次性推送。
 *
 * SSE 协议：
 *   data: {json}\n\n
 *   event: end\ndata: {}\n\n
 *   event: error\ndata: {"message": "..."}\n\n
 *   （ping 每 15s 一次，防止代理超时）
 */
import * as db from '@/lib/db/queries';
import { getEntry, type RuntimeEntry } from '@/lib/runtime/registry';
import type { GameEvent } from '@/lib/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PING_INTERVAL_MS = 15_000;
const TEXT_ENCODER = new TextEncoder();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 校验 game 存在
  const game = db.getGame(id);
  if (!game) {
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const closed = { value: false };
      const safeEnqueue = (chunk: string) => {
        if (closed.value) return;
        try {
          controller.enqueue(TEXT_ENCODER.encode(chunk));
        } catch {
          closed.value = true;
        }
      };

      const send = (event: GameEvent) => {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      };
      const sendEnd = () => {
        safeEnqueue('event: end\ndata: {}\n\n');
        close();
      };
      const sendError = (message: string) => {
        safeEnqueue(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
        close();
      };
      const close = () => {
        if (closed.value) return;
        closed.value = true;
        clearInterval(pingTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // 心跳防代理超时
      const pingTimer = setInterval(() => {
        safeEnqueue(': ping\n\n');
      }, PING_INTERVAL_MS);

      // 客户端断开
      req.signal.addEventListener('abort', () => close());

      // 路径 A：runtime registry 有 entry（实时直播）
      const entry = getEntry(id);
      if (entry) {
        streamFromEntry(entry, game, send, sendEnd, sendError);
      } else {
        // 路径 B：从 DB 读已完成对局（或新开但还没建 entry 的极端情况）
        streamFromDb(id, send, sendEnd, sendError);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // disable nginx buffering
    },
  });
}

function streamFromEntry(
  entry: RuntimeEntry,
  game: { status: string },
  send: (e: GameEvent) => void,
  sendEnd: () => void,
  sendError: (m: string) => void,
) {
  // 1) Replay 已 buffer 的事件
  for (const e of entry.events) {
    send(e);
  }

  // 2) 如果已经结束，直接关闭
  if (entry.status === 'done' || entry.status === 'failed') {
    if (entry.status === 'failed' && entry.error) {
      sendError(entry.error);
    } else {
      sendEnd();
    }
    return;
  }

  // 3) 订阅新事件
  const onEvent = (e: GameEvent) => send(e);
  const onEnd = () => {
    if (entry.status === 'failed' && entry.error) {
      sendError(entry.error);
    } else {
      sendEnd();
    }
  };
  entry.subscribers.add(onEvent);
  entry.endSubscribers.add(onEnd);
}

function streamFromDb(
  gameId: string,
  send: (e: GameEvent) => void,
  sendEnd: () => void,
  sendError: (m: string) => void,
) {
  try {
    const events = db.listEvents(gameId);
    for (const e of events) {
      send(e);
    }
    sendEnd();
  } catch (e) {
    sendError(e instanceof Error ? e.message : String(e));
  }
}
