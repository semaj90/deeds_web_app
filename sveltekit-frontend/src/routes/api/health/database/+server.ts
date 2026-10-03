import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { getPoolStatus, resetPoolHealth } from '$lib/server/db/client';
import { classifyPostgresError } from '$lib/server/db/readiness';

/**
 * GET /api/health/database
 * Health check for PostgreSQL connectivity + pool state.
 *
 * status: 'healthy' | 'starting' | 'unavailable'. 'starting' is a crash-recovery /
 * startup window (SQLSTATE 57P03): retry, and never open a repair task for it.
 * HTTP stays 200 per the degraded-response contract; consumers read `status`.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const timestamp = new Date().toISOString();
	const poolStatus = getPoolStatus();
	if (!locals.user) return json({ status: 'unavailable', service: 'database', engine: 'postgresql', reason: 'UNAUTHORIZED', sqlstate: null, retryable: false, pool: poolStatus, timestamp }, { status: 401 });

	try {
		await db.execute(sql`SELECT 1 as ok`);

		// Pool recovered — clear degraded flag so status self-heals
		if (!poolStatus.poolHealthy) resetPoolHealth();

		return json({
      status: 'healthy',
      service: 'database',
      engine: 'postgresql',
			reason: 'OK',
			sqlstate: null,
      retryable: false,
      pool: poolStatus,
      timestamp,
    });
	} catch (error: unknown) {
		const classification = classifyPostgresError(error);
		console.warn(`[Database Health] PostgreSQL ${classification.state} (${classification.reason}):`, error);

		return json({
      status: classification.state,
      service: 'database',
      engine: 'postgresql',
      reason: classification.reason,
      sqlstate: classification.sqlstate,
      retryable: classification.retryable,
      pool: poolStatus,
      timestamp,
    });
	}
};
