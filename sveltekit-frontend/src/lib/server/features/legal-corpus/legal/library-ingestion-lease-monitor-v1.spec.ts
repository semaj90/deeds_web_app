import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	assertLibraryIngestionActiveV1,
	monitorLibraryIngestionLeaseV1,
} from './library-ingestion-lease-monitor-v1.js';

describe('library ingestion lease monitor v1', () => {
	afterEach(() => vi.useRealTimers());

	it('aborts the worker after a definitive lost-lease heartbeat', async () => {
		vi.useFakeTimers();
		const monitor = monitorLibraryIngestionLeaseV1(vi.fn().mockResolvedValue(false), 10);
		await vi.advanceTimersByTimeAsync(10);
		expect(monitor.signal.aborted).toBe(true);
		expect(() => assertLibraryIngestionActiveV1(monitor.signal)).toThrow('LIBRARY_INGESTION_LEASE_LOST');
		await monitor.stop();
	});

	it('keeps running through a transient heartbeat error and retries', async () => {
		vi.useFakeTimers();
		const renew = vi.fn().mockRejectedValueOnce(new Error('temporary db issue')).mockResolvedValue(true);
		const monitor = monitorLibraryIngestionLeaseV1(renew, 10);
		await vi.advanceTimersByTimeAsync(10);
		expect(monitor.signal.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(10);
		expect(renew).toHaveBeenCalledTimes(2);
		expect(monitor.signal.aborted).toBe(false);
		await monitor.stop();
	});

	it('does not overlap a slow heartbeat request', async () => {
		vi.useFakeTimers();
		let resolveRenew!: (value: boolean) => void;
		const renew = vi.fn(() => new Promise<boolean>((resolve) => { resolveRenew = resolve; }));
		const monitor = monitorLibraryIngestionLeaseV1(renew, 10);
		await vi.advanceTimersByTimeAsync(30);
		expect(renew).toHaveBeenCalledTimes(1);
		resolveRenew(true);
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(10);
		expect(renew).toHaveBeenCalledTimes(2);
		resolveRenew(true);
		await Promise.resolve();
		await monitor.stop();
	});

	it('waits for an in-flight heartbeat before stopping', async () => {
		vi.useFakeTimers();
		let resolveRenew!: (value: boolean) => void;
		const renew = vi.fn(() => new Promise<boolean>((resolve) => { resolveRenew = resolve; }));
		const monitor = monitorLibraryIngestionLeaseV1(renew, 10);
		await vi.advanceTimersByTimeAsync(10);
		let stopped = false;
		const stopPromise = monitor.stop().then(() => { stopped = true; });
		await Promise.resolve();
		expect(stopped).toBe(false);
		resolveRenew(true);
		await stopPromise;
		expect(stopped).toBe(true);
		expect(monitor.signal.aborted).toBe(false);
	});
});
