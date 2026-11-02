import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';

class FakeSocket {
	static instances: FakeSocket[] = [];
	closed = false;
	onopen: (() => void) | null = null;
	onmessage: ((e: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: (() => void) | null = null;
	constructor(public url: string) {
		FakeSocket.instances.push(this);
	}
	close() {
		this.closed = true;
	}
}

describe('EnhancedFileUpload status-socket effect', () => {
	beforeEach(() => {
		FakeSocket.instances = [];
		vi.stubGlobal('WebSocket', FakeSocket);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'debug').mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('connects exactly once and does not loop (effect_update_depth_exceeded)', async () => {
		const errors: unknown[] = [];
		const onError = (e: ErrorEvent) => errors.push(e.error ?? e.message);
		window.addEventListener('error', onError);

		const { default: EnhancedFileUpload } = await import('./EnhancedFileUpload.svelte');
		render(EnhancedFileUpload);
		for (let i = 0; i < 5; i++) await tick();
		await new Promise((r) => setTimeout(r, 50));
		window.removeEventListener('error', onError);

		expect(FakeSocket.instances).toHaveLength(1);
		expect(errors.map(String).join(' ')).not.toMatch(/effect_update_depth_exceeded/);
	});

	it('closes the socket when the component is destroyed', async () => {
		const { default: EnhancedFileUpload } = await import('./EnhancedFileUpload.svelte');
		const { unmount } = render(EnhancedFileUpload);
		await tick();
		const socket = FakeSocket.instances[0];
		expect(socket).toBeDefined();

		unmount();
		await tick();
		expect(socket.closed).toBe(true);
	});
});
