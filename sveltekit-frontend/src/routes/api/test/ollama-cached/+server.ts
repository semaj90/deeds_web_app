/**
 * POST /api/test/ollama-cached
 *
 * Test endpoint for ollamaCachedChat() (L1 Redis + Direct Ollama)
 * NO AUTH REQUIRED - for testing only
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ollamaCachedChat } from '$lib/server/ollama-cached.js';

interface TestRequest {
  query: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export const POST: RequestHandler = async ({ request }) => {
  const startTime = performance.now();

  try {
    const body = await request.json() as TestRequest;
    const query = body.query || 'Test query';
    const model = body.model || 'gemma4-legal-fast';
    const temperature = body.temperature ?? 0.3;
    const maxTokens = body.maxTokens ?? 200;

    const content = await ollamaCachedChat(
      [{ role: 'user', content: query }],
      model,
      { temperature, maxTokens, timeoutMs: 60_000 }
    );

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
