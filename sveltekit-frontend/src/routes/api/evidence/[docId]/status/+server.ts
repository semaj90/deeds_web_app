import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getJob } from '$lib/server/evidence-progress';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';

/**
 * GET /api/evidence/[docId]/status
 * Returns processing status for an evidence upload job.
 * Checks in-memory progress store first, falls back to DB query.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { docId } = params;

	// 1. Check in-memory progress store (for active jobs)
	//    docId could be a jobId or an evidenceId
	const job = getJob(docId);
	if (job) {
		return json({
			status: job.step === 'complete' ? 'complete' : job.step === 'error' ? 'error' : 'processing',
			progress: job.progress,
			message: job.message,
			step: job.step,
			evidenceId: job.evidenceId,
			error: job.error,
		});
	}

	if (!isUuid(docId)) return json({ error: 'Invalid evidence ID format' }, { status: 400 });

	// 2. Fall back to database query (for completed uploads)
	try {
		const [record] = await db
			.select({ id: evidence.id, title: evidence.title, metadata: evidence.metadata })
			.from(evidence)
			.where(eq(evidence.id, docId))
			.limit(1);

		if (record) {
			return json({
				status: 'complete',
				progress: 100,
				message: 'Upload complete',
				evidenceId: record.id,
			});
		}
	} catch {
		// UUID parse error or DB issue — not found
	}

	return json({ status: 'not_found', progress: 0, message: 'Job not found' }, { status: 404 });
};