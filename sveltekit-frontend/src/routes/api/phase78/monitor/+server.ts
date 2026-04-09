import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';

/** GET /api/phase78/monitor — Phase78 error monitoring dashboard stats */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const { routeHealth } = await import('$lib/server/db/schema.js');
		const { desc } = await import('drizzle-orm');

		const routes = await db
			.select({
				id: routeHealth.id,
				routePath: routeHealth.routePath,
				state: routeHealth.state,
				recentErrorCount: routeHealth.recentErrorCount,
				updatedAt: routeHealth.updatedAt
			})
			.from(routeHealth)
			.orderBy(desc(routeHealth.recentErrorCount))
			.limit(100);

		const totalRoutes = routes.length;
		const healthyRoutes = routes.filter((r) => r.state === 'healthy').length;
		const errorRoutes = routes.filter((r) => (r.recentErrorCount ?? 0) > 0).length;

		return json({
			totalRoutes,
			healthyRoutes,
			errorRoutes,
			healthPercentage: totalRoutes > 0 ? Math.round((healthyRoutes / totalRoutes) * 100) : 100,
			routes,
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		console.error('[/api/phase78/monitor] error:', err);
		return json({
      totalRoutes: 0,
      healthyRoutes: 0,
      errorRoutes: 0,
      healthPercentage: 100,
      routes: [],
      timestamp: new Date().toISOString(),
    });
	}
};
