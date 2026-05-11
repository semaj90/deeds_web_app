// @vitest-environment node
/**
 * Phase A3 part 2 — agents-md-regen CLI flag-contract regression.
 *
 * Mirrors tests/agents-index-cli.spec.ts + tests/agents-cache-cli.spec.ts —
 * spawns the real script via `npx tsx`, parses the banner + JSON summary,
 * and asserts the dry-run zero-writes invariant. No DB / Redis fixture
 * needed because the loaders gracefully degrade when backends are absent;
 * we test the contract, not the data.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const SCRIPT_REL    = 'scripts/agents-md-regen.ts';

interface MachineSummary {
	dryRun:          boolean;
	force:           boolean;
	processed:       number;
	changedCount:    number;
	unchangedCount:  number;
	skippedCount:    number;
	failedCount:     number;
	redisWrites:     number;
	couchWrites:     number;
	qdrantWrites:    number;
	markdownWrites:  number;
	durationMs:      number;
	graphNodes?:     number;
	karpathyScores?: number;
	clusterSummaries?: number;
	featureRows?:    number;
	activityRows?:   number;
}

interface RunResult {
	stdout:  string;
	stderr:  string;
	status:  number | null;
	banner:  string | null;
	summary: MachineSummary | null;
}

function runRegen(flags: string[]): RunResult {
	const r = spawnSync('npx', ['tsx', SCRIPT_REL, ...flags], {
		cwd:      FRONTEND_ROOT,
		encoding: 'utf8',
		timeout:  60_000,
		shell:    true, // npx + .ts shebang needs shell on Windows
		env:      { ...process.env, NODE_NO_WARNINGS: '1' },
	});
	const stdout = r.stdout ?? '';
	const stderr = r.stderr ?? '';
	const bannerMatch  = stdout.match(/\[agents:regen\] dryRun=\S+ force=\S+ limit=\S+ writers=\S+/);
	const summaryMatch = stdout.match(/\[agents:regen\] summary=(\{.*\})/);
	const summary = summaryMatch ? (JSON.parse(summaryMatch[1]) as MachineSummary) : null;
	return { stdout, stderr, status: r.status, banner: bannerMatch?.[0] ?? null, summary };
}

describe('agents-md-regen CLI contract', () => {
	it('emits the contract banner with writers=disabled under --dry-run', () => {
		const r = runRegen(['--dry-run', '--limit', '3', '--skip-activity', '--skip-clusters', '--quiet']);
		expect(r.banner).not.toBeNull();
		expect(r.banner).toContain('dryRun=true');
		expect(r.banner).toContain('writers=disabled');
	}, 60_000);

	it('reports redisWrites=0 and all *Writes=0 under --dry-run (safety invariant)', () => {
		const r = runRegen(['--dry-run', '--limit', '5', '--skip-activity', '--skip-clusters', '--quiet']);
		expect(r.summary).not.toBeNull();
		const s = r.summary!;
		expect(s.dryRun).toBe(true);
		expect(s.redisWrites).toBe(0);
		expect(s.couchWrites).toBe(0);
		expect(s.qdrantWrites).toBe(0);
		expect(s.markdownWrites).toBe(0);
	}, 60_000);

	it('caps processed dirs at --limit value', () => {
		const r = runRegen(['--dry-run', '--limit', '3', '--skip-activity', '--skip-clusters', '--quiet']);
		expect(r.summary!.processed).toBeLessThanOrEqual(3);
		expect(r.banner).toContain('limit=3');
	}, 60_000);

	it('exits 0 under --dry-run regardless of loader backend state', () => {
		const r = runRegen(['--dry-run', '--limit', '2', '--skip-activity', '--skip-clusters', '--quiet']);
		expect(r.status).toBe(0);
	}, 60_000);

	it('honors --force in the banner + summary', () => {
		const r = runRegen(['--dry-run', '--force', '--limit', '2', '--skip-activity', '--skip-clusters', '--quiet']);
		expect(r.banner).toContain('force=true');
		expect(r.summary!.force).toBe(true);
	}, 60_000);

	it('--dir routes to a single directory (processed=1)', () => {
		const r = runRegen(['--dir', 'src/lib/server/ace', '--dry-run', '--skip-activity', '--skip-clusters', '--quiet']);
		expect(r.summary!.processed).toBe(1);
	}, 60_000);

	it('loads real signal counts when backends are reachable', () => {
		const r = runRegen(['--dry-run', '--limit', '5', '--skip-activity', '--skip-clusters', '--quiet']);
		// Graph is always reachable (file on disk).
		expect(r.summary!.graphNodes).toBeGreaterThan(0);
		// Karpathy + features may be reachable depending on env — assert >= 0 not > 0.
		expect(r.summary!.karpathyScores).toBeGreaterThanOrEqual(0);
		expect(r.summary!.featureRows).toBeGreaterThanOrEqual(0);
	}, 60_000);
});
