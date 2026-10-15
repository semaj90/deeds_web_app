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
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';
import { stableStringify } from '$lib/server/analysis/stable-hash.js';
import type { RpcCacheResult, RpcHitLevel, RpcProvenance, RpcTransport } from '$lib/types/rpc-cache.js';

const SCHEMA_VERSION = 3;

export interface RpcCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiry: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

const rpcCacheEnvelopeSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  transport: z.enum(['remote-function', 'grpc', 'mcp', 'qdrant', 'gpu', 'http']),
  method: z.string().min(1),
  argsHash: z.string().regex(/^[a-f0-9]{64}$/),
  cacheKey: z.string().min(1),
  ttlSeconds: z.number().int().positive(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  hitLevel: z.literal('MISS'),
  payloadChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  payload: z.unknown(),
  provenance: z.object({
    qdrantIds: z.array(z.string()).optional(),
    graphNodeIds: z.array(z.string()).optional(),
    hyperedgeIds: z.array(z.string()).optional(),
    clusterIds: z.array(z.number()).optional(),
    somCells: z.array(z.string()).optional(),
    grpcMethod: z.string().optional(),
    mcpTool: z.string().optional(),
  }).optional(),
});

// ── Stable hash ────────────────────────────────────────────────────────────

export function stableHash(args: unknown): string {
  return createHash('sha256')
    .update(stableStringify(args))
    .digest('hex')
}

function payloadChecksum(payload: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(payload)).digest('hex')}`;
}

function createRedisCacheStore(): RpcCacheStore {
  const redis = getRedis();
  return {
    get: (key) => redis.get(key),
    set: (key, value, expiry, ttlSeconds) => redis.set(key, value, expiry, ttlSeconds),
    del: (key) => redis.del(key),
  };
}

// ── Core wrapper ───────────────────────────────────────────────────────────

export interface RpcCacheOptions {
  transport: RpcTransport;
  method: string;
  ttlSeconds: number;
  /** If set, reject the waiting request after this deadline (ms); underlying work is not cancellable. */
  deadlineMs?: number;
  /** Injected store for deterministic tests; production defaults to the existing Redis owner. */
  cacheStore?: RpcCacheStore;
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
  let store = opts.cacheStore;

  // ── L1: Redis exact hit ──────────────────────────────────────────────────
  try {
    const activeStore = store ?? (store = createRedisCacheStore());
    const cached = await activeStore.get(key);
    if (cached) {
      const parsed = rpcCacheEnvelopeSchema.safeParse(JSON.parse(cached));
      if (
        parsed.success &&
        parsed.data.transport === opts.transport &&
        parsed.data.method === opts.method &&
        parsed.data.argsHash === argsHash &&
        parsed.data.cacheKey === key &&
        parsed.data.ttlSeconds === opts.ttlSeconds &&
        Date.parse(parsed.data.expiresAt) > Date.now() &&
        parsed.data.payloadChecksum === payloadChecksum(parsed.data.payload)
      ) {
        return {
          value: parsed.data.payload as T,
          cache: { hit: true, hitLevel: 'L1_REDIS', key, ttlSeconds: opts.ttlSeconds },
        };
      }
      await activeStore.del(key).catch(() => undefined);
    }
  } catch {
    // Redis down — fall through to compute
  }

  // ── Miss: compute with optional deadline ─────────────────────────────────
  let value: T;
  if (opts.deadlineMs) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`[rpc-cache] deadline ${opts.deadlineMs}ms exceeded: ${opts.method}`)),
          opts.deadlineMs,
        );
      });
      value = await Promise.race([compute(), timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  } else {
    value = await compute();
  }

  // ── Write to Redis ────────────────────────────────────────────────────────
  try {
    const activeStore = store ?? (store = createRedisCacheStore());
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
      payloadChecksum: payloadChecksum(value),
      payload: value,
      provenance,
    };
    await activeStore.set(key, JSON.stringify(envelope), 'EX', opts.ttlSeconds);
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
 * rpc:grpc:GetClusterSummary:v3:* keys.
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
