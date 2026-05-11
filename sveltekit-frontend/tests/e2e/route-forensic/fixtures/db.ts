/**
 * Worker-scope Postgres pool fixture.
 *
 * Replaces the module-singleton pool in _helpers.ts. Playwright spawns one
 * fixture instance per worker (default: 1 worker), so we get the same
 * reuse semantics as the singleton without the implicit global state.
 *
 * Usage:
 *   import { test } from './forensic-page';   // or any fixture barrel
 *   test('foo', async ({ pool }) => {
 *     const { rows } = await pool.query('SELECT 1');
 *   });
 *
 * Port 5434 = deeds-postgres-prod-proxy → legal-ai-postgres container.
 * Port 5432 on the host is squatted by a native Windows Postgres.
 */

import { test as base } from '@playwright/test';
import pg from 'pg';

const DB_URL =
	process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

export const test = base.extend<object, { pool: pg.Pool }>({
	pool: [
		async ({}, use) => {
			const pool = new pg.Pool({ connectionString: DB_URL });
			await use(pool);
			await pool.end();
		},
		{ scope: 'worker' },
	],
});

export { expect } from '@playwright/test';
