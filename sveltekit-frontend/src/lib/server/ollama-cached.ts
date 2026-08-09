/**
 * L1 Redis + Direct llama-server (Bifrost L2 bypassed)
 *
 * This is a simplified version of bifrostChat() that:
 * - Checks L1 Redis exact-match cache (5ms on hit)
 * - Falls back to direct llama-server :8090 (chat/synthesis lane — never Ollama)
 * - Stores result in L1 for future hits
 * - SKIPS Bifrost L2 semantic cache (broken: base_url issue in v1.4.19)
 *
 * @example
 * const response = await llamaServerCachedChat(
 *   [{ role: 'user', content: 'What is hearsay?' }],
 *   'gemma4-legal-iq4xs-direct.gguf',
 *   { temperature: 0.3, maxTokens: 200 }
 * );
 */

import { ENV } from '$lib/server/env.server.js';

export async function llamaServerCachedChat(
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

  console.log(`[ollama-cached] L1 MISS — calling llama-server directly`);

  // ── Direct llama-server Call (skip Bifrost L2) ──
  const startTime = performance.now();

  const llamaServerUrl = ENV.TURBOQUANT_BASE_URL ?? ENV.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090';
  const response = await fetch(`${llamaServerUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: normalizedMessages,
      stream: false,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
    }),
    signal: AbortSignal.timeout(options?.timeoutMs ?? 60_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`llama-server error: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const latencyMs = Math.round(performance.now() - startTime);

  console.log(`[ollama-cached] llama-server responded in ${latencyMs}ms`);

  // Store in L1 for instant future retrieval
  if (content) {
    console.log(`[ollama-cached] Attempting to cache response (${content.length} chars)`);
    try {
      await setExactMatchCache(cacheKey, {
        content,
        model,
        backend: 'llama-server-direct',
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
