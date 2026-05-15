/**
 * POST /api/test/cache-simple
 *
 * Simple cache demonstration - tests Redis L1 cache with direct Ollama (bypasses Bifrost).
 * NO AUTH REQUIRED - for testing only.
 */

import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { ollamaFetch } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
import {
  generateCacheKey,
  getExactMatchCache,
  setExactMatchCache,
  getExactMatchStats,
} from '$lib/server/cache/redis-exact-match.js';
import { z } from 'zod';

const cacheSimpleSchema = z.object({
  query: z.string().max(1000).default('What is hearsay evidence in criminal law?'),
  runs: z.number().int().min(1).max(10).default(3),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!dev) return json({ error: 'Test endpoints are dev-only' }, { status: 403 });
  const startTime = performance.now();

  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = cacheSimpleSchema.safeParse(raw);
    if (!parsed.success)
      return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    const { query, runs } = parsed.data;

    const statsBefore = await getExactMatchStats();
    const results = [];

    // Generate cache key (deterministic)
    const cacheKey = generateCacheKey({
      model: 'gemma4-legal',
      messages: [{ role: 'user', content: query }],
      temperature: 0.3,
      maxTokens: 200,
    });

    for (let i = 0; i < runs; i++) {
      const runStart = performance.now();
      let response = '';
      let cacheHit = false;
      let tier = '';

      // Check L1 cache first
      const cached = await getExactMatchCache(cacheKey);
      if (cached) {
        response = cached.content;
        cacheHit = true;
        tier = 'L1-Redis';
      } else {
        // L1 miss → call Ollama directly
        tier = 'L3-Ollama';
        const ollamaRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemma4-legal',
            messages: [{ role: 'user', content: query }],
            stream: false,
            options: { num_predict: 200, temperature: 0.3 },
          }),
        });

        const data = await ollamaRes.json();
        response = data.message?.content || '';

        // Store in L1 cache for next run
        await setExactMatchCache(cacheKey, {
          content: response,
          model: 'gemma4-legal',
          backend: 'ollama-direct',
        });
      }

      const runEnd = performance.now();
      const latency = Math.round(runEnd - runStart);

      results.push({
        run: i + 1,
        latencyMs: latency,
        cacheHit,
        tier,
        responsePreview: response.slice(0, 150) + '...',
      });

      // Small delay between runs
      if (i < runs - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const statsAfter = await getExactMatchStats();

    // Calculate speedup
    const baseline = results[0].latencyMs;
    const cachedRuns = results.filter((r) => r.cacheHit);
    const avgCacheLatency =
      cachedRuns.length > 0
        ? Math.round(cachedRuns.reduce((sum, r) => sum + r.latencyMs, 0) / cachedRuns.length)
        : 0;

    const speedup = avgCacheLatency > 0 ? Math.round(baseline / avgCacheLatency) : 0;

    return json({
      success: true,
      query,
      runs,
      cacheKey: cacheKey.slice(-16),
      results,
      cacheStats: {
        before: {
          totalKeys: statsBefore.totalKeys,
          memoryMB: (statsBefore.memoryUsedBytes / (1024 * 1024)).toFixed(2),
        },
        after: {
          totalKeys: statsAfter.totalKeys,
          memoryMB: (statsAfter.memoryUsedBytes / (1024 * 1024)).toFixed(2),
          keysAdded: statsAfter.totalKeys - statsBefore.totalKeys,
        },
      },
      performance: {
        baselineMs: baseline,
        avgCachedMs: avgCacheLatency,
        speedup: `${speedup}×`,
        totalDurationMs: Math.round(performance.now() - startTime),
      },
    });
  } catch (err) {
    console.error('[/api/test/cache-simple] Error:', err);
    return json(
      {
        success: false,
        error: (err as Error)?.message ?? 'Cache test failed',
      },
      { status: 500 }
    );
  }
};
