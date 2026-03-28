import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { isUuid } from '$lib/server/validation.js';

/**
 * GET /api/pipeline/status/[jobId]
 * Query Redis for pipeline job status. Falls back to 'not_found' if no record.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { jobId } = params;

	if (!isUuid(jobId)) {
		return json({ error: 'Invalid ID format' }, { status: 400 });
	}

	try {
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		const raw = await redis.get(`pipeline:job:${jobId}`);

		if (raw) {
			const job = JSON.parse(raw);
			return json({
				jobId,
				status: job.status ?? 'unknown',
				progress: job.progress ?? 0,
				message: job.message ?? '',
				startedAt: job.startedAt ?? null,
				completedAt: job.completedAt ?? null,
			});
		}

		// Check RabbitMQ-backed job keys (evidence.process, document.embed, etc.)
		const queueKey = await redis.get(`queue:job:${jobId}`);
		if (queueKey) {
			const qJob = JSON.parse(queueKey);
			return json({
				jobId,
				status: qJob.status ?? 'queued',
				progress: qJob.progress ?? 0,
				message: qJob.message ?? 'Job queued for processing',
				startedAt: qJob.startedAt ?? null,
				completedAt: qJob.completedAt ?? null,
			});
		}
	} catch (err) {
		console.error('Pipeline status Redis error:', err);
	}

	return json({
		jobId,
		status: 'not_found',
		progress: 0,
		message: 'Job not found or expired',
	});
};
