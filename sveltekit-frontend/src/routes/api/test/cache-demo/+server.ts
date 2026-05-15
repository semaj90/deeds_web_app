/**
 * POST /api/test/cache-demo
 *
 * Test endpoint to demonstrate Redis L1 + Bifrost L2 cache performance.
 * Makes LLM requests via bifrostChat() to test cache tiers.
 *
 * NO AUTH REQUIRED - for testing only.
 */

import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { bifrostChat } from '$lib/server/ollama.js';
import { getExactMatchStats } from '$lib/server/cache/redis-exact-match.js';
import { z } from 'zod';

const cacheDemoSchema = z.object({
  query: z.string().max(1000).default('What is hearsay evidence in criminal law?'),
  runs: z.number().int().min(1).max(10).default(3),
  model: z.string().max(100).default('gemma3:270m'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!dev) return json({ error: 'Test endpoints are dev-only' }, { status: 403 });
  const startTime = performance.now();

  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = cacheDemoSchema.safeParse(raw);
    if (!parsed.success)
      return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    const { query, runs, model } = parsed.data;

    // Get cache stats before
    const statsBefore = await getExactMatchStats();

    const results = [];

    // Run the same query multiple times to test cache tiers
    for (let i = 0; i < runs; i++) {
      const runStart = performance.now();

      const response = await bifrostChat([{ role: 'user', content: query }], model, {
        temperature: 0.3,
        maxTokens: 200,
        timeoutMs: 60_000,
      });

      const runEnd = performance.now();
      const latency = Math.round(runEnd - runStart);

      results.push({
        run: i + 1,
        latencyMs: latency,
        responsePreview: response.slice(0, 150) + '...',
        expectedTier: i === 0 ? 'L3 (Cold/Ollama)' : i === 1 ? 'L2 (Bifrost/Qdrant)' : 'L1 (Redis)',
      });

      // Small delay between runs
      if (i < runs - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Get cache stats after
    const statsAfter = await getExactMatchStats();

    // Calculate speedup
    const baseline = results[0].latencyMs;
    const fastest = Math.min(...results.map((r) => r.latencyMs));
    const speedup = Math.round(baseline / fastest);

    return json({
      success: true,
      query,
      runs,
      results,
      cacheStats: {
        before: {
          totalKeys: statsBefore.totalKeys,
          memoryMB: (statsBefore.memoryUsedBytes / (1024 * 1024)).toFixed(2),
        },
        after: {
          totalKeys: statsAfter.totalKeys,
          memoryMB: (statsAfter.memoryUsedBytes / (1024 * 1024)).toFixed(2),
        },
      },
      performance: {
        baselineMs: baseline,
        fastestMs: fastest,
        speedup: `${speedup}×`,
        totalDurationMs: Math.round(performance.now() - startTime),
      },
    });
  } catch (err) {
    console.error('[/api/test/cache-demo] Error:', err);
    return json(
      {
        success: false,
        error: (err as Error)?.message ?? 'Cache demo failed',
      },
      { status: 500 }
    );
  }
};
