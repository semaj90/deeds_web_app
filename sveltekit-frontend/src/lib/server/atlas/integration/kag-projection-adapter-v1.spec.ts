import { describe, expect, it } from 'vitest';
import { createHyperedgeV1 } from '../../graph/hyperedge-contract.js';
import type { OntologyLinkedTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';
import { projectHyperedgesToKagEdgesV1, projectOntologyTuplesToKagNodesV1 } from './kag-projection-adapter-v1.js';

function tuple(overrides: Partial<OntologyLinkedTupleV1> = {}): OntologyLinkedTupleV1 {
  return {
    tupleId: 'tuple:1',
    schemaVersion: 'ontology-linked-tuple.v1',
    packetKey: 'packet:kag-test-1',
    sourceRef: 'src/lib/db/upsert.ts',
    surfaceText: 'upsert',
    label: 'Upsert Handler',
    labelKind: 'ontology',
    labelSource: 'llm',
    ontologyIds: ['ontology:database'],
    conceptIds: ['concept:persistence'],
    participants: [],
    evidenceRefs: ['packet:kag-test-1'],
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
    ...overrides,
  } as OntologyLinkedTupleV1;
}

describe('KAG-01: projectOntologyTuplesToKagNodesV1', () => {
  it('projects one tuple to one KAGNode keyed by packetKey', () => {
    const nodes = projectOntologyTuplesToKagNodesV1([tuple()]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: 'packet:kag-test-1',
      type: 'file',
      label: 'Upsert Handler',
      filePath: 'src/lib/db/upsert.ts',
    });
    expect(nodes[0].tags.sort()).toEqual(['concept:persistence', 'ontology:database']);
  });

  it('de-duplicates by id, keeping the higher-confidence tuple', () => {
    const low = tuple({ confidence: 0.3, label: 'Weak Label' });
    const high = tuple({ confidence: 0.95, label: 'Strong Label' });
    const nodes = projectOntologyTuplesToKagNodesV1([low, high]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe('Strong Label');
  });

  it('classifies a tuple with a citation participant as type citation', () => {
    const withCitation = tuple({
      participants: [{ entityId: 'cite:1', entityKind: 'citation', role: 'source' }],
    });
    const nodes = projectOntologyTuplesToKagNodesV1([withCitation]);
    expect(nodes[0].type).toBe('citation');
  });

  it('falls back to sourceRef as id when packetKey is absent', () => {
    const noPacket = tuple({ packetKey: undefined, sourceRef: 'src/lib/db/select.ts' });
    const nodes = projectOntologyTuplesToKagNodesV1([noPacket]);
    expect(nodes[0].id).toBe('src/lib/db/select.ts');
  });
});

describe('KAG-01: projectHyperedgesToKagEdgesV1', () => {
  function edge(predicate: string, participantIds: string[]) {
    return createHyperedgeV1({
      predicate,
      participants: participantIds.map((canonicalId, ordinal) => ({ canonicalId, role: 'member', ordinal })),
      evidenceRefs: ['packet:evidence-1'],
      workspaceRevision: 'ws:1',
      graphRevision: 'graph:1',
      sourceRevision: 'src:1',
      producerRevision: 'kag-adapter-test:v1',
    });
  }

  it('projects a binary hyperedge to one KAGEdge with full weight', () => {
    const edges = projectHyperedgesToKagEdgesV1([edge('imports', ['a', 'b'])]);
    expect(edges).toEqual([{ from: 'a', to: 'b', type: 'IMPORTS', weight: 1 }]);
  });

  it('projects an n-ary hyperedge to a star with fan-out-normalized weight, not a clique', () => {
    const edges = projectHyperedgesToKagEdgesV1([edge('related', ['a', 'b', 'c', 'd'])]);
    // 3 participants beyond the hub -> 3 edges (star), not C(4,2)=6 (clique)
    expect(edges).toHaveLength(3);
    expect(edges.every((e) => e.from === 'a')).toBe(true);
    expect(edges.map((e) => e.to).sort()).toEqual(['b', 'c', 'd']);
    expect(edges.every((e) => e.weight === 1 / 3)).toBe(true);
  });

  it('maps an unrecognized predicate to RELATED rather than throwing', () => {
    const edges = projectHyperedgesToKagEdgesV1([edge('co_occurs_with', ['a', 'b'])]);
    expect(edges[0].type).toBe('RELATED');
  });

  it('maps a recognized predicate case-insensitively', () => {
    const edges = projectHyperedgesToKagEdgesV1([edge('cites', ['a', 'b'])]);
    expect(edges[0].type).toBe('CITES');
  });
});
