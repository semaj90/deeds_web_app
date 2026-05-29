/**
 * feature-context-cache.ts
 *
 * Establishes strict hot-caching routines via Redis for ACE context assembly:
 *   - ace:packet:{runId}       (1-hour TTL)
 *   - ace:cluster:{clusterId}   (24-hour TTL)
 *
 * Implements strict telemetry filters to block leaking model internals
 * (hiddenThoughts, chainOfThought, kv_cache, tensors, cudaPointers).
 */

import { getRedis } from '$lib/server/redis.js';

const PACKET_PREFIX = 'ace:packet';
const CLUSTER_PREFIX = 'ace:cluster';

const PACKET_TTL = 3600;       // 1 hour
const CLUSTER_TTL = 86400;     // 24 hours

/**
 * Recursively strips forbidden model memory telemetry attributes:
 * hiddenThoughts, chainOfThought, kv_cache, tensor, cudaPointer.
 */
export function sanitizeTelemetry<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map(sanitizeTelemetry) as unknown as T;
  }

  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (
        key === 'hiddenThoughts' ||
        key === 'chainOfThought' ||
        key === 'kv_cache' ||
        key === 'tensor' ||
        key === 'cudaPointer'
      ) {
        continue;
      }
      cleaned[key] = sanitizeTelemetry(value);
    }
    return cleaned as T;
  }

  return data;
}

// ── Packet Caching (ace:packet:{runId}) ────────────────────────────────────────

/**
 * Gets a cached assembled packet by run ID.
 */
export async function getCachedPacket(runId: string): Promise<any | null> {
  const redis = getRedis();
  try {
    const raw = await redis.get(`${PACKET_PREFIX}:${runId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[feature-cache] Failed to read packet for runId ${runId}:`, err);
    return null;
  }
}

/**
 * Caches an assembled packet by run ID with a strict 1-hour TTL.
 * Automatically sanitizes any internal model telemetry.
 */
export async function setCachedPacket(runId: string, packetData: any): Promise<void> {
  const redis = getRedis();
  try {
    const sanitized = sanitizeTelemetry(packetData);
    await redis.setex(`${PACKET_PREFIX}:${runId}`, PACKET_TTL, JSON.stringify(sanitized));
  } catch (err) {
    console.error(`[feature-cache] Failed to cache packet for runId ${runId}:`, err);
  }
}

/**
 * Invalidates a cached packet by run ID.
 */
export async function invalidatePacket(runId: string): Promise<void> {
  const redis = getRedis();
  try {
    await redis.del(`${PACKET_PREFIX}:${runId}`);
  } catch (err) {
    console.error(`[feature-cache] Failed to invalidate packet for runId ${runId}:`, err);
  }
}

// ── Cluster Caching (ace:cluster:{clusterId}) ──────────────────────────────────

/**
 * Gets a cached cluster by cluster ID.
 */
export async function getCachedCluster(clusterId: string): Promise<any | null> {
  const redis = getRedis();
  try {
    const raw = await redis.get(`${CLUSTER_PREFIX}:${clusterId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[feature-cache] Failed to read cluster for clusterId ${clusterId}:`, err);
    return null;
  }
}

/**
 * Caches a partition cluster by ID with a 24-hour TTL.
 * Automatically sanitizes any internal model telemetry.
 */
export async function setCachedCluster(clusterId: string, clusterData: any): Promise<void> {
  const redis = getRedis();
  try {
    const sanitized = sanitizeTelemetry(clusterData);
    await redis.setex(`${CLUSTER_PREFIX}:${clusterId}`, CLUSTER_TTL, JSON.stringify(sanitized));
  } catch (err) {
    console.error(`[feature-cache] Failed to cache cluster for clusterId ${clusterId}:`, err);
  }
}

/**
 * Invalidates a cached cluster by ID.
 */
export async function invalidateCluster(clusterId: string): Promise<void> {
  const redis = getRedis();
  try {
    await redis.del(`${CLUSTER_PREFIX}:${clusterId}`);
  } catch (err) {
    console.error(`[feature-cache] Failed to invalidate cluster for clusterId ${clusterId}:`, err);
  }
}

// ── Feature Card Caching (ace:feature:{featureKey}) ────────────────────────────
// Written by scripts/atlas/cache-feature-cards.mjs; read by feature-context-matrix.ts

const FEATURE_PREFIX = 'ace:feature';
const CTX_PREFIX     = 'ace:ctx';
const FEATURE_TTL    = 86400; // 24 hours

/** Get a cached feature card by feature key. */
export async function getCachedFeatureCard(featureKey: string): Promise<any | null> {
  const redis = getRedis();
  try {
    const raw = await redis.get(`${FEATURE_PREFIX}:${featureKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Cache a feature card. Called by the atlas ingestion pipeline if needed server-side. */
export async function setCachedFeatureCard(featureKey: string, card: any): Promise<void> {
  const redis = getRedis();
  try {
    const sanitized = sanitizeTelemetry(card);
    await redis.setex(`${FEATURE_PREFIX}:${featureKey}`, FEATURE_TTL, JSON.stringify(sanitized));
  } catch { /* non-fatal */ }
}

/** Get a pre-computed synthesis ctx packet. */
export async function getCachedCtxPacket(featureKey: string): Promise<any | null> {
  const redis = getRedis();
  try {
    const raw = await redis.get(`${CTX_PREFIX}:${featureKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Store a synthesized ctx packet. */
export async function setCachedCtxPacket(featureKey: string, packet: any): Promise<void> {
  const redis = getRedis();
  try {
    const sanitized = sanitizeTelemetry(packet);
    await redis.setex(`${CTX_PREFIX}:${featureKey}`, FEATURE_TTL, JSON.stringify(sanitized));
  } catch { /* non-fatal */ }
}

import { invalidationRegistry } from '../cache/invalidation-registry.js';

/** Invalidate all cached data for a feature key (card + ctx). */
export async function invalidateFeature(featureKey: string): Promise<void> {
  try {
    await invalidationRegistry.invalidate('feature_updated', { featureKey });
  } catch { /* non-fatal */ }
}
