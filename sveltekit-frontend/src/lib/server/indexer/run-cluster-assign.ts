/**
 * run-cluster-assign.ts
 *
 * Extracts the codebase k-means cluster assignment logic from the
 * cluster-assign SSE route so it can be called programmatically
 * from the GPU pipeline recompute step.
 *
 * Assigns gpu_cluster to every chunk in codebase_chunks_768 and
 * mirrors the result to codebase_chunk_index.gpu_cluster in Postgres.
 */

import { ENV } from '$lib/server/env.server.js';
import { clusterEmbeddings } from '$lib/server/gpu/libtorch-bridge.js';
import { pool } from '$lib/server/db/client';

const COLLECTION = 'codebase_chunks_768';

export interface ClusterAssignResult {
	chunksFound: number;
	updated: number;
	k: number;
	source: 'gpu' | 'cpu';
	durationMs: number;
}

// ── Scroll all 768-dim vectors from Qdrant ────────────────────────────────────

async function scrollAllVectors(): Promise<Array<{ id: string; vector: number[] }>> {
	const chunks: Array<{ id: string; vector: number[] }> = [];
	let offset: string | number | null = null;
	const limit = 500;

	do {
		const res = await fetch(`${ENV.QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				limit,
				with_payload: false,
				with_vector: true,
				offset: offset !== null ? offset : undefined,
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!res.ok) break;

		const data = await res.json();
		const points: unknown[] = data.result?.points ?? [];

		for (const pt of points as Array<{ id: unknown; vector: unknown }>) {
			const v = (pt.vector as Record<string, unknown>)?.content ?? pt.vector;
			if (Array.isArray(v) && v.length === 768) {
				chunks.push({ id: String(pt.id), vector: v as number[] });
			}
		}

		offset = data.result?.next_page_offset ?? null;
	} while (offset !== null);

	return chunks;
}

// ── Batch-update Qdrant payloads ──────────────────────────────────────────────

async function updateQdrantGpuClusters(
	chunks: Array<{ id: string }>,
	assignments: number[],
): Promise<void> {
	const batchSize = 100;

	for (let i = 0; i < chunks.length; i += batchSize) {
		const batch = chunks.slice(i, i + batchSize);
		const assignBatch = assignments.slice(i, i + batchSize);

		const operations = batch.map((chunk, idx) => ({
			set_payload: {
				payload: { gpu_cluster: assignBatch[idx], neo4j_gpuCluster: assignBatch[idx] },
				points: [chunk.id],
			},
		}));

		await fetch(`${ENV.QDRANT_URL}/collections/${COLLECTION}/points/batch`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ operations }),
			signal: AbortSignal.timeout(15_000),
		}).catch((e) => console.warn('[run-cluster-assign] Qdrant batch error:', e));
	}
}

// ── Batch-update Postgres codebase_chunk_index.gpu_cluster ───────────────────

async function updatePostgresGpuClusters(
	rows: Array<{ qdrantId: string; gpuCluster: number }>,
): Promise<void> {
	if (!rows.length) return;

	const batchSize = 500;

	for (let i = 0; i < rows.length; i += batchSize) {
		const batch = rows.slice(i, i + batchSize);
		const valuesSql = batch
			.map((_, idx) => `($${idx * 2 + 1}::text, $${idx * 2 + 2}::int)`)
			.join(', ');
		const params = batch.flatMap((r) => [r.qdrantId, r.gpuCluster]);

		await pool.query(
			`UPDATE codebase_chunk_index c
			    SET gpu_cluster = v.gpu_cluster,
			        updated_at = NOW()
			   FROM (VALUES ${valuesSql}) AS v(qdrant_id, gpu_cluster)
			  WHERE c.qdrant_id = v.qdrant_id`,
			params,
		).catch((e) => console.warn('[run-cluster-assign] Postgres batch error:', e));
	}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run k-means on all codebase_chunks_768 vectors and persist gpu_cluster
 * to both Qdrant payloads and codebase_chunk_index in Postgres.
 *
 * @param k  Number of clusters. Defaults to 20, capped at 100.
 */
export async function runClusterAssign(k = 20): Promise<ClusterAssignResult> {
	const t0 = performance.now();
	const safeK = Math.min(Math.max(k, 2), 100);

	const chunks = await scrollAllVectors();

	if (chunks.length < 2) {
		return { chunksFound: chunks.length, updated: 0, k: safeK, source: 'cpu', durationMs: Math.round(performance.now() - t0) };
	}

	const vectors = chunks.map((c) => c.vector);
	const clusterResult = await clusterEmbeddings(vectors, safeK);

	await updateQdrantGpuClusters(chunks, clusterResult.assignments);
	await updatePostgresGpuClusters(
		chunks.map((c, i) => ({ qdrantId: c.id, gpuCluster: clusterResult.assignments[i] })),
	);

	return {
		chunksFound: chunks.length,
		updated: chunks.length,
		k: safeK,
		source: clusterResult.source,
		durationMs: Math.round(performance.now() - t0),
	};
}
