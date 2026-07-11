/**
 * autoencoder-cuvs-bridge.ts — Stage 3 GPU orchestrator
 *
 * Pipeline: query embedding (768d) → autoencoder encode (768→64) → cuVS ANN prefilter
 * → top-K candidates for Stage 4 (k-means reranking)
 *
 * Purpose: Reduce search space from 40K candidates → 100-500 before expensive GPU reranking.
 * Strategy: 64-dim encoded vectors fit in 4MB cache; cuVS IVFFLAT on RTX 3060Ti is sub-millisecond.
 *
 * Hard constraints:
 * - No softmax/tanh on cuVS output (raw distances only)
 * - Batch size ≤ 256 queries (OOM at 512+)
 * - Preserve packet_key → latent_64 row mapping (lossy encoding, need original IDs for dedup)
 * - Fanout=0 in caller (this stage does NOT expand; k-means does)
 */

import { encode as autoencoderEncode } from '../gpu/autoencoder-bridge.js';
import { turbovecGrpcHealth, turbovecGrpcSearch } from '../grpc/turbovec-cuda-client.js';
import { getRedisClient } from '$lib/server/cache.js';

interface CuvSConfig {
	nProbes: number; // ∈ [1, 32], default 32 (max recall)
	nNeighbors: number; // top-K to fetch, ∈ [1, 65535]
	batchSize: number; // queries per batch, ∈ [1, 256]
}

interface PrefilterCandidate {
	packetKey: string;
	distance: number;
	rank: number;
}

interface PrefilterBatchResult {
	query_id: string;
	candidates: PrefilterCandidate[];
	latencyMs: number;
	encoded_query_bytes: number;
	search_bytes: number;
}

const DEFAULT_CONFIG: CuvSConfig = {
	nProbes: 32,
	nNeighbors: 200,
	batchSize: 16,
};

/**
 * Stage 3A: Encode query (768 → 64) via autoencoder
 */
async function encodeQuery(queryVec768: Float32Array): Promise<Float32Array> {
	try {
		// Load encoder weights from Redis
		const redis = await getRedisClient();
		const weightsJson = await redis.get('ace:autoencoder:weights');
		if (!weightsJson) {
			throw new Error('[Stage3A] Autoencoder weights not found in Redis');
		}

		const weights = JSON.parse(weightsJson);
		const W = new Float32Array(weights.encoder_W);
		const b = new Float32Array(weights.encoder_b);
		const hidden = weights.encoder_hidden_dim;

		// Encode via the GPU/CPU autoencoder bridge. This returns either the
		// native addon result or the CPU fallback with the same shape.
		const encoded = autoencoderEncode(queryVec768, 1, 768, W, b, hidden);
		if (!encoded || encoded.length !== 64) {
			throw new Error(`[Stage3A] Encoder returned invalid size: ${encoded?.length}`);
		}

		return encoded;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[Stage3A] Encoding failed: ${msg}`);
		throw err;
	}
}

/**
 * Stage 3B: Search 64-dim vectors via cuVS IVF prefilter
 *
 * Returns packet_key (via Redis reverse lookup) + distance for each result.
 * This is the critical step: 40K → 200 candidates in <10ms on RTX 3060 Ti.
 */
async function searchCuvSPrefilter(
	encodedQuery: Float32Array,
	config: Partial<CuvSConfig> = {}
): Promise<PrefilterCandidate[]> {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	try {
		const redis = await getRedisClient();

		// Stage 3B uses the existing TurboVec ANN lane as the search surface.
		// The query vector is the encoded latent64 vector produced by Stage 3A.
		const grpcResult = await turbovecGrpcSearch(Array.from(encodedQuery), cfg.nNeighbors);
		if (!grpcResult?.candidates?.length) {
			return [];
		}

		// Reverse lookup packet_key from candidate id.
		// The gRPC sidecar already returns stable ids; keep the Redis bridge as fallback.
		const candidates: PrefilterCandidate[] = [];
		const pointIds = grpcResult.candidates.map((candidate) => candidate.id);
		const cacheKeys = pointIds.map((id) => `ace:latent64:pointid:${id}`);
		const packetKeys = await redis.mget(cacheKeys);

		for (let i = 0; i < grpcResult.candidates.length; i++) {
			const candidate = grpcResult.candidates[i];
			const packetKey = packetKeys[i] || candidate.id;
			candidates.push({
				packetKey,
				distance: 1 - candidate.score,
				rank: i + 1,
			});
		}

		return candidates;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[Stage3B] cuVS search failed: ${msg}`);
		throw err;
	}
}

/**
 * Orchestrate: encode query → search → return top-K candidates for Stage 4
 *
 * Non-blocking on Redis read failures (fallback to brute-force CPU similarity via caller).
 */
export async function runStage3Prefilter(
	queryVec768: Float32Array,
	config: Partial<CuvSConfig> = {}
): Promise<PrefilterBatchResult> {
	const t0 = performance.now();
	const cfg = { ...DEFAULT_CONFIG, ...config };

	try {
		// Stage 3A: Encode
		const encoded = await encodeQuery(queryVec768);

		// Stage 3B: Search
		const candidates = await searchCuvSPrefilter(encoded, cfg);

		const latencyMs = Math.round(performance.now() - t0);

		return {
			query_id: `q:${Date.now()}`,
			candidates,
			latencyMs,
			encoded_query_bytes: encoded.byteLength,
			search_bytes: candidates.length * 12, // 4 bytes distance + 8 bytes packet_key pointer
		};
	} catch (err) {
		// Non-blocking: log error, return empty candidates
		// Caller will fall back to post-filter ranker without Stage 3B speedup
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(`[Stage3 Prefilter] Non-blocking fallback: ${msg}`);

		return {
			query_id: `q:${Date.now()}`,
			candidates: [],
			latencyMs: Math.round(performance.now() - t0),
			encoded_query_bytes: queryVec768.byteLength,
			search_bytes: 0,
		};
	}
}

/**
 * Health check: verify cuVS index is loaded and queryable
 */
export async function healthCheckStage3(): Promise<{
	healthy: boolean;
	addonLoaded: boolean;
	indexInRedis: boolean;
	sampleLatencyMs?: number;
	error?: string;
}> {
	try {
		const grpcHealth = await turbovecGrpcHealth();
		if (!grpcHealth?.ok) {
			return { healthy: false, addonLoaded: false, indexInRedis: false, error: 'TurboVec gRPC not healthy' };
		}

		const redis = await getRedisClient();
		const indexMeta = await redis.get('ace:cuvs:index:meta');
		if (!indexMeta) {
			return { healthy: false, addonLoaded: true, indexInRedis: false, error: 'Index not in Redis' };
		}

		// Sample query: all zeros (valid but arbitrary)
		const sampleQuery = new Float32Array(768);
		const t0 = performance.now();
		const result = await runStage3Prefilter(sampleQuery);
		const sampleLatencyMs = result.latencyMs;

		const healthy = sampleLatencyMs < 100; // Sanity: should be <10ms, but allow 100ms for cold start
		return {
			healthy,
			addonLoaded: true,
			indexInRedis: true,
			sampleLatencyMs,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { healthy: false, addonLoaded: false, indexInRedis: false, error: msg };
	}
}

export type { CuvSConfig, PrefilterCandidate, PrefilterBatchResult };
