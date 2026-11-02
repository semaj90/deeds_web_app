import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWorkerStats } from '$lib/server/analysis/worker.js';
import { getEvidenceVectorProjectionSchedulerStatusV1 } from '$lib/server/evidence/evidence-vector-projection-scheduler-v1.js';
import { getJobCounts, getJobsForEvidence, enqueueJob, type JobType } from '$lib/server/analysis/analysis-jobs.js';
import { z } from 'zod';

const evidenceAnalysisSchema = z.object({
	evidenceId: z.string().min(1, 'Missing evidenceId').max(500),
	caseId: z.string().max(500).nullable().optional(),
	stages: z.array(z.enum(['entity_extraction', 'forensics', 'summarization', 'code_feature_registry'])).optional(),
	payload: z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/evidence/analysis
 * Worker health + job counts for admin dashboards.
 *
 * GET /api/evidence/analysis?evidenceId=xxx
 * All analysis jobs for a specific evidence item.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const evidenceId = url.searchParams.get('evidenceId');

	try {
		if (evidenceId) {
			const jobs = await getJobsForEvidence(evidenceId);
			return json({ available: true, evidenceId, jobs, error: null });
		}

		const [worker, counts] = await Promise.all([
			Promise.resolve(getWorkerStats()),
			getJobCounts(),
		]);

		return json({
			available: true,
			worker,
			jobCounts: counts,
			projectionScheduler: getEvidenceVectorProjectionSchedulerStatusV1(),
			error: null,
		});
	} catch (err) {
		console.error('Evidence analysis GET error:', err);
		if (evidenceId) {
			return json({ available: false, evidenceId, jobs: [], error: 'ANALYSIS_STATUS_UNAVAILABLE' }, { status: 503 });
		}
		return json({
			available: false,
			worker: null,
			jobCounts: null,
			projectionScheduler: getEvidenceVectorProjectionSchedulerStatusV1(),
			error: 'ANALYSIS_STATUS_UNAVAILABLE',
		}, { status: 503 });
	}
}

/**
 * POST /api/evidence/analysis
 * Enqueue re-analysis jobs for an evidence item.
 * Body: { evidenceId, caseId?, stages?: ('entity_extraction' | 'forensics' | 'summarization' | 'code_feature_registry')[], payload?: Record<string, unknown> }
 *
 * If stages is omitted, enqueues all three.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Zod schema validates evidenceId required + stages enum array
	const parsed = evidenceAnalysisSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const validStages: JobType[] = ['entity_extraction', 'forensics', 'summarization', 'code_feature_registry'];
		const requested: JobType[] = parsed.data.stages?.length
			? parsed.data.stages
			: validStages;

		const enqueued: { jobType: string; jobId: string }[] = [];
		for (const stage of requested) {
			const jobId = await enqueueJob({
				evidenceId: parsed.data.evidenceId,
				caseId: parsed.data.caseId ?? null,
				jobType: stage,
				result: parsed.data.payload ?? undefined,
			});
			enqueued.push({ jobType: stage, jobId });
		}

		return json({ enqueued }, { status: 201 });
	} catch (err) {
		console.error('Evidence analysis POST error:', err);
		return json({ error: 'Failed to enqueue analysis jobs' }, { status: 500 });
	}
}
