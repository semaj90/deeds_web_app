/**
 * Redis Cache Invalidation Service
 * Invalidates BitFrost L1/L2 cache after Postgres writes.
 *
 * 2026-09-04 (BITFROST-INVALIDATION-OWNER-01): this module's own key patterns
 * (bifrost:packet:*, bifrost:trace:*, bifrost:source:*, bifrost:feature:*)
 * were confirmed live-absent from Redis -- a `--scan` sweep across all 4
 * returned zero matches repo-wide. Delegates to the canonical
 * invalidateBitfrostPacket() (src/lib/server/cache/atlas-reward-cache.ts)
 * instead of maintaining its own second copy of the key logic. See
 * docs/reports/parent-atlas-bitfrost-invalidation-owner-v1.json.
 */

import type Redis from 'ioredis';
import { invalidateBitfrostPacket } from '$lib/server/cache/atlas-reward-cache.js';

export interface CacheInvalidationResult {
  invalidated: number;
  patterns: string[];
  key_count: number;
  duration_ms: number;
  errors: string[];
}

/**
 * Invalidate BitFrost cache after canonical packet updates. Delegates per-packet
 * to invalidateBitfrostPacket() (semantic packet + summary + feature keys) and
 * aggregates the results into this function's existing return shape so its
 * (currently unreached) caller does not need to change.
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

  for (const packet of packets) {
    const result = await invalidateBitfrostPacket(redis, {
      packetKey: packet.packet_key,
      featureId: packet.feature_id,
    });
    patterns.push(...result.deletedKeys);
    keyCount += result.keysAttempted;
    invalidated += result.keysDeleted;
    if (!result.ok && result.error) {
      errors.push(`Key deletion error for ${packet.packet_key}: ${result.error}`);
    }
  }

  if (patterns.length > 0) {
    console.log(
      `[redis-cache-invalidate] Invalidated ${invalidated} keys across ${packets.length} packets`
    );
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
 *
 * NOTE (2026-09-04, BITFROST-INVALIDATION-OWNER-01 audit): this function still
 * writes the same non-live `bifrost:packet:*` shape as the pre-fix
 * invalidateRedisCache() above. Left as-is -- this gate's scope is invalidation
 * correctness, not warming, and this function's own caller chain is unreached
 * (see the owner-audit report). Flagged, not fixed, per this repo's "record
 * what you found even when you don't fix it" rule.
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
