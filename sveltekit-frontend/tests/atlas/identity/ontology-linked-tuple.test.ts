// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { OntologyLinkedTupleV1Schema } from '../../../src/lib/server/atlas/contracts/ontology-linked-tuple-v1.js';

describe('OntologyLinkedTupleV1Schema', () => {
  it('accepts a versioned POS/tagger/ontology linked tuple', () => {
    const tuple = OntologyLinkedTupleV1Schema.parse({
      tupleId: 'tuple-1',
      schemaVersion: 'ontology-linked-tuple.v1',
      packetKey: 'packet:trace-mcp-server',
      sourceRef: 'src/mcp/trace-mcp-server.ts',
      treeNodeId: 'tree:trace-mcp-server',
      documentId: 'doc-trace-mcp',
      titleId: 'okf:trace-mcp',
      surfaceText: 'retrieval',
      tokenIndex: 0,
      partOfSpeech: 'NOUN',
      label: 'retrieval',
      labelKind: 'ontology',
      labelSource: 'semantic_tagger',
      ontologyIds: ['ontology:tooling'],
      conceptIds: ['concept:mcp'],
      confidence: 0.86,
      evidenceState: 'ACTIVE_VERIFIED',
      provenance: {
        sourceTables: ['atlas_packets', 'feature_ontology_tuples'],
        labelerVersion: 'domain-classifier-v1',
        taggerVersion: 'langextract-v1',
        ontologyVersion: 'ontology-v1',
        nlpVersion: 'miniforge-nlp-v1',
      },
    });

    expect(tuple.schemaVersion).toBe('ontology-linked-tuple.v1');
    expect(tuple.labelKind).toBe('ontology');
    expect(tuple.labelSource).toBe('semantic_tagger');
  });
});
