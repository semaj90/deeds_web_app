import { describe, expect, it } from 'vitest';
import {
  buildCandidateExpansionReceiptV1,
  verifyCandidateExpansionReceiptV1,
  type CandidateExpansionReceiptBodyV1,
} from './candidate-expansion-receipt-v1.js';

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const firstKey = 'packet:123e4567-e89b-52d3-a456-426614174000';
const secondKey = 'packet:223e4567-e89b-52d3-a456-426614174001';
const commonStage = {
  required: true,
  status: 'PASS' as const,
  executorId: 'atlas.topk',
  executorRevision: 'atlas.topk.v1',
  indexKind: null,
  indexRevision: null,
  configurationChecksum: null,
  inputChecksum: digest('a'),
  outputChecksum: digest('b'),
  inputCount: 2,
  outputCount: 1,
  reasonCode: null,
  evidenceRefs: ['receipt:topk'],
};

function receiptInput(overrides: Partial<CandidateExpansionReceiptBodyV1> = {}) {
  return {
    requestId: '123e4567-e89b-72d3-a456-426614174000',
    requestChecksum: digest('1'),
    packetKey: firstKey,
    packetRevisionId: '223e4567-e89b-72d3-a456-426614174001',
    sourceRevision: digest('2'),
    workspaceRevision: digest('3'),
    representationRevision: 'semantic_768:rev-1',
    candidateSnapshotChecksum: digest('4'),
    ordinalMapChecksum: digest('5'),
    graphRevision: 'graph:rev-1',
    graphSnapshotChecksum: digest('6'),
    generatedAt: '2026-10-14T12:00:00.000Z',
    stages: [
      { ...commonStage, stageId: 'RPC_REQUEST' as const, inputCount: 1, outputCount: 1 },
      { ...commonStage, stageId: 'TOPK_PAGINATION' as const },
    ],
    decisions: [
      {
        packetKey: firstKey,
        candidateOrdinal: 0,
        sourceRevision: digest('7'),
        workspaceRevision: digest('3'),
        representationRevision: 'semantic_768:rev-1',
        logicalLane: 'semantic',
        rf4: 'RESOLVED' as const,
        rf5: 'KEPT' as const,
        duplicateOfPacketKey: null,
        evidenceRefs: ['evidence:first'],
        reasonCode: null,
      },
      {
        packetKey: secondKey,
        candidateOrdinal: 1,
        sourceRevision: digest('8'),
        workspaceRevision: digest('3'),
        representationRevision: 'semantic_768:rev-1',
        logicalLane: 'semantic',
        rf4: 'RESOLVED' as const,
        rf5: 'DEDUPLICATED' as const,
        duplicateOfPacketKey: firstKey,
        evidenceRefs: ['evidence:second'],
        reasonCode: 'SAME_LOGICAL_LANE_DUPLICATE',
      },
    ],
    orderedTopKPacketKeys: [firstKey],
    fallback: { used: false, failedExecutorId: null, selectedExecutorId: null, reasonCode: null },
    outcome: 'SUCCESS' as const,
    ...overrides,
  };
}

describe('CandidateExpansionReceiptV1', () => {
  it('builds and independently verifies a checksummed read-only receipt', () => {
    const receipt = buildCandidateExpansionReceiptV1(receiptInput());
    expect(verifyCandidateExpansionReceiptV1(receipt)).toEqual(receipt);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
  });

  it('preserves a failed cuVS stage when a separate fallback succeeds', () => {
    const receipt = buildCandidateExpansionReceiptV1(receiptInput({
      stages: [
        {
          ...commonStage,
          stageId: 'ANN_CUVS',
          required: false,
          status: 'FAIL',
          executorId: 'cuvs.exact',
          executorRevision: 'cuvs:26.06',
          indexKind: 'CUVS_BRUTE_FORCE',
          indexRevision: 'cuvs-index:rev-1',
          configurationChecksum: digest('e'),
          inputChecksum: digest('9'),
          outputChecksum: null,
          outputCount: 0,
          reasonCode: 'INDEX_DISTANCE_PAIR_MISMATCH',
          evidenceRefs: ['receipt:cuvs-failure'],
        },
        {
          ...commonStage,
          stageId: 'ANN_QDRANT',
          executorId: 'qdrant.hnsw',
          executorRevision: 'qdrant:index-rev-1',
          indexKind: 'HNSW',
          indexRevision: 'qdrant:index-rev-1',
          configurationChecksum: digest('f'),
        },
        { ...commonStage, stageId: 'TOPK_PAGINATION' },
      ],
      fallback: {
        used: true,
        failedExecutorId: 'cuvs.exact',
        selectedExecutorId: 'qdrant.hnsw',
        reasonCode: 'CUVS_FAILED_QDRANT_FALLBACK_SELECTED',
      },
      outcome: 'SUCCESS_WITH_FALLBACK',
    }));
    expect(receipt.stages.find((stage) => stage.stageId === 'ANN_CUVS')?.status).toBe('FAIL');
    expect(receipt.outcome).toBe('SUCCESS_WITH_FALLBACK');
    expect(verifyCandidateExpansionReceiptV1(receipt).fallback.used).toBe(true);
  });

  it('rejects a SUCCESS outcome that hides a required executor failure', () => {
    expect(() => buildCandidateExpansionReceiptV1(receiptInput({
      stages: [
        {
          ...commonStage,
          stageId: 'ANN_CUVS',
          status: 'FAIL',
          executorId: 'cuvs.exact',
          executorRevision: 'cuvs:26.06',
          indexKind: 'CUVS_BRUTE_FORCE',
          indexRevision: 'cuvs-index:rev-1',
          configurationChecksum: digest('e'),
          outputChecksum: null,
          reasonCode: 'INDEX_DISTANCE_PAIR_MISMATCH',
        },
      ],
    }))).toThrow();
  });

  it('rejects tampering and top-k keys that did not survive RF4/RF5', () => {
    const receipt = buildCandidateExpansionReceiptV1(receiptInput());
    expect(() => verifyCandidateExpansionReceiptV1({ ...receipt, requestChecksum: digest('f') })).toThrow('CANDIDATE_EXPANSION_RECEIPT_CHECKSUM_MISMATCH');
    expect(() => buildCandidateExpansionReceiptV1(receiptInput({ orderedTopKPacketKeys: [secondKey] }))).toThrow();
  });

  it('rejects ANN evidence without frozen index and configuration identity', () => {
    expect(() => buildCandidateExpansionReceiptV1(receiptInput({
      stages: [
        {
          ...commonStage,
          stageId: 'ANN_CAGRA',
          indexKind: null,
          indexRevision: null,
          configurationChecksum: null,
        },
      ],
    }))).toThrow('ANN_STAGE_REQUIRES_INDEX_AND_CONFIGURATION_IDENTITY');
  });
});
