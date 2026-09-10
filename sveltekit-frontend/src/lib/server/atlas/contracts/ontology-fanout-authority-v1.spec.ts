import { describe, expect, it } from 'vitest';

import type { OntologyLinkedTupleV1 } from './ontology-linked-tuple-v1.js';
import {
  evaluateOntologyFanoutAuthorityV1,
  type OntologyFanoutAuthorityV1,
} from './ontology-fanout-authority-v1.js';

function tuple(overrides: Partial<OntologyLinkedTupleV1> = {}): OntologyLinkedTupleV1 {
  return {
    tupleId: 'tuple:1',
    schemaVersion: 'ontology-linked-tuple.v1',
    packetKey: 'packet:canonical:1',
    sourceRef: 'src/lib/server/example.ts',
    surfaceText: 'retrieval',
    tokenIndex: 0,
    partOfSpeech: null,
    label: 'concept:retrieval',
    labelKind: 'ontology',
    labelSource: 'semantic_tagger',
    ontologyIds: ['ontology:retrieval'],
    conceptIds: ['concept:retrieval'],
    participants: [],
    evidenceRefs: ['evidence:span:1'],
    confidence: 0.95,
    evidenceState: 'ACTIVE_VERIFIED',
    lifecycle: 'OBSERVED',
    provenance: {
      sourceTables: ['atlas_observation_feature_rows'],
      labelerVersion: 'domain-classifier:v1',
      taggerVersion: 'concept-linker:v1',
      ontologyVersion: 'ontology:v1',
      nlpVersion: null,
      sourceRevision: 'sha256:source',
      representationId: 'semantic_768',
      representationRevision: 'repr:1',
      featureRevision: 'feature:1',
      graphRevision: 'graph:1',
      ontologyRevision: 'ontology:1',
      producerRevision: 'producer:1',
    },
    ...overrides,
  };
}

function authority(overrides: Partial<OntologyFanoutAuthorityV1> = {}): OntologyFanoutAuthorityV1 {
  return {
    schemaVersion: 'atlas.ontology-fanout-authority.v1',
    packetKey: 'packet:canonical:1',
    sourceRef: 'src/lib/server/example.ts',
    contentHash: 'a'.repeat(64),
    sourceRevision: 'sha256:source',
    workspaceRevision: 'sha256:workspace',
    representationId: 'semantic_768',
    representationRevision: 'repr:1',
    featureRevision: 'feature:1',
    ontologyRevision: 'ontology:1',
    graphRevision: 'graph:1',
    producerRevision: 'producer:1',
    evidenceRefs: ['evidence:span:1'],
    ontologyIds: ['ontology:retrieval'],
    conceptIds: ['concept:retrieval'],
    ...overrides,
  };
}

describe('OntologyFanoutAuthorityV1', () => {
  it('admits a fully revision-qualified verified ontology tuple', () => {
    const result = evaluateOntologyFanoutAuthorityV1(tuple(), authority());
    expect(result.blockers).toEqual([]);
    expect(result.cacheEligible).toBe(true);
    expect(result.taxonomyCandidateEligible).toBe(true);
    expect(result.canonicalTupleEligible).toBe(true);
    expect(result.graphFanoutEligible).toBe(true);
  });

  it('rejects missing authority rather than synthesizing revisions', () => {
    const result = evaluateOntologyFanoutAuthorityV1(tuple(), null);
    expect(result.blockers).toContain('FANOUT_AUTHORITY_MISSING');
    expect(result.canonicalTupleEligible).toBe(false);
  });

  it('rejects packet identity mismatch', () => {
    const result = evaluateOntologyFanoutAuthorityV1(tuple(), authority({ packetKey: 'packet:other' }));
    expect(result.blockers).toContain('FANOUT_PACKET_KEY_MISMATCH');
    expect(result.cacheEligible).toBe(false);
  });

  it('rejects unknown revisions', () => {
    const result = evaluateOntologyFanoutAuthorityV1(tuple(), authority({ sourceRevision: 'unknown' }));
    expect(result.blockers).toContain('FANOUT_SOURCE_REVISION_INVALID');
    expect(result.canonicalTupleEligible).toBe(false);
  });

  it('rejects empty tuple evidence', () => {
    const result = evaluateOntologyFanoutAuthorityV1(tuple({ evidenceRefs: [] }), authority());
    expect(result.blockers).toContain('FANOUT_EVIDENCE_REQUIRED');
    expect(result.taxonomyCandidateEligible).toBe(false);
  });

  it('rejects non-semantic_768 authority at schema boundary', () => {
    const invalid = { ...authority(), representationId: 'legacy_384' } as unknown as OntologyFanoutAuthorityV1;
    const result = evaluateOntologyFanoutAuthorityV1(tuple(), invalid);
    expect(result.blockers).toContain('FANOUT_AUTHORITY_MISSING');
    expect(result.canonicalTupleEligible).toBe(false);
  });

  it('allows canonical tuple admission while separately blocking graph fanout without graph revision', () => {
    const result = evaluateOntologyFanoutAuthorityV1(tuple(), authority({ graphRevision: null }));
    expect(result.canonicalTupleEligible).toBe(true);
    expect(result.graphFanoutEligible).toBe(false);
    expect(result.blockers).toContain('GRAPH_FANOUT_GRAPH_REVISION_REQUIRED');
  });
});
