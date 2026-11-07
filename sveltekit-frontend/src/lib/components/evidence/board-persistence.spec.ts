import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	flushServerSave,
	scheduleServerSave,
	toPlainBoardLayout,
	type BoardLayout
} from './board-persistence.svelte';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('board persistence snapshot', () => {
	it('removes reactive proxies before IndexedDB structured cloning', () => {
		const node = new Proxy({ id: 'node-1', position: new Proxy({ x: 1, y: 2 }, {}) }, {});
		const layout: BoardLayout = {
			caseId: 'case-1',
			nodes: new Proxy([node], {}),
			connections: new Proxy([], {}),
			viewport: new Proxy({ zoom: 1, panX: 0, panY: 0 }, {}),
			timestamp: 1,
		};

		const snapshot = toPlainBoardLayout(layout);

		expect(structuredClone(snapshot)).toEqual({
			caseId: 'case-1',
			nodes: [{ id: 'node-1', position: { x: 1, y: 2 } }],
			connections: [],
			viewport: { zoom: 1, panX: 0, panY: 0 },
			timestamp: 1,
		});
	});

	it('keeps server debounce queues isolated by case', async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal('fetch', fetchMock);
		vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => false) });
		const snapshot = { version: 1, viewport: { pan: { x: 0, y: 0 }, zoom: 1 }, nodes: [], edges: [] };

		scheduleServerSave('case-one', snapshot);
		scheduleServerSave('case-two', { ...snapshot, nodes: [{ id: 'node-two' }] });
		await vi.advanceTimersByTimeAsync(4000);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			'/api/cases/case-one/canvas',
			'/api/cases/case-two/canvas'
		]);
	});

	it('retains a rejected server save for an explicit retry', async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce({ ok: false, status: 409 })
			.mockResolvedValueOnce({ ok: true, status: 200 });
		vi.stubGlobal('fetch', fetchMock);
		vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => false) });
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const snapshot = { version: 1, viewport: { pan: { x: 2, y: 3 }, zoom: 1 }, nodes: [], edges: [] };

		scheduleServerSave('case-retry', snapshot);
		await vi.advanceTimersByTimeAsync(4000);
		flushServerSave('case-retry');
		await Promise.resolve();
		await Promise.resolve();

		expect(fetchMock.mock.calls.every(([url]) => url === '/api/cases/case-retry/canvas')).toBe(true);
	});
});
