/**
 * Playwright Global Setup — seeds test case data before the test suite runs.
 *
 * Strategy: POST to /api/cases via the running dev server (DEV_BYPASS_AUTH provides
 * automatic auth as the dev admin user). Created IDs are written to a JSON file so
 * global-teardown.ts can delete them after the suite completes.
 *
 * Also hard-deletes any stale [PW-TEST] cases from previous runs before seeding.
 */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { TEST_CASE_SEED, TEST_CASE_PREFIX, TEST_IDS_FILE } from './fixtures/test-cases.js';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

export default async function globalSetup() {
	console.log('\n🌱  [global-setup] Cleaning up stale test cases …');

	// Hard-delete any leftover [PW-TEST] cases from previous runs
	const pool = new pg.Pool({ connectionString: DB_URL });
	try {
		const result = await pool.query(
			`DELETE FROM cases WHERE title LIKE $1 RETURNING title`,
			[`${TEST_CASE_PREFIX}%`]
		);
		if (result.rowCount && result.rowCount > 0) {
			console.log(`   🗑️  Removed ${result.rowCount} stale test case(s) from previous runs`);
		} else {
			console.log('   ✓  No stale test cases to clean up');
		}
	} catch (err) {
		console.warn(`   ⚠️  Could not clean stale cases (DB may be unavailable): ${err}`);
	} finally {
		await pool.end();
	}

	console.log('🌱  [global-setup] Seeding test cases via /api/cases …');

	const createdIds: string[] = [];

	for (const seedCase of TEST_CASE_SEED) {
		try {
			const res = await fetch(`${BASE_URL}/api/cases`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(seedCase),
			});

			if (res.ok) {
				const payload = await res.json();
				const id: string = payload?.data?.id ?? payload?.id;
				if (id) {
					createdIds.push(id);
					console.log(`   ✅  Created: "${seedCase.title}" → ${id}`);
				} else {
					console.warn(`   ⚠️  Created but no ID returned for: "${seedCase.title}"`);
				}
			} else {
				const text = await res.text().catch(() => '');
				console.warn(`   ⚠️  Failed to create "${seedCase.title}" (${res.status}): ${text}`);
			}
		} catch (err) {
			// Server might not be running — tests will fail naturally, don't block setup
			console.warn(`   ⚠️  Fetch error for "${seedCase.title}": ${err}`);
		}
	}

	// Persist IDs for teardown
	const idsFilePath = path.resolve(TEST_IDS_FILE);
	await mkdir(path.dirname(idsFilePath), { recursive: true });
	await writeFile(idsFilePath, JSON.stringify({ ids: createdIds }, null, 2));

	console.log(`🌱  [global-setup] Done — seeded ${createdIds.length}/${TEST_CASE_SEED.length} cases\n`);
}
