import { describe, expect, it } from 'vitest';

import { materializeCandidateFeatureColumnar } from './candidate-feature-columnar-v1.js';
import { materializeCandidateFeatureSnapshot } from './candidate-feature-snapshot-v1.js';
import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import { assertCandidateFeatureGemmParity, scoreCandidateFeatureHeadsCpu } from './candidate-feature-gemm-v1.js';

function fixture() {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate:test:v1',
    workspaceRevision: 'workspace:test:v1',
    producerRevision: 'ordinal:test:v1',
    candidates: [
      { canonicalId: 'canon:a', packetKey: 'packet:a', treeNodeId: 'tree:a', symbolVersionId: 'symbol:a', workspaceRevision: 'workspace:test:v1', sourceRevision: 'source:a', graphRevision: 'graph:test:v1', semanticRevision: 'semantic:test:v1', degradedIdentity: false, evidenceRefs: ['ast:a'] },
      { canonicalId: 'canon:b', packetKey: 'packet:b', treeNodeId: 'tree:b', symbolVersionId: 'symbol:b', workspaceRevision: 'workspace:test:v1', sourceRevision: 'source:b', graphRevision: 'graph:test:v1', semanticRevision: 'semantic:test:v1', degradedIdentity: false, evidenceRefs: ['graph:b'] },
    ],
  });
  const rows = ordinalMap.candidates.map((candidate, ordinal) => ({
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: ordinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    graphRevision: candidate.graphRevision,
    semanticRevision: candidate.semanticRevision,
    featureRevision: 'feature:test:v1',
    semanticRelevance: ordinal === 0 ? 1 : 0.5,
    lexicalRelevance: ordinal === 0 ? 0.25 : 1,
    astAffinity: ordinal === 0 ? 0.75 : null,
    graphAuthority: ordinal === 0 ? 0.5 : 0.25,
    personalizedPageRank: null,
    communityAffinity: 0.25,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: 0.5,
    executionUtility: 0.25,
    memoryUtility: null,
    laneMask: ['semantic', 'graph'] as const,
    degradedIdentity: false,
    evidenceRefs: candidate.evidenceRefs,
  }));
  const snapshot = materializeCandidateFeatureSnapshot({ ordinalMap, rows, featureRevision: 'feature:test:v1', producerRevision: 'snapshot:test:v1' });
  return materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'columnar:test:v1' });
}

describe('candidate feature CPU GEMM reference', () => {
  it('scores dense feature rows with stable ordinals and a checksum receipt', () => {
    const receipt = scoreCandidateFeatureHeadsCpu({
      columnar: fixture(),
      head: {
        headId: 'head:graph-aware:v1',
        featureRevision: 'feature:test:v1',
        featureCount: 12,
        headCount: 2,
        weights: [new Array(12).fill(1), new Array(12).fill(0.5)],
        bias: [0, 1],
      },
      producerRevision: 'gemm:test:v1',
    });
    expect(receipt.candidateOrdinals).toEqual([0, 1]);
    expect(receipt.scores).toHaveLength(2);
    expect(receipt.canonicalWritesAttempted).toBe(false);
    expect(receipt.identityAuthority).toBe(false);
    expect(receipt.scoreChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts native-like output within tolerance and rejects drift', () => {
    const columnar = fixture();
    const receipt = scoreCandidateFeatureHeadsCpu({
      columnar,
      head: { headId: 'head:test:v1', featureRevision: 'feature:test:v1', featureCount: 12, headCount: 1, weights: [new Array(12).fill(0.25)], bias: [0.1] },
      producerRevision: 'gemm:test:v1',
    });
    assertCandidateFeatureGemmParity({ expected: receipt, actualScores: receipt.scores.map((row) => row.map((score) => score + 1e-7)) });
    expect(() => assertCandidateFeatureGemmParity({ expected: receipt, actualScores: receipt.scores.map((row) => row.map((score) => score + 0.1)) })).toThrow('GEMM_PARITY_MISMATCH');
  });

  it('fails closed when a head belongs to another feature revision', () => {
    expect(() => scoreCandidateFeatureHeadsCpu({
      columnar: fixture(),
      head: { headId: 'head:wrong:v1', featureRevision: 'feature:wrong:v1', featureCount: 12, headCount: 1, weights: [new Array(12).fill(1)], bias: [0] },
      producerRevision: 'gemm:test:v1',
    })).toThrow('GEMM_FEATURE_REVISION_MISMATCH');
  });
});
