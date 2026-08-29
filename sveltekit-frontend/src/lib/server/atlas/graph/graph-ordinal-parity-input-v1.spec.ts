import { describe, expect, it } from 'vitest';
import { buildGraphOrdinalMapV1 } from './graph-ordinal-map-v1.js';
import { buildGraphOrdinalParityInputV1 } from './graph-ordinal-parity-input-v1.js';

describe('GraphOrdinalParityInputV1', () => {
	it('packages one shared revision-bound topology for both executors', () => {
		const map = buildGraphOrdinalMapV1({ graphRevision: 'graph:r1', workspaceRevision: 'workspace:w1', graphNodeKeys: ['packet:b', 'packet:a'] });
		const input = buildGraphOrdinalParityInputV1({ map, edges: [{ sourceNodeKey: 'packet:a', targetNodeKey: 'packet:b', edgeType: 'CALLS' }] });
		expect(input).toMatchObject({ schema: 'atlas.graph-ordinal-parity-input.v1', graphRevision: 'graph:r1', canonicalAuthority: false, writes: false });
		expect(input.edges).toEqual([{ sourceOrdinal: 0, targetOrdinal: 1, weight: 1, edgeType: 'CALLS' }]);
	});
});
