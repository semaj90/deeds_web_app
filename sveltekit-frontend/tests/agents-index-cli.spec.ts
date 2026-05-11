// @vitest-environment node
/**
 * agents-index CLI flag-contract regression.
 *
 * Triggered by a P0 tooling bug: `npm run agents:index:smoke -- --dry-run --limit 10`
 * ran live writes despite the flags. Spawning the real script in a child process
 * is the only honest way to verify the operator-facing CLI contract — unit-testing
 * the flag parser in isolation would not catch a wiring break between the parsed
 * flags and the writer stages.
 *
 * Contract under test (build-agents-index.mjs):
 *   - `--dry-run`               → writers=disabled, all *Writes counters = 0
 *   - `--limit N` / `--limit=N` → caps `processed` at N
 *   - startup banner             → `[agents:index] dryRun=<bool> limit=<n|none> writers=<state>`
 *   - JSON summary banner        → `[agents:index] summary={...}`
 *
 * The test runs the script with the safest possible flag combo (`--dry-run` +
 * tier-skips) and parses stdout. No Redis / CouchDB / Neo4j / Qdrant connection
 * is required because dry-run short-circuits before any client is constructed.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const SCRIPT_REL    = 'scripts/agents/build-agents-index.mjs';

interface MachineSummary {
	dryRun:           boolean;
	limit:            number | null;
	processed:        number;
	redisWrites:      number;
	couchWrites:      number;
	qdrantWrites:     number;
	markdownWrites:   number;
	neo4jWrites:      number;
	analysisUpdates:  number;
}

interface RunResult {
	stdout:  string;
	stderr:  string;
	status:  number | null;
	banner:  string | null;     // the [agents:index] startup line
	summary: MachineSummary | null;
}

function runIndexer(flags: string[]): RunResult {
	const r = spawnSync('node', [SCRIPT_REL, ...flags], {
		cwd:      FRONTEND_ROOT,
		encoding: 'utf8',
		timeout:  30_000,
		env:      { ...process.env, NODE_NO_WARNINGS: '1' },
	});
	const stdout = r.stdout ?? '';
	const stderr = r.stderr ?? '';

	const bannerMatch = stdout.match(/\[agents:index\] dryRun=\S+ limit=\S+ writers=\S+/);
	const summaryMatch = stdout.match(/\[agents:index\] summary=(\{.*\})/);
	const summary = summaryMatch ? (JSON.parse(summaryMatch[1]) as MachineSummary) : null;

	return { stdout, stderr, status: r.status, banner: bannerMatch?.[0] ?? null, summary };
}

describe('build-agents-index.mjs CLI contract', () => {
	it('parses --dry-run and reports writers=disabled in the startup banner', () => {
		const r = runIndexer(['--dry-run', '--limit', '3']);
		expect(r.status).toBe(0);
		expect(r.banner).not.toBeNull();
		expect(r.banner).toContain('dryRun=true');
		expect(r.banner).toContain('writers=disabled');
	});

	it('parses --limit 10 (space-separated form) and caps processed dirs', () => {
		const r = runIndexer(['--dry-run', '--limit', '10']);
		expect(r.status).toBe(0);
		expect(r.banner).toContain('limit=10');
		expect(r.summary).not.toBeNull();
		expect(r.summary!.limit).toBe(10);
		expect(r.summary!.processed).toBeLessThanOrEqual(10);
	});

	it('parses --limit=5 (equals form) and caps processed dirs', () => {
		const r = runIndexer(['--dry-run', '--limit=5']);
		expect(r.status).toBe(0);
		expect(r.banner).toContain('limit=5');
		expect(r.summary!.limit).toBe(5);
		expect(r.summary!.processed).toBeLessThanOrEqual(5);
	});

	it('reports zero writes across every backend tier when --dry-run is set', () => {
		const r = runIndexer(['--dry-run', '--limit', '5']);
		expect(r.summary).not.toBeNull();
		const s = r.summary!;
		expect(s.dryRun).toBe(true);
		expect(s.redisWrites).toBe(0);
		expect(s.couchWrites).toBe(0);
		expect(s.qdrantWrites).toBe(0);
		expect(s.markdownWrites).toBe(0);
		expect(s.neo4jWrites).toBe(0);
		expect(s.analysisUpdates).toBe(0);
	});

	it('exits 0 on a valid dry-run with limit (no DB connection required)', () => {
		const r = runIndexer(['--dry-run', '--limit', '3']);
		expect(r.status).toBe(0);
		expect(r.stderr).not.toMatch(/ECONNREFUSED|UnhandledPromiseRejection|cannot find module/i);
	});

	it('honors --quiet (suppresses per-card logging but keeps banner + summary)', () => {
		const r = runIndexer(['--dry-run', '--limit', '3', '--quiet']);
		expect(r.status).toBe(0);
		// banner + summary are non-quiet by contract (they go through console.log directly)
		expect(r.banner).not.toBeNull();
		expect(r.summary).not.toBeNull();
		// quiet should keep stdout under a reasonable line budget for 3 cards
		const lines = r.stdout.split('\n').filter((l) => l.trim().length > 0);
		expect(lines.length).toBeLessThan(15);
	});
});
