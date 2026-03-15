import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db, { sql } from '$lib/server/db';
import { getPoolStatus, resetPoolHealth } from '$lib/server/db/client';

/**
 * GET /api/health/database
 * Health check for PostgreSQL connectivity + pool state.
 */
export const GET: RequestHandler = async () => {
	const timestamp = new Date().toISOString();
	const poolStatus = getPoolStatus();

	try {
		const result = await db.execute(sql`SELECT 1 as ok`);

		// Pool recovered — clear degraded flag so status self-heals
		if (!poolStatus.poolHealthy) resetPoolHealth();

		return json({
      status: 'healthy',
      service: 'database',
      engine: 'postgresql',
      pool: poolStatus,
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
        pool: poolStatus,
        message: 'PostgreSQL not configured or unreachable',
        error: message,
        timestamp,
      },
      { status: 503 }
    );
	}
};