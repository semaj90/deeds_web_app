import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db, { sql } from '$lib/server/db';

/**
 * GET /api/health/database
 * Health check for PostgreSQL connectivity.
 * Runs a simple SELECT 1 query to verify the connection is alive.
 */
export const GET: RequestHandler = async () => {
	const timestamp = new Date().toISOString();

	try {
		const result = await db.execute(sql`SELECT 1 as ok`);

		return json({
			status: 'healthy',
			service: 'database',
			engine: 'postgresql',
			timestamp,
		});
	} catch (error: unknown) {
		const message =
			error instanceof Error ? error.message : String(error);
		console.warn('[Database Health] PostgreSQL unavailable:', message);

		return json(
			{
				status: 'unavailable',
				service: 'database',
				engine: 'postgresql',
				message: 'PostgreSQL not configured or unreachable',
				error: message,
				timestamp,
			},
			{ status: 503 }
		);
	}
};