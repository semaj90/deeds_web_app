/**
 * Embedding Facade — unified import point for all embedding operations.
 *
 * Sprint 2: Revision-qualified cache through the embedding client.
 * Sprint 3: Circuit breaker + retry for transient failure recovery.
 * Sprint 4: Cache reuse requires qualified model-artifact identity.
 *
 * Architecture:
 *   embedText(text)   → revision-qualified cache → circuit breaker → retry → generate
 *   embedTexts(texts) → revision-qualified batch cache → circuit breaker → retry
 *
 * Cache identity is owned by grpc/embedding-client.ts and includes the
 * qualified model artifact, representation, tokenizer, input policy and input.
 *
 * Re-exports from canonical modules:
 *   - Batch embeddings: grpc/embedding-client.ts (4-tier fallback: gRPC → QUIC → HTTP)
 *   - Vector math: embedding/knn-helper.ts (cosine, dot, topK)
 */

import { generateEmbeddings, generateSingleEmbedding, checkGrpcHealth } from '$lib/server/grpc/embedding-client.js';
import { ollamaBreaker } from '$lib/server/circuit-breaker.js';
import { retry, retryPredicates } from '$lib/server/utils/retry.js';
import { formatEmbeddingGemmaInput, type EmbeddingGemmaInputMode } from '$lib/server/embedding/embedding-contract-768.js';

let activeEmbeddingCalls = 0;

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
	activeEmbeddingCalls += 1;
	try {
		return await ollamaBreaker.call(
			() => retry(
				() => generateSingleEmbedding(trimmed),
				{ maxAttempts: 2, baseDelayMs: 200, isRetryable: retryPredicates.networkOrServer }
			)
		);
	} finally {
		activeEmbeddingCalls -= 1;
	}
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
	activeEmbeddingCalls += 1;
	try {
		const generated = await ollamaBreaker.call(
			() => retry(
				() => generateEmbeddings(trimmed),
				{ maxAttempts: 2, baseDelayMs: 200, isRetryable: retryPredicates.networkOrServer }
			)
		);
		return generated.vectors;
	} finally {
		activeEmbeddingCalls -= 1;
	}
}

// ── Role-aware embedding (EMBED-CALLER-CONVERGENCE-01) ──────────────────────

/**
 * Embed text under an explicit EmbeddingGemma role. The contract owner
 * (embedding-contract-768.ts) formats the prompt, so the L3/L4 cache keys (md5 of the
 * exact text) differ automatically between roles and a prefixed vector can never be
 * served for a raw request. Recipes per column (census 2026-10-03):
 *   content_embedding     = 'document' with title = relative_path (content trimmed)
 *   content_embedding_768 = raw -> plain embedText(text), no role
 * Queries against a 'document' corpus use 'retrieval_query' / 'code_query'.
 */
export async function embedTextAs(mode: EmbeddingGemmaInputMode, text: string, title?: string): Promise<number[]> {
	return embedText(formatEmbeddingGemmaInput(mode, text, title));
}

/** Batch variant of embedTextAs; `titles` (if given) aligns with `texts` by index. */
export async function embedTextsAs(mode: EmbeddingGemmaInputMode, texts: string[], titles?: Array<string | undefined>): Promise<number[][]> {
	return embedTexts(texts.map((text, i) => formatEmbeddingGemmaInput(mode, text, titles?.[i])));
}

// ── Utility ─────────────────────────────────────────────────────────────────

/** Active generation call count, retained for the existing health response. */
export function getInFlightCount(): number {
	return activeEmbeddingCalls;
}
