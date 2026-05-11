import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Fetch recent/running jobs
		const jobs = await db.execute(sql`
			SELECT id, type, status, progress, total, metadata, error, created_at
			FROM indexing_jobs
			WHERE created_at > NOW() - INTERVAL '12 hours'
			ORDER BY created_at DESC
			LIMIT 50
		`);

		return json({
			jobs: extractRows(jobs)
		});
	} catch (err) {
		console.error('[Admin Jobs] Error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

function extractRows(result: any) {
	return Array.isArray(result) ? result : (result.rows || []);
}
