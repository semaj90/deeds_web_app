import { describe, expect, it } from 'vitest';
import type { HyperRelationV1 } from './hyper-relation-v1.js';
import { buildFeatureRelationship, featureRelationshipToKernel } from '@deeds/parent-atlas';
import { createHyperedgeV1, hyperedgeToRelationshipKernel } from '../../graph/hyperedge-contract.js';
import {
	buildIncidenceProjectionV1,
	buildIncidenceProjectionFromRelationshipKernelsV1,
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

	it('GPH-PROJ-07 admits only revision-qualified relationship kernels', () => {
		const kernel = featureRelationshipToKernel(buildFeatureRelationship({
			relationship_id: 'rel:qualified',
			relationship_type: 'DOC_RELATES_CONCEPTS',
			participants: [
				{ role: 'subject', entity_type: 'document', entity_id: 'doc:1' },
				{ role: 'object', entity_type: 'concept', entity_id: 'concept:1' }
			],
			source_ref: 'docs/one.md',
			source_revision: 'source-r1',
			relationship_revision: 'rel-r1',
			producer_revision: 'producer-r1',
			evidence_refs: ['evidence:1']
		}));
		const qualified = { ...kernel, workspaceRevision: 'ws-1' };
		const projection = buildIncidenceProjectionFromRelationshipKernelsV1({
			workspaceRevision: 'ws-1', projectionRevision: 'proj-1',
			entities: [
				{ canonicalId: 'doc:1', nodeKind: 'document' },
				{ canonicalId: 'concept:1', nodeKind: 'concept' }
			],
			kernels: [qualified]
		});
		expect(projection.relationCount).toBe(1);
		expect(projection.edges).toHaveLength(2);
		expect(() => buildIncidenceProjectionFromRelationshipKernelsV1({
			workspaceRevision: 'ws-1', projectionRevision: 'proj-1', entities: [],
			kernels: [{ ...kernel, workspaceRevision: 'ws-1', sourceRevision: null }]
		})).toThrow('SOURCE_REVISION_UNPROVEN:rel:qualified');
	});

	it('REL-OWNER-08 projects a KAG_TAXONOMY hyperedge and a FEATURE_INTELLIGENCE relationship into one incidence graph without ID or namespace collision', () => {
		const hyperedge = createHyperedgeV1({
			predicate: 'ENTITY_CLASSIFIED_AS',
			participants: [
				{ canonicalId: 'entity:file-x', role: 'subject', ordinal: 0 },
				{ canonicalId: 'concept:retrieval', role: 'object', ordinal: 1 }
			],
			evidenceRefs: ['evidence:kag-1'],
			workspaceRevision: 'ws-1',
			graphRevision: 'graph-1',
			sourceRevision: 'src-rev-1',
			producerRevision: 'taxonomy-producer-v1'
		});
		const kagKernel = { ...hyperedgeToRelationshipKernel(hyperedge), workspaceRevision: 'ws-1' };

		const fiKernel = {
			...featureRelationshipToKernel(buildFeatureRelationship({
				relationship_id: 'rel:mixed:doc-concept',
				relationship_type: 'DOC_RELATES_CONCEPTS',
				participants: [
					{ role: 'subject', entity_type: 'document', entity_id: 'doc:mixed' },
					{ role: 'object', entity_type: 'concept', entity_id: 'concept:retrieval' }
				],
				source_ref: 'docs/mixed.md',
				source_revision: 'source-r1',
				relationship_revision: 'rel-r1',
				producer_revision: 'producer-r1',
				evidence_refs: ['evidence:1']
			})),
			workspaceRevision: 'ws-1'
		};

		const projection = buildIncidenceProjectionFromRelationshipKernelsV1({
			workspaceRevision: 'ws-1',
			projectionRevision: 'proj-mixed-1',
			entities: [
				{ canonicalId: 'entity:file-x', nodeKind: 'file' },
				{ canonicalId: 'concept:retrieval', nodeKind: 'concept' },
				{ canonicalId: 'doc:mixed', nodeKind: 'document' }
			],
			kernels: [kagKernel, fiKernel]
		});

		expect(projection.relationCount).toBe(2);
		expect(projection.entityCount).toBe(3);
		expect(projection.unresolvedParticipantCount).toBe(0);

		const relationNodes = projection.nodes.filter((node) => node.kind === 'relation');
		expect(relationNodes).toHaveLength(2);
		// Both real production relationId schemes happen to share the literal
		// "hyperedge:" text prefix (see REL-OWNER-08 note in openspec tasks.md) —
		// this is exactly why the domain tag is carried as an explicit
		// `authority` field (not inferred from a prefix convention on the id
		// string). relationType/nodeKind is a secondary, guard-enforced signal;
		// `authority` is now the primary one.
		expect(new Set(relationNodes.map((node) => node.relationId))).toEqual(
			new Set([kagKernel.relationshipId, fiKernel.relationshipId])
		);
		expect(relationNodes.map((node) => node.nodeKind).sort()).toEqual(
			['DOC_RELATES_CONCEPTS', 'ENTITY_CLASSIFIED_AS'].sort()
		);
		expect(
			relationNodes.find((node) => node.relationId === kagKernel.relationshipId)?.authority
		).toBe('KAG_TAXONOMY');
		expect(
			relationNodes.find((node) => node.relationId === fiKernel.relationshipId)?.authority
		).toBe('FEATURE_INTELLIGENCE');
		expect(projection.nodes.filter((node) => node.kind === 'entity').every((node) => node.authority === null)).toBe(true);

		// concept:retrieval is the shared entity — it must have exactly one
		// incidence edge back to each relation, not be merged or duplicated.
		const conceptGpuId = projection.nodes.find((node) => node.canonicalId === 'concept:retrieval')!.gpuNodeId;
		const conceptEdges = projection.edges.filter((edge) => edge.dstGpuNodeId === conceptGpuId);
		expect(conceptEdges).toHaveLength(2);
		expect(new Set(conceptEdges.map((edge) => edge.relationId))).toEqual(
			new Set([kagKernel.relationshipId, fiKernel.relationshipId])
		);
	});

	it('REL-OWNER-07/08 fails closed, never silently coalesces, when two kernels from different authorities share one relationshipId', () => {
		const sharedId = 'hyperedge:collision-fixture';
		const kagLike = {
			...hyperedgeToRelationshipKernel(createHyperedgeV1({
				predicate: 'ENTITY_CLASSIFIED_AS',
				participants: [
					{ canonicalId: 'entity:a', role: 'subject', ordinal: 0 },
					{ canonicalId: 'concept:b', role: 'object', ordinal: 1 }
				],
				evidenceRefs: ['evidence:kag'],
				workspaceRevision: 'ws-1',
				graphRevision: 'graph-1',
				sourceRevision: 'src-rev-1',
				producerRevision: 'taxonomy-producer-v1'
			})),
			relationshipId: sharedId,
			workspaceRevision: 'ws-1'
		};
		const fiLike = {
			...featureRelationshipToKernel(buildFeatureRelationship({
				relationship_id: 'rel:distinct',
				relationship_type: 'DOC_RELATES_CONCEPTS',
				participants: [
					{ role: 'subject', entity_type: 'document', entity_id: 'doc:c' },
					{ role: 'object', entity_type: 'concept', entity_id: 'concept:b' }
				],
				source_ref: 'docs/collision.md',
				source_revision: 'source-r1',
				relationship_revision: 'rel-r1',
				producer_revision: 'producer-r1',
				evidence_refs: ['evidence:fi']
			})),
			relationshipId: sharedId,
			workspaceRevision: 'ws-1'
		};

		expect(() => buildIncidenceProjectionFromRelationshipKernelsV1({
			workspaceRevision: 'ws-1',
			projectionRevision: 'proj-collision-1',
			entities: [
				{ canonicalId: 'entity:a', nodeKind: 'file' },
				{ canonicalId: 'concept:b', nodeKind: 'concept' },
				{ canonicalId: 'doc:c', nodeKind: 'document' }
			],
			kernels: [kagLike, fiLike]
		})).toThrow(`DUPLICATE_RELATION_ID:${sharedId}`);
	});
});
