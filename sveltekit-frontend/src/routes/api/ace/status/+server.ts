import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getAceIngestJob } from '$lib/server/ace-ingest-progress.js';

const querySchema = z.object({
	jobId: z.string().min(1, 'Missing jobId parameter').max(200)
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Missing jobId parameter' }, { status: 400 });
	}
	const { jobId } = parsed.data;

	const job = getAceIngestJob(jobId);
	if (!job || job.userId !== locals.user.id) {
		return json({ error: 'Job not found' }, { status: 404 });
	}

	return json({
		jobId: job.jobId,
		sourceType: job.sourceType,
		caseId: job.caseId ?? null,
		title: job.title ?? null,
		filename: job.filename ?? null,
		step: job.step,
		progress: job.progress,
		message: job.message,
		error: job.error ?? null,
		status:
			job.step === 'complete'
				? 'completed'
				: job.step === 'deferred'
					? 'deferred'
				: job.step === 'error'
					? 'error'
					: job.step === 'queued'
						? 'queued'
						: 'running',
		result: job.result ?? null,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt,
	});
};
