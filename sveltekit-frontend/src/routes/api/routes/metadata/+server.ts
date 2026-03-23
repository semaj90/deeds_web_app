import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getAllRouteEndpoints,
	getActiveAPIEndpoints,
	getArchivedEndpoints,
	getRoutesByCategory,
	getRouteStats
} from '$lib/server/api-metadata-extractor';

const querySchema = z.object({
	includeArchived: z.enum(['true', 'false']).default('false')
});

/** GET /api/routes/metadata — Comprehensive route metadata for /all-routes UI */
export const GET: RequestHandler = async ({ url }) => {
	try {
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    const includeArchived = parsed.success ? parsed.data.includeArchived === 'true' : false;

    // Single scan — pass precomputed list to avoid repeated filesystem walks
    const allEndpoints = getAllRouteEndpoints(includeArchived);
    const activeAPI = getActiveAPIEndpoints(allEndpoints);
    const archived = includeArchived ? getArchivedEndpoints(allEndpoints) : [];
    const categories = getRoutesByCategory(includeArchived, allEndpoints);
    const stats = getRouteStats(allEndpoints);

    return json({
      success: true,
      data: {
        allEndpoints,
        activeAPI,
        archived,
        categories,
        stats,
      },
    });
  } catch (err) {
		console.error('[/api/routes/metadata]', err);
		return json({
			success: false,
			error: 'Failed to extract route metadata',
			data: {
				allEndpoints: [],
				activeAPI: [],
				archived: [],
				categories: [],
				stats: {
					totalRoutes: 0,
					activeRoutes: 0,
					archivedRoutes: 0,
					apiEndpoints: 0,
					pageServers: 0,
					pages: 0,
					categories: 0,
					methodCounts: { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0, load: 0, actions: 0 },
					groupCounts: { app: 0, dev: 0, admin: 0, api: 0, other: 0, archived: 0 },
					authRequired: 0,
					sse: 0
				}
			}
		});
	}
};