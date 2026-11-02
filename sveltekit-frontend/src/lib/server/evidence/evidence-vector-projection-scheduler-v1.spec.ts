import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createEvidenceVectorProjectionSchedulerV1,
	isEvidenceVectorProjectionEnabled,
} from './evidence-vector-projection-scheduler-v1.js';

describe('evidence vector projection scheduler', () => {
	afterEach(() => vi.useRealTimers());

	it('requires both Qdrant and the explicit projection-worker opt-in', () => {
		expect(isEvidenceVectorProjectionEnabled({ QDRANT_ENABLED: 'true' })).toBe(false);
		expect(isEvidenceVectorProjectionEnabled({ EVIDENCE_VECTOR_PROJECTION_WORKER_ENABLED: 'true' })).toBe(false);
		expect(isEvidenceVectorProjectionEnabled({
			QDRANT_ENABLED: 'true',
			EVIDENCE_VECTOR_PROJECTION_WORKER_ENABLED: 'true',
		})).toBe(true);
	});

	it('reports enabled, started, and in-flight state without changing scheduler behavior', async () => {
		let resolveBatch: (() => void) | undefined;
		const scheduler = createEvidenceVectorProjectionSchedulerV1({
			enabled: true,
			runBatch: () => new Promise<void>((resolve) => { resolveBatch = resolve; }),
		});

		expect(scheduler.getStatus()).toEqual({ enabled: true, started: false, inFlight: false });
		expect(scheduler.start()).toBe(true);
		await Promise.resolve();
		expect(scheduler.getStatus()).toEqual({ enabled: true, started: true, inFlight: true });
		const stopping = scheduler.stop();
		resolveBatch?.();
		await stopping;
		expect(scheduler.getStatus()).toEqual({ enabled: true, started: false, inFlight: false });
	});

	it('does not schedule when disabled and avoids overlapping batches when enabled', async () => {
		vi.useFakeTimers();
		let resolveBatch: (() => void) | undefined;
		const runBatch = vi.fn(() => new Promise<void>((resolve) => { resolveBatch = resolve; }));
		const disabled = createEvidenceVectorProjectionSchedulerV1({ enabled: false, runBatch });
		expect(disabled.start()).toBe(false);
		const enabled = createEvidenceVectorProjectionSchedulerV1({ enabled: true, intervalMs: 10, runBatch });
		expect(enabled.start()).toBe(true);
		await vi.advanceTimersByTimeAsync(10);
		expect(runBatch).toHaveBeenCalledOnce();
		resolveBatch?.();
		await vi.advanceTimersByTimeAsync(10);
		expect(runBatch).toHaveBeenCalledTimes(2);
		resolveBatch?.();
		await enabled.stop();
	});

	it('drains an active projection batch before shutdown completes', async () => {
		let resolveBatch: (() => void) | undefined;
		const scheduler = createEvidenceVectorProjectionSchedulerV1({
			enabled: true,
			runBatch: () => new Promise<void>((resolve) => { resolveBatch = resolve; }),
		});
		scheduler.start();
		await Promise.resolve();
		let stopped = false;
		const stop = scheduler.stop().then(() => { stopped = true; });
		await Promise.resolve();
		expect(stopped).toBe(false);
		resolveBatch?.();
		await stop;
		expect(stopped).toBe(true);
	});
});
