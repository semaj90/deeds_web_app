import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ dev: true }));

type Reported = { message: string; type: string }[];

async function load() {
	vi.resetModules();
	return import('./hooks.client.js');
}

function reportedBodies(fetchMock: ReturnType<typeof vi.fn>): Reported {
	return fetchMock.mock.calls.flatMap(([, init]) => JSON.parse((init as RequestInit).body as string).errors);
}

describe('hooks.client error reporting', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.useFakeTimers();
		fetchMock.mockReset().mockResolvedValue(new Response('{}'));
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('does not report a 404 handleError (routing outcome, not a fault)', async () => {
		const hooks = await load();
		hooks.init();
		hooks.handleError({ error: new Error('Not found: /nope'), event: {} as never, status: 404, message: 'Not Found' });
		hooks.handleError({ error: new Error('real failure'), event: {} as never, status: 500, message: 'x' });
		await vi.advanceTimersByTimeAsync(10_500);

		const msgs = reportedBodies(fetchMock).map((e) => e.message);
		expect(msgs).toContain('real failure');
		expect(msgs).not.toContain('Not found: /nope');
	});

	it('drops dev-server noise in dev but still reports real application errors', async () => {
		const hooks = await load();
		hooks.init();
		for (const m of [
			'Failed to fetch dynamically imported module: http://localhost:5173/x.js',
			'transport invoke timed out after 60000ms',
			'__SVELTEKIT_APP_VERSION__ is not defined',
			'CONTROL real application error',
		]) {
			window.dispatchEvent(new ErrorEvent('error', { message: m, error: new Error(m) }));
		}
		await vi.advanceTimersByTimeAsync(10_500);

		const msgs = reportedBodies(fetchMock).map((e) => e.message);
		expect(msgs).toEqual(['CONTROL real application error']);
	});
});
