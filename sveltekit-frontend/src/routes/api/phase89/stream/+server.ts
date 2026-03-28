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
            const embKeys = await redis.keys('emb:*');
            const fixKeys = await redis.keys('fix:*');

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'stats',
                  data: {
                    embeddingCache: embKeys.length,
                    fixSuggestions: fixKeys.length,
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



