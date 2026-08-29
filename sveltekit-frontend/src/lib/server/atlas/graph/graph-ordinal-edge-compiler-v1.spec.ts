import { describe, expect, it } from 'vitest';
import { buildGraphOrdinalMapV1 } from './graph-ordinal-map-v1.js';
import { compileGraphOrdinalEdgesV1 } from './graph-ordinal-edge-compiler-v1.js';

describe('GraphOrdinal edge compiler', () => {
	it('maps and deterministically sorts identity-keyed edges', () => {
		const map = buildGraphOrdinalMapV1({ graphRevision: 'g', workspaceRevision: 'w', graphNodeKeys: ['packet:z', 'packet:a'] });
		const edges = compileGraphOrdinalEdgesV1({ map, edges: [{ sourceNodeKey: 'packet:z', targetNodeKey: 'packet:a', edgeType: 'CALLS' }] });
		expect(edges).toEqual([{ sourceOrdinal: 1, targetOrdinal: 0, weight: 1, edgeType: 'CALLS' }]);
	});

	it('rejects unknown nodes, self-loops, and invalid weights', () => {
		const map = buildGraphOrdinalMapV1({ graphRevision: 'g', workspaceRevision: 'w', graphNodeKeys: ['packet:a'] });
		expect(() => compileGraphOrdinalEdgesV1({ map, edges: [{ sourceNodeKey: 'packet:x', targetNodeKey: 'packet:a' }] })).toThrow('GRAPH_ORDINAL_EDGE_UNKNOWN_NODE');
		expect(() => compileGraphOrdinalEdgesV1({ map, edges: [{ sourceNodeKey: 'packet:a', targetNodeKey: 'packet:a' }] })).toThrow('GRAPH_ORDINAL_SELF_LOOP_DISALLOWED');
		expect(() => compileGraphOrdinalEdgesV1({ map, edges: [{ sourceNodeKey: 'packet:a', targetNodeKey: 'packet:a', weight: -1 }], allowSelfLoops: true })).toThrow('GRAPH_ORDINAL_EDGE_WEIGHT_INVALID');
	});
});
