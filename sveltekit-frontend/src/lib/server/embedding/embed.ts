/**
 * Embedding Facade — unified import point for all embedding operations.
 *
 * Sprint 2: Cache-first pattern with in-flight request deduplication.
 * Sprint 3: Circuit breaker + retry for transient failure recovery.
 *
 * Architecture:
 *   embedText(text)   → cache check → in-flight dedup → circuit breaker → retry → generate → cache store
 *   embedTexts(texts)  → batch cache check → circuit breaker → retry → generate misses → batch cache store
 *
 * Re-exports from canonical modules:
 *   - Batch embeddings: grpc/embedding-client.ts (4-tier fallback: gRPC → QUIC → HTTP)
 *   - Binary cache: embedding-cache.ts (Redis, Float32Array, 1hr TTL)
 *   - Vector math: embedding/knn-helper.ts (cosine, dot, topK)
 */

import { generateEmbeddings, generateSingleEmbedding, checkGrpcHealth } from '$lib/server/grpc/embedding-client.js';
import {
	getCachedEmbedding,
	cacheEmbedding,
	batchGetCachedEmbeddings,
	batchCacheEmbeddings,
} from '$lib/server/embedding-cache.js';
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
	norm,
	euclideanDistance,
	topKNearest,
	type Vector,
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
 * Flow: Redis binary cache → in-flight dedup → 4-tier generation → cache store
 *
 * @param text - Text to embed (will be trimmed)
 * @returns 768-dim embedding vector
 */
export async function embedText(text: string): Promise<number[]> {
	const trimmed = text.trim();
	if (!trimmed) throw new Error('embedText: empty text');

	const key = cacheKey(trimmed);

	// 1. Check Redis binary cache
	try {
		const cached = await getCachedEmbedding(trimmed);
		if (cached) return fromFloat32(cached);
	} catch {
		// Cache miss or Redis down — continue to generation
	}

	// 2. Check in-flight requests (dedup identical concurrent calls)
	const existing = inFlight.get(key);
	if (existing) return existing;

	// 3. Generate via circuit breaker + retry, then cache
	const promise = ollamaBreaker.call(
		() => retry(
			() => generateSingleEmbedding(trimmed),
			{ maxAttempts: 2, baseDelayMs: 200, isRetryable: retryPredicates.networkOrServer }
		)
	).then(async (vector) => {
		inFlight.delete(key);
		// Cache asynchronously (don't block return)
		try {
			await cacheEmbedding(trimmed, toFloat32(vector));
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
 * Flow: Batch Redis lookup → generate cache misses → batch cache store
 *
 * @param texts - Array of texts to embed
 * @returns Array of 768-dim embedding vectors (preserves input order)
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
	if (texts.length === 0) return [];
	if (texts.length === 1) return [await embedText(texts[0])];

	const trimmed = texts.map(t => t.trim());

	// 1. Batch cache check
	let cachedResults: Array<Float32Array | null>;
	try {
		cachedResults = await batchGetCachedEmbeddings(trimmed);
	} catch {
		cachedResults = new Array(trimmed.length).fill(null);
	}

	// 2. Identify cache misses
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

	// All cached — return immediately
	if (missTexts.length === 0) {
		return results as number[][];
	}

	// 3. Generate only cache misses via circuit breaker + retry + 4-tier fallback
	const generated = await ollamaBreaker.call(
		() => retry(
			() => generateEmbeddings(missTexts),
			{ maxAttempts: 2, baseDelayMs: 200, isRetryable: retryPredicates.networkOrServer }
		)
	);

	// 4. Merge results + batch cache store
	const toCache: Array<{ text: string; embedding: Float32Array }> = [];
	for (let i = 0; i < missIndices.length; i++) {
		const idx = missIndices[i];
		const vector = generated.vectors[i];
		results[idx] = vector;
		toCache.push({ text: missTexts[i], embedding: toFloat32(vector) });
	}

	// Cache asynchronously
	if (toCache.length > 0) {
		batchCacheEmbeddings(toCache).catch(() => {
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
