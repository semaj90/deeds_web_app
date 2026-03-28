/**
 * GET /api/recommendations/jobs/[jobId]
 * Poll for async recommendation job status and results.
 *
 * Response statuses:
 *   - processing: Job still running
 *   - complete: Results ready (includes recommendations)
 *   - failed: Job errored
 *   - not_found: Job expired or never existed
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { jobId } = params;

	if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
		return json({ success: false, error: 'Invalid job ID' }, { status: 400 });
	}

	try {
		const redis = getRedis();

		// Check job status
		const jobData = await redis.get(`rec:job:${jobId}`);
		if (!jobData) {
			return json({
				success: false,
				error: 'Job not found or expired',
				status: 'not_found'
			}, { status: 404 });
		}

		const job = JSON.parse(jobData);

		if (job.status === 'processing') {
			return json({
				success: true,
				data: { status: 'processing', jobId }
			});
		}

		if (job.status === 'failed') {
			return json({
				success: false,
				data: { status: 'failed', jobId, error: job.error || 'Unknown error' }
			});
		}

		if (job.status === 'complete') {
			// Fetch results
			const resultData = await redis.get(`rec:result:${jobId}`);
			if (!resultData) {
				return json({
					success: true,
					data: {
						status: 'complete',
						jobId,
						recommendations: [],
						metadata: { error: 'Results expired' }
					}
				});
			}

			const result = JSON.parse(resultData);

			return json({
				success: true,
				data: {
					status: 'complete',
					jobId,
					recommendations: result.recommendations || [],
					glyphs: result.glyphs,
					query: result.query,
					topK: result.topK,
					totalCandidates: result.totalCandidates
				},
				metadata: result.metadata
			});
		}

		// Unknown status
		return json({
			success: false,
			data: { status: 'unknown', jobId }
		}, { status: 500 });
	} catch (err) {
		console.warn(`[recommendations] Job poll error for ${jobId}:`, (err as Error).message);
		return json({
			success: false,
			error: 'Recommendation service temporarily unavailable',
			status: 'not_found'
		}, { status: 404 });
	}
};
