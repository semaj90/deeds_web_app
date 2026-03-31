import type Redis from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';
import { cacheMetrics } from '$lib/server/cache-metrics.js';

const SHOULD_USE_REDIS =
  process.env.CACHE_BACKEND === 'redis' ||
  process.env.USE_REDIS === 'true' ||
  Boolean(process.env.REDIS_URL);

export const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;
export const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();

const RATE_LIMIT_TOKENS = Number(process.env.CACHE_RATE_LIMIT_TOKENS ?? 10);
const RATE_LIMIT_REFILL_MS = Number(process.env.CACHE_RATE_LIMIT_REFILL_MS ?? 60_000);

const REDIS_MAX_RETRIES = Number(process.env.REDIS_OP_MAX_RETRIES ?? 3);
const REDIS_BASE_DELAY_MS = Number(process.env.REDIS_OP_BASE_DELAY_MS ?? 200);
const REDIS_TIMEOUT_MS = Number(process.env.REDIS_OP_TIMEOUT_MS ?? 5000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < REDIS_MAX_RETRIES) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis op timeout')), REDIS_TIMEOUT_MS)
        ),
      ]);
      return result;
    } catch (err) {
      lastErr = err;
      attempt += 1;
      await sleep(REDIS_BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Redis operation failed');
}

export async function getRedisClient(): Promise<Redis | null> {
  if (!SHOULD_USE_REDIS) return null;
  try {
    return getRedis();
  } catch (err) {
    console.warn('[cache] Failed to get Redis from pool:', err);
    return null;
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlMs: number = MEMORY_CACHE_TTL_MS
): Promise<void> {
  const expiresAt = Date.now() + Math.max(ttlMs, 1);
  memoryCache.set(key, { value, expiresAt });

  const client = await getRedisClient();
  if (!client) return;

  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  const exSeconds = Math.max(1, Math.ceil(ttlMs / 1000));

  const start = performance.now();
  try {
    await withBackoff(() => client.set(key, payload, 'EX', exSeconds));
    const elapsed = performance.now() - start;
    cacheMetrics.recordRedisLatency(elapsed);
    if (elapsed > 500) {
      console.warn(`[cache] Slow Redis SET: ${key.slice(0, 60)} took ${Math.round(elapsed)}ms`);
    }
  } catch (err) {
    cacheMetrics.recordRedisLatency(performance.now() - start);
    console.warn('[cache] Redis SET failed (best-effort):', err);
  }
}

export function getFromMemoryCache(key: string): {
  found: boolean;
  value?: unknown;
} {
  const entry = memoryCache.get(key);
  if (!entry) {
    cacheMetrics.recordMiss('memory', key);
    return { found: false };
  }

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    cacheMetrics.recordMiss('memory', key);
    return { found: false };
  }

  cacheMetrics.recordHit('memory', key);
  return { found: true, value: entry.value };
}

const TOKEN_BUCKET_MAX_ENTRIES = 10_000;
const tokenBuckets = new Map<string, { tokens: number; lastRefill: number }>();

// Periodic cleanup: evict stale buckets every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of tokenBuckets) {
    // Bucket is stale if it hasn't been refilled in 2 windows
    if (now - bucket.lastRefill > RATE_LIMIT_REFILL_MS * 2) {
      tokenBuckets.delete(key);
    }
  }
}, 60_000).unref();

export function checkRateLimit(key = 'global'): {
  ok: boolean;
  remaining: number;
} {
  const now = Date.now();
  const bucket = tokenBuckets.get(key) ?? { tokens: RATE_LIMIT_TOKENS, lastRefill: now };
  const elapsed = now - bucket.lastRefill;

  if (elapsed > 0) {
    const refill = Math.floor(elapsed / RATE_LIMIT_REFILL_MS) * RATE_LIMIT_TOKENS;
    if (refill > 0) {
      bucket.tokens = Math.min(RATE_LIMIT_TOKENS, bucket.tokens + refill);
      bucket.lastRefill = now;
    }
  }

  if (bucket.tokens <= 0) {
    tokenBuckets.set(key, bucket);
    return { ok: false, remaining: 0 };
  }

  // Enforce max entries — evict oldest if at capacity
  if (!tokenBuckets.has(key) && tokenBuckets.size >= TOKEN_BUCKET_MAX_ENTRIES) {
    const oldest = tokenBuckets.keys().next().value;
    if (oldest) tokenBuckets.delete(oldest);
  }

  bucket.tokens -= 1;
  tokenBuckets.set(key, bucket);
  return { ok: true, remaining: bucket.tokens };
}

export async function redisRateLimit(
  key = 'global',
  maxRequests = RATE_LIMIT_TOKENS,
  windowMs = RATE_LIMIT_REFILL_MS
): Promise<{
  ok: boolean;
  remaining: number;
}> {
  const client = await getRedisClient();
  if (!client) {
    return checkRateLimit(key);
  }

  const redisKey = `rate:${key}`;

  try {
    const current = await withBackoff(async () => {
      const count = await client.incr(redisKey);
      if (count === 1) {
        await client.expire(redisKey, Math.max(1, Math.ceil(windowMs / 1000)));
      }
      return count;
    });

    const remaining = Math.max(0, maxRequests - Number(current));
    return { ok: Number(current) <= maxRequests, remaining };
  } catch (err) {
    console.warn('[cache] Redis rate limit failed, falling back to memory limiter:', err);
    return checkRateLimit(key);
  }
}

export const cognitiveCache = {
  async getJsonbDocument<T>(key: string): Promise<T | null> {
    const mem = getFromMemoryCache(key);
    if (mem.found) {
      return mem.value as T;
    }

    const client = await getRedisClient();
    if (!client) return null;

    const start = performance.now();
    try {
      const result = await withBackoff(() => client.get(key));
      cacheMetrics.recordRedisLatency(performance.now() - start);
      if (!result || typeof result !== 'string') {
        cacheMetrics.recordMiss('redis', key);
        return null;
      }
      cacheMetrics.recordHit('redis', key);
      return fastJsonParse<T>(result);
    } catch (err) {
      cacheMetrics.recordRedisLatency(performance.now() - start);
      cacheMetrics.recordMiss('redis', key);
      console.warn('[cache] Redis GET failed:', err);
      return null;
    }
  },
  async storeJsonbDocument(key: string, value: unknown, ttlSeconds = 60 * 60): Promise<void> {
    await setCache(key, value, Math.max(1, ttlSeconds) * 1000);
  },
};

/**
 * Instrumented Redis GET — records hit/miss + latency in cacheMetrics.
 * Returns parsed JSON or null. Use for structured cache lookups.
 */
export async function getFromRedisCache<T = unknown>(key: string): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) {
    cacheMetrics.recordMiss('redis', key);
    return null;
  }

  const start = performance.now();
  try {
    const raw = await withBackoff(() => client.get(key));
    cacheMetrics.recordRedisLatency(performance.now() - start);
    if (!raw) {
      cacheMetrics.recordMiss('redis', key);
      return null;
    }
    cacheMetrics.recordHit('redis', key);
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch {
    cacheMetrics.recordRedisLatency(performance.now() - start);
    cacheMetrics.recordMiss('redis', key);
    return null;
  }
}
