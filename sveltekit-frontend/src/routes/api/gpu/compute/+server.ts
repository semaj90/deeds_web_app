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

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { operation, embeddings, weights, k } = body as {
		operation: 'similarity' | 'cluster' | 'weighted_embedding' | 'device_info';
		embeddings?: number[][];
		weights?: number[];
		k?: number;
	};

	if (operation === 'device_info') {
		return json({
			cudaAvailable: isCudaAvailable(),
			device: isCudaAvailable() ? 'RTX 3060 Ti (8GB, Ampere 8.6)' : 'CPU fallback',
		});
	}

	if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
		return json({ error: 'embeddings array required' }, { status: 400 });
	}

	const start = performance.now();

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
