// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { verifyProductFeatureOrdinalMapV1 } from './product-feature-ordinal-map-verifier-v1.js';

function makeMap() {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'snapshot-r1',
    workspaceRevision: 'workspace-r1',
    producerRevision: 'producer-r1',
    candidates: [{
      canonicalId: 'candidate-1',
      packetKey: 'packet-1',
      sourceRef: 'src/search.ts',
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: 'workspace-r1',
      sourceRevision: 'source-r1',
      graphRevision: null,
      semanticRevision: null,
      degradedIdentity: false,
      evidenceRefs: [],
      representationBindings: [],
    }],
  });
}

function input(map = makeMap()) {
  return {
    requestId: 'request-1',
    workspaceRevision: map.workspaceRevision,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    ordinalMap: map,
    candidates: [{
      canonicalCandidateId: 'candidate-1',
      packetKey: 'packet-1',
      sourceRef: 'src/search.ts',
      sourceRevision: 'source-r1',
    }],
  };
}

describe('verifyProductFeatureOrdinalMapV1', () => {
  it('uses the canonical schema and integrity verifier and returns bound receipt', () => {
    const map = makeMap();
    expect(verifyProductFeatureOrdinalMapV1(input(map))).toEqual({
      status: 'MATCH',
      requestId: 'request-1',
      workspaceRevision: map.workspaceRevision,
      candidateSnapshotRevision: map.candidateSnapshotRevision,
      ordinalMapChecksum: map.ordinalMapChecksum,
      producerRevision: map.producerRevision,
      verifiedCandidateCount: 1,
    });
  });

  it('rejects a request with mismatched workspace, snapshot, or checksum', () => {
    const value = input();
    expect(() => verifyProductFeatureOrdinalMapV1({ ...value, workspaceRevision: 'stale' }))
      .toThrow('PRODUCT_FEATURE_ORDINAL_MAP_BINDING_MISMATCH');
  });

  it('rejects candidate identity that differs from canonical map row', () => {
    const value = input();
    expect(() => verifyProductFeatureOrdinalMapV1({
      ...value,
      candidates: [{ ...value.candidates[0], sourceRevision: 'stale-source' }],
    })).toThrow('PRODUCT_FEATURE_CANDIDATE_NOT_BOUND_TO_ORDINAL_MAP');
  });

  it('rejects corrupted map checksums through canonical integrity validation', () => {
    const map = makeMap();
    expect(() => verifyProductFeatureOrdinalMapV1(input({ ...map, ordinalMapChecksum: '0'.repeat(64) })))
      .toThrow(/CANDIDATE_ORDINAL_MAP_CHECKSUM_MISMATCH/);
  });
});
