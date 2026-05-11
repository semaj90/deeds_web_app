// @vitest-environment node
/**
 * Phase A4.5 — agents.regen telemetry → context_timeline.
 *
 * Verifies that recordRegenTelemetry constructs the correct row draft,
 * honors the env gate (no Postgres writes under VITEST without explicit
 * opt-in), captures DB errors as result.error instead of throwing, and
 * truncates the embedded failure sample.
 */

import { describe, expect, it, vi } from 'vitest';

import { recordRegenTelemetry } from '../src/lib/server/agents/regen/telemetry.js';
import type { RegenCliResult } from '../src/lib/server/agents/regen/run.js';

function makeResult(overrides: Partial<RegenCliResult> = {}): RegenCliResult {
	return {
		runId:               'run-abc',
		startedAt:           '2026-05-11T22:00:00.000Z',
		dirCount:            10,
		changedCount:        3,
		unchangedCount:      6,
		skippedCount:        0,
		failedCount:         1,
		failures:            [{ dir: 'src/x', error: 'something broke' }],
		redisWrites:         3,
		couchWrites:         3,
		qdrantWrites:        3,
		qdrantPointsTouched: 42,
		durationMs:          187,
		signalSourcesLoaded: { graphNodes: 100, karpathyScores: 11, clusterSummaries: 4, featureRows: 5, activityRows: 0 },
		dryRun:              false,
		force:               false,
		...overrides,
	};
}

describe('recordRegenTelemetry', () => {
	it('returns skipped=disabled when enabled is false (default)', async () => {
		const dbWrite = vi.fn(async () => undefined);
		const r = await recordRegenTelemetry(makeResult(), { dbWriteFn: dbWrite });
		expect(r.wrote).toBe(false);
		expect(r.skipped).toBe('disabled');
		expect(dbWrite).not.toHaveBeenCalled();
	});

	it('returns skipped=test-env-blocked under VITEST without allowLiveWritesInTests', async () => {
		const dbWrite = vi.fn(async () => undefined);
		const r = await recordRegenTelemetry(makeResult(), { enabled: true, dbWriteFn: dbWrite });
		expect(r.wrote).toBe(false);
		expect(r.skipped).toBe('test-env-blocked');
		expect(dbWrite).not.toHaveBeenCalled();
	});

	it('emits a structured context_timeline row when allowLiveWritesInTests=true', async () => {
		const dbWrite = vi.fn(async () => undefined);
		const result = makeResult({ userId: undefined } as Partial<RegenCliResult>);
		const r = await recordRegenTelemetry(result, {
			enabled: true,
			allowLiveWritesInTests: true,
			dbWriteFn: dbWrite,
			userId: 7,
			sessionId: 'sess-1',
		});
		expect(r.wrote).toBe(true);
		expect(dbWrite).toHaveBeenCalledOnce();
		const row = dbWrite.mock.calls[0][0];
		expect(row.eventType).toBe('agents.regen');
		expect(row.pipeline).toBe('agents');
		expect(row.userId).toBe(7);
		expect(row.sessionId).toBe('sess-1');
		expect(row.payload.runId).toBe('run-abc');
		expect(row.payload.dirCount).toBe(10);
		expect(row.payload.redisWrites).toBe(3);
		expect(row.payload.couchWrites).toBe(3);
		expect(row.payload.qdrantWrites).toBe(3);
		expect(row.payload.qdrantPointsTouched).toBe(42);
		expect(row.payload.failedSample).toEqual([{ dir: 'src/x', error: 'something broke' }]);
		expect(row.payload.signalSourcesLoaded.karpathyScores).toBe(11);
	});

	it('defaults userId to null when caller does not provide one (system event)', async () => {
		const dbWrite = vi.fn(async () => undefined);
		await recordRegenTelemetry(makeResult(), { enabled: true, allowLiveWritesInTests: true, dbWriteFn: dbWrite });
		const row = dbWrite.mock.calls[0][0];
		expect(row.userId).toBeNull();
		expect(row.sessionId).toBe('');
	});

	it('caps failedSample at maxEmbeddedFailures (default 5)', async () => {
		const dbWrite = vi.fn(async () => undefined);
		const many = Array.from({ length: 12 }, (_, i) => ({ dir: `d${i}`, error: 'x' }));
		const result = makeResult({ failures: many, failedCount: 12 });
		await recordRegenTelemetry(result, { enabled: true, allowLiveWritesInTests: true, dbWriteFn: dbWrite });
		const row = dbWrite.mock.calls[0][0];
		expect(row.payload.failedSample).toHaveLength(5);
		expect(row.payload.failedCount).toBe(12); // total preserved separately
	});

	it('respects custom maxEmbeddedFailures', async () => {
		const dbWrite = vi.fn(async () => undefined);
		const many = Array.from({ length: 10 }, (_, i) => ({ dir: `d${i}`, error: 'x' }));
		const result = makeResult({ failures: many, failedCount: 10 });
		await recordRegenTelemetry(result, {
			enabled: true,
			allowLiveWritesInTests: true,
			dbWriteFn: dbWrite,
			maxEmbeddedFailures: 2,
		});
		expect(dbWrite.mock.calls[0][0].payload.failedSample).toHaveLength(2);
	});

	it('truncates failure messages to 200 chars to keep JSONB sane', async () => {
		const dbWrite = vi.fn(async () => undefined);
		const long = 'x'.repeat(500);
		const result = makeResult({ failures: [{ dir: 'd', error: long }], failedCount: 1 });
		await recordRegenTelemetry(result, { enabled: true, allowLiveWritesInTests: true, dbWriteFn: dbWrite });
		expect(dbWrite.mock.calls[0][0].payload.failedSample[0].error.length).toBe(200);
	});

	it('captures db errors as result.error instead of throwing', async () => {
		const dbWrite = vi.fn(async () => { throw new Error('connection refused'); });
		const r = await recordRegenTelemetry(makeResult(), {
			enabled: true,
			allowLiveWritesInTests: true,
			dbWriteFn: dbWrite,
		});
		expect(r.wrote).toBe(false);
		expect(r.error).toContain('connection refused');
	});
});