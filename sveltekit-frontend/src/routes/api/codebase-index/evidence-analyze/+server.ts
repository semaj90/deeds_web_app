/**
 * POST /api/codebase-index/evidence-analyze
 *
 * Runs evidence analysis queries with cache warm-up:
 *   1. Selects domain-specific queries (evidence-analysis, evidence, etc.)
 *   2. Processes queries through bifrostChat (L1 Redis + L2 Bifrost + GPU)
 *   3. Tracks success/failure rates and latency metrics
 *   4. Writes analysis summary to CouchDB evidence_analysis
 *
 * Default model: gemma3:270m (fast, 4.5s avg) — use model: 'gemma4-legal:latest' for complex analysis
 *
 * Returns immediately with jobId. Poll GET ?jobId=<id> for status.
 *
 * Auth: requires locals.user (or DEV_BYPASS_AUTH)
 * Body (optional): {
 *   domain?: 'evidence' | 'evidence-analysis' | 'all',
 *   batchSize?: number,
 *   model?: string (default: 'gemma3:270m'),
 *   maxQueries?: number
 * }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { warmUpCache, warmUpDomain, type WarmUpReport } from '$lib/server/cache/warm-up.js';
import { couchdb } from '$lib/services/couchdb-client.js';

const COUCH_DB = 'evidence_analysis';

const bodySchema = z.object({
	domain: z.enum(['evidence', 'evidence-analysis', 'all']).optional().default('evidence-analysis'),
	batchSize: z.number().int().min(1).max(20).optional().default(5),
	// Default to gemma3:270m (fast, 4.5s avg) — use gemma4-legal for complex analysis
	model: z.string().optional().default('gemma3:270m'),
	maxQueries: z.number().int().min(1).max(200).optional(),
});

// ── In-process job tracker ────────────────────────────────────────────────────
interface EvidenceAnalysisJob {
	jobId: string;
	status: 'running' | 'done' | 'error';
	startedAt: string;
	finishedAt?: string;
	result?: WarmUpReport & {
		cacheHitRate?: number;
		avgLatency?: number;
	};
	error?: string;
}

const jobs = new Map<string, EvidenceAnalysisJob>();

// ── POST — fire evidence analysis ─────────────────────────────────────────────
export const POST: RequestHandler = async ({ request, locals }) => {
	// Auth check — only admins or dev mode
	if (!locals.user?.id) {
		if (process.env.DEV_BYPASS_AUTH !== 'true') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
	}

	const raw = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);

	if (!parsed.success) {
		return json(
			{
				error: 'Invalid request body',
				details: parsed.error.issues,
			},
			{ status: 400 }
		);
	}

	const opts = parsed.data;
	const jobId = randomUUID();
	const job: EvidenceAnalysisJob = {
		jobId,
		status: 'running',
		startedAt: new Date().toISOString(),
	};
	jobs.set(jobId, job);

	// Start analysis in background
	const analysisPromise = opts.domain === 'all'
		? warmUpCache({
				batchSize: opts.batchSize,
				model: opts.model,
				delayMs: 1000,
		  })
		: warmUpDomain(opts.domain, {
				batchSize: opts.batchSize,
				model: opts.model,
				delayMs: 1000,
		  });

	analysisPromise
		.then(async (report) => {
			// Calculate metrics (guard against division by zero)
			const cacheHitRate = report.totalQueries > 0
				? report.successful / report.totalQueries
				: 0;
			const avgLatency = report.totalQueries > 0
				? report.durationMs / report.totalQueries
				: 0;

			job.status = report.failed > 0 && report.successful === 0 ? 'error' : 'done';
			job.finishedAt = new Date().toISOString();
			job.result = {
				...report,
				cacheHitRate,
				avgLatency,
			};

			if (job.status === 'error') {
				job.error = report.errors[0]?.error || 'All queries failed';
			}

			// Store result in CouchDB
			try {
				const docId = `evidence-analysis:${jobId}:${opts.domain}`;
				await couchdb.put(COUCH_DB, docId, {
					jobId,
					domain: opts.domain,
					model: opts.model,
					batchSize: opts.batchSize,
					totalQueries: report.totalQueries,
					successful: report.successful,
					failed: report.failed,
					cacheHitRate,
					avgLatency,
					durationMs: report.durationMs,
					errors: report.errors.slice(0, 10), // Store first 10 errors only
					createdAt: new Date().toISOString(),
				});
			} catch (err) {
				console.warn('[evidence-analyze] Failed to store result in CouchDB:', err);
			}
		})
		.catch((err) => {
			console.error('[codebase-index/evidence-analyze] Pipeline error:', err);
			job.status = 'error';
			job.finishedAt = new Date().toISOString();
			job.error = 'Evidence analysis pipeline failed';
		});

	return json({
		jobId,
		status: 'started',
		message: `Evidence analysis started (domain: ${opts.domain}, queries: ${opts.domain === 'all' ? 120 : 20}, model: ${opts.model}). Poll GET /api/codebase-index/evidence-analyze?jobId=${jobId}`,
		config: {
			domain: opts.domain,
			totalQueries: opts.domain === 'all' ? 120 : 20,
			batchSize: opts.batchSize,
			model: opts.model,
		},
	});
};

// ── GET — status poll + read CouchDB data ────────────────────────────────────
export const GET: RequestHandler = async ({ url, locals }) => {
	// Auth check — only admins or dev mode
	if (!locals.user?.id) {
		if (process.env.DEV_BYPASS_AUTH !== 'true') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
	}

	const jobId = url.searchParams.get('jobId');
	const domain = url.searchParams.get('domain');
	const listAll = url.searchParams.get('list') === 'true';

	// 1 — job poll
	if (jobId) {
		const job = jobs.get(jobId);
		if (!job) return json({ error: 'Job not found' }, { status: 404 });
		return json(job);
	}

	// 2 — single domain results (latest)
	if (domain) {
		try {
			const all = await couchdb.allDocs(COUCH_DB, { include_docs: true, limit: 100 });
			const prefix = `evidence-analysis:`;
			const docs = all.rows
				.filter((r) => r.id.startsWith(prefix) && r.id.includes(`:${domain}`))
				.map((r) => r.doc)
				.filter(Boolean)
				.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));

			const latestDoc = docs[0];
			return json({ doc: latestDoc || null, total: docs.length });
		} catch {
			return json({ doc: null, total: 0, message: 'No results found for this domain' });
		}
	}

	// 3 — list all results
	if (listAll) {
		try {
			const all = await couchdb.allDocs(COUCH_DB, { include_docs: true, limit: 200 });
			const docs = all.rows
				.filter((r) => r.id.startsWith('evidence-analysis:'))
				.map((r) => r.doc)
				.filter(Boolean)
				.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));

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
