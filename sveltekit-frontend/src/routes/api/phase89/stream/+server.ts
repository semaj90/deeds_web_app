import { json } from '@sveltejs/kit';
/**
 * Phase 89: SSE Stream Endpoint
 * Real-time event stream for topology updates
 */

import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';

export const GET: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const redis = getRedis();
  const isConnected = redis.status === 'ready';

  const encoder = new TextEncoder();

  let statsIntervalId: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
      );

      // Send periodic stats updates
      statsIntervalId = setInterval(async () => {
        try {
          if (isConnected) {
            // Use SCAN instead of KEYS to avoid blocking Redis
            let embCount = 0;
            let fixCount = 0;
            let cursor = '0';
            do {
              const [next, keys] = await redis.scan(cursor, 'MATCH', 'emb:*', 'COUNT', 100);
              cursor = next;
              embCount += keys.length;
            } while (cursor !== '0');
            cursor = '0';
            do {
              const [next, keys] = await redis.scan(cursor, 'MATCH', 'fix:*', 'COUNT', 100);
              cursor = next;
              fixCount += keys.length;
            } while (cursor !== '0');

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'stats',
                  data: {
                    embeddingCache: embCount,
                    fixSuggestions: fixCount,
                    timestamp: Date.now(),
                  },
                })}\n\n`
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`
              )
            );
          }
        } catch {
          // Client may have disconnected
        }
      }, 5000);
    },

    cancel() {
      clearInterval(statsIntervalId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};



