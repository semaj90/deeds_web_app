/**
 * Playwright Global Teardown — archives seeded test cases after the suite completes.
 *
 * Reads only the IDs written by global-setup.ts and marks those cases archived.
 */
import { readFile, unlink } from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { TEST_CASE_PREFIX, TEST_IDS_FILE } from './fixtures/test-cases.js';
import { PORTS } from './helpers/env-ports.js';

const DB_URL =
  process.env.DATABASE_URL ||
  `postgresql://legal_admin:123456@127.0.0.1:${PORTS.PG_PORT}/legal_ai_db`;

export default async function globalTeardown() {
	if (process.env.PLAYWRIGHT_SKIP_GLOBAL_SETUP === 'true') {
    console.log('\n🧹  [global-teardown] Skipped via PLAYWRIGHT_SKIP_GLOBAL_SETUP\n');
    return;
  }

	console.log('\n🧹  [global-teardown] Archiving seeded test cases …');

	const pool = new pg.Pool({ connectionString: DB_URL });
	try {
		const idsFilePath = path.resolve(TEST_IDS_FILE);
		const file = await readFile(idsFilePath, 'utf8').catch(() => '');
		let ids: string[] = [];
		try {
			const parsed: unknown = file ? JSON.parse(file) : null;
			const candidates = parsed && typeof parsed === 'object' && Array.isArray((parsed as { ids?: unknown }).ids)
				? (parsed as { ids: unknown[] }).ids
				: [];
			ids = candidates.filter((id): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
		} catch {
			ids = [];
		}
		const result = ids.length === 0
			? { rowCount: 0, rows: [] as Array<{ id: string; title: string }> }
			: await pool.query(
				`UPDATE cases SET status = 'archived', updated_at = now()
				 WHERE id = ANY($1::uuid[]) AND title LIKE $2 AND status <> 'archived'
				 RETURNING id, title`,
				[ids, `${TEST_CASE_PREFIX}%`]
			);
		if (result.rowCount && result.rowCount > 0) {
			for (const row of result.rows) {
				console.log(`   ✅  Archived: ${row.id} — "${row.title}"`);
			}
		} else {
			console.log('   ✓  No tracked test cases to archive');
		}
		console.log(`🧹  [global-teardown] Done — archived ${result.rowCount ?? 0} tracked test cases\n`);
	} catch (err) {
		console.warn(`   ⚠️  DB cleanup failed: ${err}`);
		console.log('🧹  [global-teardown] Done (with errors)\n');
	} finally {
		await pool.end();
	}

	// Remove only the temporary ID manifest; the case rows remain archived.
	const idsFilePath = path.resolve(TEST_IDS_FILE);
	await unlink(idsFilePath).catch(() => {});
}
