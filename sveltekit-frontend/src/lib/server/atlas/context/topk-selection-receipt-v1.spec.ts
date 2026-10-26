import { describe, expect, it } from 'vitest';
import type { CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import {
  buildTopkSelectionReceiptV1,
  verifyTopkSelectionReceiptV1,
} from './topk-selection-receipt-v1.js';

describe('Top-K Selection Receipt Contract (SEL-RECEIPT-01, SEL-RECEIPT-02)', () => {
  const row0 = {
    schema: 'atlas.candidate-feature-row.v1',
    candidateOrdinal: 0,
    canonicalId: 'pkt_00000000000000000000000000000001',
    packetKey: 'p0',
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: 'ws_01',
    sourceRevision: 'sha256:' + 'a'.repeat(64),
    graphRevision: null,
    semanticRevision: 'semantic_768_v1',
    featureRevision: 'feat_01',
    representationBindings: [],
    semanticRelevance: 0.95,
    lexicalRelevance: 0.85,
    astAffinity: 0.7,
    graphAuthority: 0.8,
    personalizedPageRank: 0.6,
    communityAffinity: null,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: null,
    executionUtility: 0.9,
    memoryUtility: 0.8,
    laneMask: ['semantic'],
    degradedIdentity: false,
    evidenceRefs: ['evidence:0'],
  };

  const row1 = {
    ...row0,
    candidateOrdinal: 1,
    canonicalId: 'pkt_00000000000000000000000000000002',
    packetKey: 'p1',
    sourceRevision: 'sha256:' + 'b'.repeat(64),
    evidenceRefs: ['evidence:1'],
  };

  const snapshot: CandidateFeatureSnapshotV1 = {
    schema: 'atlas.candidate-feature-snapshot.v1',
    candidateSnapshotRevision: 'snap_01',
    ordinalMapChecksum: 'c'.repeat(64),
    workspaceRevision: 'ws_01',
    featureRevision: 'feat_01',
    rowCount: 2,
    rows: [row0, row1],
    snapshotChecksum: 'd'.repeat(64),
    identityAuthority: false,
    canonicalOwnerChanged: false,
    producerRevision: 'prod_01',
  } as unknown as CandidateFeatureSnapshotV1;

  const validBaseInput = {
    queryChecksum: 'e'.repeat(64),
    runChecksum: 'f'.repeat(64),
    snapshot,
    selectedOrdinals: [0, 1],
    topkAlgorithm: 'constrained_beam' as const,
    topkParameters: { beamWidth: 32, maxSelections: 2 },
    k: 10,
    evidenceRefs: ['evidence:0', 'evidence:1'],
    ontologyTupleRefs: ['fact:legal_claim:01'],
    openspecTaskRefs: ['SEL-RECEIPT-01', 'SEL-RECEIPT-02'],
    contextManifestChecksum: '1'.repeat(64),
  };

  it('builds a valid selection receipt binding snapshot, parameters, and manifest checksum', () => {
    const receipt = buildTopkSelectionReceiptV1(validBaseInput);

    expect(receipt.schema).toBe('atlas.topk-selection-receipt.v1');
    expect(receipt.orderedCandidateOrdinals).toEqual([0, 1]);
    expect(receipt.orderedCanonicalIds).toEqual([row0.canonicalId, row1.canonicalId]);
    expect(receipt.singleVoteInvariantEnforced).toBe(true);
    expect(receipt.advisoryFeaturesCannotCreateIdentity).toBe(true);
    expect(receipt.receiptChecksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify self-integrity
    expect(verifyTopkSelectionReceiptV1(receipt, {
      snapshot,
      contextManifestChecksum: '1'.repeat(64),
    })).toBe(true);
  });

  it('fails closed on duplicate candidate ordinals', () => {
    expect(() =>
      buildTopkSelectionReceiptV1({
        ...validBaseInput,
        selectedOrdinals: [0, 0],
      })
    ).toThrow('TOPK_SELECTION_DUPLICATE_CANDIDATES');
  });

  it('fails closed on candidate ordinal not in snapshot', () => {
    expect(() =>
      buildTopkSelectionReceiptV1({
        ...validBaseInput,
        selectedOrdinals: [0, 99],
      })
    ).toThrow('TOPK_CANDIDATE_UNRESOLVED_IN_SNAPSHOT');
  });

  it('fails closed when selected ordinals exceed k', () => {
    expect(() =>
      buildTopkSelectionReceiptV1({
        ...validBaseInput,
        k: 1,
        selectedOrdinals: [0, 1],
      })
    ).toThrow('TOPK_SELECTION_EXCEEDS_K');
  });

  it('fails closed when missing OpenSpec task receipts', () => {
    expect(() =>
      buildTopkSelectionReceiptV1({
        ...validBaseInput,
        openspecTaskRefs: [],
      })
    ).toThrow('TOPK_SELECTION_MISSING_OPENSPEC_TASK_REFS');
  });

  it('fails closed on invalid source revision format', () => {
    const invalidRow = {
      ...row0,
      candidateOrdinal: 0,
      sourceRevision: 'unqualified_rev',
    };
    const badSnapshot = {
      ...snapshot,
      rows: [invalidRow],
    } as unknown as CandidateFeatureSnapshotV1;

    expect(() =>
      buildTopkSelectionReceiptV1({
        ...validBaseInput,
        snapshot: badSnapshot,
        selectedOrdinals: [0],
      })
    ).toThrow('TOPK_INVALID_SOURCE_REVISION');
  });

  it('detects receipt checksum tampering', () => {
    const receipt = buildTopkSelectionReceiptV1(validBaseInput);
    const tampered = { ...receipt, receiptChecksum: '9'.repeat(64) };

    expect(() =>
      verifyTopkSelectionReceiptV1(tampered, {
        snapshot,
        contextManifestChecksum: '1'.repeat(64),
      })
    ).toThrow('RECEIPT_SELF_CHECKSUM_TAMPERED');
  });

  it('detects mismatched snapshot checksum during verification', () => {
    const receipt = buildTopkSelectionReceiptV1(validBaseInput);
    const alteredSnapshot = { ...snapshot, snapshotChecksum: '0'.repeat(64) } as unknown as CandidateFeatureSnapshotV1;

    expect(() =>
      verifyTopkSelectionReceiptV1(receipt, {
        snapshot: alteredSnapshot,
        contextManifestChecksum: '1'.repeat(64),
      })
    ).toThrow('RECEIPT_SNAPSHOT_CHECKSUM_MISMATCH');
  });
});
