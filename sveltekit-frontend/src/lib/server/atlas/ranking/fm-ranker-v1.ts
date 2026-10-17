import { createHash } from 'node:crypto';
import { z } from 'zod';

export const FM_RANK4_MODEL_SCHEMA = 'atlas.fm-rank4-model.v1' as const;

/**
 * The canonical 12 numerical feature columns for Parent Atlas function ranking.
 * Spans lexical, semantic, structural AST, graph topology, feature labels, and execution utility.
 */
export const FUNCTION_RANKING_FEATURES_12 = [
  'semantic_similarity',   // 0: Cosine similarity of semantic_768 [-1.0, 1.0]
  'bm25_lexical',          // 1: Normalized BM25/FTS text score [0.0, 1.0]
  'exact_symbol_match',    // 2: Exact identifier / symbol name match [0.0 or 1.0]
  'ast_signal',            // 3: Tree-sitter AST function declaration node quality [0.0, 1.0]
  'authority_pagerank',    // 4: Normalized GraphV2 PageRank authority score [0.0, 1.0]
  'community_fit',         // 5: Graph cluster community cohesion score [0.0, 1.0]
  'domain_fit',            // 6: Domain classification confidence [0.0, 1.0]
  'feature_label_score',   // 7: Density of verified feature labels from bitset [0.0, 1.0]
  'dependency_depth',      // 8: Inverse graph hop distance [0.0, 1.0]
  'test_coverage_status',  // 9: Verified unit test coverage (UNIT_TEST_PASS) [0.0 or 1.0]
  'typecheck_status',      // 10: Verified typecheck pass (TYPECHECK_PASS) [0.0 or 1.0]
  'execution_utility',     // 11: Route trace execution pass utility [0.0, 1.0]
] as const;

export type FunctionRankingFeatureName = (typeof FUNCTION_RANKING_FEATURES_12)[number];
export const NUM_RANKING_FEATURES = 12;
export const FM_RANK = 4;
export const TOTAL_FM_PARAMETERS = 1 + NUM_RANKING_FEATURES + NUM_RANKING_FEATURES * FM_RANK; // 1 + 12 + 48 = 61

export const FmRank4MetricsSchema = z
  .object({
    ndcgAt5: z.number().min(0).max(1),
    mrr: z.number().min(0).max(1),
    trainLoss: z.number().nonnegative(),
    valLoss: z.number().nonnegative().optional(),
  })
  .strict();
export type FmRank4Metrics = z.infer<typeof FmRank4MetricsSchema>;

export const FmTrainingProvenanceSchema = z
  .object({
    datasetDigest: z.string().min(1),
    trainingRowsCount: z.number().int().positive(),
    trainedAt: z.string().datetime(),
    optimizer: z.string().min(1),
    epochs: z.number().int().positive(),
  })
  .strict();
export type FmTrainingProvenance = z.infer<typeof FmTrainingProvenanceSchema>;

export const FmRank4ModelArtifactV1Schema = z
  .object({
    schema: z.literal(FM_RANK4_MODEL_SCHEMA),
    modelId: z.string().min(1),
    modelRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    numFeatures: z.literal(12),
    rank: z.literal(4),
    totalParameters: z.literal(61),
    w0: z.number().finite(),
    w: z.array(z.number().finite()).length(12),
    V: z.array(z.array(z.number().finite()).length(4)).length(12),
    featureNames: z.array(z.string()).length(12),
    metrics: FmRank4MetricsSchema,
    trainingProvenance: FmTrainingProvenanceSchema,
  })
  .strict();
export type FmRank4ModelArtifactV1 = z.infer<typeof FmRank4ModelArtifactV1Schema>;

export interface QueryCandidateTrainingRowV1 {
  queryId: string;
  candidateId: string;
  features: readonly number[]; // length 12
  label: number;               // relevance judgment (e.g. 0 to 3)
}

/**
 * High-throughput Rendle O(k * d) inference for the 61-parameter FM Rank-4 model.
 * Performs zero heap allocations when passed Float64Array.
 */
export function scoreCandidateFmRank4(
  model: FmRank4ModelArtifactV1,
  features: ArrayLike<number>
): number {
  if (features.length < NUM_RANKING_FEATURES) {
    throw new Error(`FEATURE_VECTOR_UNDERSIZED: expected ${NUM_RANKING_FEATURES}, got ${features.length}`);
  }

  // 1. Global bias
  let score = model.w0;

  // 2. 1st-order linear weights
  for (let i = 0; i < NUM_RANKING_FEATURES; i++) {
    score += model.w[i] * features[i];
  }

  // 3. 2nd-order pairwise interactions via Rendle factorization O(k * d)
  for (let f = 0; f < FM_RANK; f++) {
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < NUM_RANKING_FEATURES; i++) {
      const v_if = model.V[i][f];
      const prod = v_if * features[i];
      sum += prod;
      sumSq += prod * prod;
    }
    score += 0.5 * (sum * sum - sumSq);
  }

  return score;
}

/**
 * Calculates Discounted Cumulative Gain (DCG@k) and NDCG@k and MRR for ranked candidates.
 */
export function evaluateRankingMetrics(
  items: Array<{ queryId: string; candidateId: string; score: number; label: number }>,
  k = 5
): { ndcgAt5: number; mrr: number } {
  // Group by query
  const byQuery = new Map<string, Array<{ score: number; label: number }>>();
  for (const item of items) {
    const list = byQuery.get(item.queryId) ?? [];
    list.push({ score: item.score, label: item.label });
    byQuery.set(item.queryId, list);
  }

  let totalNdcg = 0;
  let totalMrr = 0;
  let validQueryCount = 0;

  for (const [, list] of byQuery) {
    if (list.length === 0) continue;

    // Predicted ranking (descending by predicted score)
    const predicted = [...list].sort((a, b) => b.score - a.score);

    // Ideal ranking (descending by true relevance label)
    const ideal = [...list].sort((a, b) => b.label - a.label);

    // Calculate DCG@k
    let dcg = 0;
    for (let i = 0; i < Math.min(k, predicted.length); i++) {
      const rel = predicted[i].label;
      dcg += (Math.pow(2, rel) - 1) / Math.log2(i + 2);
    }

    // Calculate IDCG@k
    let idcg = 0;
    for (let i = 0; i < Math.min(k, ideal.length); i++) {
      const rel = ideal[i].label;
      idcg += (Math.pow(2, rel) - 1) / Math.log2(i + 2);
    }

    const ndcg = idcg > 0 ? dcg / idcg : 1.0;
    totalNdcg += ndcg;

    // Calculate MRR (first item with label > 0)
    let rr = 0;
    for (let i = 0; i < predicted.length; i++) {
      if (predicted[i].label > 0) {
        rr = 1 / (i + 1);
        break;
      }
    }
    totalMrr += rr;
    validQueryCount++;
  }

  return {
    ndcgAt5: validQueryCount > 0 ? Number((totalNdcg / validQueryCount).toFixed(4)) : 0,
    mrr: validQueryCount > 0 ? Number((totalMrr / validQueryCount).toFixed(4)) : 0,
  };
}

export interface FmTrainingConfig {
  learningRate?: number;
  regW0?: number;
  regW?: number;
  regV?: number;
  epochs?: number;
  batchSize?: number;
}

/**
 * Supervised training of the 61-parameter FM Rank-4 model from query-candidate feature rows.
 * Uses Stochastic Gradient Descent with L2 weight decay.
 */
export function trainFmRank4Model(
  rows: readonly QueryCandidateTrainingRowV1[],
  config?: FmTrainingConfig
): FmRank4ModelArtifactV1 {
  if (rows.length === 0) {
    throw new Error('TRAINING_DATA_EMPTY: at least 1 row required');
  }

  const lr = config?.learningRate ?? 0.01;
  const regW0 = config?.regW0 ?? 0.0001;
  const regW = config?.regW ?? 0.001;
  const regV = config?.regV ?? 0.001;
  const epochs = config?.epochs ?? 50;

  // Initialize weights: bias 0, linear weights small uniform, V small random
  let w0 = 0.0;
  const w = new Array(NUM_RANKING_FEATURES).fill(0.0).map(() => 0.05);
  const V: number[][] = [];
  for (let i = 0; i < NUM_RANKING_FEATURES; i++) {
    const factors: number[] = [];
    for (let f = 0; f < FM_RANK; f++) {
      // Deterministic pseudo-random seed
      const seed = Math.sin((i + 1) * 17 + (f + 1) * 31);
      factors.push(seed * 0.05);
    }
    V.push(factors);
  }

  let finalLoss = 0;

  // Training loop (SGD over squared error loss against normalized relevance label)
  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochLoss = 0;
    for (const row of rows) {
      const x = row.features;
      const target = row.label;

      // Forward pass
      const modelStub: FmRank4ModelArtifactV1 = {
        schema: FM_RANK4_MODEL_SCHEMA,
        modelId: 'training_stub',
        modelRevision: 'sha256:' + '0'.repeat(64),
        numFeatures: 12,
        rank: 4,
        totalParameters: 61,
        w0,
        w,
        V,
        featureNames: [...FUNCTION_RANKING_FEATURES_12],
        metrics: { ndcgAt5: 0, mrr: 0, trainLoss: 0 },
        trainingProvenance: {
          datasetDigest: 'training',
          trainingRowsCount: rows.length,
          trainedAt: new Date().toISOString(),
          optimizer: 'sgd',
          epochs,
        },
      };

      const pred = scoreCandidateFmRank4(modelStub, x);
      const err = pred - target;
      epochLoss += err * err;

      // Gradients & updates
      // dw0 = err + regW0 * w0
      w0 -= lr * (err + regW0 * w0);

      // dwi = err * xi + regW * wi
      for (let i = 0; i < NUM_RANKING_FEATURES; i++) {
        w[i] -= lr * (err * x[i] + regW * w[i]);
      }

      // dV_{i,f} = err * (x_i * \sum_{j} V_{j,f} x_j - V_{i,f} x_i^2) + regV * V_{i,f}
      for (let f = 0; f < FM_RANK; f++) {
        let sumVx = 0;
        for (let j = 0; j < NUM_RANKING_FEATURES; j++) {
          sumVx += V[j][f] * x[j];
        }
        for (let i = 0; i < NUM_RANKING_FEATURES; i++) {
          const gradV = err * (x[i] * sumVx - V[i][f] * x[i] * x[i]) + regV * V[i][f];
          V[i][f] -= lr * gradV;
        }
      }
    }
    finalLoss = epochLoss / rows.length;
  }

  // Compute metrics on training set
  const scoredItems = rows.map((row) => {
    const dummyModel: FmRank4ModelArtifactV1 = {
      schema: FM_RANK4_MODEL_SCHEMA,
      modelId: 'eval',
      modelRevision: 'sha256:' + '0'.repeat(64),
      numFeatures: 12,
      rank: 4,
      totalParameters: 61,
      w0,
      w,
      V,
      featureNames: [...FUNCTION_RANKING_FEATURES_12],
      metrics: { ndcgAt5: 0, mrr: 0, trainLoss: 0 },
      trainingProvenance: {
        datasetDigest: 'eval',
        trainingRowsCount: rows.length,
        trainedAt: new Date().toISOString(),
        optimizer: 'sgd',
        epochs,
      },
    };
    return {
      queryId: row.queryId,
      candidateId: row.candidateId,
      score: scoreCandidateFmRank4(dummyModel, row.features),
      label: row.label,
    };
  });

  const metrics = evaluateRankingMetrics(scoredItems, 5);

  const datasetDigest = createHash('sha256')
    .update(JSON.stringify(rows.map((r) => [r.queryId, r.candidateId, r.label])))
    .digest('hex');

  const modelPayload = JSON.stringify({ w0, w, V, datasetDigest });
  const modelRevision = `sha256:${createHash('sha256').update(modelPayload).digest('hex')}`;

  return FmRank4ModelArtifactV1Schema.parse({
    schema: FM_RANK4_MODEL_SCHEMA,
    modelId: `fm_rank4_${modelRevision.slice(7, 19)}`,
    modelRevision,
    numFeatures: 12,
    rank: 4,
    totalParameters: 61,
    w0: Number(w0.toFixed(6)),
    w: w.map((val) => Number(val.toFixed(6))),
    V: V.map((row) => row.map((val) => Number(val.toFixed(6)))),
    featureNames: [...FUNCTION_RANKING_FEATURES_12],
    metrics: {
      ndcgAt5: metrics.ndcgAt5,
      mrr: metrics.mrr,
      trainLoss: Number(finalLoss.toFixed(6)),
    },
    trainingProvenance: {
      datasetDigest: `sha256:${datasetDigest}`,
      trainingRowsCount: rows.length,
      trainedAt: new Date().toISOString(),
      optimizer: 'sgd_rendle_l2',
      epochs,
    },
  });
}

/**
 * Pure linear baseline score (rank = 0 ablation).
 */
export function scoreLinearBaseline(features: ArrayLike<number>, weights: ArrayLike<number>): number {
  let score = 0;
  for (let i = 0; i < NUM_RANKING_FEATURES; i++) {
    score += (weights[i] ?? 1.0) * features[i];
  }
  return score;
}

/**
 * Pure BM25 text score baseline (feature index 1 ablation).
 */
export function scoreBm25Baseline(features: ArrayLike<number>): number {
  return features[1] ?? 0;
}
