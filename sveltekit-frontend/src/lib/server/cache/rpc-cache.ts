/**
 * SNES RPC Cache Bus — Redis-backed helper (server-only)
 *
 * withRpcCache() wraps any async compute function with:
 *   1. Stable args hash → Redis key
 *   2. Redis GET → return immediately on hit (L1)
 *   3. Miss → compute(), SET with TTL, return RpcCacheResult
 *
 * Used by:
 *   - gRPC retrieval wrappers (retrieval-client.ts)
 *   - MCP read-only tool dispatcher (mcp/server.ts)
 *   - GPU topology cache helpers
 *   - SvelteKit Remote Function reads (.remote.ts)
 */

import { createHash } from 'crypto';
import { getRedis } from '$lib/server/redis.js';
import type { RpcCacheResult, RpcHitLevel, RpcProvenance, RpcTransport } from '$lib/types/rpc-cache.js';

const SCHEMA_VERSION = 1;

// ── Stable hash ────────────────────────────────────────────────────────────

export function stableHash(args: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(args))
    .digest('hex')
    .slice(0, 16);
}

// ── Core wrapper ───────────────────────────────────────────────────────────

export interface RpcCacheOptions {
  transport: RpcTransport;
  method: string;
  ttlSeconds: number;
  /** If set, deadline exceeded kills the compute promise (ms) */
  deadlineMs?: number;
}

/**
 * Wrap any async compute with L1 Redis cache.
 *
 * Returns { value, cache: { hit, hitLevel, key, ttlSeconds } }.
 * Never throws — on Redis failure it falls through to compute().
 */
export async function withRpcCache<T>(
  args: unknown,
  compute: () => Promise<T>,
  opts: RpcCacheOptions,
  provenance?: RpcProvenance,
): Promise<RpcCacheResult<T>> {
  const argsHash = stableHash(args);
  const key = `rpc:${opts.transport}:${opts.method}:v${SCHEMA_VERSION}:${argsHash}`;

  // ── L1: Redis exact hit ──────────────────────────────────────────────────
  try {
    const redis = getRedis();
    const cached = await redis.get(key);
    if (cached) {
      return {
        value: JSON.parse(cached) as T,
        cache: { hit: true, hitLevel: 'L1_REDIS', key, ttlSeconds: opts.ttlSeconds },
      };
    }
  } catch {
    // Redis down — fall through to compute
  }

  // ── Miss: compute with optional deadline ─────────────────────────────────
  let value: T;
  if (opts.deadlineMs) {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[rpc-cache] deadline ${opts.deadlineMs}ms exceeded: ${opts.method}`)), opts.deadlineMs)
    );
    value = await Promise.race([compute(), timeout]);
  } else {
    value = await compute();
  }

  // ── Write to Redis ────────────────────────────────────────────────────────
  try {
    const redis = getRedis();
    const now = Date.now();
    const envelope = {
      schemaVersion: SCHEMA_VERSION,
      transport: opts.transport,
      method: opts.method,
      argsHash,
      cacheKey: key,
      ttlSeconds: opts.ttlSeconds,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + opts.ttlSeconds * 1000).toISOString(),
      hitLevel: 'MISS' as RpcHitLevel,
      payload: value,
      provenance,
    };
    await redis.set(key, JSON.stringify(envelope.payload), 'EX', opts.ttlSeconds);
  } catch {
    // Redis write failure is non-fatal
  }

  return {
    value,
    cache: { hit: false, hitLevel: 'MISS', key, ttlSeconds: opts.ttlSeconds },
  };
}

// ── Invalidation helpers ───────────────────────────────────────────────────

/**
 * Delete all cache keys matching a transport:method prefix.
 * E.g. invalidateRpcPrefix('grpc', 'GetClusterSummary') clears all
 * rpc:grpc:GetClusterSummary:v1:* keys.
 */
export async function invalidateRpcPrefix(transport: RpcTransport, method: string): Promise<number> {
  try {
    const redis = getRedis();
    const pattern = `rpc:${transport}:${method}:v${SCHEMA_VERSION}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    await redis.del(...keys);
    return keys.length;
  } catch {
    return 0;
  }
}

/**
 * Delete a single exact cache entry by args.
 */
export async function invalidateRpcKey(
  transport: RpcTransport,
  method: string,
  args: unknown,
): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `rpc:${transport}:${method}:v${SCHEMA_VERSION}:${stableHash(args)}`;
    const n = await redis.del(key);
    return n > 0;
  } catch {
    return false;
  }
}

// ── GPU topology cache helpers ─────────────────────────────────────────────

/** Cache centroid matrices (stable across re-indexes unless cluster count changes) */
export async function getCentroidCache(clusterCount: number): Promise<Float32Array | null> {
  try {
    const redis = getRedis();
    const key = `gpu:centroids:int8:v1:k${clusterCount}`;
    const raw = await redis.getBuffer(key);
    if (!raw) return null;
    return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  } catch {
    return null;
  }
}

export async function setCentroidCache(clusterCount: number, matrix: Float32Array, ttlSeconds = 3600): Promise<void> {
  try {
    const redis = getRedis();
    const key = `gpu:centroids:int8:v1:k${clusterCount}`;
    await redis.set(key, Buffer.from(matrix.buffer), 'EX', ttlSeconds);
  } catch {
    // non-fatal
  }
}

/** Cache SOM range bags — topology cells for a bounding box */
export function somRangeKey(x0: number, y0: number, x1: number, y1: number): string {
  return `gpu:som:range:v1:${x0}:${y0}:${x1}:${y1}`;
}

export async function getRpcCacheStats(): Promise<{ keys: number; pattern: string }> {
  try {
    const redis = getRedis();
    const keys = await redis.keys('rpc:*');
    return { keys: keys.length, pattern: 'rpc:*' };
  } catch {
    return { keys: 0, pattern: 'rpc:*' };
  }
}
