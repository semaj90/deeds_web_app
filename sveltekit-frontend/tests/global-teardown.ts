/**
 * Playwright Global Teardown — deletes seeded test cases after the suite completes.
 *
 * Reads the IDs written by global-setup.ts and hard-deletes each one via direct DB
 * connection (since the API only does soft-delete/archive).
 */
import { readFile, unlink } from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { TEST_CASE_PREFIX, TEST_IDS_FILE } from './fixtures/test-cases.js';

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

export default async function globalTeardown() {
	console.log('\n🧹  [global-teardown] Cleaning up test cases …');

	const pool = new pg.Pool({ connectionString: DB_URL });
	try {
		// Hard-delete all [PW-TEST] cases (covers any that weren't tracked in the IDs file)
		const result = await pool.query(
			`DELETE FROM cases WHERE title LIKE $1 RETURNING id, title`,
			[`${TEST_CASE_PREFIX}%`]
		);
		if (result.rowCount && result.rowCount > 0) {
			for (const row of result.rows) {
				console.log(`   ✅  Deleted: ${row.id} — "${row.title}"`);
			}
		} else {
			console.log('   ✓  No test cases to clean up');
		}
		console.log(`🧹  [global-teardown] Done — deleted ${result.rowCount ?? 0} test cases\n`);
	} catch (err) {
		console.warn(`   ⚠️  DB cleanup failed: ${err}`);
		console.log('🧹  [global-teardown] Done (with errors)\n');
	} finally {
		await pool.end();
	}

	// Remove the temp IDs file
	const idsFilePath = path.resolve(TEST_IDS_FILE);
	await unlink(idsFilePath).catch(() => {});
}