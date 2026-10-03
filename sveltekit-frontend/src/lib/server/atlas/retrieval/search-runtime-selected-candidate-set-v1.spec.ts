import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../features/candidate-feature-snapshot-v1.js';
import {
  buildSearchRuntimeSelectedCandidateSetV1,
  buildSearchRuntimeSelectedFeatureRowsV1,
  verifySearchRuntimeSelectedCandidateSetV1,
  verifySearchRuntimeSelectedFeatureRowsV1,
} from './search-runtime-selected-candidate-set-v1.js';

const WORKSPACE = `sha256:${'e'.repeat(64)}`;
const SOURCE_A = `sha256:${'a'.repeat(64)}`;
const SOURCE_B = `sha256:${'b'.repeat(64)}`;
const QUERY = '1'.repeat(64);

const ordinalMap = materializeCandidateOrdinalMap({
  candidates: [
    { canonicalId: 'packet:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', treeNodeId: null, symbolVersionId: null, graphRevision: null, semanticRevision: null, workspaceRevision: WORKSPACE, sourceRevision: SOURCE_A },
    { canonicalId: 'packet:b', packetKey: 'packet:b', sourceRef: 'src/b.ts', treeNodeId: null, symbolVersionId: null, graphRevision: null, semanticRevision: null, workspaceRevision: WORKSPACE, sourceRevision: SOURCE_B },
  ],
  candidateSnapshotRevision: 'snapshot:r1',
  workspaceRevision: WORKSPACE,
  producerRevision: 'ordinal-owner:r1',
});

const selectedB = {
  candidateOrdinal: 1,
  canonicalId: 'packet:b',
  packetKey: 'packet:b',
  sourceRef: 'src/b.ts',
  sourceRevision: SOURCE_B,
  workspaceRevision: WORKSPACE,
  score: 0.91,
  evidenceRefs: ['ast:ref-b', 'semantic:ref-b'],
};

const featureSnapshot = materializeCandidateFeatureSnapshot({
  ordinalMap,
  featureRevision: 'features:r1',
  producerRevision: 'feature-owner:r1',
  rows: ordinalMap.candidates.map((candidate) => ({
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    graphRevision: candidate.graphRevision,
    semanticRevision: candidate.semanticRevision,
    featureRevision: 'features:r1',
    laneMask: ['semantic'] as ('semantic')[],
    evidenceRefs: [`feature:${candidate.candidateOrdinal}`],
  })),
});

describe('SearchRuntimeSelectedCandidateSetV1', () => {
  it('binds a request-scoped hit to its original parent ordinal and map checksum', () => {
    const receipt = buildSearchRuntimeSelectedCandidateSetV1({
      ordinalMap,
      requestId: 'request:r1',
      queryDigest: QUERY,
      retrievalPolicyRevision: 'search-policy:r1',
      selectedCandidates: [selectedB],
    });

    expect(receipt.selectedCandidates[0].candidateOrdinal).toBe(1);
    expect(receipt.parentOrdinalMapChecksum).toBe(ordinalMap.ordinalMapChecksum);
    expect(receipt.selectedCount).toBe(1);
    expect(receipt.identityAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
    expect(() => verifySearchRuntimeSelectedCandidateSetV1(receipt, ordinalMap)).not.toThrow();
    const changedParentMap = materializeCandidateOrdinalMap({
      candidates: [
        { canonicalId: 'packet:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', treeNodeId: null, symbolVersionId: null, graphRevision: null, semanticRevision: null, workspaceRevision: WORKSPACE, sourceRevision: SOURCE_A },
        { canonicalId: 'packet:b', packetKey: 'packet:b', sourceRef: 'src/b.ts', treeNodeId: null, symbolVersionId: null, graphRevision: null, semanticRevision: null, workspaceRevision: WORKSPACE, sourceRevision: `sha256:${'c'.repeat(64)}` },
      ],
      candidateSnapshotRevision: 'snapshot:r1',
      workspaceRevision: WORKSPACE,
      producerRevision: 'ordinal-owner:r1',
    });
    expect(() => verifySearchRuntimeSelectedCandidateSetV1(receipt, changedParentMap))
      .toThrow('SELECTED_CANDIDATE_PARENT_MAP_BINDING_MISMATCH');
  });

  it('canonicalizes selection ordering and evidence refs for deterministic checksums', () => {
    const first = buildSearchRuntimeSelectedCandidateSetV1({
      ordinalMap,
      requestId: 'request:r1',
      queryDigest: QUERY,
      retrievalPolicyRevision: 'search-policy:r1',
      selectedCandidates: [{ ...selectedB, evidenceRefs: ['semantic:ref-b', 'ast:ref-b', 'ast:ref-b'] }],
    });
    const second = buildSearchRuntimeSelectedCandidateSetV1({
      ordinalMap,
      requestId: 'request:r1',
      queryDigest: QUERY,
      retrievalPolicyRevision: 'search-policy:r1',
      selectedCandidates: [{ ...selectedB, evidenceRefs: ['ast:ref-b', 'semantic:ref-b'] }],
    });
    expect(first.selectionChecksum).toBe(second.selectionChecksum);
  });

  it('rejects guessed or remapped ordinals and mismatched exact source identity', () => {
    expect(() => buildSearchRuntimeSelectedCandidateSetV1({
      ordinalMap, requestId: 'request:r1', queryDigest: QUERY,
      retrievalPolicyRevision: 'search-policy:r1',
      selectedCandidates: [{ ...selectedB, candidateOrdinal: 0 }],
    })).toThrow('SELECTED_CANDIDATE_PARENT_IDENTITY_MISMATCH:0');

    expect(() => buildSearchRuntimeSelectedCandidateSetV1({
      ordinalMap, requestId: 'request:r1', queryDigest: QUERY,
      retrievalPolicyRevision: 'search-policy:r1',
      selectedCandidates: [{ ...selectedB, sourceRevision: SOURCE_A }],
    })).toThrow('SELECTED_CANDIDATE_PARENT_IDENTITY_MISMATCH:1');
  });

  it('rejects duplicate candidates, empty selections, and tampered receipts', () => {
    const input = {
      ordinalMap, requestId: 'request:r1', queryDigest: QUERY,
      retrievalPolicyRevision: 'search-policy:r1', selectedCandidates: [selectedB],
    };
    expect(() => buildSearchRuntimeSelectedCandidateSetV1({
      ...input, selectedCandidates: [selectedB, selectedB],
    })).toThrow('SELECTED_CANDIDATE_SET_DUPLICATE_IDENTITY');
    expect(() => buildSearchRuntimeSelectedCandidateSetV1({
      ...input, selectedCandidates: [],
    })).toThrow('SELECTED_CANDIDATE_SET_EMPTY');

    const receipt = buildSearchRuntimeSelectedCandidateSetV1(input);
    expect(() => verifySearchRuntimeSelectedCandidateSetV1({
      ...receipt, retrievalPolicyRevision: 'search-policy:tampered',
    }, ordinalMap)).toThrow('SELECTED_CANDIDATE_SELECTION_CHECKSUM_MISMATCH');
  });

  it('joins sparse request hits to the full feature snapshot without changing parent ordinals', () => {
    const selection = buildSearchRuntimeSelectedCandidateSetV1({
      ordinalMap,
      requestId: 'request:r1',
      queryDigest: QUERY,
      retrievalPolicyRevision: 'search-policy:r1',
      selectedCandidates: [selectedB],
    });
    const selected = buildSearchRuntimeSelectedFeatureRowsV1({
      selection,
      ordinalMap,
      featureSnapshot,
    });

    expect(featureSnapshot.rowCount).toBe(ordinalMap.rowCount);
    expect(selected.selectedOrdinals).toEqual([1]);
    expect(selected.rows).toHaveLength(1);
    expect(selected.rows[0].candidateOrdinal).toBe(1);
    expect(selected.parentOrdinalMapChecksum).toBe(ordinalMap.ordinalMapChecksum);
    expect(selected.selectionChecksum).toBe(selection.selectionChecksum);
    expect(selected.canonicalAuthority).toBe(false);
    expect(selected.writesPerformed).toBe(false);
    expect(() => verifySearchRuntimeSelectedFeatureRowsV1({
      receipt: selected, selection, ordinalMap, featureSnapshot,
    })).not.toThrow();
    expect(() => verifySearchRuntimeSelectedFeatureRowsV1({
      receipt: { ...selected, selectedRowsChecksum: '0'.repeat(64) },
      selection, ordinalMap, featureSnapshot,
    })).toThrow('SELECTED_FEATURE_ROWS_RECEIPT_BINDING_MISMATCH');
  });

  it('rejects feature snapshots from another parent map or with a changed row/checksum', () => {
    const selection = buildSearchRuntimeSelectedCandidateSetV1({
      ordinalMap,
      requestId: 'request:r1',
      queryDigest: QUERY,
      retrievalPolicyRevision: 'search-policy:r1',
      selectedCandidates: [selectedB],
    });
    const changedSnapshot = { ...featureSnapshot, snapshotChecksum: '0'.repeat(64) };
    expect(() => buildSearchRuntimeSelectedFeatureRowsV1({
      selection, ordinalMap, featureSnapshot: changedSnapshot,
    })).toThrow('SELECTED_FEATURE_SNAPSHOT_CHECKSUM_MISMATCH');

    const changedMap = materializeCandidateOrdinalMap({
      candidates: [
        { canonicalId: 'packet:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', treeNodeId: null, symbolVersionId: null, graphRevision: null, semanticRevision: null, workspaceRevision: WORKSPACE, sourceRevision: SOURCE_A },
        { canonicalId: 'packet:b', packetKey: 'packet:b', sourceRef: 'src/b.ts', treeNodeId: null, symbolVersionId: null, graphRevision: null, semanticRevision: null, workspaceRevision: WORKSPACE, sourceRevision: `sha256:${'c'.repeat(64)}` },
      ],
      candidateSnapshotRevision: 'snapshot:r1',
      workspaceRevision: WORKSPACE,
      producerRevision: 'ordinal-owner:r1',
    });
    expect(() => buildSearchRuntimeSelectedFeatureRowsV1({
      selection, ordinalMap: changedMap, featureSnapshot,
    })).toThrow('SELECTED_CANDIDATE_PARENT_MAP_BINDING_MISMATCH');
  });
});
