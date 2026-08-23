import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import {
  adaptQdrantSemanticScoresToCandidateOrdinals,
  FANOUT_ADMISSION_PROOF_STATUS,
} from './qdrant-candidate-ordinal-adapter-v1.js';
import type { QdrantSemanticScoreReceiptV1 } from './qdrant-semantic-scorer.js';

function ordinalMapFixture() {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate-snapshot:qdrant:v1',
    workspaceRevision: 'workspace-world:qdrant:v1',
    producerRevision: 'ordinal-map:qdrant:test:v1',
    candidates: [
      {
        canonicalId: 'canonical:a',
        packetKey: 'packet:a',
        treeNodeId: 'tree:a',
        symbolVersionId: 'symbol:a',
        workspaceRevision: 'workspace-world:qdrant:v1',
        sourceRevision: 'sha256:source-a',
        graphRevision: 'graph:qdrant:v1',
        semanticRevision: 'semantic_768:r7',
        degradedIdentity: false,
        evidenceRefs: ['evidence:a'],
      },
      {
        canonicalId: 'canonical:b',
        packetKey: 'packet:b',
        treeNodeId: 'tree:b',
        symbolVersionId: 'symbol:b',
        workspaceRevision: 'workspace-world:qdrant:v1',
        sourceRevision: 'sha256:source-b',
        graphRevision: 'graph:qdrant:v1',
        semanticRevision: 'semantic_768:r7',
        degradedIdentity: false,
        evidenceRefs: ['evidence:b'],
      },
    ],
  });
}

function receiptFixture(): QdrantSemanticScoreReceiptV1 {
  return {
    schema: 'atlas.qdrant-semantic-score-receipt.v2',
    collection: 'codebase_chunks_768_v2',
    vectorName: null,
    representationId: 'semantic_768',
    representationRevision: 'projection:test:r12',
    dimension: 768,
    requestedPacketKeys: 2,
    returnedPacketKeys: 2,
    embeddingModel: 'embeddinggemma:test',
    embeddingCached: true,
    embeddingExecMs: 1,
    queryVector: Array.from({ length: 768 }, () => 0),
    scores: [
      {
        packetKey: 'packet:b',
        score: 0.94,
        pointId: 'qdrant:b',
        sourceRef: 'src/b.ts',
        sourceRevision: 'legacy-source-revision-b',
        sourceVersionReceiptId: null,
        reconciliationReceiptId: null,
        workspaceRevision: 999,
        representationRevision: 12,
        sourceRepresentationId: 'embeddinggemma-native-768',
        sourceDimension: 768,
        symbolVersionId: 'symbol:b',
        treeNodeId: 'tree:b',
        featureLabel: null,
        projectionRevision: 'projection:test:r12',
        vector: Array.from({ length: 768 }, () => 0.25),
      },
      {
        packetKey: 'packet:a',
        score: 0.81,
        pointId: 42,
        sourceRef: 'src/a.ts',
        sourceRevision: 'legacy-source-revision-a',
        sourceVersionReceiptId: null,
        reconciliationReceiptId: null,
        workspaceRevision: 999,
        representationRevision: 12,
        sourceRepresentationId: 'embeddinggemma-native-768',
        sourceDimension: 768,
        symbolVersionId: 'symbol:a',
        treeNodeId: 'tree:a',
        featureLabel: null,
        projectionRevision: 'projection:test:r12',
        vector: Array.from({ length: 768 }, () => 0.5),
      },
    ],
  };
}

describe('Qdrant CandidateOrdinal adapter', () => {
  it('converts an admitted Qdrant score receipt to ordinal-only hits', () => {
    const result = adaptQdrantSemanticScoresToCandidateOrdinals({
      admissionProofStatus: FANOUT_ADMISSION_PROOF_STATUS,
      ordinalMap: ordinalMapFixture(),
      qdrantReceipt: receiptFixture(),
      producerRevision: 'qdrant-ordinal-adapter:test:v1',
    });

    expect(result.hits.map(({ candidateOrdinal, score, rank }) => ({ candidateOrdinal, score, rank }))).toEqual([
      { candidateOrdinal: 1, score: 0.94, rank: 1 },
      { candidateOrdinal: 0, score: 0.81, rank: 2 },
    ]);
    expect(JSON.stringify(result.hits)).not.toContain('qdrant:b');
    expect(JSON.stringify(result.hits)).not.toContain('legacy-source-revision');
    expect(JSON.stringify(result.hits)).not.toContain('vector');
    expect(result.adapterReceipt).toMatchObject({
      admissionProofStatus: 'FANOUT_ADMISSION_READONLY_PROVEN',
      inputScoreCount: 2,
      normalizedHitCount: 2,
      rejectedHitCount: 0,
      qdrantPointIdsEscapedAboveBoundary: false,
      vectorsEscapedAboveBoundary: false,
      qdrantPayloadClaimedAsRevisionAuthority: false,
      canonicalWritesAttempted: false,
    });
  });

  it('rejects Qdrant scores whose identity conflicts with the frozen ordinal map', () => {
    const receipt = receiptFixture();
    receipt.scores[0] = { ...receipt.scores[0]!, packetKey: 'packet:missing', symbolVersionId: 'symbol:missing' };
    const result = adaptQdrantSemanticScoresToCandidateOrdinals({
      admissionProofStatus: FANOUT_ADMISSION_PROOF_STATUS,
      ordinalMap: ordinalMapFixture(),
      qdrantReceipt: receipt,
      producerRevision: 'qdrant-ordinal-adapter:test:v1',
    });

    expect(result.hits).toHaveLength(1);
    expect(result.adapterReceipt).toMatchObject({ normalizedHitCount: 1, rejectedHitCount: 1 });
  });

  it('fails when the Qdrant receipt count is internally inconsistent', () => {
    const receipt = receiptFixture();
    receipt.returnedPacketKeys = 99;
    expect(() => adaptQdrantSemanticScoresToCandidateOrdinals({
      admissionProofStatus: FANOUT_ADMISSION_PROOF_STATUS,
      ordinalMap: ordinalMapFixture(),
      qdrantReceipt: receipt,
      producerRevision: 'qdrant-ordinal-adapter:test:v1',
    })).toThrow('QDRANT_SCORE_RECEIPT_COUNT_MISMATCH');
  });
});
