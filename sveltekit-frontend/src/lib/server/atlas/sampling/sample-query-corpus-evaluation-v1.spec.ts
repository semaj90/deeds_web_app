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
import {
  compareSamplingMatricesV1,
  evaluateSamplingCorpusV1,
} from './sample-query-corpus-evaluation-v1.js';

const SOURCE_CHECKSUM = 'a'.repeat(64);

function fixture() {
  const workspaceRevision = 'workspace:sampling-corpus:v1';
  const candidateSnapshotRevision = 'candidate:sampling-corpus:v1';
  const featureRevision = 'features:sampling-corpus:v1';
  const producerRevision = 'sampling-corpus-fixture:v1';

  const ordinalMap = materializeCandidateOrdinalMap({
    workspaceRevision,
    candidateSnapshotRevision,
    producerRevision,
    candidates: ['d', 'b', 'a', 'c'].map((name) => ({
      canonicalId: `canonical:${name}`,
      packetKey: `packet:${name}`,
      treeNodeId: `tree:${name}`,
      symbolVersionId: `symbol:${name}`,
      workspaceRevision,
      sourceRevision: `source:${name}:v1`,
      graphRevision: 'graph:sampling:v1',
      semanticRevision: 'semantic:768:v1',
      degradedIdentity: false,
      evidenceRefs: [`fixture:${name}`],
    })),
  });

  const featureValues = [
    { semanticRelevance: 0.95, lexicalRelevance: 0.80, astAffinity: 0.70, graphAuthority: 0.60 },
    { semanticRelevance: 0.60, lexicalRelevance: null, astAffinity: 0.25, graphAuthority: 0.15 },
    { semanticRelevance: 0.35, lexicalRelevance: 0.20, astAffinity: null, graphAuthority: null },
    { semanticRelevance: 0.10, lexicalRelevance: null, astAffinity: null, graphAuthority: null },
  ];

  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    featureRevision,
    producerRevision,
    rows: ordinalMap.candidates.map((candidate, index) => ({
      schema: 'atlas.candidate-feature-row.v1' as const,
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision: candidate.graphRevision,
      semanticRevision: candidate.semanticRevision,
      featureRevision,
      semanticRelevance: featureValues[index]!.semanticRelevance,
      lexicalRelevance: featureValues[index]!.lexicalRelevance,
      astAffinity: featureValues[index]!.astAffinity,
      graphAuthority: featureValues[index]!.graphAuthority,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: index === 0 ? 0.9 : null,
      executionUtility: index === 0 ? 0.75 : null,
      memoryUtility: index === 3 ? 0 : null,
      laneMask: ['semantic'] as const,
      degradedIdentity: false,
      evidenceRefs: [`feature:${index}`],
    })),
  });

  const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision });

  const semanticRows = [
    { packetKey: 'packet:d', values: [-1, 0, 0, 0] },
    { packetKey: 'packet:c', values: [0, 0, 0, 2] },
    { packetKey: 'packet:b', values: [0, 3, 0, 0] },
    { packetKey: 'packet:a', values: [4, 0, 0, 0] },
  ];

  const semanticMatrix = adaptSemanticRowsToRowL2SampleQueryMatrixV1({
    ordinalMap,
    semanticRows,
    expectedDimension: 4,
    sourceMatrixRevision: 'semantic:768:fixture:v1',
    sourceArtifactChecksum: SOURCE_CHECKSUM,
    producerRevision,
  });

  const featureMatrix = adaptCandidateFeatureColumnarToSampleQueryMatrixV1({
    ordinalMap,
    columnar,
    mode: 'COLUMN_STANDARDIZED_WITH_PRESENCE',
    producerRevision,
  });

  const exactSet = buildCandidateOrdinalSetV1({
    requestId: 'request:sampling-corpus:v1',
    candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    representationRevision: 'semantic:768:v1',
    approximate: false,
    hits: [
      { candidateOrdinal: 0, score: 1, rank: 1, executor: 'CUVS_EXACT', evidenceRefs: ['exact:0'] },
      { candidateOrdinal: 1, score: 0.9, rank: 2, executor: 'CUVS_EXACT', evidenceRefs: ['exact:1'] },
      { candidateOrdinal: 2, score: 0.8, rank: 3, executor: 'CUVS_EXACT', evidenceRefs: ['exact:2'] },
    ],
  });

  const targetSet = adaptExactCandidateOrdinalSetToSamplingTargetSetV1({
    candidateSet: exactSet,
    topK: 2,
    producerRevision,
  });

  return { ordinalMap, columnar, semanticRows, semanticMatrix, featureMatrix, exactSet, targetSet, producerRevision };
}

describe('SampleQuery corpus evaluation alignment', () => {
  it('binds semantic rows by packet key rather than source row position', () => {
    const { ordinalMap, semanticRows, semanticMatrix, producerRevision } = fixture();
    expect(semanticMatrix.rows.map((row) => row.candidateOrdinal)).toEqual([0, 1, 2, 3]);
    expect(semanticMatrix.lengthSquaredDegeneratesTowardUniform).toBe(true);
    expect(semanticMatrix.rows.every((row) => Math.abs(row.rowNormSquared - 1) < 1e-10)).toBe(true);

    expect(() => adaptSemanticRowsToRowL2SampleQueryMatrixV1({
      ordinalMap,
      semanticRows: semanticRows.slice(1),
      expectedDimension: 4,
      sourceMatrixRevision: 'semantic:missing:v1',
      sourceArtifactChecksum: SOURCE_CHECKSUM,
      producerRevision,
    })).toThrow(/SAMPLING_SEMANTIC_PACKET_KEY_NOT_FOUND/);
  });

  it('preserves feature missingness with explicit presence columns', () => {
    const { featureMatrix, columnar } = fixture();
    expect(featureMatrix.columnCount).toBe(columnar.featureCount * 2);
    expect(featureMatrix.normalization).toBe('COLUMN_STANDARDIZED');
    expect(featureMatrix.lengthSquaredDegeneratesTowardUniform).toBe(false);
  });

  it('requires exact CandidateOrdinalSet for EXACT_TOP_K target truth', () => {
    const { exactSet, producerRevision } = fixture();
    const approximate = { ...exactSet, approximate: true };
    expect(() => adaptExactCandidateOrdinalSetToSamplingTargetSetV1({
      candidateSet: approximate,
      producerRevision,
    })).toThrow();
  });

  it('aggregates multiple deterministic seeds and exposes the L2 degeneracy', () => {
    const { semanticMatrix, targetSet, producerRevision } = fixture();
    const result = evaluateSamplingCorpusV1({
      matrix: semanticMatrix,
      targetSet,
      sampleSize: 2,
      seeds: [1, 7, 42, 99],
      producerRevision,
    });

    expect(result.lengthSquaredDegeneratesTowardUniform).toBe(true);
    expect(result.lengthSquared.recallMean).toBe(result.uniform.recallMean);
    expect(result.lengthSquared.decisionSetChecksum).toBeTruthy();
    expect(result.topKRowNorm.pairwiseSelectionJaccardMean).toBe(1);
    expect(result.measurementOnly).toBe(true);
    expect(result.retrievalVoteProduced).toBe(false);
  });

  it('compares semantic and feature matrices only in the same CandidateOrdinal world', () => {
    const { semanticMatrix, featureMatrix, targetSet, producerRevision } = fixture();
    const result = compareSamplingMatricesV1({
      left: semanticMatrix,
      right: featureMatrix,
      targetSet,
      sampleSize: 2,
      seeds: [3, 11, 23],
      producerRevision,
    });

    expect(result.left.lengthSquaredDegeneratesTowardUniform).toBe(true);
    expect(result.right.lengthSquaredDegeneratesTowardUniform).toBe(false);
    expect(result.identityAuthority).toBe(false);
    expect(result.promotionAuthorized).toBe(false);

    expect(() => compareSamplingMatricesV1({
      left: semanticMatrix,
      right: { ...featureMatrix, candidateSnapshotRevision: 'candidate:other:v1' },
      targetSet,
      sampleSize: 2,
      seeds: [3],
      producerRevision,
    })).toThrow(/SAMPLING_MATRIX_CANDIDATE_SNAPSHOT_MISMATCH/);
  });
});
