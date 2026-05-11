// @vitest-environment node
/**
 * Phase A6 — CI smoke gate orchestrator regression.
 *
 * Spawns `npm run agents:smoke:all` end-to-end and verifies:
 *   - exit 0 with all three child smokes green
 *   - JSON summary line at the end of stdout
 *   - summary reports passed=3 / failed=0 / violations=0
 *   - each child smoke's `*Writes` counters were observed (else the gate
 *     would have exited nonzero from the orchestrator's contract check)
 *
 * This is the gate that catches a regression of the test-leak class of bug
 * fixed in Phase A4 — if any future change makes a smoke spuriously write,
 * the orchestrator exits 2 and CI fails.
 *
 * Wall-clock: ~3-5s per run (spawns 3 child processes sequentially).
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const SCRIPT_REL    = 'scripts/agents-smoke-all.mjs';

interface SmokeAllSummary {
	totalRuns:    number;
	passed:       number;
	failed:       number;
	parseErrors:  number;
	violations:   number;
	durationMs:   number;
}

interface RunResult {
	stdout:  string;
	stderr:  string;
	status:  number | null;
	summary: SmokeAllSummary | null;
}

function runAll(): RunResult {
	const r = spawnSync('node', [SCRIPT_REL], {
		cwd:      FRONTEND_ROOT,
		encoding: 'utf8',
		timeout:  180_000,
		shell:    process.platform === 'win32',
		env:      { ...process.env, NODE_NO_WARNINGS: '1' },
	});
	const stdout = r.stdout ?? '';
	const stderr = r.stderr ?? '';
	const match  = stdout.match(/\[agents:smoke:all\] summary=(\{.*\})/);
	const summary = match ? (JSON.parse(match[1]) as SmokeAllSummary) : null;
	return { stdout, stderr, status: r.status, summary };
}

describe('agents:smoke:all CI gate', () => {
	it('exits 0 with all three smokes green + zero writer-counter violations', () => {
		const r = runAll();
		expect(r.status).toBe(0);
		expect(r.summary).not.toBeNull();
		const s = r.summary!;
		expect(s.totalRuns).toBe(3);
		expect(s.passed).toBe(3);
		expect(s.failed).toBe(0);
		expect(s.parseErrors).toBe(0);
		expect(s.violations).toBe(0);
	}, 180_000);

	it('logs a tick for each child smoke and surfaces the orchestrator summary line', () => {
		const r = runAll();
		expect(r.stdout).toContain('✓ agents:index:smoke');
		expect(r.stdout).toContain('✓ agents:cache:smoke');
		expect(r.stdout).toContain('✓ agents:regen:smoke');
		expect(r.stdout).toContain('[agents:smoke:all] summary=');
	}, 180_000);
});
