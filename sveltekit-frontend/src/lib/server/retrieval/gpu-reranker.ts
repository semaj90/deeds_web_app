/**
 * GPU-Accelerated Post-Retrieval Reranker
 *
 * Pluggable reranker that uses LibTorch CUDA for batch cosine similarity
 * on merged retrieval results. Falls back to CPU if GPU unavailable.
 *
 * Integration points:
 *   - After graph-informed expansion merge (graph-informed-retrieval.ts)
 *   - After authority chain merge (authority-chain.ts)
 *   - After Qdrant multi-collection fan-out (qdrant-manager.ts)
 *   - After hybrid dense+sparse RRF fusion
 *
 * Uses batchCosineSimilarity from libtorch-bridge.ts:
 *   GPU: L2-normalized matmul via torch::mm (cuBLAS GEMM on RTX GPU)
 *   CPU: sequential dot product fallback
 */

import {
	batchCosineSimilarity,
	isCudaAvailable,
	getCudaMemoryInfo,
} from '$lib/server/gpu/libtorch-bridge.js';

export interface RerankableDoc {
	content: string;
	similarity: number;
	documentId: string;
	sourceId?: string;
	embedding?: number[];
	[key: string]: unknown;
}

export interface RerankResult<T extends RerankableDoc> {
	docs: T[];
	source: 'gpu' | 'cpu' | 'passthrough';
	rerankMs: number;
	docsReranked: number;
}

interface RerankConfig {
	/** Minimum docs to trigger GPU reranking (below this, JS sort is fine) */
	minDocsForGpu: number;
	/** Minimum free VRAM in MB to attempt GPU reranking */
	minVramMB: number;
	/** Maximum docs to include in GPU batch (VRAM budget) */
	maxBatchSize: number;
	/** Weight for GPU similarity vs original score (0-1, where 1 = full GPU) */
	gpuWeight: number;
}

const DEFAULT_CONFIG: RerankConfig = {
	minDocsForGpu: 20,
	minVramMB: 512,
	maxBatchSize: 1000,
	gpuWeight: 0.6,
};

/**
 * GPU-accelerated reranking of retrieval results.
 *
 * Given a query vector and a set of documents with embeddings,
 * re-scores them using batch cosine similarity on GPU (cuBLAS GEMM),
 * blending the GPU score with the original score.
 *
 * Documents without embeddings retain their original score.
 *
 * @param queryVector - The original query embedding (768-dim)
 * @param docs - Documents to rerank (must have .embedding for GPU scoring)
 * @param config - Optional config overrides
 * @returns Reranked documents sorted by blended score
 */
export async function gpuRerank<T extends RerankableDoc>(
	queryVector: number[],
	docs: T[],
	config?: Partial<RerankConfig>
): Promise<RerankResult<T>> {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const start = performance.now();

	// Not enough docs — plain sort is faster than GPU overhead
	if (docs.length < cfg.minDocsForGpu || queryVector.length === 0) {
		docs.sort((a, b) => b.similarity - a.similarity);
		return {
			docs,
			source: 'passthrough',
			rerankMs: Math.round(performance.now() - start),
			docsReranked: 0,
		};
	}

	// Separate docs with/without embeddings
	const withEmbed: { idx: number; embedding: number[] }[] = [];
	const withoutEmbed: number[] = [];

	for (let i = 0; i < docs.length; i++) {
		const emb = docs[i].embedding;
		if (Array.isArray(emb) && emb.length === queryVector.length) {
			withEmbed.push({ idx: i, embedding: emb });
		} else {
			withoutEmbed.push(i);
		}
	}

	// Not enough embeddings for GPU
	if (withEmbed.length < cfg.minDocsForGpu) {
		docs.sort((a, b) => b.similarity - a.similarity);
		return {
			docs,
			source: 'passthrough',
			rerankMs: Math.round(performance.now() - start),
			docsReranked: 0,
		};
	}

	// Check VRAM availability
	const cuda = isCudaAvailable();
	if (cuda) {
		const mem = getCudaMemoryInfo();
		if (mem.freeMB < cfg.minVramMB) {
			console.info(
				`[gpu-reranker] Insufficient VRAM: ${mem.freeMB}MB free, need ${cfg.minVramMB}MB — using CPU`
			);
		}
	}

	// Build corpus for batch similarity
	const batchSize = Math.min(withEmbed.length, cfg.maxBatchSize);
	const corpus = withEmbed.slice(0, batchSize).map((e) => e.embedding);

	try {
		const result = await batchCosineSimilarity(queryVector, corpus);

		// Blend GPU score with original score
		for (let i = 0; i < batchSize; i++) {
			const docIdx = withEmbed[i].idx;
			const gpuScore = result.scores[i];
			const origScore = docs[docIdx].similarity;
			docs[docIdx].similarity =
				cfg.gpuWeight * gpuScore + (1 - cfg.gpuWeight) * origScore;
		}

		// Re-sort all docs by blended score
		docs.sort((a, b) => b.similarity - a.similarity);

		return {
			docs,
			source: result.source,
			rerankMs: Math.round(performance.now() - start),
			docsReranked: batchSize,
		};
	} catch (err) {
		console.warn('[gpu-reranker] GPU reranking failed, falling back to sort:', (err as Error)?.message);
		docs.sort((a, b) => b.similarity - a.similarity);
		return {
			docs,
			source: 'cpu',
			rerankMs: Math.round(performance.now() - start),
			docsReranked: 0,
		};
	}
}

/**
 * Lightweight GPU reranking for Qdrant search results.
 *
 * Similar to gpuRerank but works with raw Qdrant point format
 * (id, score, payload, vector). Extracts vectors from Qdrant response.
 */
export async function gpuRerankQdrantResults(
	queryVector: number[],
	results: Array<{ id: string | number; score: number; payload?: Record<string, unknown>; vector?: number[] }>,
	config?: Partial<RerankConfig>
): Promise<{
	results: typeof results;
	source: 'gpu' | 'cpu' | 'passthrough';
	rerankMs: number;
}> {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const start = performance.now();

	const withVectors = results.filter((r) => Array.isArray(r.vector) && r.vector.length === queryVector.length);

	if (withVectors.length < cfg.minDocsForGpu || queryVector.length === 0) {
		return { results, source: 'passthrough', rerankMs: 0 };
	}

	const corpus = withVectors.map((r) => r.vector!);
	const batchSize = Math.min(corpus.length, cfg.maxBatchSize);

	try {
		const batchResult = await batchCosineSimilarity(queryVector, corpus.slice(0, batchSize));

		for (let i = 0; i < batchSize; i++) {
			const gpuScore = batchResult.scores[i];
			withVectors[i].score = cfg.gpuWeight * gpuScore + (1 - cfg.gpuWeight) * withVectors[i].score;
		}

		results.sort((a, b) => b.score - a.score);

		return {
			results,
			source: batchResult.source,
			rerankMs: Math.round(performance.now() - start),
		};
	} catch {
		return { results, source: 'cpu', rerankMs: Math.round(performance.now() - start) };
	}
}
