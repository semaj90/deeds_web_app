/**
 * Redis Cache Invalidation Service
 * Invalidates BitFrost L1/L2 cache after Postgres writes
 * Manages 4 key patterns per packet: packet, trace, source_ref, feature
 */

import type Redis from 'ioredis';

interface CacheInvalidationResult {
  invalidated: number;
  patterns: string[];
  key_count: number;
  duration_ms: number;
  errors: string[];
}

/**
 * Invalidate Redis cache after canonical packet updates
 * Covers 4 key patterns:
 *   - bifrost:packet:{packet_key}
 *   - bifrost:trace:{packet_key}
 *   - bifrost:source:{source_ref}
 *   - bifrost:feature:{feature_id}
 *
 * @param redis — ioredis client
 * @param packets — Packet data with keys to invalidate
 * @returns Invalidation result with key counts
 */
export async function invalidateRedisCache(
  redis: Redis,
  packets: Array<{
    packet_key: string;
    source_ref: string;
    feature_id: string;
  }>
): Promise<CacheInvalidationResult> {
  const startMs = Date.now();
  const patterns: string[] = [];
  let invalidated = 0;
  let keyCount = 0;
  const errors: string[] = [];

  try {
    // Collect all keys to delete
    const keysToDelete: string[] = [];

    for (const packet of packets) {
      // Pattern 1: packet cache
      const packetKey = `bifrost:packet:${packet.packet_key}`;
      keysToDelete.push(packetKey);
      patterns.push(packetKey);

      // Pattern 2: trace cache
      const traceKey = `bifrost:trace:${packet.packet_key}`;
      keysToDelete.push(traceKey);
      patterns.push(traceKey);

      // Pattern 3: source_ref cache
      const sourceKey = `bifrost:source:${packet.source_ref}`;
      keysToDelete.push(sourceKey);
      patterns.push(sourceKey);

      // Pattern 4: feature cache
      const featureKey = `bifrost:feature:${packet.feature_id}`;
      keysToDelete.push(featureKey);
      patterns.push(featureKey);
    }

    // Deduplicate keys
    const uniqueKeys = [...new Set(keysToDelete)];
    keyCount = uniqueKeys.length;

    // Batch delete via Redis pipeline
    if (uniqueKeys.length > 0) {
      const pipeline = redis.pipeline();

      for (const key of uniqueKeys) {
        pipeline.del(key);
      }

      const results = await pipeline.exec();

      // Count successful deletions
      if (results) {
        invalidated = results.reduce((sum, [err, val]) => {
          if (err) {
            errors.push(`Key deletion error: ${String(err)}`);
          }
          return sum + (typeof val === 'number' ? val : 0);
        }, 0);
      }

      console.log(
        `[redis-cache-invalidate] Invalidated ${invalidated} keys from ${uniqueKeys.length} unique patterns`
      );
    }
  } catch (err) {
    const errMsg = `Redis invalidation failed: ${String(err)}`;
    errors.push(errMsg);
    console.error(`[redis-cache-invalidate] ${errMsg}`);
  }

  const durationMs = Date.now() - startMs;
  return {
    invalidated,
    patterns,
    key_count: keyCount,
    duration_ms: durationMs,
    errors,
  };
}

/**
 * Warm Redis cache with canonical packets
 * Stores packet envelopes in BitFrost L1 cache
 *
 * @param redis — ioredis client
 * @param packets — Packet data to cache
 * @param ttlSeconds — Cache TTL (default: 3600s = 1 hour)
 * @returns Warming result with cache counts
 */
export async function warmRedisCache(
  redis: Redis,
  packets: Array<{
    packet_key: string;
    source_ref: string;
    feature_id: string;
    summary?: string;
    identity_lane?: string;
    confidence?: number;
  }>,
  ttlSeconds: number = 3600
): Promise<{
  cached: number;
  failed: number;
  duration_ms: number;
  errors: string[];
}> {
  const startMs = Date.now();
  let cached = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    const pipeline = redis.pipeline();

    for (const packet of packets) {
      const key = `bifrost:packet:${packet.packet_key}`;
      const value = JSON.stringify({
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        feature_id: packet.feature_id,
        summary: packet.summary || '',
        identity_lane: packet.identity_lane || 'canonical',
        confidence: packet.confidence ?? 0.95,
        cached_at: new Date().toISOString(),
      });

      pipeline.setex(key, ttlSeconds, value);
    }

    const results = await pipeline.exec();

    if (results) {
      cached = results.reduce((sum, [err, val]) => {
        if (err) {
          errors.push(`Cache set error: ${String(err)}`);
          failed++;
        }
        return sum + (val === 'OK' ? 1 : 0);
      }, 0);
    }

    console.log(`[redis-cache-warm] Cached ${cached} packets with TTL ${ttlSeconds}s`);
  } catch (err) {
    const errMsg = `Redis cache warming failed: ${String(err)}`;
    errors.push(errMsg);
    console.error(`[redis-cache-warm] ${errMsg}`);
  }

  const durationMs = Date.now() - startMs;
  return {
    cached,
    failed,
    duration_ms: durationMs,
    errors,
  };
}

/**
 * Validate Redis connectivity and cache health
 */
export async function validateRedisHealth(redis: Redis): Promise<{
  healthy: boolean;
  key_count: number;
  memory_bytes: number;
  error?: string;
}> {
  try {
    // Check connectivity
    await redis.ping();

    // Get key count
    const dbSize = await redis.dbsize();

    // Get memory usage
    const memoryStats = await redis.info('memory');
    const memoryUsedMatch = memoryStats.match(/used_memory:(\d+)/);
    const memoryBytes = memoryUsedMatch ? parseInt(memoryUsedMatch[1], 10) : 0;

    return {
      healthy: true,
      key_count: dbSize,
      memory_bytes: memoryBytes,
    };
  } catch (err) {
    return {
      healthy: false,
      key_count: 0,
      memory_bytes: 0,
      error: String(err),
    };
  }
}
