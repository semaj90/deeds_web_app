/**
 * POST /api/codebase/analyze
 *
 * GPU-accelerated codebase analysis using LibTorch CUDA.
 * Pulls vectors from Qdrant `codebase_chunks_768` collection, then runs:
 *   1. Similarity matrix (graphSimilarity / graphSimilarityHalf) — find duplicate/near-duplicate code
 *   2. K-Means clustering (clusterEmbeddings) — discover natural code groupings
 *   3. Batch similarity (batchCosineSimilarity) — optional query-based ranking
 *
 * Body: {
 *   mode: 'clusters' | 'duplicates' | 'full',
 *   k?: number (clusters, default 8),
 *   dupThreshold?: number (0.85-0.99, default 0.92),
 *   limit?: number (max vectors to analyze, default 500),
 *   halfPrecision?: boolean (use FP16 for 2x VRAM savings),
 *   query?: string (optional — rank chunks by similarity to query)
 * }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import {
	graphSimilarity,
	graphSimilarityHalf,
	clusterEmbeddings,
	batchCosineSimilarity,
	isCudaAvailable,
	getCudaMemoryInfo,
} from '$lib/server/gpu/libtorch-bridge.js';

const analyzeSchema = z.object({
	mode: z.enum(['clusters', 'duplicates', 'full']).default('full'),
	k: z.number().int().min(2).max(50).optional().default(8),
	dupThreshold: z.number().min(0.85).max(0.99).optional().default(0.92),
	limit: z.number().int().min(10).max(2000).optional().default(500),
	halfPrecision: z.boolean().optional().default(false),
	query: z.string().max(5000).optional(),
});

interface QdrantPoint {
	id: string | number;
	payload?: Record<string, unknown>;
	vector?: number[] | Record<string, number[]>;
}

interface ClusterInfo {
	id: number;
	size: number;
	members: {
		pointId: string | number;
		path: string;
		symbol: string;
		kind: string;
	}[];
	topPaths: string[];
}

interface DuplicatePair {
	similarity: number;
	a: { pointId: string | number; path: string; symbol: string };
	b: { pointId: string | number; path: string; symbol: string };
}

/** Scroll Qdrant for codebase vectors + payloads */
async function scrollCodebaseVectors(limit: number): Promise<QdrantPoint[]> {
	const points: QdrantPoint[] = [];
	let offset: string | number | null = null;
	const batchSize = Math.min(limit, 100);

	while (points.length < limit) {
		const body: Record<string, unknown> = {
			limit: batchSize,
			with_payload: true,
			with_vector: true,
		};
		if (offset !== null) body.offset = offset;

		try {
			const res = await fetch(
				`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(30_000),
				}
			);

			if (!res.ok) break;
			const data = await res.json();
			const batch = data.result?.points ?? [];
			if (batch.length === 0) break;

			points.push(...batch);
			offset = data.result?.next_page_offset ?? null;
			if (offset === null) break;
		} catch {
			break;
		}
	}

	return points.slice(0, limit);
}

/** Extract the dense vector from a Qdrant point (handles named vectors) */
function extractVector(point: QdrantPoint): number[] | null {
	if (!point.vector) return null;
	if (Array.isArray(point.vector)) return point.vector;
	// Named vector — try 'content' or first available
	if (typeof point.vector === 'object') {
		const named = point.vector as Record<string, number[]>;
		return named.content ?? named.dense ?? Object.values(named)[0] ?? null;
	}
	return null;
}

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

	const { mode, k, dupThreshold, limit, halfPrecision, query } = parsed.data;
	const start = performance.now();

	try {
		// GPU status
		const cudaAvailable = isCudaAvailable();
		const memInfo = getCudaMemoryInfo();

		// 1. Fetch vectors from Qdrant
		const points = await scrollCodebaseVectors(limit);
		if (points.length === 0) {
			return json({
				success: false,
				message: 'No codebase vectors found. Run POST /api/codebase/index first.',
				gpu: { cuda: cudaAvailable, ...memInfo },
			});
		}

		const embeddings: number[][] = [];
		const metadata: { pointId: string | number; path: string; symbol: string; kind: string }[] = [];

		for (const point of points) {
			const vec = extractVector(point);
			if (!vec || vec.length === 0) continue;
			embeddings.push(vec);
			metadata.push({
				pointId: point.id,
				path: (point.payload?.relativePath as string) ?? (point.payload?.path as string) ?? 'unknown',
				symbol: (point.payload?.symbol as string) ?? 'unknown',
				kind: (point.payload?.kind as string) ?? 'unknown',
			});
		}

		const fetchMs = Math.round(performance.now() - start);
		const result: Record<string, unknown> = {
			success: true,
			vectorCount: embeddings.length,
			dimension: embeddings[0]?.length ?? 0,
			gpu: {
				cuda: cudaAvailable,
				freeMB: memInfo.freeMB,
				totalMB: memInfo.totalMB,
				usedMB: memInfo.usedMB,
			},
		};

		// 2. Clustering
		if (mode === 'clusters' || mode === 'full') {
			const clusterStart = performance.now();
			const clusterResult = await clusterEmbeddings(embeddings, k);
			const clusterMs = Math.round(performance.now() - clusterStart);

			// Build cluster info
			const clusterMap = new Map<number, ClusterInfo>();
			for (let i = 0; i < clusterResult.assignments.length; i++) {
				const cId = clusterResult.assignments[i];
				if (!clusterMap.has(cId)) {
					clusterMap.set(cId, { id: cId, size: 0, members: [], topPaths: [] });
				}
				const cluster = clusterMap.get(cId)!;
				cluster.size++;
				cluster.members.push(metadata[i]);
			}

			// Compute top paths per cluster (most common directory)
			for (const cluster of clusterMap.values()) {
				const dirCounts = new Map<string, number>();
				for (const m of cluster.members) {
					const dir = m.path.split('/').slice(0, -1).join('/');
					dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
				}
				cluster.topPaths = [...dirCounts.entries()]
					.sort((a, b) => b[1] - a[1])
					.slice(0, 5)
					.map(([dir, count]) => `${dir} (${count})`);
				// Limit members to top 10 per cluster for response size
				cluster.members = cluster.members.slice(0, 10);
			}

			result.clusters = {
				k: clusterResult.k,
				source: clusterResult.source,
				clusterMs,
				groups: [...clusterMap.values()].sort((a, b) => b.size - a.size),
			};
		}

		// 3. Duplicate detection via similarity matrix
		if (mode === 'duplicates' || mode === 'full') {
			const simStart = performance.now();

			// For large sets, use half precision or limit matrix size
			const maxMatrixSize = halfPrecision ? 1000 : 500;
			const matrixEmbeddings = embeddings.slice(0, maxMatrixSize);
			const matrixMeta = metadata.slice(0, maxMatrixSize);

			const simResult = halfPrecision
				? await graphSimilarityHalf(matrixEmbeddings)
				: await graphSimilarity(matrixEmbeddings);

			const simMs = Math.round(performance.now() - simStart);

			// Extract duplicate pairs above threshold
			const duplicates: DuplicatePair[] = [];
			const n = simResult.matrix.length;
			for (let i = 0; i < n; i++) {
				for (let j = i + 1; j < n; j++) {
					const sim = simResult.matrix[i][j];
					if (sim >= dupThreshold) {
						duplicates.push({
							similarity: Math.round(sim * 10000) / 10000,
							a: matrixMeta[i],
							b: matrixMeta[j],
						});
					}
				}
			}

			// Sort by similarity descending, limit to top 50
			duplicates.sort((a, b) => b.similarity - a.similarity);

			result.duplicates = {
				source: simResult.source,
				precision: halfPrecision ? 'fp16' : 'fp32',
				simMs,
				matrixSize: n,
				totalPairs: duplicates.length,
				pairs: duplicates.slice(0, 50),
			};
		}

		// 4. Optional query ranking
		if (query) {
			// Embed the query via Ollama
			try {
				const embedRes = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: 'embeddinggemma:latest',
						input: query,
					}),
					signal: AbortSignal.timeout(10_000),
				});

				if (embedRes.ok) {
					const embedData = await embedRes.json();
					const queryVec: number[] = embedData.embeddings?.[0] ?? [];
					if (queryVec.length > 0) {
						const rankStart = performance.now();
						const rankResult = await batchCosineSimilarity(queryVec, embeddings);
						const rankMs = Math.round(performance.now() - rankStart);

						// Sort by similarity
						const ranked = rankResult.scores
							.map((score, i) => ({ score: Math.round(score * 10000) / 10000, ...metadata[i] }))
							.sort((a, b) => b.score - a.score)
							.slice(0, 20);

						result.queryRanking = {
							query,
							source: rankResult.source,
							rankMs,
							topMatches: ranked,
						};
					}
				}
			} catch {
				// Query ranking is optional — skip on error
			}
		}

		const totalMs = Math.round(performance.now() - start);
		result.timing = {
			fetchMs,
			totalMs,
		};

		return json(result);
	} catch (err) {
		console.error('[/api/codebase/analyze] Failed:', (err as Error)?.message);
		return json({ error: 'Codebase analysis failed' }, { status: 500 });
	}
};

/**
 * GET /api/codebase/analyze
 *
 * Returns GPU status and analysis capabilities.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const cudaAvailable = isCudaAvailable();
	const memInfo = getCudaMemoryInfo();

	return json({
		capabilities: {
			cuda: cudaAvailable,
			gpu: {
				freeMB: memInfo.freeMB,
				totalMB: memInfo.totalMB,
				usedMB: memInfo.usedMB,
			},
			operations: [
				{ name: 'graphSimilarity', description: 'FP32 cosine similarity matrix (cuBLAS GEMM)' },
				{ name: 'graphSimilarityHalf', description: 'FP16 similarity matrix (2x VRAM savings)' },
				{ name: 'clusterEmbeddings', description: 'GPU K-Means clustering' },
				{ name: 'batchCosineSimilarity', description: 'Query-vs-corpus ranking' },
				{ name: 'computeCaseEmbedding', description: 'Weighted embedding aggregation' },
			],
			modes: ['clusters', 'duplicates', 'full'],
		},
	});
};
