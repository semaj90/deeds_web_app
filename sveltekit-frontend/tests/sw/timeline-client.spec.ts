// @vitest-environment node
// Stubs minimal browser globals (window, navigator) so the SW-absent
// fallback path in timeline-client.ts can be unit-tested without jsdom/happy-dom.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const realFetch = globalThis.fetch;

let postTimelineEvent: typeof import('$lib/client/timeline-client').postTimelineEvent;
let getTimelineQueueDepth: typeof import('$lib/client/timeline-client').getTimelineQueueDepth;
let flushTimelineQueueNow: typeof import('$lib/client/timeline-client').flushTimelineQueueNow;

beforeAll(async () => {
	// Inject minimal browser globals via vi.stubGlobal (works on Node 18+
	// even when `navigator` is a readonly built-in).
	vi.stubGlobal('window', globalThis);
	vi.stubGlobal('navigator', { serviceWorker: { controller: null } });

	const mod = await import('$lib/client/timeline-client');
	postTimelineEvent     = mod.postTimelineEvent;
	getTimelineQueueDepth = mod.getTimelineQueueDepth;
	flushTimelineQueueNow = mod.flushTimelineQueueNow;
});

describe('timeline-client — SW-absent fallback (Phase D §1.6)', () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
		globalThis.fetch = fetchSpy as unknown as typeof fetch;

		// Re-pretend SW is not installed in case a prior test mutated it.
		(globalThis as any).navigator = { serviceWorker: { controller: null } };
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
		vi.resetAllMocks();
	});

	it('postTimelineEvent fires a POST to /api/analytics/context-timeline', () => {
		postTimelineEvent({
			eventType: 'chat.intent',
			payload:   { label: 'legal_research', confidence: 0.9 },
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/api/analytics/context-timeline');
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
		expect(init.keepalive).toBe(true);

		const body = JSON.parse(init.body as string);
		expect(body.eventType).toBe('chat.intent');
		expect(body.pipeline).toBe('ace');          // default
		expect(body.payload.label).toBe('legal_research');
	});

	it('postTimelineEvent default pipeline is "ace" when omitted', () => {
		postTimelineEvent({ eventType: 'foo' });
		const init = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(JSON.parse(init.body as string).pipeline).toBe('ace');
	});

	it('postTimelineEvent honors explicit pipeline override', () => {
		postTimelineEvent({ eventType: 'foo', pipeline: 'rag' });
		const init = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(JSON.parse(init.body as string).pipeline).toBe('rag');
	});

	it('postTimelineEvent swallows fetch rejection (fire-and-forget contract)', async () => {
		fetchSpy.mockRejectedValueOnce(new Error('offline'));
		// Must not throw — design contract: NEVER awaited, NEVER throws.
		expect(() => postTimelineEvent({ eventType: 'x' })).not.toThrow();
		// Give the microtask a tick.
		await new Promise((r) => setTimeout(r, 0));
	});

	it('postTimelineEvent is a no-op in SSR (window undefined)', () => {
		const origWindow = (globalThis as any).window;
		delete (globalThis as any).window;
		postTimelineEvent({ eventType: 'x' });
		expect(fetchSpy).not.toHaveBeenCalled();
		(globalThis as any).window = origWindow;
	});

	it('getTimelineQueueDepth returns 0 when SW is absent', async () => {
		const depth = await getTimelineQueueDepth();
		expect(depth).toBe(0);
	});

	it('flushTimelineQueueNow returns zeros when SW is absent', async () => {
		const r = await flushTimelineQueueNow();
		expect(r).toEqual({ drained: 0, failed: 0 });
	});
});
