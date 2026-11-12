// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeEventSource {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSED = 2;
	static instances: FakeEventSource[] = [];
	readyState = 0;
	private listeners: Record<string, Array<(e: { data?: string }) => void>> = {};
	constructor(public url: string) {
		FakeEventSource.instances.push(this);
	}
	addEventListener(type: string, fn: (e: { data?: string }) => void) {
		(this.listeners[type] ??= []).push(fn);
	}
	close() {
		this.readyState = 2;
	}
	emit(type: string, data?: unknown) {
		for (const fn of this.listeners[type] ?? []) fn({ data: data === undefined ? undefined : JSON.stringify(data) });
	}
}

import { ChatSSEClient } from './sse-client';

const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1];

beforeEach(() => {
	FakeEventSource.instances = [];
	vi.stubGlobal('EventSource', FakeEventSource);
	vi.useFakeTimers();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('ChatSSEClient reconnect behavior', () => {
	it('leaves a native auto-reconnect (CONNECTING) alone', async () => {
		const client = new ChatSSEClient('s1');
		await client.connect();
		latest().readyState = 0; // browser is retrying by itself
		latest().emit('error');
		await vi.advanceTimersByTimeAsync(120_000);
		expect(FakeEventSource.instances).toHaveLength(1);
	});

	it('retries manually only after CLOSED, closes the old instance, and uses a jittered delay', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5); // attempt 0: floor(0.5 * 1000) = 500 ms
		const client = new ChatSSEClient('s1');
		await client.connect();
		const first = latest();
		first.readyState = 2;
		first.emit('error');

		await vi.advanceTimersByTimeAsync(499);
		expect(FakeEventSource.instances).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(2);
		expect(FakeEventSource.instances).toHaveLength(2);
		expect(first.readyState).toBe(2);
		expect(latest()).not.toBe(first);
	});

	it('stops after the attempt cap and reports it', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.999);
		const client = new ChatSSEClient('s1');
		const errors: string[] = [];
		client.onError((e) => errors.push(e.message));
		await client.connect();
		for (let i = 0; i < 12; i++) {
			latest().readyState = 2;
			latest().emit('error');
			await vi.advanceTimersByTimeAsync(31_000);
		}
		expect(FakeEventSource.instances).toHaveLength(11); // 1 initial + 10 retries, no more
		expect(errors).toContain('SSE reconnect attempts exhausted');
	});

	it('resets the attempt counter after a successful connect', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.999);
		const client = new ChatSSEClient('s1');
		await client.connect();
		for (let i = 0; i < 9; i++) {
			latest().readyState = 2;
			latest().emit('error');
			await vi.advanceTimersByTimeAsync(31_000);
		}
		latest().emit('connected', { ok: true });
		for (let i = 0; i < 9; i++) {
			latest().readyState = 2;
			latest().emit('error');
			await vi.advanceTimersByTimeAsync(31_000);
		}
		expect(FakeEventSource.instances.length).toBeGreaterThan(11); // would have stopped at 11 without the reset
	});

	it('applies a replayed message only once', async () => {
		const client = new ChatSSEClient('s1');
		const seen: string[] = [];
		client.onMessage((m) => seen.push(m.id));
		await client.connect();
		const msg = { id: 'm-1', role: 'assistant', content: 'hi', timestamp: 't' };
		latest().emit('message', msg);
		latest().emit('message', msg); // replay after a reconnect
		latest().emit('message', { ...msg, id: 'm-2' });
		expect(seen).toEqual(['m-1', 'm-2']);
	});

	it('disconnect() cancels a pending retry', async () => {
		const client = new ChatSSEClient('s1');
		await client.connect();
		latest().readyState = 2;
		latest().emit('error');
		client.disconnect();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(FakeEventSource.instances).toHaveLength(1);
	});
});
