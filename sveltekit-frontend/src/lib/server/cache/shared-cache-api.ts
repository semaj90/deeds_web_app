/**
 * Shared Redis Cache API — 4 Reusable Patterns
 *
 * Consolidates 242 files using fragmented Redis patterns.
 * All patterns use ioredis connection pool + Zod validation + graceful fallback.
 */

import { getRedis } from '$lib/server/redis';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════
// Pattern 1: Generic Set/Get with TTL
// ═══════════════════════════════════════════════════════════════════════

export async function cacheTTL<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
  options?: {
    schema?: z.ZodSchema<T>;
    onMiss?: (key: string) => void;
    onError?: (err: Error) => void;
  }
): Promise<T> {
  const redis = getRedis();

  try {
    // Try cache first
    const cached = await redis.get(key).catch(() => null);
    if (cached) {
      try {
        const parsed = options?.schema
          ? options.schema.parse(JSON.parse(cached))
          : JSON.parse(cached);
        return parsed;
      } catch (parseErr) {
        // Invalid cache entry — continue to recompute
        redis.del(key).catch(() => {});
      }
    }

    options?.onMiss?.(key);
  } catch (err) {
    options?.onError?.(err as Error);
    // Continue to compute if cache read fails
  }

  // Cache miss — compute value
  const value = await compute();

  // Store in cache (fire-and-forget)
  redis.setex(key, ttlSeconds, JSON.stringify(value)).catch((err) => {
    console.error(`[cacheTTL] setex failed for ${key}:`, err);
  });

  return value;
}

// ═══════════════════════════════════════════════════════════════════════
// Pattern 2: Hash Field Operations
// ═══════════════════════════════════════════════════════════════════════

export async function cacheHashMap<K extends string, V>(
  hashKey: string,
  fieldKey: K,
  compute: () => Promise<V>,
  options?: {
    ttlSeconds?: number;
    schema?: z.ZodSchema<V>;
    onMiss?: (key: string, field: K) => void;
    onError?: (err: Error) => void;
  }
): Promise<V> {
  const redis = getRedis();

  try {
    const cached = await redis.hget(hashKey, fieldKey).catch(() => null);
    if (cached) {
      try {
        const parsed = options?.schema
          ? options.schema.parse(JSON.parse(cached))
          : JSON.parse(cached);
        return parsed;
      } catch (parseErr) {
        redis.hdel(hashKey, fieldKey).catch(() => {});
      }
    }

    options?.onMiss?.(hashKey, fieldKey);
  } catch (err) {
    options?.onError?.(err as Error);
  }

  const value = await compute();

  // Store in hash (fire-and-forget)
  redis.hset(hashKey, fieldKey, JSON.stringify(value)).catch((err) => {
    console.error(`[cacheHashMap] hset failed for ${hashKey}:${fieldKey}:`, err);
  });

  // Optional: set hash expiration
  if (options?.ttlSeconds) {
    redis.expire(hashKey, options.ttlSeconds).catch(() => {});
  }

  return value;
}

// ═══════════════════════════════════════════════════════════════════════
// Pattern 3: Batch Operations with Fallback
// ═══════════════════════════════════════════════════════════════════════

export async function cacheGetBatch<T>(
  keys: string[],
  compute: (missingKeys: string[]) => Promise<Record<string, T>>,
  options?: {
    schema?: z.ZodSchema<T>;
    ttlSeconds?: number;
    onMissAll?: (keys: string[]) => void;
    onPartial?: (hits: number, misses: number) => void;
    onError?: (err: Error) => void;
  }
): Promise<Record<string, T>> {
  const redis = getRedis();
  const result: Record<string, T> = {};
  const missing: string[] = [];

  // Try batch cache read
  try {
    const cached = await redis.mget(keys).catch(() => []);

    keys.forEach((key, i) => {
      if (cached[i]) {
        try {
          const parsed = options?.schema
            ? options.schema.parse(JSON.parse(cached[i]))
            : JSON.parse(cached[i]);
          result[key] = parsed;
        } catch (parseErr) {
          missing.push(key);
        }
      } else {
        missing.push(key);
      }
    });

    if (missing.length > 0 && missing.length < keys.length) {
      options?.onPartial?.(keys.length - missing.length, missing.length);
    } else if (missing.length === keys.length) {
      options?.onMissAll?.(keys);
    }
  } catch (err) {
    options?.onError?.(err as Error);
    // Cache read failed, compute all
    missing.push(...keys);
  }

  // Compute missing values
  if (missing.length > 0) {
    const computed = await compute(missing);
    Object.entries(computed).forEach(([k, v]) => {
      result[k] = v;

      // Store in cache (fire-and-forget)
      if (options?.ttlSeconds) {
        redis.setex(k, options.ttlSeconds, JSON.stringify(v)).catch(() => {});
      } else {
        redis.set(k, JSON.stringify(v)).catch(() => {});
      }
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Pattern 4: Invalidation Registry (Event-Driven + Cascade)
// ═══════════════════════════════════════════════════════════════════════

export class InvalidationRegistry {
  private registry: Map<string, (ev?: any) => string[] | Promise<string[]>> = new Map();
  private dependencies: Map<string, Set<string>> = new Map(); // child → parents

  register(
    event: string,
    affectedKeys: string[] | ((ev: any) => string[]) | ((ev: any) => Promise<string[]>)
  ): void {
    if (Array.isArray(affectedKeys)) {
      this.registry.set(event, () => affectedKeys);
    } else {
      this.registry.set(event, affectedKeys);
    }
  }

  async invalidate(event: string, eventData?: any): Promise<number> {
    const redis = getRedis();
    const resolver = this.registry.get(event);
    if (!resolver) {
      console.warn(`[InvalidationRegistry] Unknown event: ${event}`);
      return 0;
    }

    try {
      const keysToInvalidate = await Promise.resolve(resolver(eventData));
      if (keysToInvalidate.length === 0) {
        return 0;
      }

      // Delete keys
      await redis.del(...keysToInvalidate).catch(() => {});

      // Cascade to dependent keys
      const cascaded = new Set<string>();
      for (const key of keysToInvalidate) {
        const dependents = await this.cascade(key);
        dependents.forEach((dep) => cascaded.add(dep));
      }

      if (cascaded.size > 0) {
        await redis.del(...Array.from(cascaded)).catch(() => {});
      }

      return keysToInvalidate.length + cascaded.size;
    } catch (err) {
      console.error(`[InvalidationRegistry] invalidate failed for ${event}:`, err);
      return 0;
    }
  }

  async cascade(rootKey: string): Promise<Set<string>> {
    const visited = new Set<string>();
    const queue = [rootKey];

    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);

      const dependents = this.dependencies.get(key);
      if (dependents) {
        queue.push(...dependents);
      }
    }

    // Remove the root key itself from visited
    visited.delete(rootKey);
    return visited;
  }

  async setDependency(childKey: string, parentKey: string): Promise<void> {
    if (!this.dependencies.has(parentKey)) {
      this.dependencies.set(parentKey, new Set());
    }
    this.dependencies.get(parentKey)!.add(childKey);
  }

  async getAffectedKeys(event: string): Promise<string[]> {
    const resolver = this.registry.get(event);
    if (!resolver) return [];
    return Promise.resolve(resolver());
  }
}

// Singleton instance
export const invalidationRegistry = new InvalidationRegistry();
