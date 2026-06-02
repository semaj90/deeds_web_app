// ── Encoded cluster prefilter — public orchestrator facade ────────────────────
//
// All callers import from this file — do not import the sub-modules directly.
//
// Sub-module responsibilities:
//   prefilter.types.ts  — shared interfaces and type aliases
//   prefilter.redis.ts  — Redis centroid loading + 5-min in-process cache
//   prefilter.shadow.ts — cosine scoring, mode decision (shadow/enforce), skip helper

import { ENV } from '$lib/server/env.server.js';
import { encode768to64 } from '../gpu/encode-768-to-64.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { createHash } from 'node:crypto';

// ── Re-export types (backward-compat — callers that import types from here) ───

export type {
	EncodedPrefilterMode,
	EncodedPrefilterConfig,
	TopKCluster,
	CentroidCacheEntry,
	Centroids64,
	PrefilterOptions,
	PrefilterResult,
	PrefilterDecision,
} from './prefilter.types.js';

// ── Re-export centroid cache helpers (used by MCP + cluster refresh routes) ───

export {
	getCentroids64,
	invalidateCentroids64Cache,
} from './prefilter.redis.js';

// ── Internal imports ──────────────────────────────────────────────────────────

import type { PrefilterOptions, PrefilterResult } from './prefilter.types.js';
import { getCentroids64, getCentroidCacheEntry, CACHE_TTL_MS } from './prefilter.redis.js';
import { topKClusters, skip, resolveMode } from './prefilter.shadow.js';
import { setSimilarityResult } from '$lib/server/cache/tensor-similarity-cache.js';

// ── Main prefilter ────────────────────────────────────────────────────────────

/**
 * Stage A0 Prefilter:
 * 1. Resolves query to a 768-dim embedding (cached).
 * 2. Encodes 768→64 via trained autoencoder weights.
 * 3. Scores against cluster centroids (in-process cache, 5 min TTL).
 * 4. Returns top-K cluster IDs + Qdrant `should` filter.
 *
 * Mode is controlled by ACE_ENCODED_PREFILTER_MODE:
 *   off     — disabled (default)
 *   shadow  — runs, emits trace, does NOT return filter
 *   enforce — runs and returns filter for injection into Qdrant ANN
 */
export async function encodedClusterPrefilter(
	queryOrEmbedding: string | Float32Array,
	opts?: PrefilterOptions
): Promise<PrefilterResult> {
	const t0      = performance.now();
	const topK    = opts?.topK ?? 5;
	// forceEnable bypasses the feature flag AND forces enforce mode (for tests + manual triggers)
	const enabled = opts?.forceEnable ?? (ENV.ACE_ENCODED_PREFILTER_ENABLED === 'true');
	const mode    = opts?.forceEnable ? 'enforce' : (ENV.ACE_ENCODED_PREFILTER_MODE ?? 'off');

	if (!enabled || mode === 'off') {
		return skip(t0, 'feature_flag_off');
	}

	try {
		const queryHash =
			typeof queryOrEmbedding === 'string'
				? createHash('sha256').update(queryOrEmbedding).digest('hex').slice(0, 16)
				: null;

		// 1. Resolve embedding
		let queryEmbedding: Float32Array;
		if (typeof queryOrEmbedding === 'string') {
			const emb = await generateSingleEmbedding(queryOrEmbedding);
			if (!emb || emb.length !== 768) return skip(t0, 'embedding_failed');
			queryEmbedding = new Float32Array(emb);
		} else {
			queryEmbedding = queryOrEmbedding;
		}

		// 2. Encode 768→64
		const encodedQuery = await encode768to64(queryEmbedding);

		// 3. Load centroids (in-process cache)
		const centroids = await getCentroids64();
		if (!centroids || centroids.count === 0) return skip(t0, 'centroids_missing');

		// 4. Score and rank
		const hits = topKClusters(encodedQuery, centroids, topK);

		// 4b. Warm the Redis similarity cache for future query+cluster lookups.
		// This is intentionally best-effort: cache warmth should never block A0.
		if (queryHash) {
			const now = Date.now();
			await Promise.allSettled(
				hits.map((hit) =>
					setSimilarityResult(queryHash, `cluster:gpu:${hit.id}`, {
						scores: [hit.score],
						topKPaths: [`cluster:gpu:${hit.id}`],
						source: 'gpu',
						computedAt: now,
					})
				)
			);
		}

		// Determine centroid source for observability
		const cached = getCentroidCacheEntry();
		const centroidSource: PrefilterResult['centroidSource'] =
			(cached?.loadedAt && Date.now() - cached.loadedAt < CACHE_TTL_MS)
				? 'process-cache' : 'redis';

		// 5. Apply mode decision (shadow: trace only, enforce: inject filter)
		return resolveMode(hits, mode, t0, centroidSource);
	} catch (err) {
		return skip(t0, err instanceof Error ? err.message : String(err));
	}
}
