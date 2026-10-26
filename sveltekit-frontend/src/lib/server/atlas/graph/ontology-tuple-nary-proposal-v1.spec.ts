import { describe, expect, it } from 'vitest';
import {
  proposeOntologyLinkedTupleNaryFactV1,
  proposeOntologyLinkedTupleWithOkfPolicyV1,
} from './ontology-tuple-nary-proposal-v1.js';

const predicateResolution = {
  status: 'RESOLVED' as const,
  predicate: 'uses_concept',
  registryDocumentSha256: 'a'.repeat(64),
  registrySchemaSha256: 'b'.repeat(64),
};

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
    ontologyRevision: 'ontology-revision:v1',
  },
};

const owners = [
  { canonicalId: 'packet:search', entityType: 'PACKET', entityRevision: 'source:v1' },
  { canonicalId: 'symbol:search', entityType: 'AST_SYMBOL', entityRevision: 'source:v1' },
  { canonicalId: 'concept:search', entityType: 'CONCEPT', entityRevision: 'source:v1' },
];

describe('OntologyLinkedTupleV1 n-ary proposal adapter', () => {
  it('loads the registered predicate policy before creating a proposal', async () => {
    const result = await proposeOntologyLinkedTupleWithOkfPolicyV1(tuple, {
      workspaceRevision: 'workspace:v1', graphRevision: 'graph:v1', producerRevision: 'ontology-proposal:v1',
    }, 'uses_concept', owners);

    expect(result.status).toBe('RESOLVED');
    expect(result.proposal?.predicate).toBe('uses_concept');
    expect(result.proposal?.predicatePolicy?.schema).toBe('atlas.okf.predicate-policy-ref.v1');
    expect(result.proposal?.predicatePolicy?.registryDocumentSha256).toBe(result.predicatePolicy.resolution.status === 'RESOLVED'
      ? result.predicatePolicy.resolution.registryDocumentSha256
      : null);
    expect(result.predicatePolicy.resolution.status).toBe('RESOLVED');
    expect(result.predicatePolicy.traversalEligible).toBe(true);
    expect(result.predicatePolicy.pagerankEligible).toBe(false);
  });

  it('does not infer a predicate from tuple labels when registry lookup fails', async () => {
    const result = await proposeOntologyLinkedTupleWithOkfPolicyV1(tuple, {
      workspaceRevision: 'workspace:v1', graphRevision: 'graph:v1', producerRevision: 'ontology-proposal:v1',
    }, 'ONTOLOGY_ONTOLOGY', owners);

    expect(result.proposal).toBeNull();
    expect(result.reasonCode).toBe('PREDICATE_NOT_REGISTERED');
    expect(result.predicatePolicy.resolution).toEqual({ status: 'UNRESOLVED', reasonCode: 'PREDICATE_NOT_REGISTERED' });
  });

  it('creates a proposal only for a verified, revision-bound tuple', () => {
    const result = proposeOntologyLinkedTupleNaryFactV1(tuple, {
      workspaceRevision: 'workspace:v1', graphRevision: 'graph:v1', producerRevision: 'ontology-proposal:v1',
      predicateResolution,
    }, owners);

    expect(result.status).toBe('RESOLVED');
    expect(result.proposal?.participants).toHaveLength(3);
    expect(result.proposal?.ontologyRevision).toBe('ontology-revision:v1');
    expect(result.proposal?.admission).toBe('PROPOSED');
    expect(result.proposal?.predicate).toBe(predicateResolution.predicate);
    expect(result.proposal?.predicate).not.toBe(tuple.label);
  });

  it('does not infer ontology revision from ontologyVersion', () => {
    const result = proposeOntologyLinkedTupleNaryFactV1({
      ...tuple,
      provenance: { ...tuple.provenance, ontologyRevision: null },
    }, {
      workspaceRevision: 'workspace:v1', graphRevision: 'graph:v1', producerRevision: 'ontology-proposal:v1',
      predicateResolution,
    }, owners);

    expect(result.proposal?.ontologyRevision).toBeNull();
  });

  it('rejects degraded tuples before participant resolution', () => {
    const result = proposeOntologyLinkedTupleNaryFactV1({ ...tuple, evidenceState: 'ACTIVE_DEGRADED' }, {
      workspaceRevision: 'workspace:v1', graphRevision: 'graph:v1', producerRevision: 'ontology-proposal:v1',
      predicateResolution,
    }, owners);

    expect(result.proposal).toBeNull();
    expect(result.reasonCode).toBe('ONTOLOGY_TUPLE_NOT_ACTIVE_VERIFIED');
  });

  it('rejects when explicit predicate policy resolution is missing', () => {
    const result = proposeOntologyLinkedTupleNaryFactV1(tuple, {
      workspaceRevision: 'workspace:v1', graphRevision: 'graph:v1', producerRevision: 'ontology-proposal:v1',
    }, owners);

    expect(result.proposal).toBeNull();
    expect(result.reasonCode).toBe('ONTOLOGY_TUPLE_PREDICATE_POLICY_UNRESOLVED');
  });

  it('rejects a resolved predicate without valid registry checksums', () => {
    const result = proposeOntologyLinkedTupleNaryFactV1(tuple, {
      workspaceRevision: 'workspace:v1', graphRevision: 'graph:v1', producerRevision: 'ontology-proposal:v1',
      predicateResolution: { ...predicateResolution, registryDocumentSha256: 'invalid' },
    }, owners);

    expect(result.proposal).toBeNull();
    expect(result.reasonCode).toBe('ONTOLOGY_TUPLE_PREDICATE_POLICY_INVALID');
  });
});
