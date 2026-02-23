/**
 * GPU Search Reranker — Client-side reranking via WebGPU compute
 *
 * Bridges:
 *   - client-embed.ts → 768-dim ONNX embeddings (cached in IndexedDB)
 *   - gpu-compute-pipeline.ts → batch cosine similarity (WebGPU → WASM → CPU)
 *
 * Flow:
 *   1. Embed query client-side (single ONNX forward pass, ~50ms)
 *   2. Embed top-N result chunks client-side (batch, cached)
 *   3. GPU batch cosine similarity (all results at once)
 *   4. Return reranked results with GPU scores + timing metrics
 *
 * This runs entirely in the browser — no server round-trip for reranking.
 */

import { browser } from '$app/environment';
import type { ComputeBackend } from './gpu-compute-pipeline.js';

const EMBEDDING_DIM = 768;

/** GPU rerank metrics for display */
export interface GPURerankMetrics {
	backend: ComputeBackend;
	queryEmbedMs: number;
	chunkEmbedMs: number;
	gpuComputeMs: number;
	totalMs: number;
	chunksProcessed: number;
	chunksSkipped: number;
}

/** Result after GPU reranking */
export interface GPURankedItem {
	index: number;
	gpuScore: number;
	serverScore: number;
	delta: number;
}

/**
 * GPU-rerank a list of text chunks against a query.
 *
 * @param query - Search query text
 * @param chunks - Array of { content, serverScore } objects
 * @param maxChunks - Max chunks to re-embed (default 10, limits ONNX passes)
 * @returns Reranked items + metrics, or null if GPU unavailable
 */
export async function gpuRerank(
	query: string,
	chunks: Array<{ content: string; serverScore: number }>,
	maxChunks = 10
): Promise<{ items: GPURankedItem[]; metrics: GPURerankMetrics } | null> {
	if (!browser || chunks.length === 0) return null;

	const totalStart = performance.now();

	try {
		// Lazy-load to avoid SSR issues
		const [{ embedText }, { getGPUCompute }] = await Promise.all([
			import('$lib/ai/client-embed.js'),
			import('./gpu-compute-pipeline.js')
		]);

		// 1. Embed query (usually cached in IndexedDB)
		const queryStart = performance.now();
		const queryEmbedding = await embedText(query);
		const queryEmbedMs = performance.now() - queryStart;

		if (!queryEmbedding || queryEmbedding.length !== EMBEDDING_DIM) {
			console.warn('[GPURerank] Query embedding failed or wrong dimension');
			return null;
		}

		// 2. Embed top-N chunks (limited to avoid long waits)
		const chunkStart = performance.now();
		const toProcess = chunks.slice(0, maxChunks);
		const embeddings: (number[] | null)[] = [];
		let chunksSkipped = 0;

		for (const chunk of toProcess) {
			try {
				const text = chunk.content.slice(0, 512); // Truncate for embedding
				const emb = await embedText(text);
				if (emb && emb.length === EMBEDDING_DIM) {
					embeddings.push(emb);
				} else {
					embeddings.push(null);
					chunksSkipped++;
				}
			} catch {
				embeddings.push(null);
				chunksSkipped++;
			}
		}
		const chunkEmbedMs = performance.now() - chunkStart;

		// Filter to valid embeddings
		const validIndices: number[] = [];
		const flatDocs = new Float32Array(embeddings.filter(Boolean).length * EMBEDDING_DIM);
		let writeOffset = 0;

		for (let i = 0; i < embeddings.length; i++) {
			const emb = embeddings[i];
			if (emb) {
				validIndices.push(i);
				for (let d = 0; d < EMBEDDING_DIM; d++) {
					flatDocs[writeOffset + d] = emb[d];
				}
				writeOffset += EMBEDDING_DIM;
			}
		}

		if (validIndices.length === 0) {
			console.warn('[GPURerank] No valid chunk embeddings');
			return null;
		}

		// 3. GPU batch cosine similarity
		const gpuCompute = await getGPUCompute();
		const queryF32 = new Float32Array(queryEmbedding);
		const gpuResult = await gpuCompute.cosineSimilarity(
			queryF32,
			flatDocs,
			validIndices.length
		);

		// 4. Build ranked items
		const items: GPURankedItem[] = [];
		for (let vi = 0; vi < validIndices.length; vi++) {
			const originalIdx = validIndices[vi];
			items.push({
				index: originalIdx,
				gpuScore: gpuResult.data[vi],
				serverScore: toProcess[originalIdx].serverScore,
				delta: Math.abs(gpuResult.data[vi] - toProcess[originalIdx].serverScore)
			});
		}

		// Add unprocessed chunks (beyond maxChunks) with no GPU score
		for (let i = maxChunks; i < chunks.length; i++) {
			items.push({
				index: i,
				gpuScore: -1, // Not computed
				serverScore: chunks[i].serverScore,
				delta: 0
			});
		}

		// Sort by GPU score (computed items first, then uncomputed)
		items.sort((a, b) => {
			if (a.gpuScore >= 0 && b.gpuScore >= 0) return b.gpuScore - a.gpuScore;
			if (a.gpuScore >= 0) return -1;
			if (b.gpuScore >= 0) return 1;
			return b.serverScore - a.serverScore;
		});

		const metrics: GPURerankMetrics = {
			backend: gpuResult.backend,
			queryEmbedMs: Math.round(queryEmbedMs),
			chunkEmbedMs: Math.round(chunkEmbedMs),
			gpuComputeMs: Math.round(gpuResult.durationMs),
			totalMs: Math.round(performance.now() - totalStart),
			chunksProcessed: validIndices.length,
			chunksSkipped: chunksSkipped + (chunks.length - maxChunks)
		};

		console.info(
			`[GPURerank] ${validIndices.length} chunks via ${gpuResult.backend} in ${metrics.totalMs}ms ` +
			`(query: ${metrics.queryEmbedMs}ms, embed: ${metrics.chunkEmbedMs}ms, gpu: ${metrics.gpuComputeMs}ms)`
		);

		return { items, metrics };
	} catch (err) {
		console.error('[GPURerank] Failed:', err);
		return null;
	}
}