/**
 * Embedding Facade — unified import point for all embedding operations.
 *
 * Sprint 2: Cache-first pattern with in-flight request deduplication.
 * Sprint 3: Circuit breaker + retry for transient failure recovery.
 * Sprint 4: PostgreSQL persistence (L4 cache tier, permanent storage).
 *
 * Architecture:
 *   embedText(text)   → L3 Redis → L4 PostgreSQL → in-flight dedup → circuit breaker → retry → generate → cache store
 *   embedTexts(texts) → batch L3/L4 check → circuit breaker → retry → generate misses → batch cache store
 *
 * Cache Hierarchy:
 *   L3: Redis (1hr TTL, binary Float32Array, fast)
 *   L4: PostgreSQL (permanent, compressed JSON, durable)
 *
 * Re-exports from canonical modules:
 *   - Batch embeddings: grpc/embedding-client.ts (4-tier fallback: gRPC → QUIC → HTTP)
 *   - Binary cache: embedding-cache.ts (Redis, Float32Array, 1hr TTL)
 *   - Persistence: embedding-persist.ts (PostgreSQL, permanent)
 *   - Vector math: embedding/knn-helper.ts (cosine, dot, topK)
 */

import { generateEmbeddings, generateSingleEmbedding, checkGrpcHealth } from '$lib/server/grpc/embedding-client.js';
import {
	getCachedEmbedding,
	cacheEmbedding,
	batchGetCachedEmbeddings,
	batchCacheEmbeddings,
} from '$lib/server/embedding-cache.js';
import {
	getPersistedEmbedding,
	persistEmbedding,
	batchGetPersistedEmbeddings,
	batchPersistEmbeddings,
} from '$lib/server/embedding/embedding-persist.js';
import { ollamaBreaker } from '$lib/server/circuit-breaker.js';
import { retry, retryPredicates } from '$lib/server/utils/retry.js';
import { createHash } from 'crypto';

// ── Re-exports (keep backward compatibility) ────────────────────────────────

export {
	generateEmbeddings,
	generateSingleEmbedding,
	checkGrpcHealth,
	type EmbeddingResult,
	type ProtoEmbeddingRequest,
	type ProtoEmbeddingResponse,
} from '$lib/server/grpc/embedding-client.js';

export {
	cosineSimilarity,
	dot,
	topKDomainCentroids,
	norm,
	euclideanDistance,
	topKNearest,
	validateVectorContract,
	type Vector,
	type VectorContract,
	type DomainCentroid,
	type DomainCentroidMatch,
} from '$lib/server/embedding/knn-helper.js';

export { embeddingCacheService } from '$lib/server/embedding-cache-service.js';

// ── In-flight request deduplication ─────────────────────────────────────────

const inFlight = new Map<string, Promise<number[]>>();

function cacheKey(text: string): string {
	return createHash('md5').update(text).digest('hex');
}

function toFloat32(arr: number[]): Float32Array {
	return new Float32Array(arr);
}

function fromFloat32(arr: Float32Array): number[] {
	return Array.from(arr);
}

// ── Cache-first single embedding ────────────────────────────────────────────

/**
 * Embed a single text with cache-first pattern + in-flight deduplication.
 *
 * Flow: L3 Redis → L4 PostgreSQL → in-flight dedup → 4-tier generation → cache store
 *
 * @param text - Text to embed (will be trimmed)
 * @returns 768-dim embedding vector
 */
export async function embedText(text: string): Promise<number[]> {
	const trimmed = text.trim();
	if (!trimmed) throw new Error('embedText: empty text');

	const key = cacheKey(trimmed);

	// 1. Check L3 Redis binary cache (fast, 1hr TTL)
	try {
		const cached = await getCachedEmbedding(trimmed);
		if (cached) return fromFloat32(cached);
	} catch {
		// Redis miss or down — continue to L4
	}

	// 2. Check L4 PostgreSQL cache (permanent, fallback)
	try {
		const persisted = await getPersistedEmbedding(trimmed);
		if (persisted) {
			// Backfill Redis cache asynchronously
			cacheEmbedding(trimmed, toFloat32(persisted)).catch(() => {});
			return persisted;
		}
	} catch {
		// PG miss or down — continue to generation
	}

	// 3. Check in-flight requests (dedup identical concurrent calls)
	const existing = inFlight.get(key);
	if (existing) return existing;

	// 4. Generate via circuit breaker + retry, then cache to L3 + L4
	const promise = ollamaBreaker.call(
		() => retry(
			() => generateSingleEmbedding(trimmed),
			{ maxAttempts: 2, baseDelayMs: 200, isRetryable: retryPredicates.networkOrServer }
		)
	).then(async (vector) => {
		inFlight.delete(key);
		// Cache to L3 Redis + L4 PostgreSQL asynchronously (don't block return)
		try {
			await Promise.all([
				cacheEmbedding(trimmed, toFloat32(vector)),    // L3 Redis
				persistEmbedding(trimmed, vector),              // L4 PostgreSQL
			]);
		} catch {
			// Cache write failure is non-fatal
		}
		return vector;
	}).catch((err) => {
		inFlight.delete(key);
		throw err;
	});

	inFlight.set(key, promise);
	return promise;
}

// ── Cache-first batch embedding ─────────────────────────────────────────────

/**
 * Embed multiple texts with cache-first pattern per item.
 *
 * Flow: Batch L3 Redis → L4 PostgreSQL fallback → generate misses → batch cache store
 *
 * @param texts - Array of texts to embed
 * @returns Array of 768-dim embedding vectors (preserves input order)
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
	if (texts.length === 0) return [];
	if (texts.length === 1) return [await embedText(texts[0])];

	const trimmed = texts.map(t => t.trim());

	// 1. Batch L3 Redis cache check
	let cachedResults: Array<Float32Array | null>;
	try {
		cachedResults = await batchGetCachedEmbeddings(trimmed);
	} catch {
		cachedResults = new Array(trimmed.length).fill(null);
	}

	// 2. Identify L3 cache misses
	const missIndices: number[] = [];
	const missTexts: string[] = [];
	const results: (number[] | null)[] = cachedResults.map((cached) =>
		cached ? fromFloat32(cached) : null
	);

	for (let i = 0; i < results.length; i++) {
		if (!results[i]) {
			missIndices.push(i);
			missTexts.push(trimmed[i]);
		}
	}

	// All cached in L3 — return immediately
	if (missTexts.length === 0) {
		return results as number[][];
	}

	// 3. Check L4 PostgreSQL for misses
	let l4Results: Array<number[] | null> = [];
	try {
		l4Results = await batchGetPersistedEmbeddings(missTexts);
	} catch {
		l4Results = new Array(missTexts.length).fill(null);
	}

	// Backfill L3 from L4 hits and track remaining misses
	const redisBackfill: Array<{ text: string; embedding: Float32Array }> = [];
	const generateIndices: number[] = [];
	const generateTexts: string[] = [];

	for (let i = 0; i < missIndices.length; i++) {
		const idx = missIndices[i];
		const l4Embedding = l4Results[i];
		if (l4Embedding) {
			results[idx] = l4Embedding;
			// Backfill L3 Redis
			redisBackfill.push({ text: missTexts[i], embedding: toFloat32(l4Embedding) });
		} else {
			generateIndices.push(idx);
			generateTexts.push(missTexts[i]);
		}
	}

	// Backfill L3 Redis asynchronously
	if (redisBackfill.length > 0) {
		batchCacheEmbeddings(redisBackfill).catch(() => {});
	}

	// All resolved from L3 + L4 — return immediately
	if (generateTexts.length === 0) {
		return results as number[][];
	}

	// 4. Generate only remaining misses via circuit breaker + retry + 4-tier fallback
	const generated = await ollamaBreaker.call(
		() => retry(
			() => generateEmbeddings(generateTexts),
			{ maxAttempts: 2, baseDelayMs: 200, isRetryable: retryPredicates.networkOrServer }
		)
	);

	// 5. Merge results + batch cache store to L3 + L4
	const toCache: Array<{ text: string; embedding: Float32Array }> = [];
	const toPersist: Array<{ text: string; embedding: number[] }> = [];
	for (let i = 0; i < generateIndices.length; i++) {
		const idx = generateIndices[i];
		const vector = generated.vectors[i];
		results[idx] = vector;
		toCache.push({ text: generateTexts[i], embedding: toFloat32(vector) });
		toPersist.push({ text: generateTexts[i], embedding: vector });
	}

	// Cache to L3 Redis + L4 PostgreSQL asynchronously
	if (toCache.length > 0) {
		Promise.all([
			batchCacheEmbeddings(toCache),           // L3 Redis
			batchPersistEmbeddings(toPersist),       // L4 PostgreSQL
		]).catch(() => {
			// Cache write failure is non-fatal
		});
	}

	return results as number[][];
}

// ── Utility ─────────────────────────────────────────────────────────────────

/** Get current in-flight request count (for monitoring) */
export function getInFlightCount(): number {
	return inFlight.size;
}
