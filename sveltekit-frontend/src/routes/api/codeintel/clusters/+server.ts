/**
 * GET /api/codeintel/clusters
 * List all cluster summaries, optionally filtered by gpu_clusters.
 *
 * Query params:
 *   repoId    — filter by repo (optional)
 *   clusters  — comma-separated cluster IDs (optional)
 *   limit     — max rows (default 100)
 *   offset    — pagination offset (default 0)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { clusterSummaries } from '$lib/server/db/schema-postgres.js';
import { eq, inArray, sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ summaries: [], total: 0 }, { status: 401 });
	}

	const repoId = url.searchParams.get('repoId') ?? '';
	const clustersParam = url.searchParams.get('clusters') ?? '';
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 200);
	const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);

	const clusterFilter = clustersParam
		? clustersParam.split(',').map(Number).filter(n => !isNaN(n))
		: [];

	try {
		let query = db
			.select({
				id: clusterSummaries.id,
				repoId: clusterSummaries.repoId,
				gpuCluster: clusterSummaries.gpuCluster,
				summary: clusterSummaries.summary,
				purpose: clusterSummaries.purpose,
				patterns: clusterSummaries.patterns,
				warnings: clusterSummaries.warnings,
				tags: clusterSummaries.tags,
				memberCount: clusterSummaries.memberCount,
				representativeChunkIds: clusterSummaries.representativeChunkIds,
				summaryModel: clusterSummaries.summaryModel,
				centroidDistanceMean: clusterSummaries.centroidDistanceMean,
				hasSummaryEmbedding: sql<boolean>`(summary_embedding IS NOT NULL)`,
				metadataJson: sql<string>`COALESCE(metadata::text, '{}')`,
				updatedAt: sql<string>`COALESCE(updated_at::text, '')`,
			})
			.from(clusterSummaries)
			.$dynamic();

		if (repoId) {
			query = query.where(eq(clusterSummaries.repoId, repoId));
		}
		if (clusterFilter.length > 0) {
			query = query.where(inArray(clusterSummaries.gpuCluster, clusterFilter));
		}

		const rows = await query
			.orderBy(clusterSummaries.gpuCluster)
			.limit(limit)
			.offset(offset);

		// Count total
		const countResult = await db
			.select({ count: sql<number>`COUNT(*)` })
			.from(clusterSummaries);
		const total = Number(countResult[0]?.count ?? 0);

		return json({ summaries: rows, total });
	} catch {
		return json({ summaries: [], total: 0 });
	}
};
