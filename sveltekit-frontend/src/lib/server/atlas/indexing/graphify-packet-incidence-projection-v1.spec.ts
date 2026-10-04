import { describe, expect, it } from 'vitest';
import {
	projectGraphifyEdgeToPacketIncidenceV1,
	type GraphifyPacketIncidenceProjectionInputV1,
} from './graphify-packet-incidence-projection-v1.js';

const packet = {
	graphEndpointKey: 'symbol:src/a.ts#source',
	packetKey: 'packet:0123456789ab',
	status: 'RESOLVED' as const,
	canonicalId: 'packet:00000000-0000-5000-8000-000000000001',
	sourceRef: 'src/a.ts',
	sourceRevision: 'source-a-r1',
	workspaceRevision: 'workspace-r1',
	graphRevision: 'graph-r1',
};

const neighbor = {
	...packet,
	graphEndpointKey: 'symbol:src/b.ts#target',
	packetKey: 'packet:abcdef012345',
	canonicalId: 'packet:00000000-0000-5000-8000-000000000002',
	sourceRef: 'src/b.ts',
	sourceRevision: 'source-b-r1',
};

const input: GraphifyPacketIncidenceProjectionInputV1 = {
	edge: {
		schema: 'atlas.graphify-edge-projection-candidate.v1',
		workspaceId: '00000000-0000-4000-8000-000000000010',
		workspaceRevision: 'workspace-r1',
		sourceRef: 'src/a.ts',
		sourceRevision: 'source-a-r1',
		subjectStableSymbolKey: packet.graphEndpointKey,
		predicate: 'IMPORTS',
		objectStableSymbolKey: neighbor.graphEndpointKey,
		unresolvedTarget: null,
		evidenceKind: 'AST_REFERENCE',
		evidenceSpan: { startByte: 10, endByte: 20, startRow: 1, endRow: 1 },
		confidence: 1,
		evidenceRefs: ['source-span:src/a.ts:1-2'],
		referenceId: 'reference-1',
	},
	packet,
	neighbor,
	graphRevision: 'graph-r1',
	producerRevision: 'graphify-packet-incidence-projection-v1@1',
};

describe('Graphify packet-incidence projection owner', () => {
	it('projects only exact, evidence-backed, same-workspace endpoints', () => {
		const result = projectGraphifyEdgeToPacketIncidenceV1(input);
		const reorderedEdge = Object.fromEntries(Object.entries(input.edge).reverse()) as typeof input.edge;
		const reordered = projectGraphifyEdgeToPacketIncidenceV1({ ...input, edge: reorderedEdge });

		expect(result.canonicalId).toBe(packet.canonicalId);
		expect(result.neighborCanonicalId).toBe(neighbor.canonicalId);
		expect(result.graphRevision).toBe('graph-r1');
		expect(result.evidenceRefs).toContain('source-span:src/a.ts:1-2');
		expect(result.evidenceRefs).toContain('graph-edge:reference-1');
		expect(result).toEqual(reordered);
	});

	it('rejects unresolved or identity-mismatched targets', () => {
		expect(() => projectGraphifyEdgeToPacketIncidenceV1({
			...input,
			edge: { ...input.edge, objectStableSymbolKey: null, unresolvedTarget: 'unknown.ts#symbol' },
		})).toThrow('GRAPHIFY_PACKET_INCIDENCE_TARGET_UNRESOLVED');
		expect(() => projectGraphifyEdgeToPacketIncidenceV1({
			...input,
			neighbor: { ...neighbor, graphEndpointKey: 'symbol:wrong' },
		})).toThrow('GRAPHIFY_PACKET_INCIDENCE_TARGET_IDENTITY_MISMATCH');
	});

	it('rejects empty evidence and stale source/workspace bindings', () => {
		expect(() => projectGraphifyEdgeToPacketIncidenceV1({
			...input,
			edge: { ...input.edge, evidenceRefs: [] },
		})).toThrow('GRAPHIFY_PACKET_INCIDENCE_EVIDENCE_REQUIRED');
		expect(() => projectGraphifyEdgeToPacketIncidenceV1({
			...input,
			packet: { ...packet, sourceRevision: 'stale-source' },
		})).toThrow('GRAPHIFY_PACKET_INCIDENCE_SOURCE_BINDING_MISMATCH');
		expect(() => projectGraphifyEdgeToPacketIncidenceV1({
			...input,
			neighbor: { ...neighbor, workspaceRevision: 'stale-workspace' },
		})).toThrow('GRAPHIFY_PACKET_INCIDENCE_WORKSPACE_REVISION_MISMATCH');
		expect(() => projectGraphifyEdgeToPacketIncidenceV1({
			...input,
			packet: { ...packet, graphRevision: 'stale-graph' },
		})).toThrow('GRAPHIFY_PACKET_INCIDENCE_GRAPH_REVISION_MISMATCH');
	});
});
