import { json, type RequestHandler } from '@sveltejs/kit';
import { getAceIngestJob } from '$lib/server/ace-ingest-progress.js';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const jobId = url.searchParams.get('jobId');
	if (!jobId) {
		return json({ error: 'Missing jobId parameter' }, { status: 400 });
	}

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
