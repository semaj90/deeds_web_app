#!/usr/bin/env node
/**
 * Ingest route-hardening findings (NDJSON from export-route-hardening-ndjson-v1.mjs) into error_logs.
 *
 *   node --env-file=.env scripts/atlas/ingest-route-hardening-errors-v1.mjs [--apply] [--ndjson <file>]
 *
 * Dry run by default. --apply runs ONE transaction, idempotent through the table's existing partial unique index
 * (diagnostic_log_sha256, diagnostic_log_line): re-running inserts nothing new. Postgres only; no cache, no events.
 *
 * Scope (deliberate): critical/high/medium findings only. Excluded: 355 low-severity UX/layout heuristics
 * (stay in the NDJSON) and `request_failed` rows, which are ERR_BLOCKED_BY_CLIENT artifacts of the harness' own mutation fence.
 * Conventions measured from existing rows: severity is uppercase (WARNING/INFO), categories are snake_case.
 * Rollback: inside the transaction only. After commit, rows are identified by diagnostic_run_id; resolve them, do not delete.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const apply = process.argv.includes('--apply');
const nIdx = process.argv.indexOf('--ndjson');
const NDJSON = nIdx >= 0 ? process.argv[nIdx + 1] : path.join(REPO, 'logs', 'task-output', 'route-hardening-errors-pass1-20261017.ndjson');
const RUN_ID = 'route-hardening-20261017-pass1';
const SEV = { critical: 'CRITICAL', high: 'ERROR', medium: 'WARNING' };
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required (run with --env-file=.env)');

const raw = fs.readFileSync(NDJSON, 'utf8');
const sha = createHash('sha256').update(raw).digest('hex');
const lines = raw.split('\n').filter(Boolean);

// Re-test status per route (current per-route records), so notes never overclaim a fix.
const slug = (r) => (r === '/' ? 'root' : r.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_'));
const flaggedFile = process.env.FLAGGED_ROUTES_JSON; // optional: JSON array of routes re-tested serially
const flagged = new Set(flaggedFile && fs.existsSync(flaggedFile) ? JSON.parse(fs.readFileSync(flaggedFile, 'utf8')) : []);
function retestNote(route) {
	if (!flagged.has(route)) return null;
	const f = path.join(REPO, 'logs', 'task-output', 'route-hardening', `${slug(route)}.json`);
	if (!fs.existsSync(f)) return null;
	const d = JSON.parse(fs.readFileSync(f, 'utf8'));
	const failing = d.navError || d.status >= 400 || d.pageErrors.length > 0 || (d.layout?.bodyTextLen ?? 1) === 0;
	return failing
		? 'serial re-test 2026-10-17: still failing'
		: 'serial re-test 2026-10-17: route clean; components were modified by another session after the first pass; not verified as a fix';
}

const rows = [];
lines.forEach((line, i) => {
	const r = JSON.parse(line);
	if (!SEV[r.severity] || r.signal === 'request_failed') return;
	const occ = r.occurrences > 1 ? ` [occurrences=${r.occurrences}]` : '';
	rows.push({
		error_category: `route_hardening_${r.signal}`.slice(0, 100), severity: SEV[r.severity], message: `${r.message}${occ}`,
		route_path: r.route.slice(0, 255), context_key: 'playwright-production-hardening-routes', diagnostic_run_id: RUN_ID,
		diagnostic_log_sha256: sha, diagnostic_log_line: i + 1, diagnostic_code: r.signal, diagnostic_fingerprint: r.fingerprint,
		fix_notes: retestNote(r.route),
		file_path: r.filePath ?? null, line_number: r.lineNumber ?? null, source_ref: r.sourceRef ?? null,
	});
});

const bySev = rows.reduce((m, r) => ((m[r.severity] = (m[r.severity] ?? 0) + 1), m), {});
console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', ndjson: path.relative(REPO, NDJSON), ndjsonSha256: sha, ndjsonLines: lines.length, plannedRows: rows.length, bySeverity: bySev, runId: RUN_ID }, null, 2));
if (!apply) { console.log('sample:', JSON.stringify(rows.slice(0, 2), null, 1)); process.exit(0); }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
	await client.query('BEGIN');
	const before = Number((await client.query('select count(*)::int c from error_logs')).rows[0].c);
	let inserted = 0;
	for (const r of rows) {
		const res = await client.query(
			`INSERT INTO error_logs (error_category, severity, message, route_path, context_key, diagnostic_run_id, diagnostic_log_sha256,
			   diagnostic_log_line, diagnostic_code, diagnostic_fingerprint, fix_notes, file_path, line_number, source_ref, workspace_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
			 ON CONFLICT (diagnostic_log_sha256, diagnostic_log_line) WHERE diagnostic_log_sha256 IS NOT NULL DO NOTHING`,
			[r.error_category, r.severity, r.message, r.route_path, r.context_key, r.diagnostic_run_id, r.diagnostic_log_sha256,
			 r.diagnostic_log_line, r.diagnostic_code, r.diagnostic_fingerprint, r.fix_notes, r.file_path, r.line_number, r.source_ref, process.env.ATLAS_WORKSPACE_ID || 'deeds-web-app']);
		inserted += res.rowCount;
	}
	const after = Number((await client.query('select count(*)::int c from error_logs')).rows[0].c);
	const tagged = Number((await client.query('select count(*)::int c from error_logs where diagnostic_run_id=$1', [RUN_ID])).rows[0].c);
	if (after - before !== inserted || tagged < inserted) throw new Error(`READBACK_MISMATCH before=${before} after=${after} inserted=${inserted} tagged=${tagged}`);
	await client.query('COMMIT');
	console.log(JSON.stringify({ committed: true, inserted, errorLogsBefore: before, errorLogsAfter: after, rowsWithRunId: tagged }, null, 2));
} catch (e) {
	await client.query('ROLLBACK');
	console.error('ROLLED BACK:', e.message);
	process.exitCode = 1;
} finally { client.release(); await pool.end(); }
