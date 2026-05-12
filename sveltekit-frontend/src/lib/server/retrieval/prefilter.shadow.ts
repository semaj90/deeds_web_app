// ── Encoded cluster prefilter — cosine scoring + mode decision ────────────────

import type { CentroidCacheEntry, TopKCluster, PrefilterResult } from './prefilter.types.js';
import { DIM } from './prefilter.redis.js';
import { getAddonInternal } from '$lib/server/gpu/libtorch-bridge.js';

// ── Native fast path (AVX2 / CUDA via tensorrt_bridge.node) ──────────────────
//
// For 87 clusters × 64-dim: the JS loop is already fast (<0.1ms), but the
// native path avoids V8 de-optimisation on Float32Array iteration and benefits
// from SIMD auto-vectorisation (AVX2) or CUDA (if the GPU addon is loaded).
//
// Module-level score buffer: 87 floats = 348 bytes — reused across requests.
// Safe because batchCosineSimilarity is synchronous and Node.js is single-threaded
// in the JS event loop, so no concurrent writes can occur between buffer fill
// and the `results.push` loop that drains it.

let _scoresBuffer: Float32Array | null = null;

function tryNativeScores(
	encodedQuery: Float32Array,
	centroids: CentroidCacheEntry
): Float32Array | null {
	const native = getAddonInternal();
	if (!native?.batchCosineSimilarity) return null;
	const n = centroids.count;
	if (!_scoresBuffer || _scoresBuffer.length < n) _scoresBuffer = new Float32Array(n);
	try {
		const rc = native.batchCosineSimilarity(encodedQuery, DIM, centroids.data, n, _scoresBuffer, n);
		return rc === 0 ? _scoresBuffer : null;
	} catch {
		return null;
	}
}

// ── Pure-JS fallback ──────────────────────────────────────────────────────────

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot   += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-10);
}

/**
 * Score query against all centroids, return top-K cluster IDs.
 *
 * Fast path: native batchCosineSimilarity (AVX2 CPU or CUDA GPU via
 * tensorrt_bridge.node) — no per-vector JS overhead.
 * Fallback: pure TypeScript cosine loop.
 */
export function topKClusters(
	encodedQuery: Float32Array,
	centroids: CentroidCacheEntry,
	topK: number
): TopKCluster[] {
	const n = centroids.ids.length;
	const results: TopKCluster[] = new Array(n);

	const nativeScores = tryNativeScores(encodedQuery, centroids);
	if (nativeScores) {
		for (let i = 0; i < n; i++) {
			results[i] = { id: centroids.ids[i], score: nativeScores[i] };
		}
	} else {
		for (let i = 0; i < n; i++) {
			const slice = centroids.data.subarray(i * DIM, (i + 1) * DIM);
			results[i] = { id: centroids.ids[i], score: cosineSimilarity(encodedQuery, slice) };
		}
	}

	results.sort((a, b) => b.score - a.score);
	return results.slice(0, topK);
}

/** Build a Qdrant `should` filter from a set of cluster IDs. */
export function buildFilterFromClusters(
	clusterIds: number[]
): NonNullable<PrefilterResult['filter']> {
	return {
		should: clusterIds.map(id => ({ key: 'som_cluster', match: { value: id } })),
	};
}

/**
 * Compose the final PrefilterResult based on mode:
 *   shadow  — trace returned but filter NOT injected (applied: false)
 *   enforce — filter returned and applied: true
 */
export function resolveMode(
	hits: TopKCluster[],
	mode: string,
	t0: number,
	centroidSource: PrefilterResult['centroidSource']
): PrefilterResult {
	const resultIds = hits.map(h => h.id);
	const filter    = buildFilterFromClusters(resultIds);
	return {
		clusterIds:    resultIds,
		scores:        hits.map(h => h.score),
		durationMs:    performance.now() - t0,
		applied:       mode === 'enforce',
		filter:        mode === 'enforce' ? filter : undefined,
		centroidSource,
	};
}

/** Return a skipped/failed PrefilterResult. */
export function skip(t0: number, reason: string): PrefilterResult {
	return {
		clusterIds:     [],
		scores:         [],
		durationMs:     performance.now() - t0,
		applied:        false,
		fallbackReason: reason,
	};
}
