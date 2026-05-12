// ── Encoded cluster prefilter — Redis centroid cache ──────────────────────────

import { getRedis } from '$lib/server/redis.js';
import type { CentroidCacheEntry } from './prefilter.types.js';

export const REDIS_HASH      = 'gpu:autoencoder:centroids_64';
export const REDIS_META_HASH = 'gpu:autoencoder:centroids_64_meta';
export const DIM             = 64;
export const CACHE_TTL_MS    = 5 * 60 * 1000; // 5 min — aligns with Qdrant filter freshness

let _cache: CentroidCacheEntry | null = null;

/**
 * Load and validate 64-dim cluster centroids from Redis.
 * Cached in process memory for 5 minutes; invalidated when `trainedAt` changes (ETag check).
 *
 * Shape contract: data.length === ids.length × 64
 */
export async function getCentroids64(): Promise<CentroidCacheEntry | null> {
	const redis = getRedis();
	try {
		// Fast-path: TTL still valid
		if (_cache && Date.now() - _cache.loadedAt < CACHE_TTL_MS) {
			return _cache;
		}

		// ETag check — skip Redis bulk load if trainedAt matches cached version
		const meta = await redis.hgetall(REDIS_META_HASH);
		const trainedAt = meta?.trainedAt;
		if (!trainedAt) return null;

		if (_cache?.trainedAt === trainedAt && Date.now() - _cache.loadedAt < CACHE_TTL_MS) {
			return _cache;
		}

		// Reload all centroids
		const raw = await redis.hgetall(REDIS_HASH);
		const entries = Object.entries(raw)
			.map(([k, v]) => ({ id: parseInt(k.replace('cluster_', '')), csv: v }))
			.filter(e => !isNaN(e.id));

		if (entries.length === 0) return null;

		// Validate shape: each centroid must be exactly DIM floats
		const ids: number[] = [];
		const flat: number[] = [];
		for (const { id, csv } of entries) {
			const vals = csv.split(',').map(Number);
			if (vals.length !== DIM) continue; // skip malformed
			ids.push(id);
			flat.push(...vals);
		}

		if (ids.length === 0) return null;

		_cache = {
			data:      new Float32Array(flat),
			ids,
			trainedAt,
			count:     ids.length,
			loadedAt:  Date.now(),
		};
		return _cache;
	} catch {
		return null;
	}
}

/** Invalidate the in-process cache (call after retraining). */
export function invalidateCentroids64Cache(): void {
	_cache = null;
}

/** Expose raw cache entry for centroidSource detection in the facade. */
export function getCentroidCacheEntry(): CentroidCacheEntry | null {
	return _cache;
}
