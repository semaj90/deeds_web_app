/**
 * L1 Redis + Direct Ollama (Bifrost L2 bypassed)
 *
 * This is a simplified version of bifrostChat() that:
 * - Checks L1 Redis exact-match cache (5ms on hit)
 * - Falls back to direct Ollama (2.8s with gemma4-legal-fast)
 * - Stores result in L1 for future hits
 * - SKIPS Bifrost L2 semantic cache (broken: base_url issue in v1.4.19)
 *
 * Use this for gemma4-legal-fast until Bifrost config is fixed.
 *
 * @example
 * const response = await ollamaCachedChat(
 *   [{ role: 'user', content: 'What is hearsay?' }],
 *   'gemma4-legal-fast',
 *   { temperature: 0.3, maxTokens: 200 }
 * );
 */

import { ENV } from '$lib/server/env.server.js';

export async function ollamaCachedChat(
  messages: Array<{ role: string; content: string }>,
  model: string,
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
): Promise<string> {
  const normalizedMessages = messages.map((m) =>
    m.role === 'user' ? { ...m, content: normalizeMessage(m.content) } : m
  );

  // ── L1 Cache: Redis Exact-Match ──
  const { generateCacheKey, getExactMatchCache, setExactMatchCache } = await import(
    '$lib/server/cache/redis-exact-match.js'
  );
  const cacheKey = generateCacheKey({
    model,
    messages: normalizedMessages,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  });

  const exactMatch = await getExactMatchCache(cacheKey);
  if (exactMatch) {
    console.log(`[ollama-cached] L1 HIT — instant return`);
    return exactMatch.content;
  }

  console.log(`[ollama-cached] L1 MISS — calling Ollama directly`);

  // ── Direct Ollama Call (skip Bifrost L2) ──
  const prompt = normalizedMessages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  const startTime = performance.now();

  const ollamaUrl = ENV.OLLAMA_BASE_URL;
  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048,
      },
    }),
    signal: AbortSignal.timeout(options?.timeoutMs ?? 60_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Ollama error: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.response || '';
  const latencyMs = Math.round(performance.now() - startTime);

  console.log(`[ollama-cached] Ollama responded in ${latencyMs}ms`);

  // Store in L1 for instant future retrieval
  if (content) {
    console.log(`[ollama-cached] Attempting to cache response (${content.length} chars)`);
    try {
      await setExactMatchCache(cacheKey, {
        content,
        model,
        backend: 'ollama-direct',
      });
      console.log(`[ollama-cached] ✓ Successfully cached in L1`);
    } catch (cacheErr) {
      console.error(`[ollama-cached] ✗ Cache write failed:`, cacheErr);
    }
  } else {
    console.warn(`[ollama-cached] No content to cache`);
  }

  return content;
}

// Normalize message to improve cache hit rate
function normalizeMessage(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ') // collapse whitespace
    .replace(/[""]/g, '"') // normalize quotes
    .replace(/['']/g, "'");
}