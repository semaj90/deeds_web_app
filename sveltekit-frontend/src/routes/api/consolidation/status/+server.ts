import { json } from '@sveltejs/kit';
import type { RequestHandler } from './';
import { db } from '$lib/server/db/client';
import { errorClusters, errorEvents, routeHealth } from '$lib/server/db/schema-postgres.js';
import { sql, eq } from 'drizzle-orm';

/**
 * GET /api/consolidation/status
 * Returns real error cluster and route health statistics from the database.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const [clusterRows, errorCount, healthyRoutes, degradedRoutes] = await Promise.all([
			db.select({ count: sql<number>`count(*)::int` }).from(errorClusters),
			db.select({ count: sql<number>`count(*)::int` }).from(errorEvents),
			db.select({ count: sql<number>`count(*)::int` }).from(routeHealth).where(eq(routeHealth.state, 'healthy')),
			db.select({ count: sql<number>`count(*)::int` }).from(routeHealth).where(eq(routeHealth.state, 'degraded')),
		]);

		return json({
			status: 'complete',
			lastRun: new Date().toISOString(),
			clusterCount: clusterRows[0]?.count ?? 0,
			errorEventCount: errorCount[0]?.count ?? 0,
			healthyRoutes: healthyRoutes[0]?.count ?? 0,
			degradedRoutes: degradedRoutes[0]?.count ?? 0,
			message: `${clusterRows[0]?.count ?? 0} error clusters, ${errorCount[0]?.count ?? 0} events tracked`,
		});
	} catch (err) {
		console.error('Consolidation status error:', err);
		return json({
			status: 'complete',
			lastRun: new Date().toISOString(),
			clusterCount: 0,
			errorEventCount: 0,
			healthyRoutes: 0,
			degradedRoutes: 0,
			message: 'Database query failed — returning defaults',
		});
	}
};