/**
 * POST /api/test/ollama-cached
 *
 * Test endpoint for ollamaCachedChat() (L1 Redis + Direct Ollama)
 * NO AUTH REQUIRED - for testing only
 */

import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { ollamaCachedChat } from '$lib/server/ollama-cached.js';
import { z } from 'zod';

const ollamaCachedSchema = z.object({
  query: z.string().max(1000).default('Test query'),
  model: z.string().max(100).default('gemma4-legal-fast'),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().int().min(1).max(4096).default(200),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!dev) return json({ error: 'Test endpoints are dev-only' }, { status: 403 });
  const startTime = performance.now();

  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = ollamaCachedSchema.safeParse(raw);
    if (!parsed.success)
      return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    const { query, model, temperature, maxTokens } = parsed.data;

    const content = await ollamaCachedChat([{ role: 'user', content: query }], model, {
      temperature,
      maxTokens,
      timeoutMs: 60_000,
    });

    const totalMs = Math.round(performance.now() - startTime);

    return json({
      success: true,
      content,
      model,
      latencyMs: totalMs,
      cached: totalMs < 100, // Heuristic: < 100ms = L1 Redis hit
    });
  } catch (err) {
    console.error('[/api/test/ollama-cached] Error:', err);
    return json(
      {
        success: false,
        error: (err as Error)?.message ?? 'Request failed',
      },
      { status: 500 }
    );
  }
};
