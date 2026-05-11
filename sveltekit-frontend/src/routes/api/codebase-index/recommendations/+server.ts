/**
 * POST /api/codebase-index/recommendations
 *
 * Generates GPU-powered missing-import recommendations:
 *   1. Scrolls Qdrant codebase_chunks_768 for file embeddings
 *   2. Averages per-file chunk vectors → one centroid per file
 *   3. batchCosineSimilarity (GPU/CPU) per file vs corpus
 *   4. Filters already-wired pairs via Neo4j IMPORTS edges
 *   5. Writes graph-reco:file:<id> docs to CouchDB graph_recommendations
 *
 * Returns immediately with jobId. Poll GET ?jobId=<id> for status.
 *
 * Auth: requires locals.user
 * Body (optional): { threshold?: number, topK?: number, maxFiles?: number }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { generateMissingImportRecommendations, type RecommendationResult } from '$lib/server/graph/missing-import-recommendations.js';
import { couchdb } from '$lib/server/services/couchdb-client.js';

const COUCH_DB = 'graph_recommendations';

const bodySchema = z.object({
	threshold: z.number().min(0.5).max(0.99).optional().default(0.75),
	topK: z.number().int().min(1).max(20).optional().default(5),
	maxFiles: z.number().int().min(1).max(2000).optional().default(500),
});

// ── In-process job tracker ────────────────────────────────────────────────────
interface RecoJob {
	jobId: string;
	status: 'running' | 'done' | 'error';
	startedAt: string;
	finishedAt?: string;
	result?: RecommendationResult;
	error?: string;
}

const jobs = new Map<string, RecoJob>();

// ── POST — fire and forget ────────────────────────────────────────────────────
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	const opts = parsed.success ? parsed.data : { threshold: 0.75, topK: 5, maxFiles: 500 };

	const jobId = randomUUID();
	const job: RecoJob = { jobId, status: 'running', startedAt: new Date().toISOString() };
	jobs.set(jobId, job);

	generateMissingImportRecommendations(opts).then((result) => {
		job.status = result.errors.length && !result.filesProcessed ? 'error' : 'done';
		job.finishedAt = new Date().toISOString();
		job.result = result;
		if (job.status === 'error') {
			console.error('[codebase-index/recommendations] Pipeline errors:', result.errors);
			job.error = 'Recommendation pipeline failed';
		}
	}).catch((err) => {
		console.error('[codebase-index/recommendations] Pipeline error:', err);
		job.status = 'error';
		job.finishedAt = new Date().toISOString();
		job.error = 'Recommendation pipeline failed';
	});

	return json({
		jobId,
		status: 'started',
		message: `Recommendations job started (threshold: ${opts.threshold}, topK: ${opts.topK}, maxFiles: ${opts.maxFiles}). Poll GET /api/codebase-index/recommendations?jobId=${jobId}`,
	});
};

// ── GET — status poll + read CouchDB data ────────────────────────────────────
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const jobId = url.searchParams.get('jobId');
	const filePath = url.searchParams.get('filePath');
	const listAll = url.searchParams.get('list') === 'true';

	// 1 — job poll
	if (jobId) {
		const job = jobs.get(jobId);
		if (!job) return json({ error: 'Job not found' }, { status: 404 });
		return json(job);
	}

	// 2 — look up single file's recommendation doc
	if (filePath) {
		const fileId = (filePath.startsWith('src/') ? filePath : `src/${filePath}`)
			.replace(/[^a-zA-Z0-9/_.-]/g, '_');
		const docId = `graph-reco:file:${fileId}`;
		try {
			const doc = await couchdb.get(COUCH_DB, docId);
			return json({ doc });
		} catch {
			return json({ doc: null, message: 'No recommendation doc found for this file' });
		}
	}

	// 3 — list all recommendation docs
	if (listAll) {
		try {
			const all = await couchdb.allDocs(COUCH_DB, { include_docs: true, limit: 200 });
			const docs = all.rows
				.filter(r => r.id.startsWith('graph-reco:file:'))
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
