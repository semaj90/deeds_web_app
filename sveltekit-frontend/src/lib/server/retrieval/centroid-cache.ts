/**
 * Centroid cache — precomputed cluster centroid vectors in Redis.
 *
 * Key layout (matches cache-keys.ts centroidKey):
 *   taxonomy:clusters:gpu:<clusterId>     Float32Array packed as JSON
 *   taxonomy:clusters:som:<x>:<y>         SOM cell centroid
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

import { getRedis, setJsonWithTtl, getJson } from '$lib/server/redis.js';
import { centroidKey, TTL } from '$lib/server/cache-keys.js';
import { db } from '$lib/server/db/client';
import { gpuClusterCentroids } from '$lib/server/db/schema/codebase-intelligence.js';
import { eq, sql } from 'drizzle-orm';

// ── get / set ─────────────────────────────────────────────────────────────────

export async function getClusterCentroid(clusterId: number): Promise<Float32Array | null> {
  const arr = await getJson<number[]>(centroidKey.cluster(clusterId));
  return arr ? new Float32Array(arr) : null;
}

export async function setClusterCentroid(
  clusterId: number,
  vec: Float32Array,
  ttlSeconds = TTL.CENTROID
): Promise<void> {
  await setJsonWithTtl(centroidKey.cluster(clusterId), Array.from(vec), ttlSeconds);
}

export async function getSomCentroid(x: number, y: number): Promise<Float32Array | null> {
  const arr = await getJson<number[]>(centroidKey.som(x, y));
  return arr ? new Float32Array(arr) : null;
}

export async function setSomCentroid(
  x: number,
  y: number,
  vec: Float32Array,
  ttlSeconds = TTL.CENTROID
): Promise<void> {
  await setJsonWithTtl(centroidKey.som(x, y), Array.from(vec), ttlSeconds);
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
 * Uses CUDA batch cosine similarity when ≥4 centroids are loaded and CUDA is available
 * (100× faster than CPU for 50 centroids on RTX 3060 Ti); falls back to CPU cosine.
 * Returns null if no centroids are cached.
 */
export async function nearestCluster(
  queryVec: Float32Array | number[],
  maxClusters = 50
): Promise<{ 
  clusterId: number; 
  similarity: number; 
  source: 'cuda-batch-cosine' | 'cpu-cosine'; 
  durationMs: number;
  topoClass?: string;
  topoByte?: number;
} | null> {
  const t0 = Date.now();
  try {
    const redis = getRedis();
    let keys = (await redis.keys('centroid:cluster:*')).slice(0, maxClusters);
    if (!keys.length) {
      await loadCentroidsFromDB();
      keys = (await redis.keys('centroid:cluster:*')).slice(0, maxClusters);
    }
    if (!keys.length) return null;

    const values = await redis.mget(...keys);

    // simdjson AVX2 fast-parse for ≥10/≥5KB aggregate.
    const totalChars = values.reduce((sum, v) => sum + (v?.length ?? 0), 0);
    let parseFn: (s: string) => number[] = (s) => JSON.parse(s) as number[];
    if (values.length >= 10 && totalChars >= 5_000) {
      try {
        const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
        if (isSimdJsonAvailable()) parseFn = fastJsonParse<number[]>;
      } catch { /* addon unavailable — keep V8 */ }
    }

    // Build parallel arrays of (id, vec) for valid entries
    const ids:  number[]   = [];
    const vecs: number[][] = [];
    const meta: Array<{ topoClass?: string; topoByte?: number }> = [];

    for (let i = 0; i < keys.length; i++) {
      const raw = values[i];
      if (!raw) continue;
      const id = parseInt(keys[i].split(':').at(-1)!, 10);
      if (isNaN(id)) continue;
      
      const parsed = parseFn(raw);
      ids.push(id);
      
      if (Array.isArray(parsed)) {
        vecs.push(parsed);
        meta.push({});
      } else {
        const data = parsed as any;
        vecs.push(data.vector || []);
        meta.push({ topoClass: data.topoClass, topoByte: data.topoByte });
      }
    }
    if (!ids.length) return null;

    const qArr = Array.isArray(queryVec) ? queryVec : Array.from(queryVec);

    // ── GPU path: CUDA batch cosine (RTX 3060 Ti ~0.1ms for 50 centroids) ──
    if (ids.length >= 4) {
      try {
        const { batchCosineSimilarity, isCudaAvailable } = await import('$lib/server/gpu/libtorch-bridge.js');
        if (isCudaAvailable()) {
          const result = await batchCosineSimilarity(qArr, vecs);
          let bestIdx = 0;
          for (let i = 1; i < result.scores.length; i++) {
            if (result.scores[i] > result.scores[bestIdx]) bestIdx = i;
          }
          return {
            clusterId: ids[bestIdx],
            similarity: result.scores[bestIdx],
            source: 'cuda-batch-cosine',
            durationMs: Date.now() - t0,
            topoClass: meta[bestIdx].topoClass,
            topoByte: meta[bestIdx].topoByte,
          };
        }
      } catch { /* GPU unavailable or OOM — fall through to CPU */ }
    }

    // ── CPU path: loop cosine ──────────────────────────────────────────────
    let bestId  = -1;
    let bestSim = -Infinity;
    for (let i = 0; i < ids.length; i++) {
      const sim = cosine(new Float32Array(qArr), new Float32Array(vecs[i]));
      if (sim > bestSim) { bestSim = sim; bestId = ids[i]; }
    }

    return bestId >= 0
      ? { 
          clusterId: bestId, 
          similarity: bestSim, 
          source: 'cpu-cosine', 
          durationMs: Date.now() - t0,
          topoClass: meta[ids.indexOf(bestId)].topoClass,
          topoByte: meta[ids.indexOf(bestId)].topoByte,
        }
      : null;
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
const raw = await res.text();
let data: { result: { points: { vector: number[] | { content: number[] } }[] } };
try {
const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
if (isSimdJsonAvailable()) {
data = fastJsonParse(raw);
} else {
data = JSON.parse(raw);
}
} catch {
data = JSON.parse(raw);
}
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

      // Get dominant topoClass for this cluster
      const { rows: topoRows } = await db.execute(sql`
        SELECT topo_class, topo_byte, count(*) as cnt 
        FROM embedded_summaries 
        WHERE gpu_cluster = ${clusterId} 
        GROUP BY topo_class, topo_byte 
        ORDER BY cnt DESC LIMIT 1
      `);
      const topoInfo = topoRows[0] || { topo_class: 'unclassified', topo_byte: 0 };

      const centroidData = {
        vector: Array.from(sum),
        topoClass: String(topoInfo.topo_class),
        topoByte: Number(topoInfo.topo_byte)
      };

      pipe.setex(centroidKey.cluster(clusterId), ttlSeconds, JSON.stringify(centroidData));
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

  const values = await redis.mget(...keys);
  // simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. Each centroid is a
  // 768-dim Float32Array serialized as JSON (~6KB), so 10+ centroids
  // (a typical batch) is ~60KB — well above the threshold.
  const totalChars = values.reduce((sum, v) => sum + (v?.length ?? 0), 0);
  let parseFn: (s: string) => number[] = (s) => JSON.parse(s) as number[];
  if (values.length >= 10 && totalChars >= 5_000) {
    try {
      const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
      if (isSimdJsonAvailable()) parseFn = fastJsonParse<number[]>;
    } catch { /* addon unavailable — keep V8 */ }
  }

  let upserted = 0;
  for (let i = 0; i < clusterIds.length; i++) {
    const raw = values[i];
    if (!raw) continue;
    try {
      const data = parseFn(raw) as any;
      if (!data) continue;
      await db
        .insert(gpuClusterCentroids)
        .values({
          clusterId:   clusterIds[i],
          clusterType,
          centroidVec: data.vector || [],
          topoClass:   data.topoClass || 'unclassified',
          topoByte:    data.topoByte || 0,
          chunkCount:  0,
          updatedAt:   new Date(),
        })
        .onConflictDoUpdate({
          target: gpuClusterCentroids.clusterId,
          set: {
            centroidVec: sql`EXCLUDED.centroid_vec`,
            clusterType: sql`EXCLUDED.cluster_type`,
            topoClass:   sql`EXCLUDED.topo_class`,
            topoByte:    sql`EXCLUDED.topo_byte`,
            updatedAt:   sql`now()`,
          },
        });
      upserted++;
    } catch { /* non-fatal per centroid */ }
  }

  return upserted;
}

// ── SOM grid neighbor lookup ──────────────────────────────────────────────────

export interface SomNeighbor {
  row:        number;
  col:        number;
  similarity: number; // cosine similarity to the primary BMU centroid
}

/**
 * Return up to `maxNeighbors` SOM cells adjacent to `(row, col)` ranked by
 * centroid similarity to the primary cell.  Uses the Moore neighbourhood
 * (8 surrounding cells).  Missing cells (no centroid in Redis) are skipped.
 *
 * Used by the "did you mean" path: when a query lands far from any centroid
 * (high reconstruction error), the adjacent cells surface related clusters
 * the user may have intended.
 */
export async function nearestSomNeighbors(
  row:          number,
  col:          number,
  gridSize    = 10,
  maxNeighbors = 3,
): Promise<SomNeighbor[]> {
  try {
    const redis = getRedis();

    // Load the primary cell centroid for comparison baseline
    const primaryRaw = await redis.get(centroidKey.som(row, col));
    if (!primaryRaw) return [];
    const primary = new Float32Array(JSON.parse(primaryRaw) as number[]);

    // Enumerate Moore neighbourhood
    const candidates: Array<{ row: number; col: number }> = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
          candidates.push({ row: nr, col: nc });
        }
      }
    }
    if (!candidates.length) return [];

    const keys   = candidates.map((c) => centroidKey.som(c.row, c.col));
    const values = await redis.mget(...keys);

    const results: SomNeighbor[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const raw = values[i];
      if (!raw) continue;
      const vec = new Float32Array(JSON.parse(raw) as number[]);
      results.push({ ...candidates[i], similarity: cosine(primary, vec) });
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxNeighbors);
  } catch {
    return [];
  }
}

export interface DidYouMeanResult {
  neighbors:           SomNeighbor[];
  reconstructionError: number;
  isNovel:             boolean; // true when error exceeds noveltyThreshold
  errorSource:         'autoencoder-gpu' | 'autoencoder-cpu' | 'cosine-approx';
}

// ── Autoencoder weight loader ─────────────────────────────────────────────────

/** Redis key written by the topology projection pipeline after autoencoder training. */
const DECODER_WEIGHTS_KEY = 'ace:autoencoder:decoder:weights';

interface StoredWeights {
  W:         number[];
  b:         number[];
  hidden:    number;
  outputDim: number;
}

/**
 * Load decoder weights from Redis.
 * Returns null when the autoencoder hasn't been trained / weights not yet cached.
 * Results are NOT cached in-process — weights may be refreshed between SOM rebuilds.
 */
async function loadDecoderWeights() {
  try {
    const redis = getRedis();
    const raw   = await redis.get(DECODER_WEIGHTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWeights;
    if (!parsed.W?.length || !parsed.b?.length) return null;
    return {
      W:         new Float32Array(parsed.W),
      b:         new Float32Array(parsed.b),
      hidden:    parsed.hidden,
      outputDim: parsed.outputDim,
    };
  } catch {
    return null;
  }
}

/**
 * "Did you mean" cluster suggestions based on reconstruction error.
 *
 * When `manifold4Coords` are provided (4-dim encoded representation from
 * tensorAnalysisCache), the function uses the true autoencoder reconstruction
 * error: MSE(queryVec, decode(manifold4)) normalised to cosine-distance scale.
 *
 * Falls back to the approximation `1 − cosine(queryVec, primaryBmuCentroid)`
 * when decoder weights aren't cached or manifold4 is not available.
 *
 * Routing guide (same thresholds apply regardless of error source):
 *   error < 0.15 → familiar → ace:code cache hit path
 *   error 0.15–0.40 → suggest neighbors (did you mean)
 *   error > 0.40 → out-of-distribution → broader ANN / web fallback
 */
export async function didYouMeanClusters(
  queryVec:      Float32Array | number[],
  primaryBmuRow: number,
  primaryBmuCol: number,
  opts: {
    gridSize?:         number;
    maxSuggestions?:   number;
    noveltyThreshold?: number;
    /** 4-dim manifold representation from tensorAnalysisCache (manifold4_x/y/z/w). */
    manifold4Coords?:  [number, number, number, number] | Float32Array;
  } = {},
): Promise<DidYouMeanResult> {
  const { gridSize = 10, maxSuggestions = 3, noveltyThreshold = 0.15, manifold4Coords } = opts;

  let reconstructionError = 0;
  let errorSource: DidYouMeanResult['errorSource'] = 'cosine-approx';

  // ── Attempt true autoencoder reconstruction error ─────────────────────────
  if (manifold4Coords) {
    try {
      const weights = await loadDecoderWeights();
      if (weights) {
        const { decodeManifold4, reconstructionMse } = await import('$lib/server/gpu/libtorch-bridge.js');
        const result = decodeManifold4(
          manifold4Coords instanceof Float32Array
            ? manifold4Coords
            : new Float32Array(manifold4Coords),
          weights,
        );
        const mse = reconstructionMse(queryVec, result.decoded);
        if (mse !== null) {
          reconstructionError = mse;
          errorSource = result.source === 'gpu' ? 'autoencoder-gpu' : 'autoencoder-cpu';
        }
      }
    } catch { /* non-fatal — fall through to cosine approx */ }
  }

  // ── Cosine approximation fallback ─────────────────────────────────────────
  if (errorSource === 'cosine-approx') {
    try {
      const redis      = getRedis();
      const primaryRaw = await redis.get(centroidKey.som(primaryBmuRow, primaryBmuCol));
      if (primaryRaw) {
        const centroid = new Float32Array(JSON.parse(primaryRaw) as number[]);
        const qArr     = queryVec instanceof Float32Array ? queryVec : new Float32Array(queryVec);
        reconstructionError = 1 - cosine(qArr, centroid);
      }
    } catch { /* non-fatal — stays 0 */ }
  }

  const neighbors = await nearestSomNeighbors(
    primaryBmuRow, primaryBmuCol, gridSize, maxSuggestions,
  );

  return {
    neighbors,
    reconstructionError,
    isNovel:     reconstructionError >= noveltyThreshold,
    errorSource,
  };
}

// ── Token density helpers ─────────────────────────────────────────────────────

export interface TokenBudgetStats {
  p50Tokens:         number;
  p90Tokens:         number;
  avgChunksPerQuery: number;
  sampleCount:       number;
  updatedAt:         number; // Unix ms
}

/**
 * Read the pre-computed token budget stats for a (topoClass, clusterId) pair.
 * Returns null when no stats have been recorded yet.
 * Used before Qdrant fetch to pre-size the chunk limit.
 */
export async function getTokenBudget(
  topoClass: number,
  clusterId: number | null,
): Promise<TokenBudgetStats | null> {
  try {
    const { aceTokenBudgetKey } = await import('$lib/server/cache-keys.js');
    const redis = getRedis();
    const key   = clusterId != null
      ? aceTokenBudgetKey.forCluster(topoClass, clusterId)
      : aceTokenBudgetKey.forClass(topoClass);
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as TokenBudgetStats) : null;
  } catch {
    return null;
  }
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
        topoClass:   gpuClusterCentroids.topoClass,
        topoByte:    gpuClusterCentroids.topoByte,
      })
      .from(gpuClusterCentroids)
      .where(eq(gpuClusterCentroids.clusterType, clusterType));

    if (!rows.length) return 0;

    const redis = getRedis();
    const pipe  = redis.pipeline();

    for (const row of rows) {
      if (!row.centroidVec?.length) continue;
      const centroidData = {
        vector: row.centroidVec,
        topoClass: row.topoClass,
        topoByte: row.topoByte
      };
      pipe.setex(
        centroidKey.cluster(row.clusterId),
        ttlSeconds,
        JSON.stringify(centroidData),
      );
    }

    await pipe.exec();
    return rows.length;
  } catch {
    return 0;
  }
}
