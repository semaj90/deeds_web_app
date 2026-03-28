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

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
      );

      // Send periodic stats updates
      const statsInterval = setInterval(async () => {
        try {
          if (isConnected) {
            // Get some quick stats
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
            // Just send a heartbeat
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`
              )
            );
          }
        } catch (e) {
          // Ignore errors, client may have disconnected
        }
      }, 5000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(statsInterval);
        try { controller.close(); } catch { /* already closed */ }
      });
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



