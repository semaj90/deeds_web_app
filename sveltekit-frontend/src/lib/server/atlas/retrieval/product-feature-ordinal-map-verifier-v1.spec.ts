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

  it('rejects a stale candidate snapshot revision and a request checksum that differs from a valid map', () => {
    const value = input();
    expect(() => verifyProductFeatureOrdinalMapV1({ ...value, candidateSnapshotRevision: 'snapshot-stale' }))
      .toThrow('PRODUCT_FEATURE_ORDINAL_MAP_BINDING_MISMATCH');
    expect(() => verifyProductFeatureOrdinalMapV1({ ...value, ordinalMapChecksum: 'f'.repeat(64) }))
      .toThrow('PRODUCT_FEATURE_ORDINAL_MAP_BINDING_MISMATCH');
  });

  it('rejects swapped packetKey / sourceRef identity and unknown canonical ids', () => {
    const value = input();
    expect(() => verifyProductFeatureOrdinalMapV1({ ...value, candidates: [{ ...value.candidates[0], packetKey: 'packet-other' }] }))
      .toThrow('PRODUCT_FEATURE_CANDIDATE_NOT_BOUND_TO_ORDINAL_MAP');
    expect(() => verifyProductFeatureOrdinalMapV1({ ...value, candidates: [{ ...value.candidates[0], sourceRef: 'src/other.ts' }] }))
      .toThrow('PRODUCT_FEATURE_CANDIDATE_NOT_BOUND_TO_ORDINAL_MAP');
    expect(() => verifyProductFeatureOrdinalMapV1({ ...value, candidates: [{ ...value.candidates[0], canonicalCandidateId: 'candidate-unknown' }] }))
      .toThrow('PRODUCT_FEATURE_CANDIDATE_NOT_BOUND_TO_ORDINAL_MAP');
  });

  it('rejects missing and duplicate canonical candidate ids', () => {
    const value = input();
    expect(() => verifyProductFeatureOrdinalMapV1({ ...value, candidates: [{ ...value.candidates[0], canonicalCandidateId: '' }] }))
      .toThrow('PRODUCT_FEATURE_CANDIDATE_ID_MISSING_OR_DUPLICATE');
    expect(() => verifyProductFeatureOrdinalMapV1({ ...value, candidates: [value.candidates[0], value.candidates[0]] }))
      .toThrow('PRODUCT_FEATURE_CANDIDATE_ID_MISSING_OR_DUPLICATE');
  });

  it('verifies the joined ordinal when supplied: right ordinal matches, wrong ordinal is rejected', () => {
    const value = input();
    expect(verifyProductFeatureOrdinalMapV1({ ...value, candidates: [{ ...value.candidates[0], candidateOrdinal: 0 }] }).status).toBe('MATCH');
    expect(() => verifyProductFeatureOrdinalMapV1({ ...value, candidates: [{ ...value.candidates[0], candidateOrdinal: 1 }] }))
      .toThrow('PRODUCT_FEATURE_CANDIDATE_ORDINAL_MISMATCH');
    // omitting the ordinal keeps the previous binding-by-canonicalId behavior (backward compatible)
    expect(verifyProductFeatureOrdinalMapV1(value).status).toBe('MATCH');
  });

  it('a candidate bound to the wrong row of a multi-row map is caught by ordinal even when ids are valid', () => {
    const map = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: 'snapshot-r1', workspaceRevision: 'workspace-r1', producerRevision: 'producer-r1',
      candidates: ['a', 'b'].map((id) => ({
        canonicalId: `candidate-${id}`, packetKey: `packet-${id}`, sourceRef: `src/${id}.ts`, treeNodeId: null, symbolVersionId: null,
        workspaceRevision: 'workspace-r1', sourceRevision: `source-${id}`, graphRevision: null, semanticRevision: null,
        degradedIdentity: false, evidenceRefs: [], representationBindings: [],
      })),
    });
    const base = { requestId: 'r', workspaceRevision: map.workspaceRevision, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, ordinalMap: map };
    const b = { canonicalCandidateId: 'candidate-b', packetKey: 'packet-b', sourceRef: 'src/b.ts', sourceRevision: 'source-b' };
    expect(verifyProductFeatureOrdinalMapV1({ ...base, candidates: [{ ...b, candidateOrdinal: 1 }] }).verifiedCandidateCount).toBe(1);
    expect(() => verifyProductFeatureOrdinalMapV1({ ...base, candidates: [{ ...b, candidateOrdinal: 0 }] })).toThrow('PRODUCT_FEATURE_CANDIDATE_ORDINAL_MISMATCH');
  });
});
