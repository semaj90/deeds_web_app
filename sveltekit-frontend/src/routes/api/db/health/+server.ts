import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/** GET /api/db/health — PostgreSQL database health check */
export const GET: RequestHandler = async () => {
	try {
		const { db } = await import('$lib/server/db/client');
		const { sql } = await import('drizzle-orm');

		const start = Date.now();
		const result = await db.execute(sql`SELECT 1 AS ok, current_timestamp AS server_time`);
		const latency = Date.now() - start;

		return json({
			status: 'healthy',
			latency,
			serverTime: result.rows?.[0]?.server_time ?? new Date().toISOString(),
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		console.error('[/api/db/health] error:', err);
		return json(
			{
				status: 'unhealthy',
				error: 'Database connection failed',
				timestamp: new Date().toISOString()
			},
			{ status: 503 }
		);
	}
};