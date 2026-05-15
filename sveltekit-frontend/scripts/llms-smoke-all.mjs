#!/usr/bin/env node
/**
 * Phase A6 — agents:smoke:all
 *
 * Runs the three operator-facing dry-run smokes in sequence:
 *   1. agents:index:smoke   — build-agents-index dry-run (graph-only)
 *   2. agents:cache:smoke   — mini-active-cache dry-run (forgiving on empty backends)
 *   3. agents:regen:smoke   — agents-md-regen dry-run (full A1-A5 pipeline)
 *
 * Each child runs as a separate `node` / `npx tsx` invocation. For each one
 * we parse the JSON contract summary line emitted at the end and assert the
 * safety invariant — every `*Writes` counter MUST be 0.
 *
 * Exit codes:
 *   0  every smoke green + all writers report 0
 *   1  any smoke exited nonzero
 *   2  any smoke leaked a non-zero writer counter (contract violation)
 *   3  could not parse a smoke's JSON summary (malformed output)
 *
 * Designed for CI: no DB/Redis/Qdrant/CouchDB required because every smoke
 * uses --dry-run and (for the index/cache lanes) gracefully degrades to
 * empty when backends are absent.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '..');

const RUNS = [
	{
		label:     'agents:index:smoke',
		summaryRe: /\[agents:index\] summary=(\{.*\})/,
		argv:      ['node', 'scripts/agents/build-agents-index.mjs', '--dry-run', '--limit', '10', '--quiet'],
	},
	{
		label:     'agents:cache:smoke',
		summaryRe: /\[mini-active-cache\] summary=(\{.*\})/,
		argv:      ['node', 'scripts/agents/build-mini-active-cache.mjs', '--dry-run', '--quiet', '--skip-neo4j'],
	},
	{
		label:     'agents:regen:smoke',
		summaryRe: /\[agents:regen\] summary=(\{.*\})/,
		argv:      ['npx', 'tsx', 'scripts/agents-md-regen.ts', '--all', '--limit', '10', '--dry-run', '--quiet', '--skip-activity', '--skip-clusters'],
	},
];

const WRITER_KEYS = ['redisWrites', 'couchWrites', 'qdrantWrites', 'markdownWrites', 'nvmeWrites', 'bytesWritten'];

function runOne(run) {
	const [cmd, ...args] = run.argv;
	const r = spawnSync(cmd, args, {
		cwd:      FRONTEND_ROOT,
		encoding: 'utf8',
		timeout:  90_000,
		shell:    process.platform === 'win32',
		env:      { ...process.env, NODE_NO_WARNINGS: '1' },
	});
	const stdout = r.stdout ?? '';
	const stderr = r.stderr ?? '';
	const status = r.status;

	if (status !== 0) {
		return { run, status, summary: null, error: `exit ${status}`, stdout, stderr };
	}

	const match = stdout.match(run.summaryRe);
	if (!match) {
		return { run, status, summary: null, error: 'no JSON summary line found in stdout', stdout, stderr };
	}

	let summary;
	try {
		summary = JSON.parse(match[1]);
	} catch (err) {
		return { run, status, summary: null, error: `summary JSON parse failed: ${err.message}`, stdout, stderr };
	}

	const violations = [];
	for (const key of WRITER_KEYS) {
		if (key in summary && summary[key] !== 0) {
			violations.push(`${key}=${summary[key]}`);
		}
	}

	return { run, status, summary, violations, stdout, stderr };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const startMs = Date.now();
const results = [];
let exitCode = 0;

console.log(`[agents:smoke:all] running ${RUNS.length} smokes (cwd=${FRONTEND_ROOT})`);

for (const run of RUNS) {
	const t0 = Date.now();
	const result = runOne(run);
	const ms = Date.now() - t0;

	if (result.status !== 0) {
		console.error(`✗ ${run.label} — ${result.error} (${ms}ms)`);
		if (result.stderr.trim()) console.error(`  stderr: ${result.stderr.trim().slice(0, 500)}`);
		exitCode = Math.max(exitCode, 1);
	} else if (!result.summary) {
		console.error(`✗ ${run.label} — ${result.error} (${ms}ms)`);
		exitCode = Math.max(exitCode, 3);
	} else if (result.violations.length > 0) {
		console.error(`✗ ${run.label} — writer-counter violation: ${result.violations.join(', ')} (${ms}ms)`);
		exitCode = Math.max(exitCode, 2);
	} else {
		const counts = Object.entries(result.summary)
			.filter(([k]) => k.endsWith('Count') || k.endsWith('Writes') || k === 'processed' || k === 'cardCount' || k === 'clusterCount')
			.map(([k, v]) => `${k}=${v}`)
			.join(' ');
		console.log(`✓ ${run.label} — ${counts} (${ms}ms)`);
	}

	results.push(result);
}

const totalMs = Date.now() - startMs;
const summary = {
	totalRuns:    RUNS.length,
	passed:       results.filter((r) => r.status === 0 && r.summary && (r.violations ?? []).length === 0).length,
	failed:       results.filter((r) => r.status !== 0).length,
	parseErrors:  results.filter((r) => r.status === 0 && !r.summary).length,
	violations:   results.filter((r) => r.violations && r.violations.length > 0).length,
	durationMs:   totalMs,
};
console.log(`[agents:smoke:all] summary=${JSON.stringify(summary)}`);

process.exit(exitCode);
