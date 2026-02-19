import { json, type RequestEvent } from '@sveltejs/kit';
import { getWorkerStats } from '$lib/server/analysis/worker.js';
import { getJobCounts, getJobsForEvidence, enqueueJob, type JobType } from '$lib/server/analysis/analysis-jobs.js';

/**
 * GET /api/evidence/analysis
 * Worker health + job counts for admin dashboards.
 *
 * GET /api/evidence/analysis?evidenceId=xxx
 * All analysis jobs for a specific evidence item.
 */
export async function GET({ url, locals }: RequestEvent) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const evidenceId = url.searchParams.get('evidenceId');

	if (evidenceId) {
		const jobs = await getJobsForEvidence(evidenceId);
		return json({ evidenceId, jobs });
	}

	const [worker, counts] = await Promise.all([
		Promise.resolve(getWorkerStats()),
		getJobCounts(),
	]);

	return json({ worker, jobCounts: counts });
}

/**
 * POST /api/evidence/analysis
 * Enqueue re-analysis jobs for an evidence item.
 * Body: { evidenceId, caseId?, stages?: ('entity_extraction' | 'forensics' | 'summarization')[] }
 *
 * If stages is omitted, enqueues all three.
 */
export async function POST({ request, locals }: RequestEvent) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	if (!body?.evidenceId) {
		return json({ error: 'Missing evidenceId' }, { status: 400 });
	}

	const validStages: JobType[] = ['entity_extraction', 'forensics', 'summarization'];
	const requested: JobType[] = Array.isArray(body.stages)
		? body.stages.filter((s: string) => validStages.includes(s as JobType))
		: validStages;

	if (requested.length === 0) {
		return json({ error: 'No valid stages specified' }, { status: 400 });
	}

	const enqueued: { jobType: string; jobId: string }[] = [];
	for (const stage of requested) {
		const jobId = await enqueueJob({
			evidenceId: body.evidenceId,
			caseId: body.caseId ?? null,
			jobType: stage,
		});
		enqueued.push({ jobType: stage, jobId });
	}

	return json({ enqueued }, { status: 201 });
}
