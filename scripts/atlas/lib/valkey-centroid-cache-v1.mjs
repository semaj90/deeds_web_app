/**
 * Valkey/Redis Centroid LRU TTL Cache Client (SEM768-TP-05).
 *
 * Implements Cache-Aside pattern for spherical/Euclidean KMeans centroids.
 * Namespace schema: atlas:centroid:v1:<embeddingSpaceId>:<modelSnapshotHash>:<clusterId>
 * Enforces explicit TTL (default 7 days = 604,800s) and volatile-lru/allkeys-lru bounds.
 *
 * Invariants:
 * - Cache writes occur strictly AFTER PostgreSQL commits.
 * - Cache misses recompute from PostgreSQL; cache loss never corrupts identity.
 * - Vector must be 768-D finite float array.
 * - Strictly forbidden from caching KV cache, hidden reasoning, or bulk unquantized tensors.
 */
import { centroidCacheDescriptorV1 } from './atlas-retrieval-identity-guard-v1.mjs';

export const DEFAULT_CENTROID_TTL_SECONDS = 604800; // 7 days

export function deriveCentroidCacheKey(input) {
  const descriptor = centroidCacheDescriptorV1(input);
  return descriptor.cacheKey;
}

export async function getCachedCentroid(redisClient, input) {
  const descriptor = centroidCacheDescriptorV1(input);
  const raw = await redisClient.get(descriptor.cacheKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.centroid) || parsed.centroid.length !== input.embedding.dimension) {
      return null;
    }
    return {
      descriptor,
      centroid: parsed.centroid,
      cachedAt: parsed.cachedAt,
      modelRevision: parsed.modelRevision,
    };
  } catch {
    return null;
  }
}

export async function setCachedCentroid(redisClient, input, centroid, ttlSeconds = DEFAULT_CENTROID_TTL_SECONDS) {
  const descriptor = centroidCacheDescriptorV1(input);

  if (!Array.isArray(centroid) || centroid.length !== input.embedding.dimension) {
    throw new Error(`INVALID_CENTROID_DIMENSION: expected ${input.embedding.dimension}, got ${centroid?.length}`);
  }
  if (!centroid.every(Number.isFinite)) {
    throw new Error('NON_FINITE_CENTROID_VALUES');
  }

  const payload = JSON.stringify({
    schema: 'atlas.cached-centroid.v1',
    cacheKey: descriptor.cacheKey,
    embeddingSpaceId: descriptor.embeddingSpaceId,
    clusterId: descriptor.clusterId,
    dimension: centroid.length,
    centroid,
    cachedAt: new Date().toISOString(),
    ttlSeconds,
  });

  await redisClient.set(descriptor.cacheKey, payload, 'EX', ttlSeconds);
  return descriptor.cacheKey;
}

export async function invalidateCachedCentroid(redisClient, input) {
  const descriptor = centroidCacheDescriptorV1(input);
  await redisClient.del(descriptor.cacheKey);
  return descriptor.cacheKey;
}
