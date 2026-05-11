import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { qdrantCentroidClusters } from '$lib/server/db/schema/kag-dag';
import { desc } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Fetch recent centroid clusters which act as RAPTOR summaries
		const clusters = await db
			.select()
			.from(qdrantCentroidClusters)
			.orderBy(desc(qdrantCentroidClusters.createdAt))
			.limit(20);

		return json({
			summaries: clusters.map(c => ({
				id: c.id,
				clusterKey: c.clusterKey,
				label: c.label || 'Thematic Cluster',
				summary: c.summary || 'Summary pending analysis...',
				level: (c.metadata as any)?.level || 1,
				created_at: c.createdAt,
				memberCount: c.memberCount
			}))
		});
	} catch (err) {
		console.error('[RAPTOR Atlas] Error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
