/**
 * POST /api/codebase-index/centroids
 *
 * Builds cluster centroid vectors from Qdrant codebase_chunks_768,
 * caches them in Redis (6h TTL), and persists to Postgres gpu_cluster_centroids.
 *
 * Typically called after graphify:semantic / GPU k-means completes.
 * Safe to re-run — upserts are idempotent.
 *
 * Body (optional):
 *   { clusterIds?: number[], clusterType?: 'gpu' | 'som' }
 *   — defaults to all clusters 0-49 if clusterIds omitted
 *
 * Returns: { built, persisted, durationMs }
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import {
  buildAndCacheCentroids,
  persistCentroidsToDB,
} from '$lib/server/retrieval/centroid-cache.js';

const schema = z.object({
  clusterIds:  z.array(z.number().int().nonnegative()).max(200).optional(),
  clusterType: z.enum(['gpu', 'som']).default('gpu'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown = {};
  try { body = await request.json().catch(() => ({})); } catch {/* ok */}
  const { clusterIds, clusterType } = schema.parse(body ?? {});

  // Default: all clusters 0..49 (adjust if k > 50)
  const ids = clusterIds ?? Array.from({ length: 50 }, (_, i) => i);

  const startMs   = Date.now();
  const qdrantUrl = ENV.QDRANT_URL ?? 'http://localhost:6333';

  const built     = await buildAndCacheCentroids(ids, qdrantUrl);
  const persisted = await persistCentroidsToDB(ids.filter((_, i) => i < built + 5), clusterType);

  return json({ built, persisted, durationMs: Date.now() - startMs });
};

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  // Quick stats: how many centroids are in Redis right now
  const { getRedis } = await import('$lib/server/redis.js');
  try {
    const redis = getRedis();
    const keys  = await redis.keys('centroid:cluster:*');
    return json({ cached: keys.length, hint: 'POST to rebuild from Qdrant' });
  } catch {
    return json({ cached: 0, hint: 'Redis unavailable' });
  }
};