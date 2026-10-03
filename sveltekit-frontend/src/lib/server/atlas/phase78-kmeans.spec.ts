import { describe, expect, it } from 'vitest';
import { kmeansCluster, type KmeansEmbedding } from '../../../../scripts/phase78-kmeans.js';

const fixture: KmeansEmbedding[] = [
	{ id: 'a-1', embedding: [0, 0] },
	{ id: 'a-2', embedding: [0.1, 0] },
	{ id: 'b-1', embedding: [100, 100] },
	{ id: 'b-2', embedding: [100.1, 100] },
];

describe('Phase 78 deterministic K-means', () => {
	it('separates obvious groups and is replay-stable', () => {
		const first = kmeansCluster(fixture, 2);
		const second = kmeansCluster([...fixture].reverse(), 2);
		expect([...first.values()].map((ids) => [...ids].sort())).toEqual([
			['a-1', 'a-2'],
			['b-1', 'b-2'],
		]);
		expect(second).toEqual(first);
	});

	it('clamps k and preserves finite assignments for degenerate input', () => {
		const result = kmeansCluster([{ id: 'only', embedding: [1, 1] }], 4);
		expect([...result.values()]).toEqual([['only']]);
	});
});
