import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('$lib/stores/notifications.svelte', () => ({
	notificationStore: { add: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

async function settle() {
	for (let i = 0; i < 6; i++) await tick();
	await new Promise((r) => setTimeout(r, 30));
}

describe('/admin/explorer route list', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		// jsdom has no EventSource; the page opens an SSE stream for live route updates.
		vi.stubGlobal(
			'EventSource',
			class {
				addEventListener() {}
				close() {}
			}
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	// Original report: "Cannot read properties of undefined (reading 'filter' / 'some')"
	// when /api/admin/routes answered without a routes array (degraded response).
	it('renders without throwing when the API returns no routes array', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
		const errors: string[] = [];
		const onError = (e: ErrorEvent) => errors.push(String(e.error ?? e.message));
		window.addEventListener('error', onError);
		const unhandled = (e: PromiseRejectionEvent) => errors.push(String(e.reason));
		window.addEventListener('unhandledrejection', unhandled);

		const { default: Explorer } = await import('./+page.svelte');
		const { container } = render(Explorer);
		// The page must finish loading (derived route list evaluated) instead of crashing mid-render.
		await waitFor(() => expect(container.textContent).not.toContain('Loading routes'), { timeout: 2000 });
		window.removeEventListener('error', onError);
		window.removeEventListener('unhandledrejection', unhandled);

		expect(errors.filter((m) => /reading '(filter|some)'|undefined/.test(m))).toEqual([]);
		expect(container.textContent).toContain('Route Explorer');
		expect(container.textContent).toContain('0 routes');
	});

	it('renders the routes it is given', async () => {
		const routes = [{ path: '/alpha', type: 'page', file: 'a', imports: [] }];
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes }), { status: 200 })));
		const { default: Explorer } = await import('./+page.svelte');
		const { container } = render(Explorer);
		await settle();
		expect(container.textContent).toContain('Route Explorer');
	});
});
