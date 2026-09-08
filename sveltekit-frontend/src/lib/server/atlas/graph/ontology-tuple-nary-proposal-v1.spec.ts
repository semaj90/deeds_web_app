import { describe, expect, it } from 'vitest';
import { proposeOntologyLinkedTupleNaryFactV1 } from './ontology-tuple-nary-proposal-v1.js';

const tuple = {
  tupleId: 'tuple:1', schemaVersion: 'ontology-linked-tuple.v1' as const,
  packetKey: 'packet:search', sourceRef: 'src/search.ts', surfaceText: 'search', label: 'search',
  labelKind: 'ontology' as const, labelSource: 'manual' as const, ontologyIds: ['ontology:search'],
  conceptIds: ['concept:search'], evidenceRefs: ['evidence:tuple'], confidence: 0.99,
  evidenceState: 'ACTIVE_VERIFIED' as const, lifecycle: 'OBSERVED' as const,
  participants: [
    { entityId: 'packet:search', entityKind: 'packet' as const, role: 'packet' as const },
    { entityId: 'symbol:search', entityKind: 'ast_symbol' as const, role: 'symbol' as const },
    { entityId: 'concept:search', entityKind: 'concept' as const, role: 'target' as const },
  ],
  provenance: {
    sourceTables: ['fixture'], labelerVersion: null, taggerVersion: null, ontologyVersion: 'oak:v1',
    nlpVersion: null, sourceRevision: 'source:v1', graphRevision: 'graph:v1',
  },
};

const owners = [
  { canonicalId: 'packet:search', entityType: 'PACKET', entityRevision: 'source:v1' },
  { canonicalId: 'symbol:search', entityType: 'AST_SYMBOL', entityRevision: 'source:v1' },
  { canonicalId: 'concept:search', entityType: 'CONCEPT', entityRevision: 'source:v1' },
];

describe('OntologyLinkedTupleV1 n-ary proposal adapter', () => {
  it('creates a proposal only for a verified, revision-bound tuple', () => {
    const result = proposeOntologyLinkedTupleNaryFactV1(tuple, {
      workspaceRevision: 'workspace:v1', graphRevision: 'graph:v1', producerRevision: 'ontology-proposal:v1',
    }, owners);

    expect(result.status).toBe('RESOLVED');
    expect(result.proposal?.participants).toHaveLength(3);
    expect(result.proposal?.admission).toBe('PROPOSED');
  });

  it('rejects degraded tuples before participant resolution', () => {
    const result = proposeOntologyLinkedTupleNaryFactV1({ ...tuple, evidenceState: 'ACTIVE_DEGRADED' }, {
      workspaceRevision: 'workspace:v1', graphRevision: 'graph:v1', producerRevision: 'ontology-proposal:v1',
    }, owners);

    expect(result.proposal).toBeNull();
    expect(result.reasonCode).toBe('ONTOLOGY_TUPLE_NOT_ACTIVE_VERIFIED');
  });
});
