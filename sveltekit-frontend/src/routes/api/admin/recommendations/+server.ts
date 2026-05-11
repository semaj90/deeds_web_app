import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { RecommendationEngine } from '$lib/server/ai/recommendation-engine';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Gather some basic state for the engine
		const stats = await db.execute(sql`
			SELECT 
				(SELECT count(*) FROM evidence WHERE summary IS NULL) as missing_summaries,
				(SELECT count(*) FROM legal_citations) as total_citations,
				(SELECT status FROM indexing_jobs ORDER BY created_at DESC LIMIT 1) as last_job_status
		`);

		const recommendations = await RecommendationEngine.getRecommendations({
			stats: (stats as any).rows || stats,
			timestamp: new Date().toISOString()
		});

		return json({ recommendations });
	} catch (err) {
		console.error('[Recommendations API] Error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
