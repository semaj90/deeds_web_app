/**
 * POST /api/graph/analyze
 *
 * GPU-accelerated graph analysis endpoint.
 * Combines Neo4j graph algorithms + LibTorch CUDA matrix ops.
 *
 * Body: {
 *   caseId?: string,
 *   includePageRank?: boolean (default true),
 *   includeCommunities?: boolean (default true),
 *   includeGpuClusters?: boolean (default false),
 *   includeSimilarityMatrix?: boolean (default false),
 *   clusterCount?: number (default 8),
 *   halfPrecision?: boolean (default false),
 *   maxNodes?: number (default 500)
 * }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { analyzeGraph } from '$lib/server/graph/gpu-graph-analysis.js';

const analyzeSchema = z.object({
	caseId: z.string().uuid().optional(),
	includePageRank: z.boolean().optional().default(true),
	includeCommunities: z.boolean().optional().default(true),
	includeGpuClusters: z.boolean().optional().default(false),
	includeSimilarityMatrix: z.boolean().optional().default(false),
	clusterCount: z.number().int().min(2).max(50).optional().default(8),
	halfPrecision: z.boolean().optional().default(false),
	maxNodes: z.number().int().min(10).max(5000).optional().default(500),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const parsed = analyzeSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const result = await analyzeGraph(parsed.data);
		return json(result);
	} catch (err) {
		console.error('[/api/graph/analyze] Failed:', (err as Error)?.message);
		return json({ error: 'Graph analysis failed' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	return json({
		description: 'GPU-accelerated graph analysis (Neo4j + LibTorch CUDA)',
		algorithms: [
			{ name: 'pageRank', description: 'Iterative PageRank with damping=0.85', complexity: 'O(n*edges*iterations)' },
			{ name: 'communityDetection', description: 'Label propagation community detection', complexity: 'O(n*edges*iterations)' },
			{ name: 'gpuClusters', description: 'GPU K-Means clustering via cuBLAS (requires Qdrant embeddings)', complexity: 'O(n*k*dim*iterations)' },
			{ name: 'similarityMatrix', description: 'GPU cosine similarity matrix via torch::mm (cuBLAS GEMM)', complexity: 'O(n^2*dim)' },
		],
		gpu: {
			backend: 'LibTorch 2.9.0+cu130',
			matrixOps: 'cuBLAS GEMM (via torch::mm)',
			precisions: ['fp32', 'fp16 (halfPrecision=true, 2x VRAM savings)'],
		},
	});
};
