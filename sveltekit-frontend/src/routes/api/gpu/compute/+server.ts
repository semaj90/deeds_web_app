/**
 * POST /api/gpu/compute
 *
 * GPU-accelerated compute operations via libtorch N-API addon.
 * Supports: similarity, cluster, weighted_embedding.
 * Falls back to CPU if native addon unavailable.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { graphSimilarity, clusterEmbeddings, computeCaseEmbedding, isCudaAvailable } from '$lib/server/gpu/libtorch-bridge.js';
import { embedAndCompare } from '$lib/gpu/gpu-embedding-bridge.js';
import { z } from 'zod';

const GPU_OPERATIONS = ['similarity', 'cluster', 'weighted_embedding', 'device_info', 'embed_compare'] as const;

const gpuComputeSchema = z.object({
	operation: z.enum(GPU_OPERATIONS, { message: 'Invalid operation' }),
	embeddings: z.array(z.array(z.number())).max(10000).optional(),
	weights: z.array(z.number()).max(10000).optional(),
	k: z.number().int().min(1).max(100).optional(),
	texts: z.array(z.string()).max(100).optional(),
	query: z.string().max(2048).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const raw = await request.json();
	const parsed = gpuComputeSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { operation, embeddings, weights, k } = parsed.data;
	const start = performance.now();

	if (operation === 'device_info') {
		return json({
			cudaAvailable: isCudaAvailable(),
			device: isCudaAvailable() ? 'RTX 3060 Ti (8GB, Ampere 8.6)' : 'CPU fallback',
			capabilities: ['similarity', 'cluster', 'weighted_embedding', 'embed_compare'],
		});
	}

	if (operation === 'embed_compare') {
		const { texts: inputTexts, query: inputQuery } = parsed.data;
		if (!inputTexts || inputTexts.length === 0) {
			return json({ error: 'texts array required for embed_compare' }, { status: 400 });
		}
		const result = await embedAndCompare(inputTexts, inputQuery ?? undefined);
		return json({
			totalVectors: result.metrics.totalVectors,
			embeddingTimeMs: result.metrics.embeddingTimeMs,
			similarityTimeMs: result.metrics.similarityTimeMs ?? null,
			compressionRatio: result.metrics.compressionRatio ?? null,
			backend: result.metrics.backend,
			similarities: result.similarities ? Array.from(result.similarities) : null,
			latencyMs: Math.round(performance.now() - start),
		});
	}

	if (!embeddings || embeddings.length === 0) {
		return json({ error: 'embeddings array required' }, { status: 400 });
	}

	if (operation === 'similarity') {
		const result = await graphSimilarity(embeddings);
		return json({
			...result,
			latencyMs: Math.round(performance.now() - start),
		});
	}

	if (operation === 'cluster') {
		const result = await clusterEmbeddings(embeddings, k ?? 5);
		return json({
			...result,
			latencyMs: Math.round(performance.now() - start),
		});
	}

	if (operation === 'weighted_embedding') {
		if (!weights || weights.length !== embeddings.length) {
			return json({ error: 'weights array must match embeddings length' }, { status: 400 });
		}
		const result = await computeCaseEmbedding(weights, embeddings);
		return json({
			...result,
			latencyMs: Math.round(performance.now() - start),
		});
	}

	return json({ error: `Unknown operation: ${operation}` }, { status: 400 });
};
