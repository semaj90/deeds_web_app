import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { clusterSummaries } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return json({ cluster: null, error: 'Unauthorized' }, { status: 401 });
	}

	const clusterId = parseInt(params.id, 10);
	if (isNaN(clusterId) || clusterId < 0) {
		return json({ cluster: null, error: 'Invalid cluster id' }, { status: 400 });
	}

	try {
		const rows = await db
			.select({
				id: clusterSummaries.id,
				gpuCluster: clusterSummaries.gpuCluster,
				summary: clusterSummaries.summary,
				purpose: clusterSummaries.purpose,
				patterns: clusterSummaries.patterns,
				warnings: clusterSummaries.warnings,
				tags: clusterSummaries.tags,
				memberCount: clusterSummaries.memberCount,
				summaryModel: clusterSummaries.summaryModel,
				centroidDistanceMean: clusterSummaries.centroidDistanceMean,
				createdAt: clusterSummaries.createdAt,
				updatedAt: clusterSummaries.updatedAt,
			})
			.from(clusterSummaries)
			.where(eq(clusterSummaries.gpuCluster, clusterId))
			.limit(1);

		if (rows.length === 0) {
			return json({ cluster: null, error: 'Cluster summary not found' }, { status: 404 });
		}

		const row = rows[0];
		return json({
			cluster: {
				...row,
				withEmbedding: false, // embedding not returned (large vector; query Qdrant for similarity)
			},
			error: null,
		});
	} catch {
		return json({ cluster: null, error: null }, { status: 200 });
	}
};
