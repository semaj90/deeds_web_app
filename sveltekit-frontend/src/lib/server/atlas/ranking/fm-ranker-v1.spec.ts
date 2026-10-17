import { describe, expect, it } from 'vitest';
import {
  type QueryCandidateTrainingRowV1,
  type FmRank4ModelArtifactV1,
  FUNCTION_RANKING_FEATURES_12,
  TOTAL_FM_PARAMETERS,
  evaluateRankingMetrics,
  scoreBm25Baseline,
  scoreCandidateFmRank4,
  scoreLinearBaseline,
  trainFmRank4Model,
} from './fm-ranker-v1.js';

describe('FM-05: Factorization Machine Rank-4 (61-Parameter) Function Ranker', () => {
  it('confirms exactly 61 parameters in the model architecture', () => {
    // 1 global bias + 12 linear weights + (12 * 4) latent interaction factors
    const biasCount = 1;
    const linearCount = 12;
    const latentCount = 12 * 4;
    expect(biasCount + linearCount + latentCount).toBe(61);
    expect(TOTAL_FM_PARAMETERS).toBe(61);
    expect(FUNCTION_RANKING_FEATURES_12.length).toBe(12);
  });

  it('proves Rendle O(k * d) factorization exactly matches the explicit pairwise sum', () => {
    // Create an arbitrary model artifact
    const w0 = 0.5;
    const w = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];
    const V: number[][] = [];
    for (let i = 0; i < 12; i++) {
      V.push([0.1 * i, 0.2 * i, 0.05 * i, 0.15 * i]);
    }

    const testFeatures = [0.8, 0.6, 1.0, 0.9, 0.7, 0.5, 0.85, 0.95, 0.3, 1.0, 1.0, 0.75];

    const model: FmRank4ModelArtifactV1 = {
      schema: 'atlas.fm-rank4-model.v1',
      modelId: 'test_model',
      modelRevision: 'sha256:' + 'a'.repeat(64),
      numFeatures: 12,
      rank: 4,
      totalParameters: 61,
      w0,
      w,
      V,
      featureNames: [...FUNCTION_RANKING_FEATURES_12],
      metrics: { ndcgAt5: 1.0, mrr: 1.0, trainLoss: 0.01 },
      trainingProvenance: {
        datasetDigest: 'test',
        trainingRowsCount: 1,
        trainedAt: new Date().toISOString(),
        optimizer: 'test',
        epochs: 1,
      },
    };

    // 1. Fast Rendle formula
    const rendleScore = scoreCandidateFmRank4(model, testFeatures);

    // 2. Slow explicit pairwise interaction sum
    let explicitPairwise = 0;
    for (let i = 0; i < 12; i++) {
      for (let j = i + 1; j < 12; j++) {
        // Dot product <v_i, v_j>
        let dot = 0;
        for (let f = 0; f < 4; f++) {
          dot += V[i][f] * V[j][f];
        }
        explicitPairwise += dot * testFeatures[i] * testFeatures[j];
      }
    }
    let explicitLinear = w0;
    for (let i = 0; i < 12; i++) {
      explicitLinear += w[i] * testFeatures[i];
    }
    const explicitTotalScore = explicitLinear + explicitPairwise;

    expect(rendleScore).toBeCloseTo(explicitTotalScore, 9);
  });

  it('trains FM Rank-4 on query-candidate judgments and demonstrates ranking lift over baselines', () => {
    // Generate synthetic but realistic query-candidate dataset
    // Query 1: "validate legal deed packet" -> wants high semantic, exact symbol, test passed, typecheck pass
    const rows: QueryCandidateTrainingRowV1[] = [
      // Query 1 candidates
      {
        queryId: 'q1_validate_packet',
        candidateId: 'fn_validatePacketSchema',
        features: [0.92, 0.85, 1.0, 0.95, 0.88, 0.75, 0.90, 1.0, 0.80, 1.0, 1.0, 0.95],
        label: 3, // Highly relevant
      },
      {
        queryId: 'q1_validate_packet',
        candidateId: 'fn_packetValidatorHelper',
        features: [0.81, 0.70, 0.0, 0.80, 0.65, 0.60, 0.80, 0.75, 0.60, 1.0, 1.0, 0.80],
        label: 2, // Relevant
      },
      {
        queryId: 'q1_validate_packet',
        candidateId: 'fn_untestedDeedParser',
        features: [0.75, 0.90, 0.0, 0.50, 0.30, 0.40, 0.50, 0.20, 0.30, 0.0, 0.0, 0.10], // High lexical, but untested & broken types
        label: 0, // Irrelevant / Dangerous
      },
      {
        queryId: 'q1_validate_packet',
        candidateId: 'fn_renderPdfThumbnail',
        features: [0.20, 0.10, 0.0, 0.70, 0.40, 0.20, 0.10, 0.50, 0.20, 1.0, 1.0, 0.50],
        label: 0, // Unrelated
      },

      // Query 2: "execute graph quick hop"
      {
        queryId: 'q2_graph_hop',
        candidateId: 'fn_executeKagQuickHopV1',
        features: [0.95, 0.90, 1.0, 0.90, 0.92, 0.85, 0.95, 1.0, 0.90, 1.0, 1.0, 0.98],
        label: 3, // Perfect match
      },
      {
        queryId: 'q2_graph_hop',
        candidateId: 'fn_traverseGraphNeighborhood',
        features: [0.85, 0.65, 0.0, 0.85, 0.80, 0.70, 0.85, 0.80, 0.70, 1.0, 1.0, 0.85],
        label: 2, // Good match
      },
      {
        queryId: 'q2_graph_hop',
        candidateId: 'fn_legacyGraphStub',
        features: [0.60, 0.80, 0.0, 0.40, 0.20, 0.30, 0.40, 0.10, 0.20, 0.0, 1.0, 0.20],
        label: 0, // Outdated stub
      },
    ];

    // Train FM Rank-4 model
    const trainedModel = trainFmRank4Model(rows, {
      learningRate: 0.02,
      epochs: 80,
    });

    expect(trainedModel.schema).toBe('atlas.fm-rank4-model.v1');
    expect(trainedModel.totalParameters).toBe(61);
    expect(trainedModel.metrics.ndcgAt5).toBeGreaterThanOrEqual(0.85);
    expect(trainedModel.metrics.mrr).toBe(1.0);

    // Baseline comparisons
    // 1. BM25 baseline ranking
    const bm25Scored = rows.map((r) => ({
      queryId: r.queryId,
      candidateId: r.candidateId,
      score: scoreBm25Baseline(r.features),
      label: r.label,
    }));
    const bm25Metrics = evaluateRankingMetrics(bm25Scored, 5);

    // 2. FM Rank-4 model ranking
    const fmScored = rows.map((r) => ({
      queryId: r.queryId,
      candidateId: r.candidateId,
      score: scoreCandidateFmRank4(trainedModel, r.features),
      label: r.label,
    }));
    const fmMetrics = evaluateRankingMetrics(fmScored, 5);

    // FM ranker should strictly outperform or match naive BM25 on tested functions
    expect(fmMetrics.ndcgAt5).toBeGreaterThanOrEqual(bm25Metrics.ndcgAt5);
    expect(fmMetrics.mrr).toBeGreaterThanOrEqual(bm25Metrics.mrr);
  });
});
