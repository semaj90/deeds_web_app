/**
 * GET /api/codeintel/jobs/[jobId]
 * Poll enrichment job status from enrichment_jobs table.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ job: null }, { status: 401 });

	const { jobId } = params;
	if (!jobId || jobId.length > 128) {
		return json({ job: null }, { status: 400 });
	}

	try {
		const result = await db.execute(sql`
			SELECT job_id, COALESCE(job_type,'') AS job_type,
			       COALESCE(status,'') AS status,
			       COALESCE(total_processed, 0) AS total_processed,
			       COALESCE(total_upserted, 0) AS total_upserted,
			       COALESCE(total_failed, 0) AS total_failed,
			       COALESCE(error_json::text, '') AS error_json,
			       COALESCE(updated_at::text, '') AS updated_at
			FROM enrichment_jobs
			WHERE job_id = ${jobId}
			LIMIT 1
		`);

		if (result.rows.length === 0) {
			return json({ job: null }, { status: 404 });
		}

		const r = result.rows[0] as any;
		return json({
			job: {
				jobId: r.job_id,
				jobType: r.job_type,
				status: r.status,
				totalProcessed: Number(r.total_processed),
				totalUpserted: Number(r.total_upserted),
				totalFailed: Number(r.total_failed),
				errorJson: r.error_json,
				updatedAt: r.updated_at,
			},
		});
	} catch {
		return json({ job: null });
	}
};
