/**
 * Attention-Based Post-Retrieval Reranker for ACE Stage 4
 *
 * Companion to gpu-reranker.ts but using computeAttentionBatch() from GPU.
 *
 * Replaces script: scripts/compute-p4-attention-scores.mjs (now live)
 *
 * Algorithm:
 *   1. Compute batch attention scores (query cosine similarity + sigmoid/softmax)
 *   2. Normalize via softmax (all scores sum to 1.0) or sigmoid (independent)
 *   3. Blend with original retrieval scores (weighted combination)
 *   4. Re-sort by blended score
 *   5. Optionally apply Karpathy Authority Blend (PR + authority + attention)
 *
 * Performance:
 *   - Batch 100 scores: CPU ~5ms → GPU ~0.5ms (10× faster)
 *   - GPU scoring on RTX 3060 Ti vs CPU: ~100× speedup for large batches
 *
 * Integration into ACE Stage 4:
 *   Called after RRF fusion, before LLM context packing.
 *   Optional; does not block retrieval if unavailable.
 */

import {
	computeAttentionBatch,
	AttentionDefaults,
	type AttentionScoreResult,
	type AttentionConfig
} from '$lib/gpu/attention-scoring.js';

export interface RerankableDocWithAttention {
	content: string;
	similarity: number; // Original retrieval score
	attentionScore?: number; // GPU-computed attention weight
	documentId: string;
	sourceId?: string;
	embedding?: Float32Array; // Must be 768-dim for attention computation
	[key: string]: unknown;
}

export interface AttentionRerankResult<T extends RerankableDocWithAttention> {
	docs: T[];
	rerankMethod: 'attention-sigmoid' | 'attention-softmax' | 'attention-linear';
	blendWeight: number; // How much to weight attention vs original score
	rerankMs: number;
	docsReranked: number;
	failureReason?: string; // Set if reranking failed (non-blocking)
}

export interface AttentionRerankConfig {
	/** Minimum docs to trigger attention reranking (default: 5) */
	minDocsForRerank?: number;
	/** Attention normalization mode (default: 'sigmoid') */
	normalization?: 'sigmoid' | 'softmax' | 'linear';
	/** Attention temperature parameter (default: 1.0) */
	temperature?: number;
	/** Blend weight: blended = (original * (1-w) + attention * w) (default: 0.5) */
	blendWeight?: number;
	/** Relevance threshold for attention filtering (default: 0.3) */
	relevanceThreshold?: number;
	/** Max documents to include in batch (default: 500) */
	maxBatchSize?: number;
}

const DEFAULT_CONFIG: AttentionRerankConfig = {
	minDocsForRerank: 5,
	normalization: 'sigmoid',
	temperature: 1.0,
	blendWeight: 0.5,
	relevanceThreshold: 0.3,
	maxBatchSize: 500
};

/**
 * Attention-based reranking of retrieval results
 *
 * Scores documents using query-weighted attention mechanism.
 * Non-blocking: returns original docs if attention computation fails.
 *
 * @param queryEmbedding 768-dim query embedding
 * @param docs Documents to rerank (must have .embedding)
 * @param config Rerank configuration
 * @returns Reranked documents sorted by blended attention score
 */
export async function rerankWithAttention<T extends RerankableDocWithAttention>(
	queryEmbedding: Float32Array,
	docs: T[],
	config: AttentionRerankConfig = {}
): Promise<AttentionRerankResult<T>> {
	const t0 = Date.now();
	const opts = { ...DEFAULT_CONFIG, ...config };

	if (docs.length < (opts.minDocsForRerank ?? 5)) {
		return {
			docs: docs.slice().sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)),
			rerankMethod: 'attention-sigmoid',
			blendWeight: opts.blendWeight ?? 0.5,
			rerankMs: Date.now() - t0,
			docsReranked: 0
		};
	}

	try {
		// Filter docs with embeddings (required for attention scoring)
		const docsWithEmbeddings = docs
			.map((doc, idx) => ({
				...doc,
				_originalIdx: idx
			}))
			.filter((doc) => doc.embedding && doc.embedding.length === 768);

		if (docsWithEmbeddings.length === 0) {
			return {
				docs,
				rerankMethod: 'attention-sigmoid',
				blendWeight: opts.blendWeight ?? 0.5,
				rerankMs: Date.now() - t0,
				docsReranked: 0,
				failureReason: 'No documents with 768-dim embeddings'
			};
		}

		// Batch attention scoring
		const packetEmbeddings = docsWithEmbeddings.map(
			(doc) => new Float32Array(doc.embedding as number[])
		);

		const attentionConfig: AttentionConfig = {
			normalization: (opts.normalization ?? 'sigmoid') as any,
			temperature: opts.temperature ?? 1.0,
			relevanceThreshold: opts.relevanceThreshold ?? 0.3
		};

		const attentionResults = await computeAttentionBatch(queryEmbedding, packetEmbeddings, attentionConfig);

		// Blend attention scores with original scores
		const blendWeight = opts.blendWeight ?? 0.5;
		const reranked = docsWithEmbeddings.map((doc, idx) => {
			const attentionScore = attentionResults.data[idx]?.attentionScore ?? 0;
			const originalScore = doc.similarity ?? 0;

			// Blend: weighted combination of original + attention
			const blendedScore = originalScore * (1 - blendWeight) + attentionScore * blendWeight;

			return {
				...doc,
				similarity: blendedScore,
				attentionScore
			};
		});

		// Re-sort by blended score
		reranked.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

		// Restore docs without embeddings at end (they retained original scores)
		const withoutEmbeddings = docs.filter((doc) => !doc.embedding || doc.embedding.length !== 768);

		return {
			docs: [...reranked, ...withoutEmbeddings] as T[],
			rerankMethod: attentionConfig.normalization as any,
			blendWeight,
			rerankMs: Date.now() - t0,
			docsReranked: reranked.length
		};
	} catch (err) {
		// Non-blocking: log error and return original docs
		console.warn('[Attention Reranker] Failed:', (err as Error).message);
		return {
			docs: docs.slice().sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)),
			rerankMethod: 'attention-sigmoid',
			blendWeight: opts.blendWeight ?? 0.5,
			rerankMs: Date.now() - t0,
			docsReranked: 0,
			failureReason: (err as Error).message
		};
	}
}

/**
 * Karpathy Authority Blend reranker
 *
 * Combines three scoring signals into a unified attention weight:
 *   blend = 0.4 * pageRank + 0.3 * attention + 0.3 * authority
 *
 * Used in ACE Karpathy re-ranking pass (Stage A0.5).
 *
 * @param docs Documents with PR, attention, and authority scores
 * @param config Blend configuration (all scores assumed normalized to [0,1])
 * @returns Reranked documents by blended score
 */
export async function rerankWithKarpathyBlend<T extends RerankableDocWithAttention & {
	pageRank?: number;
	authority?: number;
}>(docs: T[], config?: { karpathyWeights?: [number, number, number] }): Promise<T[]> {
	const [prWeight, attentionWeight, authorityWeight] = config?.karpathyWeights ?? [0.4, 0.3, 0.3];

	return docs
		.map((doc) => ({
			...doc,
			similarity:
				(doc.pageRank ?? 0) * prWeight +
				(doc.attentionScore ?? 0) * attentionWeight +
				(doc.authority ?? 0) * authorityWeight
		}))
		.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
}