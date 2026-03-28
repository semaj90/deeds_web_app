/**
 * GET /api/cache/llm/stats
 * Returns LLM cache statistics (collection size, recent entries, hit rate estimates)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { QdrantManager } from '$lib/server/vector/qdrant-manager.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const qdrant = new QdrantManager();

		// Get collection info
		const collectionInfo = await qdrant.client.getCollection(qdrant.collections.llm_cache);

		// Get sample of recent cache entries
		const scrollRes = await qdrant.client.scroll(qdrant.collections.llm_cache, {
			limit: 10,
			with_payload: true,
			order_by: {
				key: 'cachedAt',
				direction: 'desc'
			}
		});

		const recentEntries = scrollRes.points.map((p: Record<string, any>) => ({
			query: p.payload?.query?.slice(0, 50) + '...',
			model: p.payload?.model,
			cachedAt: p.payload?.cachedAt,
			expiresAt: p.payload?.expiresAt
		}));

		// Count expired entries
		const now = new Date().toISOString();
		const expiredRes = await qdrant.client.scroll(qdrant.collections.llm_cache, {
			limit: 1,
			filter: {
				must: [
					{
						key: 'expiresAt',
						range: {
							lt: now
						}
					}
				]
			}
		});

		return json({
			success: true,
			stats: {
				totalEntries: collectionInfo.points_count,
				vectorsDim: (collectionInfo.config?.params?.vectors as { size?: number })?.size ?? 768,
				expiredEntries: expiredRes.points.length > 0 ? '1+' : 0,
				recentEntries,
				collectionStatus: collectionInfo.status
			},
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('[Cache Stats] Error:', error);
		return json(
			{
				success: false,
				error: 'Failed to retrieve cache stats',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};
