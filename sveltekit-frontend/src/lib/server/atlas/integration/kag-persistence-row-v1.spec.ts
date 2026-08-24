import { describe, expect, it } from 'vitest';
import { createHyperedgeV1 } from '../../graph/hyperedge-contract.js';
import { OntologyLinkedTupleV1Schema } from '../contracts/ontology-linked-tuple-v1.js';
import {
  toAtlasHyperedgePersistenceRowsV1,
  toAtlasOntologyTuplePersistenceRowV1,
} from './kag-persistence-row-v1.js';

describe('KAG persistence row mapping', () => {
  it('keeps n-ary hyperedges as one row plus ordered members', () => {
    const edge = createHyperedgeV1({
      predicate: 'CALLS',
      participants: [
        { canonicalId: 'symbol:a', role: 'caller', ordinal: 0 },
        { canonicalId: 'symbol:b', role: 'callee', ordinal: 1 },
        { canonicalId: 'packet:p', role: 'evidence', ordinal: 2 },
      ],
      evidenceRefs: ['packet:p'],
      workspaceRevision: 'workspace:1',
      graphRevision: 'graph:1',
      sourceRevision: 'source:1',
      producerRevision: 'ast-grep:1',
    });
    const rows = toAtlasHyperedgePersistenceRowsV1(edge);
    expect(rows.hyperedge.contractHyperedgeId).toBe(edge.hyperedgeId);
    expect(rows.hyperedge.packetKey).toBe('packet:p');
    expect(rows.members.map((member) => member.memberId)).toEqual(['symbol:a', 'symbol:b', 'packet:p']);
  });

  it('preserves tuple identity, revisions, and evidence without promoting it', () => {
    const tuple = OntologyLinkedTupleV1Schema.parse({
      tupleId: 'tuple:1',
      schemaVersion: 'ontology-linked-tuple.v1',
      packetKey: 'packet:p',
      sourceRef: 'src/a.ts',
      surfaceText: 'calls',
      label: 'CALLS',
      labelKind: 'ontology',
      labelSource: 'semantic_tagger',
      ontologyIds: ['ontology:calls'],
      conceptIds: ['concept:call'],
      participants: [{ entityId: 'symbol:a', entityKind: 'ast_symbol', role: 'actor' }],
      evidenceRefs: ['src/a.ts#1'],
      confidence: 0.9,
      evidenceState: 'ACTIVE_VERIFIED',
      lifecycle: 'OBSERVED',
      provenance: {
        sourceTables: ['ast'],
        labelerVersion: null,
        taggerVersion: null,
        ontologyVersion: 'ontology:1',
        nlpVersion: null,
        sourceRevision: 'source:1',
        featureRevision: 'feature:1',
      },
    });
    const row = toAtlasOntologyTuplePersistenceRowV1(tuple);
    expect(row.tupleId).toBe('tuple:1');
    expect(row.packetKey).toBe('packet:p');
    expect(row.sourceRef).toBe('src/a.ts');
    expect(row.provenance.sourceRevision).toBe('source:1');
    expect(row.ontologyIds).toEqual(['ontology:calls']);
  });
});
