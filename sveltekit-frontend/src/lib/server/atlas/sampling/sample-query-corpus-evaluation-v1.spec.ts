import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../features/candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar } from '../features/candidate-feature-columnar-v1.js';
import { buildCandidateOrdinalSetV1 } from '../kernel/candidate-ordinal-set-v1.js';
import {
  adaptCandidateFeatureColumnarToSampleQueryMatrixV1,
  adaptExactCandidateOrdinalSetToSamplingTargetSetV1,
  adaptSemanticRowsToRowL2SampleQueryMatrixV1,
} from './sample-query-artifact-adapters-v1.js';
import { compareSamplingMatricesV1, evaluateSamplingCorpusV1 } from './sample-query-corpus-evaluation-v1.js';

const SOURCE_CHECKSUM = 'a'.repeat(64);

function makeFixture() {
  const workspaceRevision = 'workspace:sampling-corpus:v1';
  const candidateSnapshotRevision = 'candidate:sampling-corpus:v1';
  const featureRevision = 'features:sampling-corpus:v1';
  const producerRevision = 'sampling-corpus-fixture:v1';
  const ordinalMap = materializeCandidateOrdinalMap({
    workspaceRevision, candidateSnapshotRevision, producerRevision,
    candidates: ['d', 'b', 'a', 'c'].map((name) => ({
      canonicalId: `canonical:${name}`, packetKey: `packet:${name}`, treeNodeId: `tree:${name}`,
      symbolVersionId: `symbol:${name}`, workspaceRevision, sourceRevision: `source:${name}:v1`,
      graphRevision: 'graph:sampling:v1', semanticRevision: 'semantic:768:v1', degradedIdentity: false,
      evidenceRefs: [`fixture:${name}`],
    })),
  });
  const featureValues = [
    [0.95, 0.80, 0.70, 0.60], [0.60, null, 0.25, 0.15], [0.35, 0.20, null, null], [0.10, null, null, null],
  ] as const;
  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap, featureRevision, producerRevision,
    rows: ordinalMap.candidates.map((candidate, index) => ({
      schema: 'atlas.candidate-feature-row.v1' as const,
      candidateOrdinal: candidate.candidateOrdinal, canonicalId: candidate.canonicalId, packetKey: candidate.packetKey,
      treeNodeId: candidate.treeNodeId, symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision, sourceRevision: candidate.sourceRevision,
      graphRevision: candidate.graphRevision, semanticRevision: candidate.semanticRevision, featureRevision,
      semanticRelevance: featureValues[index]![0], lexicalRelevance: featureValues[index]![1],
      astAffinity: featureValues[index]![2], graphAuthority: featureValues[index]![3],
      personalizedPageRank: null, communityAffinity: null, manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null, crossEncoderCalibratedScore: null, crossEncoderAvailable: false,
      domainAffinity: index === 0 ? 0.9 : null, executionUtility: index === 0 ? 0.75 : null,
      memoryUtility: index === 3 ? 0 : null, laneMask: ['semantic' as const], degradedIdentity: false,
      evidenceRefs: [`feature:${index}`],
    })),
  });
  const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision });
  const semanticRows = [
    { packetKey: 'packet:d', values: [-1, 0, 0, 0] }, { packetKey: 'packet:c', values: [0, 0, 0, 2] },
    { packetKey: 'packet:b', values: [0, 3, 0, 0] }, { packetKey: 'packet:a', values: [4, 0, 0, 0] },
  ];
  const semanticMatrix = adaptSemanticRowsToRowL2SampleQueryMatrixV1({ ordinalMap, semanticRows, expectedDimension: 4, sourceMatrixRevision: 'semantic:768:fixture:v1', sourceArtifactChecksum: SOURCE_CHECKSUM, producerRevision });
  const featureMatrix = adaptCandidateFeatureColumnarToSampleQueryMatrixV1({ ordinalMap, columnar, mode: 'COLUMN_STANDARDIZED_WITH_PRESENCE', producerRevision });
  const exactSet = buildCandidateOrdinalSetV1({ requestId: 'request:sampling:v1', candidateSnapshotRevision, ordinalMapChecksum: ordinalMap.ordinalMapChecksum, representationRevision: 'semantic:768:v1', approximate: false, hits: [
    { candidateOrdinal: 0, score: 1, rank: 1, executor: 'CUVS_EXACT', evidenceRefs: ['exact:0'] },
    { candidateOrdinal: 1, score: 0.9, rank: 2, executor: 'CUVS_EXACT', evidenceRefs: ['exact:1'] },
    { candidateOrdinal: 2, score: 0.8, rank: 3, executor: 'CUVS_EXACT', evidenceRefs: ['exact:2'] },
  ]});
  const targetSet = adaptExactCandidateOrdinalSetToSamplingTargetSetV1({ candidateSet: exactSet, topK: 2, producerRevision });
  return { ordinalMap, columnar, semanticRows, semanticMatrix, featureMatrix, exactSet, targetSet, producerRevision };
}

describe('sample-query real-corpus contracts', () => {
  it('joins semantic rows by packet key and proves row-L2 degeneracy', () => {
    const f = makeFixture();
    expect(f.semanticMatrix.rows.map((row) => row.candidateOrdinal)).toEqual([0, 1, 2, 3]);
    expect(f.semanticMatrix.lengthSquaredDegeneratesTowardUniform).toBe(true);
    expect(f.semanticMatrix.rows.every((row) => Math.abs(row.rowNormSquared - 1) < 1e-10)).toBe(true);
    expect(() => adaptSemanticRowsToRowL2SampleQueryMatrixV1({ ordinalMap: f.ordinalMap, semanticRows: f.semanticRows.slice(1), expectedDimension: 4, sourceMatrixRevision: 'semantic:missing:v1', sourceArtifactChecksum: SOURCE_CHECKSUM, producerRevision: f.producerRevision })).toThrow(/SAMPLING_SEMANTIC_PACKET_KEY_NOT_FOUND/);
  });

  it('keeps feature missingness as explicit presence columns', () => {
    const f = makeFixture();
    expect(f.featureMatrix.columnCount).toBe(f.columnar.featureCount * 2);
    expect(f.featureMatrix.normalization).toBe('COLUMN_STANDARDIZED');
    expect(f.featureMatrix.lengthSquaredDegeneratesTowardUniform).toBe(false);
  });

  it('rejects approximate CandidateOrdinalSet as exact target truth', () => {
    const f = makeFixture();
    expect(() => adaptExactCandidateOrdinalSetToSamplingTargetSetV1({ candidateSet: { ...f.exactSet, approximate: true }, producerRevision: f.producerRevision })).toThrow();
  });

  it('aggregates fixed seeds and keeps equal-norm length-squared equal to uniform', () => {
    const f = makeFixture();
    const result = evaluateSamplingCorpusV1({ matrix: f.semanticMatrix, targetSet: f.targetSet, sampleSize: 2, seeds: [1, 7, 42, 99], producerRevision: f.producerRevision });
    expect(result.lengthSquaredDegeneratesTowardUniform).toBe(true);
    expect(result.lengthSquared.recallMean).toBe(result.uniform.recallMean);
    expect(result.topKRowNorm.pairwiseSelectionJaccardMean).toBe(1);
    expect(result.measurementOnly).toBe(true);
    expect(result.retrievalVoteProduced).toBe(false);
  });

  it('compares matrices only inside one CandidateOrdinal world', () => {
    const f = makeFixture();
    const result = compareSamplingMatricesV1({ left: f.semanticMatrix, right: f.featureMatrix, targetSet: f.targetSet, sampleSize: 2, seeds: [3, 11, 23], producerRevision: f.producerRevision });
    expect(result.left.lengthSquaredDegeneratesTowardUniform).toBe(true);
    expect(result.right.lengthSquaredDegeneratesTowardUniform).toBe(false);
    expect(result.promotionAuthorized).toBe(false);
    expect(() => compareSamplingMatricesV1({ left: f.semanticMatrix, right: { ...f.featureMatrix, candidateSnapshotRevision: 'candidate:other:v1' }, targetSet: f.targetSet, sampleSize: 2, seeds: [3], producerRevision: f.producerRevision })).toThrow(/SAMPLING_MATRIX_CANDIDATE_SNAPSHOT_MISMATCH/);
  });
});
