import { describe, expect, it } from 'vitest';
import { deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1 } from './taxonomy-candidate-producer-v1.js';
import { OntologyLinkedTupleV1Schema, type OntologyLinkedTupleV1 } from './contracts/ontology-linked-tuple-v1.js';

function tuple(overrides: Partial<OntologyLinkedTupleV1> = {}): OntologyLinkedTupleV1 {
  return OntologyLinkedTupleV1Schema.parse({
    tupleId: 'tuple:producer-test-1',
    schemaVersion: 'ontology-linked-tuple.v1',
    packetKey: 'packet:producer-test-1',
    sourceRef: 'taxonomy:node-1',
    surfaceText: 'authentication',
    label: 'authentication',
    labelKind: 'ontology',
    labelSource: 'semantic_tagger',
    ontologyIds: ['ontology:auth'],
    conceptIds: ['concept:auth'],
    participants: [],
    evidenceRefs: ['src/lib/server/auth.ts#12'],
    confidence: 0.9,
    evidenceState: 'ACTIVE_VERIFIED',
    lifecycle: 'OBSERVED',
    provenance: {
      sourceTables: ['taxonomy_nodes'],
      labelerVersion: null,
      taggerVersion: null,
      ontologyVersion: 'ontology:1',
      nlpVersion: null,
      graphRevision: 'graph:1',
    },
    ...overrides,
  } as OntologyLinkedTupleV1);
}

describe('deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1', () => {
  it('turns a confident ontology tuple into an auto-proposeable candidate', () => {
    const [candidate] = deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1([tuple()], 'producer:test:1');

    expect(candidate.entityId).toBe('packet:producer-test-1');
    expect(candidate.conceptId).toBe('concept:auth');
    expect(candidate.semanticScore).toBe(0.9);
    expect(candidate.communityAffinity).toBeNull();
    expect(candidate.graphSupport).toBeNull();
    expect(candidate.status).toBe('proposed');
    expect(candidate.evidenceRefs).toContain('src/lib/server/auth.ts#12');
    expect(candidate.evidenceRefs).toContain('ontology-tuple:tuple:producer-test-1');
  });

  it('sends a low-confidence or degraded tuple to review_required instead of auto-proposing', () => {
    const [lowConfidence] = deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1(
      [tuple({ confidence: 0.6 })],
      'producer:test:1'
    );
    expect(lowConfidence.status).toBe('review_required');

    const [degraded] = deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1(
      [tuple({ evidenceState: 'ACTIVE_DEGRADED' })],
      'producer:test:1'
    );
    expect(degraded.status).toBe('review_required');
  });

  it('skips pos/tag tuples entirely — only ontology-labeled tuples are taxonomy assignments', () => {
    const candidates = deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1(
      [tuple({ labelKind: 'pos', label: 'noun' }), tuple({ labelKind: 'tag', label: 'misc' })],
      'producer:test:1'
    );
    expect(candidates).toHaveLength(0);
  });

  it('skips a tuple with no resolvable concept id', () => {
    const candidates = deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1(
      [tuple({ ontologyIds: [], conceptIds: [] })],
      'producer:test:1'
    );
    expect(candidates).toHaveLength(0);
  });

  it('skips a tuple with no evidence — never fabricates a candidate without proof', () => {
    const candidates = deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1(
      [tuple({ evidenceRefs: [] })],
      'producer:test:1'
    );
    expect(candidates).toHaveLength(0);
  });

  it('is deterministic: same input produces the same candidateId every time', () => {
    const a = deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1([tuple()], 'producer:test:1');
    const b = deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1([tuple()], 'producer:test:1');
    expect(a[0].candidateId).toBe(b[0].candidateId);
  });
});
