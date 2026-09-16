import { describe, expect, it } from 'vitest';
import { buildGraphOrdinalMapV1, graphNodeKeyForOrdinalV1, parseGraphOrdinalMapV1 } from './graph-ordinal-map-v1.js';

describe('GraphOrdinalMapV1', () => {
	it('sorts graph keys into dense executor ordinals', () => {
		const map = buildGraphOrdinalMapV1({ graphRevision: 'graph:r1', workspaceRevision: 'workspace:w1', graphNodeKeys: ['packet:z', 'symbol:a', 'packet:b'] });
		expect(map.rows).toEqual([
			{ graphOrdinal: 0, graphNodeKey: 'packet:b' },
			{ graphOrdinal: 1, graphNodeKey: 'packet:z' },
			{ graphOrdinal: 2, graphNodeKey: 'symbol:a' },
		]);
		expect(graphNodeKeyForOrdinalV1(map, 1)).toBe('packet:z');
	});

	it('rejects duplicates and missing revisions', () => {
		expect(() => buildGraphOrdinalMapV1({ graphRevision: 'g', workspaceRevision: 'w', graphNodeKeys: ['packet:a', 'packet:a'] })).toThrow('GRAPH_ORDINAL_DUPLICATE_NODE_KEY');
		expect(() => buildGraphOrdinalMapV1({ graphRevision: '', workspaceRevision: 'w', graphNodeKeys: [] })).toThrow('GRAPH_ORDINAL_REVISION_BINDING_REQUIRED');
	});

	it('rejects tampered checksum and non-contiguous ordinals on readback', () => {
		const map = buildGraphOrdinalMapV1({ graphRevision: 'graph:r1', workspaceRevision: 'workspace:w1', graphNodeKeys: ['packet:a', 'packet:b'] });
		expect(() => parseGraphOrdinalMapV1({ ...map, graphOrdinalMapChecksum: '0'.repeat(64) })).toThrow('GRAPH_ORDINAL_CHECKSUM_MISMATCH');
		expect(() => parseGraphOrdinalMapV1({ ...map, rows: [{ ...map.rows[0], graphOrdinal: 1 }, map.rows[1] ] })).toThrow('GRAPH_ORDINAL_SEQUENCE_INVALID');
	});
});
