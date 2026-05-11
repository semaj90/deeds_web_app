import { Redis } from 'ioredis';
import { ENV } from '$lib/server/env.server.js';
import { encode768to64 } from '../gpu/encode-768-to-64.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';

const REDIS_URL = ENV.REDIS_URL;

export interface PrefilterOptions {
	/** Number of clusters to keep. Default: 3. */
	topK?: number;
	/** Skip prefilter when feature flag is off. Default: false. */
	forceEnable?: boolean;
}

export interface PrefilterResult {
	/** Cluster IDs ordered by cosine similarity to query. */
	clusterIds: number[];
	/** Cosine score per cluster, same order. */
	scores: number[];
	/** Total scan duration. */
	durationMs: number;
	/** True when prefilter ran; false when skipped. */
	applied: boolean;
	/** Diagnostic — null on success, error message on fallback. */
	fallbackReason?: string;
	/** Qdrant filter object ready for injection. */
	filter?: any;
}

/**
 * Stage A0 Prefilter:
 * 1. Encodes 768d query embedding into 64d.
 * 2. Compares against 20 cluster centroids stored in Redis.
 * 3. Returns top-K cluster IDs for Qdrant filtering.
 */
export async function encodedClusterPrefilter(
	queryOrEmbedding: string | Float32Array,
	opts?: PrefilterOptions
): Promise<PrefilterResult> {
	const t0 = performance.now();
	const topK = opts?.topK ?? 3;
	const enabled = opts?.forceEnable ?? (ENV.ACE_ENCODED_PREFILTER_ENABLED === 'true');

	if (!enabled) {
		return {
			clusterIds: [],
			scores: [],
			durationMs: performance.now() - t0,
			applied: false,
			fallbackReason: 'feature_flag_off'
		};
	}

	const redis = new Redis(REDIS_URL);
	try {
		// 1. Resolve embedding if needed
		let queryEmbedding: Float32Array;
		if (typeof queryOrEmbedding === 'string') {
			const emb = await generateSingleEmbedding(queryOrEmbedding);
			if (!emb || emb.length !== 768) throw new Error('Query embedding generation failed');
			queryEmbedding = new Float32Array(emb);
		} else {
			queryEmbedding = queryOrEmbedding;
		}

		// 2. Encode query
		const encodedQuery = await encode768to64(queryEmbedding);

		// 3. Load centroids from Redis
		const centroidsRaw = await redis.hgetall('gpu:autoencoder:centroids_64');
		const clusterIds = Object.keys(centroidsRaw)
			.map(k => parseInt(k.replace('cluster_', '')))
			.filter(id => !isNaN(id));

		if (clusterIds.length === 0) {
			return {
				clusterIds: [],
				scores: [],
				durationMs: performance.now() - t0,
				applied: false,
				fallbackReason: 'centroids_missing'
			};
		}

		// 4. Compute cosine similarities
		const similarities: { id: number; score: number }[] = [];
		for (const id of clusterIds) {
			const centroid = new Float32Array(centroidsRaw[`cluster_${id}`].split(',').map(Number));
			similarities.push({ id, score: cosineSimilarity(encodedQuery, centroid) });
		}

		// 5. Sort and return top-K
		similarities.sort((a, b) => b.score - a.score);
		const topHits = similarities.slice(0, topK);

		const resultIds = topHits.map(h => h.id);
		const filter = {
			should: resultIds.map(id => ({
				key: 'som_cluster',
				match: { value: id }
			}))
		};

		return {
			clusterIds: resultIds,
			scores: topHits.map(h => h.score),
			durationMs: performance.now() - t0,
			applied: true,
			filter
		};
	} catch (err) {
		return {
			clusterIds: [],
			scores: [],
			durationMs: performance.now() - t0,
			applied: false,
			fallbackReason: err instanceof Error ? err.message : String(err)
		};
	} finally {
		redis.disconnect();
	}
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-10);
}
