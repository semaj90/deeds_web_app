/**
 * POST /api/test/tiered-cache
 *
 * Test endpoint for 3-tier LLM cache validation
 * (Redis L1 + Qdrant L2 + Ollama L3)
 *
 * NO AUTH REQUIRED - for testing only
 */

import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { tieredLLMQuery, getTieredCacheStats } from '$lib/server/ai/tiered-llm-cache.js';
import { z } from 'zod';

const tieredCacheSchema = z.object({
  query: z.string().max(1000).default('What is hearsay evidence in criminal law?'),
  runs: z.number().int().min(1).max(10).default(3),
  model: z.string().max(100).default('gemma3:270m'),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().int().min(1).max(4096).default(200),
  context: z.string().max(200).default('test'),
});

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) return json({ error: 'Test endpoints are dev-only' }, { status: 403 });
  const overallStart = performance.now();

  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = tieredCacheSchema.safeParse(raw);
    if (!parsed.success)
      return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    const { query, runs, model, temperature, maxTokens, context } = parsed.data;

    // Get stats before
    const statsBefore = await getTieredCacheStats();

    const results = [];

    // Run the same query multiple times to test cache tiers
    for (let i = 0; i < runs; i++) {
      const result = await tieredLLMQuery([{ role: 'user', content: query }], {
        model,
        temperature,
        maxTokens,
        context,
      });

      const responseStr =
        typeof result.response === 'string' ? result.response : JSON.stringify(result.response);

      results.push({
        run: i + 1,
        tier: result.tier,
        latencyMs: result.latencyMs,
        similarity: result.similarity,
        responsePreview: responseStr.slice(0, 100) + '...',
        expectedTier: i === 0 ? 'L3_ollama' : i === 1 ? 'L2_qdrant or L3_ollama' : 'L1_redis',
      });

      // Small delay between runs to allow cache writes to complete
      if (i < runs - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Get stats after
    const statsAfter = await getTieredCacheStats();

    // Calculate metrics
    const run1 = results[0];
    const run3 = results[2];
    const speedup = run3 ? Math.round(run1.latencyMs / run3.latencyMs) : 1;

    return json({
      success: true,
      query,
      runs,
      results,
      cacheStats: {
        before: statsBefore,
        after: statsAfter,
      },
      performance: {
        baselineMs: run1.latencyMs,
        fastestMs: run3?.latencyMs ?? run1.latencyMs,
        speedup: `${speedup}×`,
        totalDurationMs: Math.round(performance.now() - overallStart),
      },
    });
  } catch (err) {
    console.error('[/api/test/tiered-cache] Error:', err);
    return json(
      {
        success: false,
        error: (err as Error)?.message ?? 'Tiered cache test failed',
      },
      { status: 500 }
    );
  }
};

/**
 * GET /api/test/tiered-cache
 *
 * Get current cache statistics
 */
export const GET: RequestHandler = async () => {
  try {
    const stats = await getTieredCacheStats();

    return json({
      success: true,
      stats,
      description: {
        l1_redis: 'Exact-match cache (SHA-256 hash, 3ms avg)',
        l2_qdrant: 'Semantic similarity cache (vector search, 100ms avg, threshold 0.88)',
        l3_ollama: 'Cold inference (GPU, 3.2s avg for gemma3:270m)',
      },
    });
  } catch (err) {
    console.error('[/api/test/tiered-cache] Error:', err);
    return json(
      {
        success: false,
        error: (err as Error)?.message ?? 'Failed to get cache stats',
      },
      { status: 500 }
    );
  }
};
