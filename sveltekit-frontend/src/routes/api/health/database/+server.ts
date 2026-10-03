import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, getPoolStatus, pgRows, resetPoolHealth } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

/**
 * GET /api/health/database
 * Health check for PostgreSQL connectivity + pool state.
 *
 * The read-only runtime fingerprint is intentionally produced through the
 * existing Drizzle client so Playwright can prove the browser -> SvelteKit ->
 * Drizzle -> PostgreSQL path without a second database owner.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ status: 'unavailable', error: 'Unauthorized' }, { status: 401 });
	const timestamp = new Date().toISOString();
	const poolStatus = getPoolStatus();

	try {
		const result = await db.execute(sql`
      SELECT
        current_setting('server_version') AS "serverVersion",
        current_setting('server_version_num') AS "serverVersionNum",
        current_database() AS "databaseName"
    `);
    const [runtime] = pgRows<{
      serverVersion: string;
      serverVersionNum: string;
      databaseName: string;
    }>(result);

    if (!runtime) {
      throw new Error('PostgreSQL runtime fingerprint query returned no rows');
    }

    const serverVersionNum = Number(runtime.serverVersionNum);
    const majorVersion = Number.isFinite(serverVersionNum)
      ? Math.floor(serverVersionNum / 10000)
      : null;

		// Pool recovered — clear degraded flag so status self-heals
		if (!poolStatus.poolHealthy) resetPoolHealth();

		return json({
      status: 'healthy',
      service: 'database',
      engine: 'postgresql',
      accessPath: 'drizzle-orm/node-postgres',
      postgres: {
        serverVersion: runtime.serverVersion,
        serverVersionNum,
        majorVersion,
        databaseName: runtime.databaseName,
      },
      pool: poolStatus,
      timestamp,
    });
	} catch (error: unknown) {
		console.warn('[Database Health] PostgreSQL unavailable:', error);

		return json({
      status: 'unavailable',
      service: 'database',
      engine: 'postgresql',
      accessPath: 'drizzle-orm/node-postgres',
      pool: poolStatus,
      timestamp,
    });
	}
};
