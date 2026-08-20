import { describe, expect, it } from 'vitest';
import {
	createConceptBroaderThanV1,
	createConceptV1,
	createTaxonomyAssignmentCandidateV1,
	promoteTaxonomyAssignmentV1,
} from './entity-concept-taxonomy-v1.js';


describe('entity-concept taxonomy contracts', () => {
	it('keeps concept identity stable across label/alias presentation changes', () => {
		const left = createConceptV1({
			conceptKey: 'retrieval.semantic',
			namespace: 'parent-atlas',
			label: 'Semantic Retrieval',
			aliases: ['vector search'],
			taxonomyRevision: 'taxonomy:1',
			definitionEvidenceRefs: ['spec:retrieval'],
			producerRevision: 'taxonomy-builder:1',
		});
		const right = createConceptV1({
			conceptKey: 'retrieval.semantic',
			namespace: 'parent-atlas',
			label: 'Semantic Candidate Retrieval',
			aliases: ['KNN', 'vector search'],
			taxonomyRevision: 'taxonomy:2',
			definitionEvidenceRefs: ['spec:retrieval:v2'],
			producerRevision: 'taxonomy-builder:2',
		});
		expect(left.conceptId).toBe(right.conceptId);
	});

	it('does not turn KNN/community signals directly into canonical truth', () => {
		const candidate = createTaxonomyAssignmentCandidateV1({
			entityId: 'symbol:searchCandidates',
			conceptId: 'concept:semantic-retrieval',
			taxonomyRevision: 'taxonomy:1',
			semanticRevision: 'semantic_768:7',
			graphRevision: 'graph:9',
			semanticNeighborRefs: ['knn:receipt:1'],
			communityRefs: ['community:receipt:1'],
			evidenceRefs: ['source:span:1'],
			semanticScore: 0.94,
			communityAffinity: 0.8,
			producerRevision: 'taxonomy-candidate:1',
		});
		expect(candidate.status).toBe('proposed');
		expect(candidate.semanticRevision).toBe('semantic_768:7');
	});

	it('promotes an accepted assignment through canonical HyperedgeV1', () => {
		const candidate = createTaxonomyAssignmentCandidateV1({
			entityId: 'symbol:searchCandidates',
			conceptId: 'concept:semantic-retrieval',
			taxonomyRevision: 'taxonomy:1',
			semanticRevision: 'semantic_768:7',
			graphRevision: 'graph:9',
			evidenceRefs: ['source:span:1'],
			producerRevision: 'taxonomy-candidate:1',
		});
		const edge = promoteTaxonomyAssignmentV1({
			candidate,
			workspaceRevision: 'workspace:1',
			sourceRevision: 'source:1',
			graphRevision: 'graph:9',
			promotionEvidenceRefs: ['review:approved:1'],
			producerRevision: 'taxonomy-promotion:1',
		});
		expect(edge.predicate).toBe('ENTITY_CLASSIFIED_AS');
		expect(edge.participants.map((participant) => participant.role)).toEqual(['entity', 'concept']);
		expect(edge.evidenceRefs).toContain('review:approved:1');
	});

	it('reuses HyperedgeV1 for concept hierarchy instead of inventing a second relation owner', () => {
		const edge = createConceptBroaderThanV1({
			parentConceptId: 'concept:retrieval',
			childConceptId: 'concept:semantic-retrieval',
			workspaceRevision: 'workspace:1',
			graphRevision: 'graph:9',
			sourceRevision: 'taxonomy-source:1',
			evidenceRefs: ['spec:taxonomy:1'],
			producerRevision: 'taxonomy-builder:1',
		});
		expect(edge.predicate).toBe('CONCEPT_BROADER_THAN');
		expect(edge.participants.map((participant) => participant.role)).toEqual(['broader', 'narrower']);
	});
});
