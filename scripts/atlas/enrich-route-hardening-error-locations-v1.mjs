#!/usr/bin/env node
/**
 * RH-15b: fill file_path / line_number / source_ref on error_logs rows from a newer route-hardening NDJSON.
 *
 *   node --env-file=.env scripts/atlas/enrich-route-hardening-error-locations-v1.mjs --ndjson <pass2.ndjson> [--apply]
 *
 * Dry run by default. Rules: only rows with diagnostic_run_id = RUN_ID; matched by diagnostic_fingerprint
 * (sha256 of route|signal|normalized message); only fills columns that are currently NULL (never overwrites);
 * one transaction with readback; locations come from the deterministic exporter regex (first-party /src/ files only).
 * Does not insert rows, does not touch packet_key, severity, resolved or fix_notes.
 */
import fs from 'node:fs';
import pg from 'pg';

const RUN_ID = 'route-hardening-20261017-pass1';
const apply = process.argv.includes('--apply');
const i = process.argv.indexOf('--ndjson');
if (i < 0) throw new Error('--ndjson <file> required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required (run with --env-file=.env)');

const byFp = new Map();
for (const line of fs.readFileSync(process.argv[i + 1], 'utf8').split('\n').filter(Boolean)) {
	const r = JSON.parse(line);
	if (r.filePath && r.sourceRef) byFp.set(r.fingerprint, r);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const c = await pool.connect();
try {
	await c.query('BEGIN');
	const existing = (await c.query(
		`SELECT id, diagnostic_fingerprint fp FROM error_logs
		 WHERE diagnostic_run_id = $1 AND file_path IS NULL AND source_ref IS NULL AND line_number IS NULL AND diagnostic_fingerprint = ANY($2)`,
		[RUN_ID, [...byFp.keys()]])).rows;
	console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', recordsWithLocation: byFp.size, matchingRowsToFill: existing.length }));
	let updated = 0;
	if (apply) {
		for (const row of existing) {
			const r = byFp.get(row.fp);
			const res = await c.query(
				`UPDATE error_logs SET file_path = $1, line_number = $2, source_ref = $3
				 WHERE id = $4 AND file_path IS NULL AND source_ref IS NULL AND line_number IS NULL`,
				[r.filePath, r.lineNumber, r.sourceRef, row.id]);
			updated += res.rowCount;
		}
		const filled = Number((await c.query(`SELECT count(*)::int n FROM error_logs WHERE diagnostic_run_id = $1 AND file_path IS NOT NULL`, [RUN_ID])).rows[0].n);
		if (updated !== existing.length || filled < updated) throw new Error(`READBACK_MISMATCH updated=${updated} expected=${existing.length} filled=${filled}`);
		console.log(JSON.stringify({ updated, rowsInRunWithFilePath: filled }));
	}
	await c.query(apply ? 'COMMIT' : 'ROLLBACK');
} catch (e) { await c.query('ROLLBACK'); console.error('ROLLED BACK:', e.message); process.exitCode = 1; } finally { c.release(); await pool.end(); }
