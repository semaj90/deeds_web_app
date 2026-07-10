/**
 * GET/POST /api/retrieval/cache-layers
 *
 * Measures and coordinates cache layers 2-4 for a given query.
 * Compares latencies: OpenCode adapter, BitFrost exact, BitFrost semantic.
 *
 * Returns orchestration results with cache hit/miss per layer.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  orchestrateCacheLayers,
  checkCacheLayersHealth,
  type CacheLayersOrchestrationResult
} from '$lib/server/retrieval/cache-layers-orchestrator.js';
import { z } from 'zod';

const querySchema = z.object({
  system_prompt: z.string().min(10).default('You are Atlas, a legal AI.'),
  user_prompt: z.string().min(1),
  measure_direct_ms: z.coerce.number().optional()
});

type QueryInput = z.infer<typeof querySchema>;

export const GET: RequestHandler = async ({ url }) => {
  // Parse query parameters
  const systemPrompt = url.searchParams.get('system_prompt') ?? 'You are Atlas, a legal AI.';
  const userPrompt = url.searchParams.get('user_prompt');
  const measureDirectMs = parseInt(url.searchParams.get('measure_direct_ms') ?? '0', 10);

  if (!userPrompt) {
    return error(400, { message: 'Missing required parameter: user_prompt' });
  }

  try {
    const result = await orchestrateCacheLayers(systemPrompt, userPrompt, measureDirectMs || 200);

    return json({
      success: true,
      cache_layers: result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[cache-layers] orchestration error:', err);
    return json(
      {
        success: false,
        error: String(err),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
};

export const POST: RequestHandler = async ({ request }) => {
  // Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, { message: 'Invalid JSON body' });
  }

  const validation = querySchema.safeParse(body);
  if (!validation.success) {
    return json(
      {
        success: false,
        error: 'Validation failed',
        details: validation.error.flatten()
      },
      { status: 400 }
    );
  }

  const { system_prompt, user_prompt, measure_direct_ms } = validation.data;

  try {
    const result = await orchestrateCacheLayers(
      system_prompt,
      user_prompt,
      measure_direct_ms || 200
    );

    return json({
      success: true,
      cache_layers: result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[cache-layers] orchestration error:', err);
    return json(
      {
        success: false,
        error: String(err),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
};
