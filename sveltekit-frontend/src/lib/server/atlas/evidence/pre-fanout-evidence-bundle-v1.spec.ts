import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeObservationCoordinateV2 } from './observation-coordinate-v2.js';
import { materializeOntologyObservationTupleV1 } from './ontology-observation-tuple-v1.js';
import { materializePreFanoutEvidenceBundleV1 } from './pre-fanout-evidence-bundle-v1.js';

function fixtureMap() {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'snapshot-r1',
    workspaceRevision: 'workspace-r1',
    producerRevision: 'fixture-producer-r1',
    candidates: [{
      canonicalId: 'canonical-A',
      packetKey: 'packet-A',
      treeNodeId: 'tree-A',
      symbolVersionId: 'symbol-A',
      workspaceRevision: 'workspace-r1',
      sourceRevision: 'source-r1',
      graphRevision: 'graph-r1',
      semanticRevision: 'semantic-r1',
      degradedIdentity: false,
      evidenceRefs: ['source-evidence-A'],
      identityAuthority: undefined as never,
      producerRevision: undefined as never,
    } as never],
  });
}

function fixtureTuple() {
  return materializeOntologyObservationTupleV1({
    subjectCanonicalId: 'canonical-A',
    predicate: 'IMPLEMENTS_CAPABILITY',
    objectCanonicalIdOrClass: 'ontology:database-write',
    confidence: 0.95,
    evidenceRefs: ['ast-grep:route-write'],
    sourceRef: 'src/routes/a.ts',
    workspaceRevision: 'workspace-r1',
    sourceRevision: 'source-r1',
    classifierRevision: 'classifier-r1',
    ontologyRevision: 'ontology-r1',
    producerRevision: 'tuple-producer-r1',
    evaluationStatus: 'CHALLENGER_UNPROVEN',
  });
}

describe('pre-fanout evidence alignment', () => {
  it('makes generic observation identity revision-sensitive', () => {
    const base = {
      provider: 'AST_GREP' as const,
      observationUnit: 'PATTERN_MATCH' as const,
      sourceRef: 'src/routes/a.ts',
      workspaceRevision: 'workspace-r1',
      sourceRevision: 'source-r1',
      providerRevision: 'ast-grep-0.44.0',
      producerRevision: 'producer-r1',
      startByte: 10,
      endByte: 40,
    };
    const a = materializeObservationCoordinateV2(base);
    const b = materializeObservationCoordinateV2({ ...base, sourceRevision: 'source-r2' });
    expect(a.canonicalAuthority).toBe(false);
    expect(a.evidenceKey).not.toBe(b.evidenceKey);
  });

  it('allows fanout with an unproven domain classifier only at zero weight', () => {
    const map = fixtureMap();
    const receipt = materializePreFanoutEvidenceBundleV1({
      ordinalMap: map,
      candidateOrdinal: 0,
      structuralEvidenceRefs: ['sev2:node-A'],
      chunkEvidenceRefs: ['sev2:chunk-A'],
      astGrepEvidenceRefs: ['obs2:pattern-A'],
      ontologyTuples: [fixtureTuple()],
      ontologyRevision: 'ontology-r1',
      domain: {
        classId: 'domain:retrieval',
        classifierRevision: 'domain-classifier-r1',
        evaluationStatus: 'CHALLENGER_UNPROVEN',
        weight: 0,
        evidenceRefs: ['domain-evidence-A'],
      },
      semantic: {
        representationId: 'semantic_768',
        representationRevision: 'semantic-r1',
        representationChecksum: 'a'.repeat(64),
      },
      gates: {
        sourceBytesProven: true,
        structuralIdentityProven: true,
        ontologyLineageProven: true,
        semanticRevisionBound: true,
      },
    });

    expect(receipt.fanoutEligible).toBe(true);
    expect(receipt.gates.domainClassifierFrozen).toBe(false);
    expect(receipt.domain?.weight).toBe(0);
    expect(receipt.retrievalVoteProduced).toBe(false);
    expect(receipt.canonicalWritesAllowed).toBe(false);
  });

  it('rejects nonzero domain influence before frozen evaluation', () => {
    const map = fixtureMap();
    expect(() => materializePreFanoutEvidenceBundleV1({
      ordinalMap: map,
      candidateOrdinal: 0,
      structuralEvidenceRefs: ['sev2:node-A'],
      ontologyTuples: [fixtureTuple()],
      ontologyRevision: 'ontology-r1',
      domain: {
        classId: 'domain:retrieval',
        classifierRevision: 'domain-classifier-r1',
        evaluationStatus: 'CHALLENGER_UNPROVEN',
        weight: 0.25,
        evidenceRefs: ['domain-evidence-A'],
      },
      semantic: {
        representationId: 'semantic_768',
        representationRevision: 'semantic-r1',
        representationChecksum: 'b'.repeat(64),
      },
      gates: {
        sourceBytesProven: true,
        structuralIdentityProven: true,
        ontologyLineageProven: true,
        semanticRevisionBound: true,
      },
    })).toThrow(/DOMAIN_CLASSIFIER_UNPROVEN_REQUIRES_ZERO_WEIGHT/);
  });

  it('blocks fanout eligibility when structural identity is not proven', () => {
    const map = fixtureMap();
    const receipt = materializePreFanoutEvidenceBundleV1({
      ordinalMap: map,
      candidateOrdinal: 0,
      structuralEvidenceRefs: ['sev2:node-A'],
      ontologyTuples: [fixtureTuple()],
      ontologyRevision: 'ontology-r1',
      semantic: {
        representationId: 'semantic_768',
        representationRevision: 'semantic-r1',
        representationChecksum: 'c'.repeat(64),
      },
      gates: {
        sourceBytesProven: true,
        structuralIdentityProven: false,
        ontologyLineageProven: true,
        semanticRevisionBound: true,
      },
    });
    expect(receipt.fanoutEligible).toBe(false);
  });
});
