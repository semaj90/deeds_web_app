import { describe, expect, it } from 'vitest';
import type { HyperRelationV1 } from './hyper-relation-v1.js';
import {
	buildIncidenceProjectionV1,
	reconstructRelationsFromIncidenceProjectionV1
} from './incidence-projection-v1.js';

const relation: HyperRelationV1 = {
	schema: 'atlas.hyper-relation.v1',
	relationId: 'call-binding:42',
	relationType: 'CALL_BINDING',
	participants: [
		{ canonicalId: 'symbol:caller', role: 'caller', ordinal: 0 },
		{ canonicalId: 'symbol:callee', role: 'callee', ordinal: 1 },
		{ canonicalId: 'symbol:argument', role: 'argument', ordinal: 2 },
		{ canonicalId: 'symbol:parameter', role: 'parameter', ordinal: 3 },
		{ canonicalId: 'callsite:42', role: 'callsite', ordinal: 4 }
	],
	evidenceRefs: ['src/app.ts#L10-L14'],
	workspaceRevision: 'ws-1',
	sourceRevision: 'src-rev-1',
	producerRevision: 'tree-sitter-v1'
};

const entities = [
	{ canonicalId: 'symbol:parameter', nodeKind: 'symbol' },
	{ canonicalId: 'callsite:42', nodeKind: 'callsite' },
	{ canonicalId: 'symbol:caller', nodeKind: 'symbol' },
	{ canonicalId: 'symbol:argument', nodeKind: 'symbol' },
	{ canonicalId: 'symbol:callee', nodeKind: 'symbol' }
];

describe('GPH-PROJ incidence projection', () => {
	it('GPH-PROJ-01 creates one relation vertex plus role-preserving incidence edges', () => {
		const projection = buildIncidenceProjectionV1({
			workspaceRevision: 'ws-1',
			projectionRevision: 'proj-1',
			entities,
			relations: [relation]
		});

		expect(projection.entityCount).toBe(5);
		expect(projection.relationCount).toBe(1);
		expect(projection.nodes).toHaveLength(6);
		expect(projection.edges).toHaveLength(5);
		expect(projection.unresolvedParticipantCount).toBe(0);
		expect(projection.edges.map((edge) => edge.participantRole)).toEqual([
			'caller', 'callee', 'argument', 'parameter', 'callsite'
		]);
	});

	it('GPH-PROJ-02 is deterministic across shuffled entity input', () => {
		const first = buildIncidenceProjectionV1({
			workspaceRevision: 'ws-1', projectionRevision: 'proj-1', entities, relations: [relation]
		});
		const second = buildIncidenceProjectionV1({
			workspaceRevision: 'ws-1', projectionRevision: 'proj-1', entities: [...entities].reverse(), relations: [relation]
		});
		expect(second.nodeTableHash).toBe(first.nodeTableHash);
		expect(second.edgeTableHash).toBe(first.edgeTableHash);
		expect(second.projectionHash).toBe(first.projectionHash);
	});

	it('GPH-PROJ-03 assigns dense stable GPU ordinals', () => {
		const projection = buildIncidenceProjectionV1({
			workspaceRevision: 'ws-1', projectionRevision: 'proj-1', entities, relations: [relation]
		});
		expect(projection.nodes.map((node) => node.gpuNodeId)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(projection.nodes.map((node) => node.projectionNodeKey)).toEqual([
			'entity:callsite:42',
			'entity:symbol:argument',
			'entity:symbol:callee',
			'entity:symbol:caller',
			'entity:symbol:parameter',
			'relation:call-binding:42'
		]);
	});

	it('GPH-PROJ-05 reconstructs the original N-ary participant tuple without clique expansion', () => {
		const projection = buildIncidenceProjectionV1({
			workspaceRevision: 'ws-1', projectionRevision: 'proj-1', entities, relations: [relation]
		});
		const reconstructed = reconstructRelationsFromIncidenceProjectionV1(projection, [relation]);
		expect(reconstructed).toEqual([relation]);
		expect(projection.edges.every((edge) => edge.edgeType === 'INCIDENT_TO')).toBe(true);
	});

	it('GPH-PROJ-06 fails closed on mixed workspace revisions', () => {
		expect(() => buildIncidenceProjectionV1({
			workspaceRevision: 'ws-2', projectionRevision: 'proj-1', entities, relations: [relation]
		})).toThrow('WORKSPACE_REVISION_MISMATCH:call-binding:42');
	});
});
