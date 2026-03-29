import { json } from '@sveltejs/kit';
/**
 * Phase 76: Server-Sent Events (SSE) Endpoint
 * Enhanced with heartbeat, error handling, and proper cleanup
 *
 * ChatSession connects to /api/sse/${chatId} - this endpoint handles that
 */

import IORedis from 'ioredis';
import { getRedisUrl } from '$lib/config/env.server.js';
import { produceTokenChunk, readTokenStream } from '$lib/server/redis-streams.js';
import { sseFormat, sseHeaders } from '$lib/server/streaming/sse-utils.js';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/validation.js';

const REDIS_URL = getRedisUrl();

// Shared Redis pub/sub connection — ONE connection for ALL SSE clients
// Each client registers a callback; the shared subscriber fans out messages
let sharedSubscriber: IORedis | null = null;
const channelCallbacks = new Map<string, Set<(message: string) => void>>();

function getSharedSubscriber(): IORedis {
  if (!sharedSubscriber || sharedSubscriber.status === 'end') {
    sharedSubscriber = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    sharedSubscriber.on('message', (channel: string, message: string) => {
      const cbs = channelCallbacks.get(channel);
      if (cbs) {
        for (const cb of cbs) {
          try { cb(message); } catch { /* individual callback error */ }
        }
      }
    });
    sharedSubscriber.on('error', (err) => {
      console.warn('[SSE shared sub] Redis error:', err.message);
    });
  }
  return sharedSubscriber;
}

async function subscribeChannel(channel: string, cb: (message: string) => void): Promise<void> {
  const sub = getSharedSubscriber();
  if (!channelCallbacks.has(channel)) {
    channelCallbacks.set(channel, new Set());
    await sub.subscribe(channel);
  }
  channelCallbacks.get(channel)!.add(cb);
}

async function unsubscribeChannel(channel: string, cb: (message: string) => void): Promise<void> {
  const cbs = channelCallbacks.get(channel);
  if (!cbs) return;
  cbs.delete(cb);
  if (cbs.size === 0) {
    channelCallbacks.delete(channel);
    try { await sharedSubscriber?.unsubscribe(channel); } catch { /* ignore */ }
  }
}

export const GET: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const chatId = params.id;

  if (!isUuid(chatId)) {
    return new Response('Invalid ID format', { status: 400 });
  }

  // Replay missed tokens if client reconnects with Last-Event-ID
  const lastEventId = request.headers.get('last-event-id');

  let closed = false;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let messageCallback: ((message: string) => void) | null = null;
  const channel = `updates:${chatId}`;

  console.log(`[SSE] connection request for chat:${chatId}`);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const write = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFormat(event, data)));
        } catch (e) {
          console.warn('SSE write failed:', e);
        }
      };

      try {
        // Replay any missed messages since the client's last-event-id
        if (lastEventId) {
          try {
            const missed = await readTokenStream(chatId, lastEventId);
            for (const entry of missed) {
              write('message', {
                type: 'delta',
                content: entry.chunk,
                seq: entry.seq,
                replayed: true,
              });
            }
            if (missed.length > 0) {
              console.log(`[SSE] Replayed ${missed.length} missed tokens for chat:${chatId}`);
            }
          } catch {
            // Replay is best-effort
          }
        }

        // Send initial ready event
        write('ready', { chatId, timestamp: new Date().toISOString() });

        // Subscribe via shared pub/sub connection (1 Redis conn for ALL clients)
        messageCallback = (message: string) => {
          try {
            const data = JSON.parse(message);
            write('message', data);
            if (data.type === 'delta' && typeof data.content === 'string') {
              const seq = data.seq ?? Date.now();
              produceTokenChunk(chatId, seq, data.content, { model: data.model ?? '' }).catch(
                () => {}
              );
            }
          } catch {
            write('message', { type: 'delta', content: message });
          }
        };

        await subscribeChannel(channel, messageCallback);
        console.log(`[SSE] subscribed to ${channel}`);

        // Keepalive ping every 15 seconds
        heartbeatInterval = setInterval(() => {
          write('ping', { t: Date.now() });
        }, 15000);
      } catch (error) {
        console.error('SSE Redis connection failed:', error);
        write('error', { message: 'Failed to connect to message stream' });
        controller.close();
      }
    },

    cancel() {
      console.log(`[SSE] connection closed for chat:${chatId}`);
      closed = true;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (messageCallback) {
        unsubscribeChannel(channel, messageCallback).catch(() => {});
        messageCallback = null;
      }
    },
  });

  // Handle client disconnect via abort signal
  request.signal.addEventListener('abort', () => {
    closed = true;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (messageCallback) {
      unsubscribeChannel(channel, messageCallback).catch(() => {});
      messageCallback = null;
    }
  });

  return new Response(stream, { headers: sseHeaders() });
};
