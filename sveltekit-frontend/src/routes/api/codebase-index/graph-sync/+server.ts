/**
 * POST /api/codebase-index/graph-sync
 *
 * Fires AST extraction → Neo4j sync as a background job.
 * Returns { jobId, status: 'started' } immediately — does NOT wait.
 *
 * Poll status: GET /api/codebase-index/graph-sync/status?jobId=<id>
 *
 * Auth: requires locals.user
 * Body (optional): { maxFiles?: number }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { syncCodebaseToNeo4j, type CodebaseSyncResult } from '$lib/server/graph/codebase-neo4j-sync.js';

const bodySchema = z.object({
	maxFiles: z.number().int().min(1).max(5000).optional().default(2000),
});

// ── In-process job tracker (server-side singleton) ────────────────────────────
export interface SyncJob {
	jobId: string;
	status: 'running' | 'done' | 'error';
	startedAt: string;
	finishedAt?: string;
	result?: CodebaseSyncResult;
	error?: string;
	// Live progress
	phase?: string;
	lastHeartbeat?: string;
	processedFiles?: number;
	processedEdges?: number;
}

const jobs = new Map<string, SyncJob>();

// ── POST — fire and forget ────────────────────────────────────────────────────
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	const { maxFiles } = parsed.success ? parsed.data : { maxFiles: 2000 };

	const jobId = randomUUID();
	const job: SyncJob = { jobId, status: 'running', startedAt: new Date().toISOString() };
	jobs.set(jobId, job);

	// Fire-and-forget — do NOT await
	const onPhase = (phase: string, extra?: { files?: number; edges?: number }) => {
		job.phase = phase;
		job.lastHeartbeat = new Date().toISOString();
		if (extra?.files !== undefined) job.processedFiles = extra.files;
		if (extra?.edges !== undefined) job.processedEdges = extra.edges;
	};
	syncCodebaseToNeo4j({ maxFiles, onPhase }).then((result) => {
		job.status = result.errors.length && !result.files ? 'error' : 'done';
		job.finishedAt = new Date().toISOString();
		job.result = result;
		job.phase = job.status === 'done' ? 'complete' : 'failed';
		if (job.status === 'error') {
			console.error('[codebase-index/graph-sync] Pipeline errors:', result.errors);
			job.error = 'Graph sync failed';
		}
	}).catch((err) => {
		console.error('[codebase-index/graph-sync] Pipeline error:', err);
		job.status = 'error';
		job.finishedAt = new Date().toISOString();
		job.error = 'Graph sync failed';
		job.phase = 'failed';
	});

	return json({
		jobId,
		status: 'started',
		message: `Sync job started (maxFiles: ${maxFiles}). Poll GET /api/codebase-index/graph-sync/status?jobId=${jobId}`,
	});
};

// ── GET — status poll ─────────────────────────────────────────────────────────
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const jobId = url.searchParams.get('jobId');
	if (!jobId) {
		// List recent jobs
		const recent = [...jobs.values()]
			.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
			.slice(0, 10);
		return json({ jobs: recent });
	}

	const job = jobs.get(jobId);
	if (!job) return json({ error: 'Job not found' }, { status: 404 });
	return json(job);
};
