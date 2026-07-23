import { describe, expect, it } from 'vitest';
import {
	GraphIdentityValidationError,
	GraphNodeSchema,
	validateGraphSnapshotIdentity
} from './graph-snapshot.js';

const snapshotId = '22222222-2222-4222-8222-222222222222';
const baseNodes = [
	{ snapshotId, nodeKey: 'file:a', nodeType: 'file', packetKey: null, treeNodeId: null, sourceRef: 'a.ts', properties: {} },
	{ snapshotId, nodeKey: 'packet:b', nodeType: 'packet', packetKey: 'packet:b', treeNodeId: null, sourceRef: 'b.ts', properties: {} }
] as const;
const baseEdges = [
	{ snapshotId, edgeKey: 'edge:a', sourceNodeKey: 'file:a', targetNodeKey: 'packet:b', edgeType: 'MATERIALIZES', weight: 1, confidence: 1, provenance: 'test', properties: {} }
] as const;

describe('Parent Atlas graph snapshot identity', () => {
	it('proves canonical identities and deterministic topology hashes', () => {
		const first = validateGraphSnapshotIdentity({ snapshotId, nodes: baseNodes, edges: baseEdges });
		const second = validateGraphSnapshotIdentity({ snapshotId, nodes: [...baseNodes].reverse(), edges: baseEdges });
		expect(first).toBe(second);
	});

	it('rejects duplicate graph identities and tree collisions with structured evidence', () => {
		expect(() => validateGraphSnapshotIdentity({ snapshotId, nodes: [baseNodes[0], baseNodes[0]], edges: baseEdges })).toThrow(GraphIdentityValidationError);
		try {
			validateGraphSnapshotIdentity({
				snapshotId,
				nodes: [
					{ ...baseNodes[0], treeNodeId: '33333333-3333-4333-8333-333333333333' },
					{ ...baseNodes[1], treeNodeId: '33333333-3333-4333-8333-333333333333' }
				],
				edges: baseEdges
			});
		} catch (error) {
			expect((error as GraphIdentityValidationError).evidence).toMatchObject({ kind: 'TREE_NODE_ID_COLLISION', nodeA: 'file:a', nodeB: 'packet:b' });
		}
	});

	it('rejects missing endpoints, snapshot mismatch, duplicate edges, and invalid numeric values', () => {
		expect(() => validateGraphSnapshotIdentity({ snapshotId, nodes: baseNodes, edges: [{ ...baseEdges[0], targetNodeKey: 'missing' }] })).toThrow(/EDGE_TARGET_MISSING/);
		expect(() => validateGraphSnapshotIdentity({ snapshotId, nodes: baseNodes, edges: [{ ...baseEdges[0], snapshotId: '44444444-4444-4444-8444-444444444444' }] })).toThrow(/SNAPSHOT_ID_MISMATCH/);
		expect(() => validateGraphSnapshotIdentity({ snapshotId, nodes: baseNodes, edges: [baseEdges[0], baseEdges[0]] })).toThrow(/DUPLICATE_EDGE_KEY/);
		expect(() => GraphNodeSchema.parse({ ...baseNodes[1], packetKey: null })).toThrow(/packet nodes require packetKey/);
		expect(() => validateGraphSnapshotIdentity({ snapshotId, nodes: baseNodes, edges: [{ ...baseEdges[0], weight: -1 }] })).toThrow();
	});

	it('preserves hyperedge participants only when relation and snapshot identities resolve', () => {
		const topologyHash = validateGraphSnapshotIdentity({ snapshotId, nodes: baseNodes, edges: baseEdges });
		expect(() => validateGraphSnapshotIdentity({
			snapshotId,
			nodes: baseNodes,
			edges: baseEdges,
			relationEvents: [{ snapshotId, relationId: 'call:1', relationType: 'FUNCTION_CALL', sourceRef: 'a.ts', evidenceSpan: 'a()', confidence: 1, topologyHash }],
			relationParticipants: [{ snapshotId, relationId: 'call:1', nodeKey: 'missing', role: 'callee', ordinal: 0 }]
		})).toThrow(/RELATION_PARTICIPANT_NODE_MISSING/);
	});
});
