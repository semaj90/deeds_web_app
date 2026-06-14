/**
 * HyperRAG ANN retrieval for tool selection.
 * POST /api/tools/rpc-search
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';

const requestSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().min(1).max(100).optional().default(10),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return error(401, 'Unauthorized');
  }

  try {
    const body = await request.json();
    const { query, limit } = requestSchema.parse(body);
    const startMs = performance.now();
    const redis = getRedis();

    // Try Redis cache
    const cacheKey = `ace:rpc-search:${Buffer.from(query).toString('base64').slice(0, 32)}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return json({
        packets: JSON.parse(cached),
        cached: true,
        latencyMs: performance.now() - startMs,
      });
    }

    // Mock response (simplified for testing)
    const packets = [
      {
        packet_key: `packet:${Math.random().toString(36).slice(2, 8)}`,
        feature_id: 'auth.sessions',
        score: 0.92,
        tags: ['authentication', 'session'],
      },
      {
        packet_key: `packet:${Math.random().toString(36).slice(2, 8)}`,
        feature_id: 'auth.validation',
        score: 0.88,
        tags: ['auth', 'validation'],
      },
    ].slice(0, limit);

    // Cache result
    await redis.setex(cacheKey, 300, JSON.stringify(packets));

    return json({
      packets,
      cached: false,
      latencyMs: performance.now() - startMs,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return error(400, 'Invalid request');
    }
    console.error('[rpc-search]', err);
    return error(500, 'Internal error');
  }
};
