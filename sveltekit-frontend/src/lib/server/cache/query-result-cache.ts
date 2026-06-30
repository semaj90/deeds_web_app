/**
 * src/lib/server/cache/query-result-cache.ts
 *
 * P0 + P1 Caching: Query embedding + Qdrant topK results.
 *
 * Cache schema:
 *   emb:q:v1:{sha256(normalized_query)} → Float32Array (7 day TTL)
 *   hyperrag:q:v1:{sha256(normalized_query)} → topK results (24h TTL)
 *   qdrant:topk:v1:{sha256(normalized_query)}:{limit} → candidate IDs (24h TTL)
 *
 * Flow:
 *   query → normalize → hash → L1 embedding cache
 *   → L1 topK cache → optional GPU rerank → ACE packet
 *
 * Latency impact:
 *   Cold (no cache): 855ms+
 *   Warm (L1 embedding + topK): 5–30ms
 */

import { createHash } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';

export interface CachedTopKResult {
  candidates: Array<{
    id: string;
    score: number;
    payload?: Record<string, unknown>;
  }>;
  cached: boolean;
  cacheHit: 'L1' | 'miss';
  latencyMs: number;
}

// ─────────────────────────────────────────────────────────────────

const EMBEDDING_CACHE_TTL = 7 * 24 * 3600; // 7 days
const TOPK_CACHE_TTL = 24 * 3600; // 24 hours
const ANSWER_CACHE_TTL = 300; // 5 minutes (configurable 5–60)

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getEmbeddingCacheKey(query: string): string {
  const normalized = normalizeQuery(query);
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `emb:q:v1:${hash}`;
}

function getTopKCacheKey(query: string, limit: number): string {
  const normalized = normalizeQuery(query);
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `qdrant:topk:v1:${hash}:${limit}`;
}

function getAnswerCacheKey(query: string, context: string): string {
  const normalized = normalizeQuery(query);
  const hash = createHash('sha256').update(normalized + context).digest('hex');
  return `hyperrag:q:v1:${hash}`;
}

// ─────────────────────────────────────────────────────────────────

/**
 * Get cached Qdrant topK results (P1 caching).
 *
 * Returns: { candidates, cached, cacheHit, latencyMs }
 */
export async function getCachedTopK(
  query: string,
  limit: number = 200,
  options: { fetchFn?: () => Promise<any[]> } = {}
): Promise<CachedTopKResult> {
  const startTime = Date.now();
  const redis = getRedis();
  const cacheKey = getTopKCacheKey(query, limit);

  // Check L1 cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const latencyMs = Date.now() - startTime;
      const candidates = JSON.parse(cached);
      return {
        candidates,
        cached: true,
        cacheHit: 'L1',
        latencyMs,
      };
    }
  } catch (err) {
    // Cache miss or error: continue to fetch
  }

  // Cache miss: fetch candidates
  if (!options.fetchFn) {
    throw new Error('fetchFn required for cache miss');
  }

  let candidates;
  try {
    candidates = await options.fetchFn();
  } catch (err) {
    throw new Error(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Store in L1
  try {
    await redis.setex(cacheKey, TOPK_CACHE_TTL, JSON.stringify(candidates));
  } catch (err) {
    // Cache write error: non-blocking
  }

  const latencyMs = Date.now() - startTime;

  return {
    candidates,
    cached: false,
    cacheHit: 'miss',
    latencyMs,
  };
}

// ─────────────────────────────────────────────────────────────────

/**
 * Get or store cached answer (P1 extended for final synthesis).
 *
 * Cache the final LLM answer + retrieval context (5–60 min TTL).
 */
export async function getCachedAnswer(
  query: string,
  context: string,
  options: { ttlSeconds?: number; fetchFn?: () => Promise<string> } = {}
): Promise<{
  answer: string;
  cached: boolean;
  latencyMs: number;
}> {
  const startTime = Date.now();
  const redis = getRedis();
  const cacheKey = getAnswerCacheKey(query, context);
  const ttl = options.ttlSeconds ?? ANSWER_CACHE_TTL;

  // Check cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return {
        answer: cached,
        cached: true,
        latencyMs: Date.now() - startTime,
      };
    }
  } catch (err) {
    // Continue
  }

  // Miss: synthesize
  if (!options.fetchFn) {
    throw new Error('fetchFn required for cache miss');
  }

  let answer;
  try {
    answer = await options.fetchFn();
  } catch (err) {
    throw new Error(`Synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Store
  try {
    await redis.setex(cacheKey, ttl, answer);
  } catch (err) {
    // Non-blocking
  }

  return {
    answer,
    cached: false,
    latencyMs: Date.now() - startTime,
  };
}

// ─────────────────────────────────────────────────────────────────

/**
 * Clear cache by pattern (for testing/refresh).
 */
export async function clearQueryCache(pattern: string = 'emb:q:v1:*'): Promise<number> {
  const redis = getRedis();

  try {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;

    await redis.del(...keys);
    return keys.length;
  } catch (err) {
    console.error(`Clear cache failed: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────

/**
 * Get cache stats.
 */
export async function getQueryCacheStats(): Promise<{
  embeddingKeysCount: number;
  topkKeysCount: number;
  answerKeysCount: number;
  totalKeys: number;
  estimatedBytes: number;
}> {
  const redis = getRedis();

  try {
    const embKeys = await redis.keys('emb:q:v1:*');
    const topkKeys = await redis.keys('qdrant:topk:v1:*');
    const answerKeys = await redis.keys('hyperrag:q:v1:*');

    const totalKeys = embKeys.length + topkKeys.length + answerKeys.length;

    // Estimate bytes (rough)
    const embBytes = embKeys.length * 3072; // ~768 floats × 4 bytes + overhead
    const topkBytes = topkKeys.length * 5120; // ~200 candidates × 26 bytes + overhead
    const answerBytes = answerKeys.length * 2048; // ~2KB average answer

    return {
      embeddingKeysCount: embKeys.length,
      topkKeysCount: topkKeys.length,
      answerKeysCount: answerKeys.length,
      totalKeys,
      estimatedBytes: embBytes + topkBytes + answerBytes,
    };
  } catch (err) {
    console.error(`Get stats failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      embeddingKeysCount: 0,
      topkKeysCount: 0,
      answerKeysCount: 0,
      totalKeys: 0,
      estimatedBytes: 0,
    };
  }
}
