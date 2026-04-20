/**
 * POST /api/codebase-index/batch-gpu
 *
 * Batch PyTorch orchestrator — runs n-ary GPU math over ALL indexed codebase vectors.
 * This is the GPU "spine" that the orchestrate endpoint calls piecemeal.
 * Here, all 6 ops run in sequence over the full corpus in one shot:
 *
 *   1. Scroll all codebase_chunks_768 vectors from Qdrant
 *   2. batchCosineSimilarity — query vs corpus (optional, requires query)
 *   3. kmeansWithCentroids — cluster the entire embedding space
 *   4. trainSOM — Kohonen topology map (grid adjacency)
 *   5. pageRankGPU — graph-level importance scoring
 *   6. attentionScoreGPU — query-weighted centroid scoring (optional)
 *   7. rewardScoreGPU — GRPO reward signal per cluster (optional)
 *   8. Write-back: update Qdrant payloads + Neo4j properties
 *
 * Body: {
 *   query?: string          — optional query for similarity + attention stages
 *   k?: number              — cluster count (default 20, max 100)
 *   somGridW?: number       — SOM grid width (auto if omitted)
 *   somGridH?: number       — SOM grid height (auto if omitted)
 *   somIters?: number       — SOM training iterations (default 1000)
 *   maxChunks?: number      — max vectors to process (default 2000, max 5000)
 *   writeBack?: boolean     — write results to Qdrant+Neo4j (default true)
 *   stages?: string[]       — run only these stages (default: all)
 * }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

const QDRANT_URL = ENV.QDRANT_URL;
const COLLECTION = 'codebase_chunks_768';
const DIM = 768;

const ALL_STAGES = ['similarity', 'kmeans', 'som', 'pagerank', 'attention', 'reward', 'writeback'] as const;
type Stage = typeof ALL_STAGES[number];

const batchSchema = z.object({
	query: z.string().max(500).optional(),
	k: z.number().int().min(2).max(100).default(20),
	somGridW: z.number().int().min(2).max(50).optional(),
	somGridH: z.number().int().min(2).max(50).optional(),
	somIters: z.number().int().min(100).max(10000).default(1000),
	maxChunks: z.number().int().min(10).max(5000).default(2000),
	writeBack: z.boolean().default(true),
	stages: z.array(z.enum(ALL_STAGES)).optional(),
});

// ── Qdrant scroll with vectors ──────────────────────────────────────────────

interface QdrantPoint {
	id: string | number;
	vector: Record<string, number[]> | number[];
	payload: Record<string, unknown>;
}

async function scrollAllVectors(limit: number): Promise<QdrantPoint[]> {
	const points: QdrantPoint[] = [];
	let offset: string | number | null = null;

	while (points.length < limit) {
		const remaining = limit - points.length;
		const body: Record<string, unknown> = {
			limit: Math.min(remaining, 100),
			with_payload: true,
			with_vector: true,
		};
		if (offset != null) body.offset = offset;

		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(30_000),
		}).catch(() => null);

		if (!res?.ok) break;
		const data = await res.json();
		const batch = data.result?.points ?? [];
		if (batch.length === 0) break;
		points.push(...batch);
		offset = data.result?.next_page_offset ?? null;
		if (offset == null) break;
	}

	return points;
}

/** Extract the 'content' named vector (768-dim) from a Qdrant point. */
function extractVector(point: QdrantPoint): Float32Array | null {
	const v = point.vector;
	if (!v) return null;
	// Named vectors: { content: number[], signature: number[] }
	if (typeof v === 'object' && !Array.isArray(v)) {
		const named = (v as Record<string, number[]>).content;
		if (Array.isArray(named) && named.length === DIM) return new Float32Array(named);
	}
	// Anonymous vector
	if (Array.isArray(v) && v.length === DIM) return new Float32Array(v);
	return null;
}

/** Embed a query string via Ollama embeddinggemma. */
async function embedQuery(text: string): Promise<Float32Array | null> {
	try {
		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', input: text }),
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) return null;
		const data = await res.json();
		const emb = data.embeddings?.[0];
		return emb ? new Float32Array(emb) : null;
	} catch {
		return null;
	}
}

// ── POST handler ────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = batchSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}

	const { query, k, somGridW, somGridH, somIters, maxChunks, writeBack, stages: requestedStages } = parsed.data;
	const activeStages = new Set<Stage>(requestedStages ?? ALL_STAGES);
	const t0 = performance.now();
	const results: Record<string, unknown> = {};
	const timings: Record<string, number> = {};

	// ── 1. Scroll all vectors from Qdrant ───────────────────────────────────
	const stageT = performance.now();
	const points = await scrollAllVectors(maxChunks);
	const n = points.length;
	timings.scroll = Math.round(performance.now() - stageT);

	if (n === 0) {
		return json({ error: 'No vectors in codebase_chunks_768', n: 0 }, { status: 404 });
	}

	// Build flat [n × DIM] array
	const flat = new Float32Array(n * DIM);
	const ids: (string | number)[] = [];
	let validCount = 0;

	for (const point of points) {
		const vec = extractVector(point);
		if (!vec) continue;
		flat.set(vec, validCount * DIM);
		ids.push(point.id);
		validCount++;
	}

	results.scroll = { totalPoints: n, validVectors: validCount, dim: DIM };

	// Lazy imports — only load GPU modules when actually called
	const {
		kmeansWithCentroids,
		trainSOM,
		pageRankGPU,
		attentionScoreGPU,
		rewardScoreGPU,
		drainFloat32Pool,
	} = await import('$lib/server/gpu/pytorch-graph.js');

	const { batchCosineSimilarityChunked } = await import('$lib/server/gpu/libtorch-bridge.js');

	// ── 2. Batch cosine similarity (optional — needs query) ─────────────────
	if (activeStages.has('similarity') && query) {
		const st = performance.now();
		const qVec = await embedQuery(query);
		if (qVec) {
			const corpus: number[][] = Array.from({ length: validCount }, (_, i) =>
				Array.from(flat.slice(i * DIM, (i + 1) * DIM))
			);
			const simResult = await batchCosineSimilarityChunked(Array.from(qVec), corpus);
			// Top-10 most similar
			const scored = simResult.scores
				.map((s, i) => ({ id: ids[i], score: s, source: simResult.source }))
				.sort((a, b) => b.score - a.score)
				.slice(0, 10);
			results.similarity = { topK: scored, source: simResult.source };
		} else {
			results.similarity = { skipped: true, reason: 'embedding failed' };
		}
		timings.similarity = Math.round(performance.now() - st);
	}

	// ── 3. K-means clustering ───────────────────────────────────────────────
	let assignments: Int32Array | null = null;
	let centroids: Float32Array | null = null;
	if (activeStages.has('kmeans')) {
		const st = performance.now();
		const km = kmeansWithCentroids(flat, validCount, DIM, k);
		assignments = km.assignments;
		centroids = km.centroids;

		// Cluster size distribution
		const clusterSizes: Record<number, number> = {};
		for (let i = 0; i < validCount; i++) {
			const c = assignments[i];
			clusterSizes[c] = (clusterSizes[c] ?? 0) + 1;
		}

		results.kmeans = {
			k,
			source: km.source,
			clusterSizes,
			centroidShape: `${k}×${DIM}`,
		};
		timings.kmeans = Math.round(performance.now() - st);
	}

	// ── 4. SOM topology ─────────────────────────────────────────────────────
	let bmu: Int32Array | null = null;
	if (activeStages.has('som')) {
		const st = performance.now();
		const gw = somGridW ?? Math.ceil(Math.sqrt(Math.sqrt(validCount) * 5));
		const gh = somGridH ?? Math.ceil(Math.sqrt(Math.sqrt(validCount) * 5));
		const radInit = Math.max(gw, gh) / 2;

		const som = trainSOM(flat, validCount, DIM, gw, gh, somIters, 0.1, 0.01, radInit, 1.0);
		bmu = som.bmu;

		results.som = {
			gridSize: `${gw}×${gh}`,
			neurons: gw * gh,
			source: som.source,
			bmuSample: Array.from(som.bmu.slice(0, 10)),
		};
		timings.som = Math.round(performance.now() - st);
	}

	// ── 5. PageRank ─────────────────────────────────────────────────────────
	let prScores: Float32Array | null = null;
	if (activeStages.has('pagerank') && assignments) {
		const st = performance.now();
		// Build adjacency from k-means: nodes in the same cluster are connected
		const adj = new Float32Array(validCount * validCount);
		for (let i = 0; i < validCount; i++) {
			for (let j = i + 1; j < validCount; j++) {
				if (assignments[i] === assignments[j]) {
					adj[i * validCount + j] = 1;
					adj[j * validCount + i] = 1;
				}
			}
		}

		// Cap at 2000 nodes for memory safety (adj is n² floats)
		if (validCount <= 2000) {
			const pr = pageRankGPU(adj, validCount);
			prScores = pr.scores;

			// Top-10 by PageRank
			const ranked = Array.from(pr.scores)
				.map((s, i) => ({ id: ids[i], score: s }))
				.sort((a, b) => b.score - a.score)
				.slice(0, 10);

			results.pagerank = { source: pr.source, top10: ranked };
		} else {
			results.pagerank = { skipped: true, reason: `n=${validCount} too large for n² adjacency` };
		}
		timings.pagerank = Math.round(performance.now() - st);
	}

	// ── 6. Attention scores (query-weighted centroids) ───────────────────────
	if (activeStages.has('attention') && query && centroids) {
		const st = performance.now();
		const qVec = await embedQuery(query);
		if (qVec) {
			const att = attentionScoreGPU(qVec, DIM, centroids, k);
			const weightedClusters = Array.from(att.weights)
				.map((w, i) => ({ cluster: i, weight: w }))
				.sort((a, b) => b.weight - a.weight);

			results.attention = { source: att.source, clusters: weightedClusters };
		} else {
			results.attention = { skipped: true, reason: 'embedding failed' };
		}
		timings.attention = Math.round(performance.now() - st);
	}

	// ── 7. Reward scores (GRPO signal per cluster centroid vs corpus mean) ──
	if (activeStages.has('reward') && centroids) {
		const st = performance.now();
		// Reference = corpus mean vector
		const mean = new Float32Array(DIM);
		for (let i = 0; i < validCount; i++) {
			for (let d = 0; d < DIM; d++) mean[d] += flat[i * DIM + d];
		}
		for (let d = 0; d < DIM; d++) mean[d] /= validCount;

		// Tile mean to k copies for rewardScoreGPU
		const refs = new Float32Array(k * DIM);
		for (let c = 0; c < k; c++) refs.set(mean, c * DIM);

		const rw = rewardScoreGPU(centroids, refs, k, DIM);
		const rewards = Array.from(rw.scores).map((s, i) => ({ cluster: i, reward: s }));

		results.reward = { source: rw.source, rewards };
		timings.reward = Math.round(performance.now() - st);
	}

	// ── 8. Write-back: Qdrant payloads + Neo4j properties ───────────────────
	if (activeStages.has('writeback') && writeBack && assignments) {
		const st = performance.now();
		let updated = 0;
		let failed = 0;

		// Batch Qdrant payload updates (100 at a time)
		for (let batch = 0; batch < validCount; batch += 100) {
			const end = Math.min(batch + 100, validCount);
			const pointUpdates = [];

			for (let i = batch; i < end; i++) {
				const payload: Record<string, unknown> = {
					gpu_cluster: assignments[i],
				};
				if (bmu) payload.som_bmu = bmu[i];
				if (prScores) payload.gpu_pagerank = prScores[i];

				pointUpdates.push({ id: ids[i], payload });
			}

			try {
				const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ points: pointUpdates }),
					signal: AbortSignal.timeout(15_000),
				});
				if (res.ok) updated += pointUpdates.length;
				else failed += pointUpdates.length;
			} catch {
				failed += pointUpdates.length;
			}
		}

		results.writeback = { updated, failed };
		timings.writeback = Math.round(performance.now() - st);
	}

	// Clean up pooled arrays
	drainFloat32Pool();

	return json({
		n: validCount,
		stages: Object.keys(results),
		results,
		timings,
		totalMs: Math.round(performance.now() - t0),
	});
};
