import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	GraphIdentityValidationError,
	GraphNodeSchema,
	topologyHash,
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
		const hash = validateGraphSnapshotIdentity({ snapshotId, nodes: baseNodes, edges: baseEdges });
		expect(() => validateGraphSnapshotIdentity({
			snapshotId,
			nodes: baseNodes,
			edges: baseEdges,
			relationEvents: [{ snapshotId, relationId: 'call:1', relationType: 'FUNCTION_CALL', sourceRef: 'a.ts', evidenceSpan: 'a()', confidence: 1, topologyHash: hash }],
			relationParticipants: [{ snapshotId, relationId: 'call:1', nodeKey: 'missing', role: 'callee', ordinal: 0 }]
		})).toThrow(/RELATION_PARTICIPANT_NODE_MISSING/);
	});

	it('binds N-ary participants and roles into the topology checksum', () => {
		const workspaceRevision = `sha256:${'a'.repeat(64)}`;
		const sourceRevision = `sha256:${'b'.repeat(64)}`;
		const nodes = [
			{ ...baseNodes[0], properties: { sourceRevision, workspaceRevision } },
			{ ...baseNodes[1], properties: { sourceRevision, workspaceRevision } },
			{ snapshotId, nodeKey: 'packet:c', nodeType: 'packet' as const, packetKey: 'packet:c', treeNodeId: null, sourceRef: 'c.ts', properties: { sourceRevision, workspaceRevision } },
		];
		const participants = [
			{ snapshotId, relationId: 'fact:1', nodeKey: 'file:a', role: 'source', ordinal: 0 },
			{ snapshotId, relationId: 'fact:1', nodeKey: 'packet:b', role: 'callee', ordinal: 1 },
			{ snapshotId, relationId: 'fact:1', nodeKey: 'packet:c', role: 'context', ordinal: 2 },
		];
		const relation = { snapshotId, relationId: 'fact:1', relationType: 'CALLS_WITH_CONTEXT', sourceRef: 'a.ts', evidenceSpan: 'utf8:[4,12)', confidence: 0.9, topologyHash: '' };
		const expected = topologyHash(nodes, baseEdges, [relation], participants);
		const boundRelation = { ...relation, topologyHash: expected };

		expect(validateGraphSnapshotIdentity({ snapshotId, nodes, edges: baseEdges, relationEvents: [boundRelation], relationParticipants: participants })).toBe(expected);
		expect(topologyHash(nodes, baseEdges, [relation], participants)).not.toBe(topologyHash(nodes, baseEdges));
		expect(() => validateGraphSnapshotIdentity({
			snapshotId,
			nodes,
			edges: baseEdges,
			relationEvents: [boundRelation],
			relationParticipants: participants.map((participant) => participant.role === 'context' ? { ...participant, role: 'other' } : participant),
		})).toThrow(/RELATION_TOPOLOGY_HASH_MISMATCH/);
	});

	it('rejects binary or unrevisioned relation incidence before hashing', () => {
		const baseHash = validateGraphSnapshotIdentity({ snapshotId, nodes: baseNodes, edges: baseEdges });
		const event = { snapshotId, relationId: 'fact:binary', relationType: 'CALLS', sourceRef: 'a.ts', evidenceSpan: 'utf8:[0,1)', confidence: 1, topologyHash: baseHash };
		expect(() => validateGraphSnapshotIdentity({
			snapshotId,
			nodes: baseNodes,
			edges: baseEdges,
			relationEvents: [event],
			relationParticipants: [
				{ snapshotId, relationId: event.relationId, nodeKey: 'file:a', role: 'source', ordinal: 0 },
				{ snapshotId, relationId: event.relationId, nodeKey: 'packet:b', role: 'target', ordinal: 1 },
			],
		})).toThrow(/RELATION_ARITY_BELOW_THREE/);
	});
});

describe('topologyHash streaming/legacy byte compatibility', () => {
	// Reference implementation preserved verbatim from the pre-streaming
	// topologyHash — the monolithic single-string version that broke at
	// full-corpus scale (RangeError: Invalid string length). This exists
	// ONLY to prove the streamed replacement is byte-identical on inputs
	// small enough for the old implementation to run.
	function legacyStableJson(value: unknown): string {
		if (value === null || typeof value !== 'object') return JSON.stringify(value);
		if (Array.isArray(value)) return `[${value.map(legacyStableJson).join(',')}]`;
		const object = value as Record<string, unknown>;
		return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${legacyStableJson(object[key])}`).join(',')}}`;
	}

	function legacyTopologyHash(nodes: readonly any[], edges: readonly any[]): string {
		const normalized = {
			nodes: nodes.map(({ snapshotId: _snapshotId, properties, ...node }) => ({ ...node, properties })).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey)),
			edges: edges.map(({ snapshotId: _snapshotId, properties, ...edge }) => ({ ...edge, properties })).sort((a, b) => a.edgeKey.localeCompare(b.edgeKey))
		};
		return createHash('sha256').update(legacyStableJson(normalized)).digest('hex');
	}

	const nodesFixture = [
		{ snapshotId, nodeKey: 'packet:b', nodeType: 'packet', packetKey: 'packet:b', treeNodeId: null, sourceRef: 'b.ts', properties: { b: 2, a: 1 } },
		{ snapshotId, nodeKey: 'file:a', nodeType: 'file', packetKey: null, treeNodeId: null, sourceRef: 'a.ts', properties: { z: 9 } }
	];
	const edgesFixture = [
		{ snapshotId, edgeKey: 'edge:a', sourceNodeKey: 'file:a', targetNodeKey: 'packet:b', edgeType: 'MATERIALIZES', weight: 1, confidence: 1, provenance: 'test', properties: {} }
	];

	it('preserves the legacy topology hash byte contract on fixture data', () => {
		const oldHash = legacyTopologyHash(nodesFixture, edgesFixture);
		const streamedHash = topologyHash(nodesFixture as any, edgesFixture as any);
		expect(streamedHash).toBe(oldHash);
	});

	it('is deterministic regardless of input ordering', () => {
		expect(topologyHash(nodesFixture as any, edgesFixture as any)).toBe(
			topologyHash([...nodesFixture].reverse() as any, [...edgesFixture].reverse() as any)
		);
	});

	it('normalizes nested property key ordering', () => {
		const first = structuredClone(nodesFixture);
		const second = structuredClone(nodesFixture);
		(first[0].properties as any) = { b: 2, a: 1 };
		(second[0].properties as any) = { a: 1, b: 2 };
		expect(topologyHash(first as any, edgesFixture as any)).toBe(topologyHash(second as any, edgesFixture as any));
	});
});
