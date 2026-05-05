/**
 * Centroid cache — precomputed cluster centroid vectors in Redis.
 *
 * Key layout (matches cache-keys.ts centroidKey):
 *   centroid:cluster:<clusterId>     Float32Array packed as base64 JSON
 *   centroid:som:<x>:<y>             SOM cell centroid
 *
 * Centroids are computed by averaging all chunk embeddings in a cluster
 * (done by graphify:semantic / som-topology pipeline) and stored here for
 * fast nearest-cluster lookup without re-querying Qdrant.
 *
 * Usage:
 *   const vec = await getClusterCentroid(7);        // 768-dim Float32Array
 *   await setClusterCentroid(7, myVec, 3600 * 6);   // 6-hour TTL
 *   const id  = await nearestCluster(queryVec, 10); // top-1 cluster
 */

import { getRedis } from '$lib/server/redis.js';
import { centroidKey, TTL } from '$lib/server/cache-keys.js';

// ── get / set ─────────────────────────────────────────────────────────────────

export async function getClusterCentroid(clusterId: number): Promise<Float32Array | null> {
  try {
    const redis = getRedis();
    const raw   = await redis.get(centroidKey.cluster(clusterId));
    if (!raw) return null;
    const arr   = JSON.parse(raw) as number[];
    return new Float32Array(arr);
  } catch {
    return null;
  }
}

export async function setClusterCentroid(
  clusterId: number,
  vec: Float32Array,
  ttlSeconds = TTL.CENTROID
): Promise<void> {
  const redis = getRedis();
  await redis.setex(centroidKey.cluster(clusterId), ttlSeconds, JSON.stringify(Array.from(vec)));
}

export async function getSomCentroid(x: number, y: number): Promise<Float32Array | null> {
  try {
    const redis = getRedis();
    const raw   = await redis.get(centroidKey.som(x, y));
    if (!raw) return null;
    return new Float32Array(JSON.parse(raw) as number[]);
  } catch {
    return null;
  }
}

export async function setSomCentroid(
  x: number,
  y: number,
  vec: Float32Array,
  ttlSeconds = TTL.CENTROID
): Promise<void> {
  const redis = getRedis();
  await redis.setex(centroidKey.som(x, y), ttlSeconds, JSON.stringify(Array.from(vec)));
}

// ── nearest-cluster lookup ────────────────────────────────────────────────────

/** Cosine similarity between two equal-length vectors. */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] ** 2;
    nb  += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Find the nearest cluster to `queryVec` among the cached centroids.
 * Scans Redis keys matching `centroid:cluster:*`.
 * Returns null if no centroids are cached.
 */
export async function nearestCluster(
  queryVec: Float32Array,
  maxClusters = 50
): Promise<{ clusterId: number; similarity: number } | null> {
  try {
    const redis = getRedis();
    const keys  = (await redis.keys('centroid:cluster:*')).slice(0, maxClusters);
    if (!keys.length) return null;

    const values = await redis.mget(...keys);
    let bestId   = -1;
    let bestSim  = -Infinity;

    for (let i = 0; i < keys.length; i++) {
      const raw = values[i];
      if (!raw) continue;
      const id  = parseInt(keys[i].split(':')[2], 10);
      if (isNaN(id)) continue;
      const vec = new Float32Array(JSON.parse(raw) as number[]);
      const sim = cosine(queryVec, vec);
      if (sim > bestSim) { bestSim = sim; bestId = id; }
    }

    return bestId >= 0 ? { clusterId: bestId, similarity: bestSim } : null;
  } catch {
    return null;
  }
}

/**
 * Build and cache centroids from Qdrant codebase_chunks_768.
 * Called by graphify:semantic after GPU k-means to seed Redis.
 * Returns number of centroids written.
 */
export async function buildAndCacheCentroids(
  clusterIds: number[],
  qdrantUrl: string,
  ttlSeconds = TTL.CENTROID
): Promise<number> {
  let written = 0;
  const redis  = getRedis();
  const pipe   = redis.pipeline();

  for (const clusterId of clusterIds) {
    try {
      const res = await fetch(
        `${qdrantUrl}/collections/codebase_chunks_768/points/scroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter:       { must: [{ key: 'gpuCluster', match: { value: clusterId } }] },
            limit:        200,
            with_payload: false,
            with_vector:  true,
          }),
        }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { result: { points: { vector: number[] | { content: number[] } }[] } };
      const pts  = data.result?.points ?? [];
      if (!pts.length) continue;

      // Average all vectors (or the 'content' named vector)
      const dim  = 768;
      const sum  = new Float32Array(dim);
      let   count = 0;
      for (const pt of pts) {
        const v = Array.isArray(pt.vector) ? pt.vector
          : (pt.vector as { content?: number[] }).content;
        if (!v || v.length !== dim) continue;
        for (let d = 0; d < dim; d++) sum[d] += v[d];
        count++;
      }
      if (!count) continue;
      for (let d = 0; d < dim; d++) sum[d] /= count;

      pipe.setex(centroidKey.cluster(clusterId), ttlSeconds, JSON.stringify(Array.from(sum)));
      written++;
    } catch { /* non-fatal per cluster */ }
  }

  await pipe.exec();
  return written;
}
