import { describe, expect, it } from 'vitest';
import {
	createConceptBroaderThanV1,
	createConceptPartOfV1,
	createConceptV1,
	recognizeConceptV1,
	createTaxonomyAssignmentCandidateV1,
	promoteTaxonomyAssignmentV1,
	TaxonomyAssignmentCandidateV1Schema,
} from './entity-concept-taxonomy-v1.js';


describe('entity-concept taxonomy contracts', () => {
	it('recognizes exact concept labels deterministically and keeps provenance', () => {
		const concept = createConceptV1({
			conceptKey: 'retrieval.knn', namespace: 'parent-atlas', label: 'KNN', aliases: ['nearest neighbour'],
			taxonomyRevision: 'taxonomy:1', definitionEvidenceRefs: ['spec:knn'], producerRevision: 'taxonomy-builder:1',
		});
		const result = recognizeConceptV1({
			observation: { schema: 'atlas.term-observation.v1', observationId: 'obs:1', term: 'KNN', normalizedTerm: 'knn', kind: 'query_term', sourceRef: 'query:1', sourceRevision: 'query:rev1', evidenceRefs: ['query:1'], producer: 'query-parser', producerRevision: 'parser:1', confidence: 0.9, canonicalAuthority: false },
			concepts: [concept], conceptRegistryRevision: 'registry:1', resolverRevision: 'resolver:1',
		});
		expect(result.status).toBe('ADMITTED');
		expect(result.selectedConceptId).toBe(concept.conceptId);
		expect(result.evidenceRefs).toEqual(['query:1']);
	});

	it('does not admit semantic-looking text without an exact concept or alias match', () => {
		const concept = createConceptV1({ conceptKey: 'retrieval.knn', namespace: 'parent-atlas', label: 'KNN', taxonomyRevision: 'taxonomy:1', definitionEvidenceRefs: ['spec:knn'], producerRevision: 'taxonomy-builder:1' });
		const result = recognizeConceptV1({ observation: { schema: 'atlas.term-observation.v1', observationId: 'obs:2', term: 'search nearby vectors', normalizedTerm: 'search nearby vectors', kind: 'query_term', sourceRef: 'query:2', sourceRevision: 'query:rev1', evidenceRefs: ['query:2'], producer: 'query-parser', producerRevision: 'parser:1', confidence: 0.9, canonicalAuthority: false }, concepts: [concept], conceptRegistryRevision: 'registry:1', resolverRevision: 'resolver:1' });
		expect(result.status).toBe('UNMAPPED');
		expect(result.selectedConceptId).toBeNull();
	});

	it('rejects ambiguous aliases instead of silently selecting one concept', () => {
		const make = (key: string) => createConceptV1({ conceptKey: key, namespace: 'parent-atlas', label: key, aliases: ['vector search'], taxonomyRevision: 'taxonomy:1', definitionEvidenceRefs: ['spec:' + key], producerRevision: 'taxonomy-builder:1' });
		const result = recognizeConceptV1({ observation: { schema: 'atlas.term-observation.v1', observationId: 'obs:3', term: 'vector search', normalizedTerm: 'vector search', kind: 'phrase', sourceRef: 'doc:1', sourceRevision: 'doc:rev1', evidenceRefs: ['doc:1:0-12'], producer: 'nlp', producerRevision: 'nlp:1', confidence: 0.8, canonicalAuthority: false }, concepts: [make('retrieval.semantic'), make('retrieval.knn')], conceptRegistryRevision: 'registry:1', resolverRevision: 'resolver:1' });
		expect(result.status).toBe('AMBIGUOUS');
		expect(result.candidateConceptIds).toHaveLength(2);
	});
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
		// createTaxonomyAssignmentCandidateV1 can only mint 'proposed' /
		// 'review_required' — reaching 'promoted' is a separate review step's
		// job, so the transition is simulated here the same way that step
		// would: re-parsing with status overridden.
		const promotedCandidate = TaxonomyAssignmentCandidateV1Schema.parse({ ...candidate, status: 'promoted' });
		const edge = promoteTaxonomyAssignmentV1({
			candidate: promotedCandidate,
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

	it('refuses to promote a candidate that has not cleared review (KAG-HYP-01 sibling gate)', () => {
		const baseCandidate = createTaxonomyAssignmentCandidateV1({
			entityId: 'symbol:searchCandidates',
			conceptId: 'concept:semantic-retrieval',
			taxonomyRevision: 'taxonomy:1',
			semanticRevision: 'semantic_768:7',
			graphRevision: 'graph:9',
			evidenceRefs: ['source:span:1'],
			producerRevision: 'taxonomy-candidate:1',
		});

		for (const status of ['proposed', 'review_required', 'rejected'] as const) {
			const candidate = TaxonomyAssignmentCandidateV1Schema.parse({ ...baseCandidate, status });
			expect(() =>
				promoteTaxonomyAssignmentV1({
					candidate,
					workspaceRevision: 'workspace:1',
					sourceRevision: 'source:1',
					graphRevision: 'graph:9',
					promotionEvidenceRefs: ['review:approved:1'],
					producerRevision: 'taxonomy-promotion:1',
				})
			).toThrow(`TAXONOMY_PROMOTION_REQUIRES_PROMOTED_STATUS:${candidate.candidateId}:${status}`);
		}
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

	it('keeps meronymy (part-of) distinct from hyponymy (broader-than)', () => {
		const edge = createConceptPartOfV1({
			wholeConceptId: 'concept:cluster-ui-component-21',
			partConceptId: 'concept:file-173561965',
			workspaceRevision: 'workspace:1',
			graphRevision: 'graph:9',
			sourceRevision: 'taxonomy-source:1',
			evidenceRefs: ['taxonomy_edges:5089'],
			producerRevision: 'taxonomy-builder:1',
		});
		expect(edge.predicate).toBe('CONCEPT_PART_OF');
		expect(edge.participants.map((participant) => participant.role)).toEqual(['whole', 'part']);
	});

	it('rejects a part-of edge with no evidence and a part-of edge referring to itself', () => {
		expect(() =>
			createConceptPartOfV1({
				wholeConceptId: 'concept:a',
				partConceptId: 'concept:b',
				workspaceRevision: 'workspace:1',
				graphRevision: 'graph:9',
				sourceRevision: 'taxonomy-source:1',
				evidenceRefs: [],
				producerRevision: 'taxonomy-builder:1',
			})
		).toThrow('CONCEPT_PART_OF_REQUIRES_EVIDENCE:concept:a:concept:b');

		expect(() =>
			createConceptPartOfV1({
				wholeConceptId: 'concept:a',
				partConceptId: 'concept:a',
				workspaceRevision: 'workspace:1',
				graphRevision: 'graph:9',
				sourceRevision: 'taxonomy-source:1',
				evidenceRefs: ['taxonomy_edges:1'],
				producerRevision: 'taxonomy-builder:1',
			})
		).toThrow('CONCEPT_PART_OF_SELF:concept:a');
	});
});
