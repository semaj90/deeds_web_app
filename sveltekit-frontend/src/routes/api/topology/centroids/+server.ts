import { json } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis.js';

/**
 * GET /api/topology/centroids
 * 
 * Exposes the SOM centroids (64d) for client-side WebGPU visualization.
 * These centroids represent the topological backbone of the codebase.
 */
export async function GET({ locals }) {
  if (!locals.user) {
    return json({
      error: 'Unauthorized',
      centroids: [],
      meta: {
        count: 0,
        dim: 64,
        gridRows: 0,
        gridCols: 0
      }
    }, { status: 401 });
  }

  const redis = getRedis();
  
  const [centroidsRaw, meta] = await Promise.all([
    redis.hget('gpu:autoencoder:centroids_64', 'centroids'),
    redis.hgetall('gpu:autoencoder:centroids_64_meta')
  ]);

  if (!centroidsRaw) {
    // Absent data is a valid empty state, not a 404 (degraded-response contract). Callers read
    // `clusters` and fall back to [] when it is missing.
    return json({ centroids: [], clusters: [], available: false });
  }

  // Centroids are stored as base64-encoded Float32Array
  const buffer = Buffer.from(centroidsRaw, 'base64');
  const centroids = Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));

  return json({
    centroids,
    meta: {
      count: parseInt(meta.count || '0'),
      dim: parseInt(meta.dim || '64'),
      gridRows: parseInt(meta.gridRows || '0'),
      gridCols: parseInt(meta.gridCols || '0'),
    }
  });
}
