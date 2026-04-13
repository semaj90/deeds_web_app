/**
 * POST /api/codebase-index/cluster-detect
 *
 * Runs GPU k-means clustering over all indexed codebase files:
 *   1. Pulls file embeddings from Qdrant codebase_chunks_768
 *   2. Mean-pools chunk vectors → one 768-dim centroid per file
 *   3. clusterEmbeddings(centroids, k) via libtorch CUDA (CPU fallback)
 *   4. Writes gpuCluster property to Neo4j CodebaseFile nodes
 *   5. Writes cluster summary docs to CouchDB graph_clusters
 *
 * Returns immediately with jobId. Poll GET ?jobId=<id> for status.
 *
 * Auth: requires locals.user
 * Body (optional): { k?: number, maxFiles?: number }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { detectCodebaseClusters, type ClusterDetectionResult } from '$lib/server/graph/codebase-cluster-detection.js';
import { couchdb } from '$lib/services/couchdb-client.js';

const COUCH_DB = 'graph_clusters';

const bodySchema = z.object({
	k: z.number().int().min(2).max(50).optional(),
	maxFiles: z.number().int().min(10).max(2000).optional().default(500),
});

// ── In-process job tracker ────────────────────────────────────────────────────
interface ClusterJob {
	jobId: string;
	status: 'running' | 'done' | 'error';
	startedAt: string;
	finishedAt?: string;
	result?: ClusterDetectionResult;
	error?: string;
}

const jobs = new Map<string, ClusterJob>();

// ── POST ──────────────────────────────────────────────────────────────────────
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	const opts = parsed.success ? parsed.data : { maxFiles: 500 };

	const jobId = randomUUID();
	const job: ClusterJob = { jobId, status: 'running', startedAt: new Date().toISOString() };
	jobs.set(jobId, job);

	detectCodebaseClusters(opts).then((result) => {
		job.status = result.errors.length && !result.filesProcessed ? 'error' : 'done';
		job.finishedAt = new Date().toISOString();
		job.result = result;
		if (job.status === 'error') job.error = result.errors[0];
	}).catch((err) => {
		job.status = 'error';
		job.finishedAt = new Date().toISOString();
		job.error = err instanceof Error ? err.message : String(err);
	});

	return json({
		jobId,
		status: 'started',
		message: `Cluster detection started (k: ${opts.k ?? 'auto'}, maxFiles: ${opts.maxFiles}). Poll GET /api/codebase-index/cluster-detect?jobId=${jobId}`,
	});
};

// ── GET ───────────────────────────────────────────────────────────────────────
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const jobId = url.searchParams.get('jobId');
	const kParam = url.searchParams.get('k');
	const clusterIdParam = url.searchParams.get('clusterId');
	const listAll = url.searchParams.get('list') === 'true';

	// 1 — job poll
	if (jobId) {
		const job = jobs.get(jobId);
		if (!job) return json({ error: 'Job not found' }, { status: 404 });
		return json(job);
	}

	// 2 — single cluster doc (requires both k and clusterId)
	if (kParam && clusterIdParam !== null) {
		const docId = `gpu-cluster:k${kParam}:${clusterIdParam}`;
		try {
			const doc = await couchdb.get(COUCH_DB, docId);
			return json({ doc });
		} catch {
			return json({ doc: null, message: 'Cluster doc not found' });
		}
	}

	// 3 — list all cluster docs (optionally filtered by k)
	if (listAll || kParam) {
		try {
			const all = await couchdb.allDocs(COUCH_DB, { include_docs: true, limit: 100 });
			const prefix = kParam ? `gpu-cluster:k${kParam}:` : 'gpu-cluster:';
			const docs = all.rows
				.filter(r => r.id.startsWith(prefix))
				.map(r => r.doc)
				.filter(Boolean);
			return json({ total: docs.length, docs });
		} catch {
			return json({ total: 0, docs: [] });
		}
	}

	// 4 — recent jobs list
	const recent = [...jobs.values()]
		.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
		.slice(0, 10);
	return json({ jobs: recent });
};
