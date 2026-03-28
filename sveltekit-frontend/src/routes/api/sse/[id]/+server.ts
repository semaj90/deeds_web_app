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
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/validation.js';

const REDIS_URL = getRedisUrl();

function sseFormat(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const GET: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const chatId = params.id;

  if (!isUuid(chatId)) {
    return new Response('Invalid ID format', { status: 400 });
  }

  // Replay missed tokens if client reconnects with Last-Event-ID
  const lastEventId = request.headers.get('last-event-id');
  // Create a dedicated Redis connection for pub/sub (ioredis auto-connects)
  const redisSubscriber = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });

  let closed = false;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  console.log(`📡 SSE connection request for chat:${chatId}`);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const write = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFormat(event, data)));
        } catch (e) {
          // Controller may be closed
          console.warn('SSE write failed:', e);
        }
      };

      try {
        // Wait for Redis to be ready
        await new Promise<void>((resolve, reject) => {
          if (redisSubscriber.status === 'ready') {
            resolve();
            return;
          }
          redisSubscriber.once('ready', resolve);
          redisSubscriber.once('error', reject);
          // Timeout after 5 seconds
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
        });

        console.log(`📡 SSE Redis connected for chat:${chatId}`);

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
            // Replay is best-effort — don't fail the connection
          }
        }

        // Send initial ready event so tests can detect connection
        write('ready', { chatId, timestamp: new Date().toISOString() });

        // Subscribe to the specific Redis channel for this chat ID
        const channel = `updates:${chatId}`;

        redisSubscriber.on('message', (ch: string, message: string) => {
          if (ch !== channel) return;

          try {
            // Parse and forward the message
            const data = JSON.parse(message);
            write('message', data);
            // Persist delta chunks to Redis Stream for replay on reconnect
            if (data.type === 'delta' && typeof data.content === 'string') {
              const seq = data.seq ?? Date.now();
              produceTokenChunk(chatId, seq, data.content, { model: data.model ?? '' }).catch(
                () => {}
              );
            }
            console.log(`📨 SSE forwarded ${data.type} to chat:${chatId}`);
          } catch (error) {
            // If not JSON, send as raw content
            write('message', { type: 'delta', content: message });
          }
        });

        await redisSubscriber.subscribe(channel);
        console.log(`📡 SSE subscribed to ${channel}`);

        // Keepalive ping every 15 seconds (some proxies kill idle streams)
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
      console.log(`🔌 SSE connection closed for chat:${chatId}`);
      closed = true;

      // Clear heartbeat
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }

      // Cleanup Redis connection safely
      try {
        if (redisSubscriber.status === 'ready' || redisSubscriber.status === 'connect') {
          redisSubscriber.unsubscribe(`updates:${chatId}`).catch(() => {});
          redisSubscriber.quit().catch(() => {});
        }
      } catch (e) {
        // Ignore cleanup errors - connection may already be closed
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
    try {
      if (redisSubscriber.status === 'ready' || redisSubscriber.status === 'connect') {
        redisSubscriber.unsubscribe(`updates:${chatId}`).catch(() => {});
        redisSubscriber.quit().catch(() => {});
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering for real-time streaming
    },
  });
};
