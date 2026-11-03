import { describe, expect, it } from 'vitest';
import { toPlainBoardLayout, type BoardLayout } from './board-persistence.svelte';

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
});
