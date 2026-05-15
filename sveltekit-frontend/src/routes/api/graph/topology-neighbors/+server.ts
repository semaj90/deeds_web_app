/**
 * GET /api/graph/topology-neighbors?nodeId=<file-path>&k=12&clusterId=<int>
 *
 * Returns the k nearest neighbors of a codebase file in PCA-projected 2D space.
 * Used by the VS Code topology explorer to highlight topologically adjacent files
 * when a node is selected.
 *
 * Pipeline:
 *   1. Fetch the target node's content embedding from Qdrant (by `path` filter)
 *   2. Fetch all embeddings for nodes in the same som_cluster (or cluster_id)
 *   3. Compute mean + power-iteration PCA components on the cluster sample
 *   4. Run pcaProject (GPU when n≥256, CPU fallback) → 2D coords
 *   5. Find k-nearest by Euclidean distance in projected space
 *   6. Return neighbor file paths + projected coords + outputMeta (D19)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { pcaProject } from '$lib/server/gpu/topology-projection.js';
import { computeMean, computePCAComponents } from '$lib/server/topology/gpu-topology-projection.js';

const COLLECTION  = 'codebase_chunks_768';
const CONTENT_VEC = 'content';
const MAX_CLUSTER_SIZE = 2000;
const DEFAULT_K = 12;

const DEGRADED: TopologyNeighborsResponse = {
	nodeId: '', neighbors: [], projectedX: 0, projectedY: 0,
	source: 'cpu-fallback', durationMs: 0,
	outputMeta: { op: 'pcaProjectGPU', gpuUsed: false, inputRows: 0, inputDim: 0, outputDim: 2 },
};

interface NeighborEntry {
	id: string;
	file: string;
	projectedX: number;
	projectedY: number;
	distance: number;
	somCluster?: number;
}

interface TopologyNeighborsResponse {
	nodeId: string;
	neighbors: NeighborEntry[];
	projectedX: number;
	projectedY: number;
	source: 'gpu' | 'cpu-fallback';
	durationMs: number;
	outputMeta: {
		op: string;
		gpuUsed: boolean;
		inputRows: number;
		inputDim: number;
		outputDim: number;
	};
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ ...DEGRADED, error: 'Unauthorized' }, { status: 401 });

	const nodeId = url.searchParams.get('nodeId')?.trim();
	if (!nodeId) return json({ ...DEGRADED, error: 'nodeId required' }, { status: 400 });

	const k           = Math.min(50, Math.max(1, parseInt(url.searchParams.get('k') ?? '') || DEFAULT_K));
	const clusterHint = url.searchParams.get('clusterId');

	const t0 = performance.now();

	try {
		// ── Step 1: fetch target node embedding ────────────────────────────────
		const targetScroll = await qdrant.client.scroll(COLLECTION, {
			filter: { must: [{ key: 'path', match: { value: nodeId } }] },
			with_vector: [CONTENT_VEC],
			with_payload: ['path', 'som_cluster', 'cluster_id'],
			limit: 1,
		});

		const targetPoint = targetScroll.points[0];
		if (!targetPoint) {
			return json({ ...DEGRADED, nodeId, error: 'Node not found in index' }, { status: 404 });
		}

		const targetVec = extractVector(targetPoint.vector);
		if (!targetVec) {
			return json({ ...DEGRADED, nodeId, error: 'No content vector for node' }, { status: 404 });
		}

		const somCluster: number | undefined =
			(targetPoint.payload?.som_cluster as number | undefined) ??
			(clusterHint !== null ? parseInt(clusterHint) : undefined);

		// ── Step 2: fetch cluster siblings ────────────────────────────────────
		const filter = somCluster !== undefined
			? { must: [{ key: 'som_cluster', match: { value: somCluster } }] }
			: clusterHint
				? { must: [{ key: 'cluster_id', match: { value: clusterHint } }] }
				: null;

		if (!filter) {
			return json({ ...DEGRADED, nodeId, error: 'No cluster context — pass clusterId param' }, { status: 400 });
		}

		const clusterScroll = await qdrant.client.scroll(COLLECTION, {
			filter,
			with_vector: [CONTENT_VEC],
			with_payload: ['path', 'som_cluster'],
			limit: MAX_CLUSTER_SIZE,
		});

		const points = clusterScroll.points;
		if (points.length < 2) {
			return json({ ...DEGRADED, nodeId, neighbors: [], source: 'cpu-fallback', durationMs: Math.round(performance.now() - t0) });
		}

		// ── Step 3: build embedding matrix (include target node) ───────────────
		const dim = targetVec.length;
		const allPoints = points.some(p => p.payload?.path === nodeId)
			? points
			: [targetPoint, ...points].slice(0, MAX_CLUSTER_SIZE);

		const n = allPoints.length;
		const flat = new Float32Array(n * dim);
		const paths: string[] = [];
		const somClusters: (number | undefined)[] = [];
		let targetIdx = 0;

		for (let i = 0; i < n; i++) {
			const vec = extractVector(allPoints[i].vector);
			if (!vec || vec.length !== dim) continue;
			flat.set(vec, i * dim);
			paths.push((allPoints[i].payload?.path as string | undefined) ?? '');
			somClusters.push(allPoints[i].payload?.som_cluster as number | undefined);
			if (allPoints[i].payload?.path === nodeId) targetIdx = i;
		}

		// ── Step 4: power-iteration PCA → 2D ─────────────────────────────────
		const mean       = computeMean(flat, n, dim);
		const components = computePCAComponents(flat, n, dim, 2, mean);

		const result = await pcaProject(flat, mean, components, { n, dim, outDim: 2 });

		// ── Step 5: k-nearest by Euclidean in projected space ─────────────────
		const qx = result.projected[targetIdx * 2];
		const qy = result.projected[targetIdx * 2 + 1];

		const distances: { idx: number; dist: number }[] = [];
		for (let i = 0; i < n; i++) {
			if (i === targetIdx) continue;
			const dx = result.projected[i * 2] - qx;
			const dy = result.projected[i * 2 + 1] - qy;
			distances.push({ idx: i, dist: Math.sqrt(dx * dx + dy * dy) });
		}
		distances.sort((a, b) => a.dist - b.dist);

		const neighbors: NeighborEntry[] = distances.slice(0, k).map(({ idx, dist }) => ({
			id: paths[idx],
			file: paths[idx],
			projectedX: result.projected[idx * 2],
			projectedY: result.projected[idx * 2 + 1],
			distance: Math.round(dist * 10000) / 10000,
			somCluster: somClusters[idx],
		}));

		return json({
			nodeId,
			neighbors,
			projectedX: qx,
			projectedY: qy,
			source: result.source,
			durationMs: Math.round(performance.now() - t0),
			outputMeta: result.outputMeta,
		} satisfies TopologyNeighborsResponse);

	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[topology-neighbors] error:', msg);
		return json({ ...DEGRADED, nodeId, error: msg });
	}
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractVector(v: unknown): Float32Array | null {
	if (Array.isArray(v)) return new Float32Array(v as number[]);
	if (v && typeof v === 'object' && CONTENT_VEC in v) {
		const inner = (v as Record<string, unknown>)[CONTENT_VEC];
		if (Array.isArray(inner)) return new Float32Array(inner as number[]);
	}
	return null;
}
