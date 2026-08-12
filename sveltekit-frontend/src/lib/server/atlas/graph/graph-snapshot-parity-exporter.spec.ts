import { describe, expect, it } from 'vitest';
import { buildGraphSnapshotParityTables } from './graph-snapshot-parity-exporter.js';

describe('graph snapshot parity exporter (pure mapping)', () => {
	it('assigns positional gpu_node_id and resolves edges by nodeKey', () => {
		const result = buildGraphSnapshotParityTables({
			nodes: [
				{ nodeKey: 'file:a', nodeType: 'file', sourceRef: 'src/a.ts', packetKey: null },
				{ nodeKey: 'symbol:b', nodeType: 'symbol', sourceRef: 'src/a.ts', packetKey: 'packet:a' }
			],
			edges: [{ sourceNodeKey: 'file:a', targetNodeKey: 'symbol:b', edgeType: 'CONTAINS', weight: 1 }]
		});

		expect(result.nodeRows).toEqual([
			{
				gpu_node_id: 0,
				graph_node_key: 'file:a',
				node_kind: 'file',
				source_ref: 'src/a.ts',
				source_revision: null,
				packet_key: null,
				symbol_id: null,
				symbol_version_id: null
			},
			{
				gpu_node_id: 1,
				graph_node_key: 'symbol:b',
				node_kind: 'symbol',
				source_ref: 'src/a.ts',
				source_revision: null,
				packet_key: 'packet:a',
				symbol_id: null,
				symbol_version_id: null
			}
		]);
		expect(result.edgeRows).toEqual([{ src_gpu_node_id: 0, dst_gpu_node_id: 1, edge_type: 'CONTAINS', weight: 1 }]);
		expect(result.unresolvedEdgeCount).toBe(0);
		expect(result.nodeTableHash).toMatch(/^[a-f0-9]{64}$/);
		expect(result.edgeTableHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it('drops and counts edges whose endpoints are missing from the node set instead of fabricating ids', () => {
		const result = buildGraphSnapshotParityTables({
			nodes: [{ nodeKey: 'file:a', nodeType: 'file', sourceRef: 'src/a.ts', packetKey: null }],
			edges: [{ sourceNodeKey: 'file:a', targetNodeKey: 'symbol:missing', edgeType: 'CONTAINS', weight: 1 }]
		});

		expect(result.edgeRows).toEqual([]);
		expect(result.unresolvedEdgeCount).toBe(1);
	});

	it('is deterministic: identical input produces identical table hashes', () => {
		const input = {
			nodes: [{ nodeKey: 'file:a', nodeType: 'file', sourceRef: 'src/a.ts', packetKey: null }],
			edges: []
		};
		const first = buildGraphSnapshotParityTables(input);
		const second = buildGraphSnapshotParityTables(input);
		expect(first.nodeTableHash).toBe(second.nodeTableHash);
		expect(first.edgeTableHash).toBe(second.edgeTableHash);
	});
});
