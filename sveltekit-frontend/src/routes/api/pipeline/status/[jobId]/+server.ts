import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { isUuid } from '$lib/server/validation.js';
import { and, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { analysisJobs, evidence } from '$lib/server/db/schema-postgres.js';

/**
 * GET /api/pipeline/status/[jobId]
 * Query canonical database job status, then legacy Redis records.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { jobId } = params;

	if (!isUuid(jobId)) {
		return json({ error: 'Invalid ID format' }, { status: 400 });
	}

	const actorId = Number(locals.user.id);
	if (Number.isSafeInteger(actorId) && actorId > 0) {
		try {
			const [job] = await db
				.select({
					id: analysisJobs.id,
					status: analysisJobs.status,
					progress: analysisJobs.progress,
					result: analysisJobs.result,
					error: analysisJobs.error,
					startedAt: analysisJobs.startedAt,
					completedAt: analysisJobs.completedAt,
				})
				.from(analysisJobs)
				.innerJoin(evidence, eq(analysisJobs.evidenceId, evidence.id))
				.where(
					and(
						eq(analysisJobs.id, jobId),
						or(eq(evidence.uploadedBy, actorId), eq(evidence.userId, actorId)),
					),
				)
				.limit(1);

			if (job) {
				const result = job.result && typeof job.result === 'object'
					? (job.result as Record<string, unknown>)
					: {};
				const progress = Number(job.progress ?? 0);
				return json({
					jobId,
					status: job.status ?? 'unknown',
					progress: Number.isFinite(progress) ? progress : 0,
					message: typeof result.message === 'string' ? result.message : job.error ?? '',
					startedAt: job.startedAt?.toISOString() ?? null,
					completedAt: job.completedAt?.toISOString() ?? null,
				});
			}
		} catch (err) {
			console.error('Pipeline database status lookup failed; refusing cache fallback:', err);
			return json({
				jobId,
				status: 'unavailable',
				progress: 0,
				message: 'Durable job status is temporarily unavailable',
				startedAt: null,
				completedAt: null,
			}, { status: 503 });
		}
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
