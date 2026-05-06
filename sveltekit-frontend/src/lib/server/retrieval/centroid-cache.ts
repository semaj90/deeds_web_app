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
import { db } from '$lib/server/db/client';
import { gpuClusterCentroids } from '$lib/server/db/schema/codebase-intelligence.js';
import { eq, sql } from 'drizzle-orm';

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

    // simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. Each centroid is a
    // 768-dim Float32Array serialized as JSON (~6KB), so a typical 50-cluster
    // MGET is ~300KB — well above the threshold where simdjson beats V8 2-5×.
    const totalChars = values.reduce((sum, v) => sum + (v?.length ?? 0), 0);
    let parseFn: (s: string) => number[] = (s) => JSON.parse(s) as number[];
    if (values.length >= 10 && totalChars >= 5_000) {
      try {
        const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
        if (isSimdJsonAvailable()) parseFn = fastJsonParse<number[]>;
      } catch { /* addon unavailable — keep V8 */ }
    }

    let bestId   = -1;
    let bestSim  = -Infinity;

    for (let i = 0; i < keys.length; i++) {
      const raw = values[i];
      if (!raw) continue;
      const id  = parseInt(keys[i].split(':')[2], 10);
      if (isNaN(id)) continue;
      const vec = new Float32Array(parseFn(raw));
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
158:       const raw = await res.text();
159:       let data: { result: { points: { vector: number[] | { content: number[] } }[] } };
160:       try {
161:         const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
162:         if (isSimdJsonAvailable()) {
163:           data = fastJsonParse(raw);
164:         } else {
165:           data = JSON.parse(raw);
166:         }
167:       } catch {
168:         data = JSON.parse(raw);
169:       }
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

// ── Postgres persistence ──────────────────────────────────────────────────────

/**
 * Persist all currently cached centroids from Redis → Postgres.
 * Called after buildAndCacheCentroids() to make them durable across restarts.
 * Returns number of rows upserted.
 */
export async function persistCentroidsToDB(
  clusterIds: number[],
  clusterType: 'gpu' | 'som' = 'gpu',
): Promise<number> {
  const redis = getRedis();
  const keys  = clusterIds.map((id) => centroidKey.cluster(id));
  if (!keys.length) return 0;

200:   const values = await redis.mget(...keys);
201: 
202:   // simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. Each centroid is a
203:   // 768-dim Float32Array serialized as JSON (~6KB), so 10+ centroids
204:   // (a typical batch) is ~60KB — well above the threshold.
205:   const totalChars = values.reduce((sum, v) => sum + (v?.length ?? 0), 0);
206:   let parseFn: (s: string) => number[] = (s) => JSON.parse(s) as number[];
207:   if (values.length >= 10 && totalChars >= 5_000) {
208:     try {
209:       const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
210:       if (isSimdJsonAvailable()) parseFn = fastJsonParse<number[]>;
211:     } catch { /* addon unavailable — keep V8 */ }
212:   }
213: 
214:   let upserted = 0;
215: 
216:   for (let i = 0; i < clusterIds.length; i++) {
217:     const raw = values[i];
218:     if (!raw) continue;
219: 
220:     try {
221:       const vec = parseFn(raw);
222:       if (!vec.length) continue;

    try {
      await db
        .insert(gpuClusterCentroids)
        .values({
          clusterId:   clusterIds[i],
          clusterType,
          centroidVec: vec,
          chunkCount:  0,
          updatedAt:   new Date(),
        })
        .onConflictDoUpdate({
          target: gpuClusterCentroids.clusterId,
          set: {
            centroidVec: sql`EXCLUDED.centroid_vec`,
            clusterType: sql`EXCLUDED.cluster_type`,
            updatedAt:   sql`now()`,
          },
        });
      upserted++;
    } catch { /* non-fatal per centroid */ }
  }

  return upserted;
}

/**
 * Warm Redis centroid cache from Postgres on startup / after Redis restart.
 * Returns number of centroids loaded into Redis.
 */
export async function loadCentroidsFromDB(
  clusterType: 'gpu' | 'som' = 'gpu',
  ttlSeconds = TTL.CENTROID,
): Promise<number> {
  try {
    const rows = await db
      .select({
        clusterId:   gpuClusterCentroids.clusterId,
        centroidVec: gpuClusterCentroids.centroidVec,
      })
      .from(gpuClusterCentroids)
      .where(eq(gpuClusterCentroids.clusterType, clusterType));

    if (!rows.length) return 0;

    const redis = getRedis();
    const pipe  = redis.pipeline();

    for (const row of rows) {
      if (!row.centroidVec?.length) continue;
      pipe.setex(
        centroidKey.cluster(row.clusterId),
        ttlSeconds,
        JSON.stringify(row.centroidVec),
      );
    }

    await pipe.exec();
    return rows.length;
  } catch {
    return 0;
  }
}
