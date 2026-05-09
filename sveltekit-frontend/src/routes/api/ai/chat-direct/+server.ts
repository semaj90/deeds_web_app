import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { generateCacheKey, getExactMatchCache, setExactMatchCache } from '$lib/server/cache/redis-exact-match.js';

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(10000),
});

const directChatSchema = z
  .object({
    message: z.string().max(10000).optional(),
    prompt: z.string().max(10000).optional(),
    // Default to gemma3:270m (fast, 4.5s avg) — use gemma4-legal for complex analysis
    model: z.string().optional().default('gemma3:270m'),
    temperature: z.number().min(0).max(2).optional().default(0.7),
    history: z.array(chatMessageSchema).max(50).optional().default([]),
  })
  .refine((d) => d.message?.trim() || d.prompt?.trim(), { message: 'Message is required' });

/** POST /api/ai/chat-direct — Direct Ollama endpoint for load testing (bypasses inference router, uses fast model) */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = await request.json();
    const parsed = directChatSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }

    const body = parsed.data;
    const message = body.message || body.prompt || '';
    const model = body.model || 'gemma3:270m';
    const temperature = body.temperature;

    // ── L1 Redis Cache Lookup (5ms) ──
    const cacheKey = generateCacheKey({
      model,
      messages: [{ role: 'user', content: message }],
      temperature,
      maxTokens: 200,
    });

    try {
      const cached = await getExactMatchCache(cacheKey);
      if (cached) {
        console.log(`[chat-direct] L1 REDIS HIT — model=${model}`);
        return json({
          response: cached.content,
          model,
          backend: 'redis-l1-cache',
          cached: true,
          performance: { latencyMs: 0 },
        });
      }
    } catch (cacheErr) {
      console.warn('[chat-direct] Cache lookup failed (non-fatal):', cacheErr);
    }

    const start = performance.now();

    // Direct Ollama call (bypasses router)
    const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: message,
        stream: false,
        options: {
          temperature,
          num_predict: 200,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    const result = await response.json();
    const latencyMs = Math.round(performance.now() - start);
    const responseText = result.response || '';

    // ── Store in L1 Redis Cache (1hr TTL) ──
    setExactMatchCache(cacheKey, {
      content: responseText,
      model,
      backend: 'ollama',
    }).catch((err) => {
      console.warn('[chat-direct] Cache storage failed:', err);
    });

    console.log(`[chat-direct] Inference complete — model=${model} time=${latencyMs}ms`);

    return json({
      response: responseText,
      model,
      backend: 'ollama-direct',
      cached: false,
      performance: { latencyMs },
    });
  } catch (err) {
    console.error('[/api/ai/chat-direct] Error:', err);
    return json({ error: 'AI service unavailable' }, { status: 503 });
  }
};
