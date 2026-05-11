import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/** GET /api/health/system — Overall system health status */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ status: 'degraded', error: 'Unauthorized' }, { status: 401 });
	try {
		let allHealthy = true;

		// Quick checks
		try {
			const { getRedis } = await import('$lib/server/redis.js');
			const redis = getRedis();
			await redis.ping();
		} catch {
			allHealthy = false;
		}

		try {
			const { db } = await import('$lib/server/db/client');
			const { sql } = await import('drizzle-orm');
			await db.execute(sql`SELECT 1`);
		} catch {
			allHealthy = false;
		}

		return json({
			status: allHealthy ? 'healthy' : 'degraded',
			timestamp: new Date().toISOString()
		});
	} catch {
		return json({ status: 'error', timestamp: new Date().toISOString() });
	}
};