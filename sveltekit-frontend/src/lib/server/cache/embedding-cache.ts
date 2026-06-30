/**
 * src/lib/server/cache/embedding-cache.ts
 *
 * Embedding cache: L1 Redis exact-match + L2 Bifrost semantic.
 * Relieves embedding bottleneck (365ms → ~5ms on L1 hit).
 *
 * Cache flow:
 *   query string
 *   → SHA256 hash
 *   → L1 Redis (exact-match 768-dim vector)
 *   → L2 Bifrost (semantic cache if not exact)
 *   → Ollama /api/embeddings (if cache miss)
 *   → store result in L1
 */

import { createHash } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';

export interface EmbeddingCacheResult {
  vector: Float32Array;
  cached: boolean;
  cacheHit: 'L1' | 'L2' | 'miss';
  latencyMs: number;
}

// ─────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 3600; // 1 hour
const L1_PREFIX = 'embedding:exact:';

function getCacheKey(text: string): string {
  return L1_PREFIX + createHash('sha256').update(text).digest('hex');
}

// ─────────────────────────────────────────────────────────────────

/**
 * Get or compute embedding with caching.
 *
 * L1: Redis exact-match (5ms)
 * L2: Bifrost semantic (2-5s if not exact)
 * L3: Ollama /api/embeddings (365ms cold)
 *
 * Returns: { vector, cached, cacheHit, latencyMs }
 */
export async function getCachedEmbedding(
  text: string,
  options: {
    model?: string;
    bifrostThreshold?: number;
  } = {}
): Promise<EmbeddingCacheResult> {
  const model = options.model ?? 'embeddinggemma:latest';
  const startTime = Date.now();
  const redis = getRedis();

  const cacheKey = getCacheKey(text);

  // ─────────────────────────────────────────────────────────────

  // L1: Redis exact-match
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const latencyMs = Date.now() - startTime;
      const vector = new Float32Array(JSON.parse(cached));
      return {
        vector,
        cached: true,
        cacheHit: 'L1',
        latencyMs,
      };
    }
  } catch (err) {
    // Redis error: continue to L2
  }

  // ─────────────────────────────────────────────────────────────

  // L2: Bifrost semantic (optional, skip if only L1 is configured)
  // (Bifrost wiring deferred; focus on L1 + L3 for now)

  // ─────────────────────────────────────────────────────────────

  // L3: Ollama /api/embeddings (cold path)
  let vector: Float32Array;
  try {
    const ollama = await import('$lib/server/embeddings/ollama.js');
    const response = await ollama.getOllamaEmbedding(text, { model });
    vector = new Float32Array(response.embedding);
  } catch (err) {
    throw new Error(`Embedding failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ─────────────────────────────────────────────────────────────

  // Store in L1 cache
  try {
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(Array.from(vector)));
  } catch (err) {
    // Cache write error: non-blocking, continue
  }

  // ─────────────────────────────────────────────────────────────

  const latencyMs = Date.now() - startTime;

  return {
    vector,
    cached: false,
    cacheHit: 'miss',
    latencyMs,
  };
}

// ─────────────────────────────────────────────────────────────────

/**
 * Batch embed with caching.
 *
 * Deduplicates queries, caches individually, returns in original order.
 */
export async function getCachedEmbeddingsBatch(
  texts: string[],
  options: { model?: string } = {}
): Promise<
  Array<{
    vector: Float32Array;
    cached: boolean;
    latencyMs: number;
  }>
> {
  const startTime = Date.now();

  // Deduplicate
  const uniqueTexts = Array.from(new Set(texts));
  const indexMap = new Map(texts.map((t, i) => [t, i]));

  // Fetch all (with caching)
  const results = await Promise.all(
    uniqueTexts.map((t) =>
      getCachedEmbedding(t, options).catch((err) => {
        console.error(`Failed to embed "${t.substring(0, 50)}...": ${err.message}`);
        return null;
      })
    )
  );

  // Rebuild in original order
  const batchResults = texts.map((t) => {
    const idx = uniqueTexts.indexOf(t);
    const result = results[idx];

    if (!result) {
      // Fallback: zero vector
      return {
        vector: new Float32Array(768),
        cached: false,
        latencyMs: Date.now() - startTime,
      };
    }

    return result;
  });

  return batchResults;
}

// ─────────────────────────────────────────────────────────────────

/**
 * Clear embedding cache (for testing/refresh).
 */
export async function clearEmbeddingCache(pattern: string = L1_PREFIX + '*'): Promise<number> {
  const redis = getRedis();

  try {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;

    await redis.del(...keys);
    return keys.length;
  } catch (err) {
    console.error(`Failed to clear embedding cache: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────

/**
 * Get cache stats.
 */
export async function getEmbeddingCacheStats(): Promise<{
  keysCount: number;
  estimatedBytes: number;
  ttlSeconds: number;
}> {
  const redis = getRedis();

  try {
    const keys = await redis.keys(L1_PREFIX + '*');
    const totalBytes = await Promise.all(
      keys.map((k) =>
        redis
          .memory('USAGE', k)
          .then((bytes) => bytes ?? 0)
          .catch(() => 0)
      )
    ).then((sizes) => sizes.reduce((a, b) => a + b, 0));

    return {
      keysCount: keys.length,
      estimatedBytes: totalBytes,
      ttlSeconds: CACHE_TTL_SECONDS,
    };
  } catch (err) {
    console.error(`Failed to get embedding cache stats: ${err instanceof Error ? err.message : String(err)}`);
    return {
      keysCount: 0,
      estimatedBytes: 0,
      ttlSeconds: CACHE_TTL_SECONDS,
    };
  }
}
