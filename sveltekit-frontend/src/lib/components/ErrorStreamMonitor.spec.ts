import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';

type Listener = (event: Event) => void;

class FakeEventSource {
	static instances: FakeEventSource[] = [];
	listeners = new Map<string, Listener[]>();
	closed = false;
	constructor(public url: string) {
		FakeEventSource.instances.push(this);
	}
	addEventListener(type: string, fn: Listener) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
	}
	close() {
		this.closed = true;
	}
	emit(type: string, event: Event) {
		for (const fn of this.listeners.get(type) ?? []) fn(event);
	}
}

describe('ErrorStreamMonitor SSE handling', () => {
	beforeEach(() => {
		FakeEventSource.instances = [];
		vi.stubGlobal('EventSource', FakeEventSource);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.useFakeTimers();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('does not throw when the native error event carries no data (JSON.parse(undefined))', async () => {
		const { default: ErrorStreamMonitor } = await import('./ErrorStreamMonitor.svelte');
		render(ErrorStreamMonitor);
		const es = FakeEventSource.instances[0];
		expect(es).toBeDefined();

		// EventSource connection loss fires a plain Event with no .data
		expect(() => es.emit('error', new Event('error'))).not.toThrow();
		expect(es.closed).toBe(true);
	});

	it('still parses a well-formed server error payload', async () => {
		const { default: ErrorStreamMonitor } = await import('./ErrorStreamMonitor.svelte');
		const { findByText } = render(ErrorStreamMonitor);
		const es = FakeEventSource.instances[0];

		es.emit('error', new MessageEvent('error', { data: JSON.stringify({ message: 'stream backend down' }) }));
		expect(await findByText(/stream backend down/)).toBeTruthy();
	});
});
