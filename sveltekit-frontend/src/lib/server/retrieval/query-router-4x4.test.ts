import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTER_MATRIX } from './router-matrix.js';
import { getRouterMatrix } from './query-router-4x4.js';

describe('getRouterMatrix', () => {
	it('returns the configured matrix row for every declared signal', () => {
		for (const [signal, lanes] of Object.entries(DEFAULT_ROUTER_MATRIX)) {
			expect(getRouterMatrix(signal)).toEqual(lanes);
		}
	});

	it('returns null for an unknown signal', () => {
		expect(getRouterMatrix('unknown_signal')).toBeNull();
	});
});
