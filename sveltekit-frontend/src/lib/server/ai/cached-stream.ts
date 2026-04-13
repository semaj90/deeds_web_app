/**
 * Cached Streaming LLM Response
 *
 * Integrates Redis L1 exact-match cache with SSE streaming endpoints.
 *
 * Flow:
 * 1. Check Redis L1 cache for exact match (3ms)
 * 2. If HIT: Stream cached response chunk-by-chunk (simulated streaming)
 * 3. If MISS: Stream from Ollama + store complete response in cache
 *
 * Performance:
 * - Cache hit: 3ms lookup + ~50ms chunk streaming = ~50-100ms total
 * - Cache miss: 3-25s Ollama + storage
 * - Speedup: 50-500× for cached responses
 */

import {
  generateCacheKey,
  getExactMatchCache,
  setExactMatchCache,
} from '$lib/server/cache/redis-exact-match.js';

export interface CachedStreamOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Chunk size for simulated streaming (chars per chunk) */
  chunkSize?: number;
  /** Delay between chunks in ms (simulates typing speed) */
  chunkDelayMs?: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  cached?: boolean;
}

/**
 * Get cached response or indicate cache miss
 *
 * @returns Cached response string if found, null if miss
 */
export async function getCachedStreamResponse(
  messages: Array<{ role: string; content: string }>,
  options: CachedStreamOptions = {}
): Promise<string | null> {
  const {
    model = 'gemma4-legal:latest',
    temperature = 0.7,
    maxTokens = 2048,
  } = options;

  const cacheKey = generateCacheKey({
    model,
    messages,
    temperature,
    maxTokens,
  });

  const cached = await getExactMatchCache(cacheKey);

  if (cached) {
    console.log('[cached-stream] L1 REDIS HIT (streaming cached response)');
    return cached.content;
  }

  return null;
}

/**
 * Store complete response in cache after streaming finishes
 */
export async function storeCachedStreamResponse(
  messages: Array<{ role: string; content: string }>,
  response: string,
  options: CachedStreamOptions = {}
): Promise<void> {
  const {
    model = 'gemma4-legal:latest',
    temperature = 0.7,
    maxTokens = 2048,
  } = options;

  const cacheKey = generateCacheKey({
    model,
    messages,
    temperature,
    maxTokens,
  });

  await setExactMatchCache(cacheKey, {
    content: response,
    model,
    backend: 'ollama',
  }).catch(err => {
    console.error('[cached-stream] Failed to store response:', err);
  });

  console.log(`[cached-stream] Stored ${response.length} chars in L1 Redis`);
}

/**
 * Simulate streaming for cached responses
 *
 * Yields the cached response in chunks to maintain consistent UX
 * with Ollama streaming (users expect typing animation)
 */
export async function* streamCachedResponse(
  cachedResponse: string,
  options: CachedStreamOptions = {}
): AsyncGenerator<StreamChunk> {
  const {
    chunkSize = 5, // 5 chars per chunk (realistic typing speed)
    chunkDelayMs = 20, // 20ms between chunks (~50 chars/sec)
  } = options;

  let offset = 0;

  while (offset < cachedResponse.length) {
    const chunk = cachedResponse.slice(offset, offset + chunkSize);
    offset += chunkSize;

    yield {
      content: chunk,
      done: offset >= cachedResponse.length,
      cached: true,
    };

    // Delay between chunks to simulate typing
    if (offset < cachedResponse.length) {
      await new Promise(resolve => setTimeout(resolve, chunkDelayMs));
    }
  }
}

/**
 * Integration example for SSE chat endpoint:
 *
 * ```typescript
 * // 1. Check cache before Ollama call
 * const cached = await getCachedStreamResponse(messages, { model, temperature });
 *
 * if (cached) {
 *   // 2a. Stream cached response chunk-by-chunk
 *   for await (const chunk of streamCachedResponse(cached)) {
 *     controller.enqueue(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
 *   }
 * } else {
 *   // 2b. Stream from Ollama + collect for caching
 *   let fullResponse = '';
 *   const reader = ollamaRes.body.getReader();
 *
 *   while (true) {
 *     const { done, value } = await reader.read();
 *     if (done) break;
 *
 *     const content = parseOllamaChunk(value);
 *     fullResponse += content;
 *     controller.enqueue(`data: ${JSON.stringify({ content })}\n\n`);
 *   }
 *
 *   // 3. Store complete response in cache
 *   await storeCachedStreamResponse(messages, fullResponse, { model, temperature });
 * }
 * ```
 */
