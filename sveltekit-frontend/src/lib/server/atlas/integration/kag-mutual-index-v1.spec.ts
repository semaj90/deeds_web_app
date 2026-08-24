import { describe, expect, it } from 'vitest';
import { createHyperedgeV1 } from '../../graph/hyperedge-contract.js';
import type { OntologyLinkedTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';
import { buildKagMutualIndexV1 } from './kag-mutual-index-v1.js';

function tuple(id: string, packetKey: string | undefined, sourceRef: string): OntologyLinkedTupleV1 {
  return {
    tupleId: id,
    schemaVersion: 'ontology-linked-tuple.v1',
    packetKey,
    sourceRef,
    surfaceText: 'x',
    label: 'x',
    labelKind: 'ontology',
    labelSource: 'llm',
    ontologyIds: [],
    conceptIds: [],
    participants: [],
    evidenceRefs: [],
    confidence: 0.9,
    evidenceState: 'ACTIVE_VERIFIED',
    lifecycle: 'OBSERVED',
    provenance: {
      sourceTables: ['atlas_packets'],
      labelerVersion: null,
      taggerVersion: null,
      ontologyVersion: null,
      nlpVersion: null,
    },
  } as OntologyLinkedTupleV1;
}

function edge(id: string, participantIds: string[]) {
  return createHyperedgeV1({
    predicate: 'related',
    participants: participantIds.map((canonicalId, ordinal) => ({ canonicalId, role: 'member', ordinal })),
    evidenceRefs: ['packet:evidence-1'],
    workspaceRevision: 'ws:1',
    graphRevision: 'graph:1',
    sourceRevision: 'src:1',
    producerRevision: `kag-mutual-index-test:${id}`,
  });
}

describe('KAG-02: buildKagMutualIndexV1', () => {
  it('maps canonicalId to tuple ids and back, preferring packetKey over sourceRef', () => {
    const t = tuple('tuple:1', 'packet:a', 'src/a.ts');
    const index = buildKagMutualIndexV1([t], []);
    expect(index.canonicalIdToTupleIds.get('packet:a')).toEqual(['tuple:1']);
    expect(index.tupleIdToCanonicalId.get('tuple:1')).toBe('packet:a');
    expect(index.canonicalIdToTupleIds.has('src/a.ts')).toBe(false);
  });

  it('falls back to sourceRef when packetKey is absent', () => {
    const t = tuple('tuple:2', undefined, 'src/b.ts');
    const index = buildKagMutualIndexV1([t], []);
    expect(index.canonicalIdToTupleIds.get('src/b.ts')).toEqual(['tuple:2']);
  });

  it('indexes hyperedges both directions without duplicating repeated participants', () => {
    const e = edge('hyperedge:1', ['packet:a', 'packet:b', 'packet:a']);
    const index = buildKagMutualIndexV1([], [e]);
    expect([...(index.hyperedgeIdToCanonicalIds.get(e.hyperedgeId) ?? [])].sort()).toEqual(['packet:a', 'packet:b']);
    expect(index.canonicalIdToHyperedgeIds.get('packet:a')).toEqual([e.hyperedgeId]);
    expect(index.canonicalIdToHyperedgeIds.get('packet:b')).toEqual([e.hyperedgeId]);
  });

  it('accumulates multiple hyperedges referencing the same canonical id without duplicates', () => {
    const e1 = edge('hyperedge:1', ['packet:a', 'packet:b']);
    const e2 = edge('hyperedge:2', ['packet:a', 'packet:c']);
    const index = buildKagMutualIndexV1([], [e1, e2]);
    expect([...(index.canonicalIdToHyperedgeIds.get('packet:a') ?? [])].sort()).toEqual([e1.hyperedgeId, e2.hyperedgeId].sort());
  });

  it('is empty-input safe', () => {
    const index = buildKagMutualIndexV1([], []);
    expect(index.canonicalIdToTupleIds.size).toBe(0);
    expect(index.canonicalIdToHyperedgeIds.size).toBe(0);
  });
});
