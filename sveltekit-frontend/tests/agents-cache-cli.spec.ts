// @vitest-environment node
/**
 * Mini-Active-Cache CLI flag-contract regression.
 *
 * Parallel guardrail to tests/agents-index-cli.spec.ts. Same failure mode
 * (a tool with --dry-run that silently writes) would be catastrophic for
 * this script because it touches NVMe + reads from 3 backends, so the
 * dry-run contract gets the same end-to-end spawn proof.
 *
 * Contract under test (build-mini-active-cache.mjs):
 *   - `--dry-run`              → writers=disabled, nvmeWrites=0, bytesWritten=0
 *   - `--pretty`               → reported in banner + summary
 *   - `--skip-neo4j`           → reported in banner + summary
 *   - startup banner:           `[mini-active-cache] dryRun=<bool> pretty=<bool> skipNeo4j=<bool> writers=<state>`
 *   - JSON summary banner:      `[mini-active-cache] summary={...}`
 *
 * Backend tolerance: dry-run must NOT exit nonzero just because CouchDB is
 * down or has no kag:cluster:agents:* docs. The script falls through with
 * an empty cache and still emits the contract summary.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const SCRIPT_REL    = 'scripts/agents/build-mini-active-cache.mjs';

interface MachineSummary {
	dryRun:        boolean;
	pretty:        boolean;
	skipNeo4j:     boolean;
	cardCount:     number;
	clusterCount:  number;
	featureCount:  number;
	tagCount:      number;
	dirCount:      number;
	nvmeWrites:    number;
	bytesWritten:  number;
	elapsedMs:     number;
}

interface RunResult {
	stdout:  string;
	stderr:  string;
	status:  number | null;
	banner:  string | null;
	summary: MachineSummary | null;
}

function runCache(flags: string[]): RunResult {
	const r = spawnSync('node', [SCRIPT_REL, ...flags], {
		cwd:      FRONTEND_ROOT,
		encoding: 'utf8',
		timeout:  30_000,
		env:      { ...process.env, NODE_NO_WARNINGS: '1' },
	});
	const stdout = r.stdout ?? '';
	const stderr = r.stderr ?? '';
	const bannerMatch  = stdout.match(/\[mini-active-cache\] dryRun=\S+ pretty=\S+ skipNeo4j=\S+ writers=\S+/);
	const summaryMatch = stdout.match(/\[mini-active-cache\] summary=(\{.*\})/);
	const summary = summaryMatch ? (JSON.parse(summaryMatch[1]) as MachineSummary) : null;
	return { stdout, stderr, status: r.status, banner: bannerMatch?.[0] ?? null, summary };
}

describe('build-mini-active-cache.mjs CLI contract', () => {
	it('emits the contract banner with writers=disabled under --dry-run', () => {
		const r = runCache(['--dry-run', '--skip-neo4j']);
		expect(r.banner).not.toBeNull();
		expect(r.banner).toContain('dryRun=true');
		expect(r.banner).toContain('writers=disabled');
		expect(r.banner).toContain('skipNeo4j=true');
	});

	it('reports nvmeWrites=0 and bytesWritten=0 in the summary under --dry-run', () => {
		const r = runCache(['--dry-run', '--skip-neo4j']);
		expect(r.summary).not.toBeNull();
		const s = r.summary!;
		expect(s.dryRun).toBe(true);
		expect(s.nvmeWrites).toBe(0);
		expect(s.bytesWritten).toBe(0);
	});

	it('exits 0 under --dry-run regardless of backend state (forgiving)', () => {
		// Even if CouchDB is empty or unreachable, dry-run must not exit nonzero —
		// the entire point of dry-run is to make tooling observable, not require state.
		const r = runCache(['--dry-run', '--skip-neo4j']);
		expect(r.status).toBe(0);
	});

	it('reports --pretty in the banner', () => {
		const r = runCache(['--dry-run', '--pretty', '--skip-neo4j']);
		expect(r.banner).toContain('pretty=true');
		expect(r.summary?.pretty).toBe(true);
	});

	it('honors --quiet (banner + summary still emitted as they bypass log())', () => {
		const r = runCache(['--dry-run', '--quiet', '--skip-neo4j']);
		expect(r.banner).not.toBeNull();
		expect(r.summary).not.toBeNull();
		// quiet should drop per-stage chatter but keep the contract lines
		const lines = r.stdout.split('\n').filter((l) => l.trim().length > 0);
		expect(lines.length).toBeLessThan(12);
	});
});
