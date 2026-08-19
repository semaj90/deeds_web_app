import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  PACKET_FEATURE_NAMES,
  type PacketFeatureRow,
} from './packet-feature-matrix.js';

/**
 * Parent Atlas adaptive search planner.
 *
 * This module chooses algorithms and executor parameters. It does not execute
 * graph traversal, vector search, cache writes, or model inference. That keeps
 * LANE != EXECUTOR intact and lets the DAG authorize side effects separately.
 */

export const GraphSearchAlgorithmSchema = z.enum([
  'BFS',
  'BIDIRECTIONAL_BFS',
  'SSSP_DIJKSTRA',
  'A_STAR',
  'PERSONALIZED_PAGERANK',
  'PAGERANK',
  'HITS',
  'LEIDEN',
  'RANDOM_WALK',
  'TWO_HOP',
  'K_HOP',
  'CUVS_BRUTE_FORCE',
  'CUVS_CAGRA',
  'QDRANT_ANN',
]);
export type GraphSearchAlgorithm = z.infer<typeof GraphSearchAlgorithmSchema>;

export const SearchIntentSchema = z.enum([
  'LOCAL_NEIGHBORHOOD',
  'PATH_FINDING',
  'SEMANTIC_PATH',
  'AUTHORITY',
  'PERSONAL_AUTHORITY',
  'COMMUNITY',
  'STRUCTURAL_EXPANSION',
  'VECTOR_EXACT',
  'VECTOR_FAST',
  'FILTERED_VECTOR',
]);
export type SearchIntent = z.infer<typeof SearchIntentSchema>;

export const SearchLogicalLaneSchema = z.enum([
  'graph',
  'semantic',
  'structural',
  'policy',
]);
export type SearchLogicalLane = z.infer<typeof SearchLogicalLaneSchema>;

export const AdaptiveSearchBudgetV1Schema = z.object({
  maxGraphHops: z.number().int().nonnegative().max(8),
  maxGraphFanout: z.number().int().positive().max(100_000),
  maxCandidates: z.number().int().positive().max(1_000_000),
  topK: z.number().int().positive().max(100_000),
  queryBatchSize: z.number().int().positive().max(100_000),
  latencyBudgetMs: z.number().int().positive().max(120_000),
  contextTokenBudget: z.number().int().positive().max(10_000_000),
  exactPromotionTopK: z.number().int().positive().max(100_000),
}).strict().superRefine((value, ctx) => {
  if (value.topK > value.maxCandidates) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['topK'],
      message: 'topK must be <= maxCandidates',
    });
  }
  if (value.exactPromotionTopK > value.maxCandidates) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['exactPromotionTopK'],
      message: 'exactPromotionTopK must be <= maxCandidates',
    });
  }
});
export type AdaptiveSearchBudgetV1 = z.infer<typeof AdaptiveSearchBudgetV1Schema>;

export const MatrixDiagnosticsV1Schema = z.object({
  rowCount: z.number().int().positive(),
  columnCount: z.number().int().positive(),
  effectiveRank: z.number().finite().positive().nullable(),
  retainedRank: z.number().int().positive().nullable(),
  retainedEnergyPercent: z.number().finite().min(0).max(100).nullable(),
  conditionNumber: z.number().finite().positive().nullable(),
  measured: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.effectiveRank != null && value.effectiveRank > value.columnCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['effectiveRank'],
      message: 'effectiveRank must be <= columnCount',
    });
  }
  if (value.retainedRank != null && value.retainedRank > value.columnCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['retainedRank'],
      message: 'retainedRank must be <= columnCount',
    });
  }
});
export type MatrixDiagnosticsV1 = z.infer<typeof MatrixDiagnosticsV1Schema>;

export const AdaptiveSearchInputV1Schema = z.object({
  schema: z.literal('atlas.adaptive-search-input.v1'),
  requestId: z.string().min(1),
  queryText: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  graphWeighted: z.boolean(),
  sourceNodeKnown: z.boolean(),
  targetNodeKnown: z.boolean(),
  candidateCount: z.number().int().positive(),
  filteredFraction: z.number().finite().min(0).max(1),
  budget: AdaptiveSearchBudgetV1Schema,
  matrixDiagnostics: MatrixDiagnosticsV1Schema.nullable(),
  producerRevision: z.string().min(1),
}).strict();
export type AdaptiveSearchInputV1 = z.infer<typeof AdaptiveSearchInputV1Schema>;

export const SearchAlgorithmRecommendationV1Schema = z.object({
  algorithm: GraphSearchAlgorithmSchema,
  intent: SearchIntentSchema,
  logicalLane: SearchLogicalLaneSchema,
  priorityPercent: z.number().finite().min(0).max(100),
  executorOnly: z.boolean(),
  independentLaneVote: z.literal(false),
  exactOracle: z.boolean(),
  reasonCodes: z.array(z.string().min(1)).min(1),
  parameters: z.record(
    z.string(),
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string()),
      z.array(z.number()),
    ]),
  ),
}).strict();
export type SearchAlgorithmRecommendationV1 = z.infer<typeof SearchAlgorithmRecommendationV1Schema>;

export const CuvsGraphBuildAlgorithmSchema = z.enum(['IVF_PQ', 'NN_DESCENT', 'ACE']);
export const CuvsSearchAlgorithmSchema = z.enum(['auto', 'single_cta', 'multi_cta', 'multi_kernel']);
export const CuvsDatasetMemoryTypeSchema = z.enum(['device', 'host', 'mmap']);
export const CuvsGraphMemoryTypeSchema = z.enum(['device', 'host_pinned', 'host_huge_page']);

export const CuvsCagraBuildPlanV1Schema = z.object({
  graph_degree: z.number().int().positive().max(512),
  intermediate_graph_degree: z.number().int().positive().max(1024),
  graph_build_algo: CuvsGraphBuildAlgorithmSchema,
  dataset_memory_type: CuvsDatasetMemoryTypeSchema,
  npartitions: z.number().int().positive().max(1024),
}).strict().superRefine((value, ctx) => {
  if (value.intermediate_graph_degree < value.graph_degree) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['intermediate_graph_degree'],
      message: 'intermediate graph degree must be >= graph degree',
    });
  }
});
export type CuvsCagraBuildPlanV1 = z.infer<typeof CuvsCagraBuildPlanV1Schema>;

export const CuvsCagraSearchPlanV1Schema = z.object({
  itopk: z.number().int().positive().max(4096),
  search_width: z.number().int().positive().max(128),
  max_iterations: z.number().int().nonnegative().max(100_000),
  algo: CuvsSearchAlgorithmSchema,
  query_memory_type: CuvsDatasetMemoryTypeSchema,
  graph_memory_type: CuvsGraphMemoryTypeSchema,
  internal_dataset_memory_type: CuvsGraphMemoryTypeSchema,
}).strict();
export type CuvsCagraSearchPlanV1 = z.infer<typeof CuvsCagraSearchPlanV1Schema>;

export const CuvsBenchAnalysisPlanV1Schema = z.object({
  schema: z.literal('atlas.cuvs-bench-analysis-plan.v1'),
  algorithm: z.literal('cuvs_cagra'),
  atlasArtifactFormat: z.literal('JSON'),
  officialCuvsBenchAuthoringFormat: z.literal('YAML'),
  build: CuvsCagraBuildPlanV1Schema,
  search: CuvsCagraSearchPlanV1Schema,
  exactOracle: z.object({
    algorithm: z.literal('cuvs_brute_force'),
    required: z.literal(true),
    topK: z.number().int().positive(),
  }).strict(),
  benchmarkAxes: z.array(z.enum(['recall', 'latency_ms', 'qps'])).min(2),
  notes: z.array(z.string().min(1)),
}).strict();
export type CuvsBenchAnalysisPlanV1 = z.infer<typeof CuvsBenchAnalysisPlanV1Schema>;

export const TangPromotionPolicyV1Schema = z.object({
  maxEffectiveRankRatio: z.number().finite().positive().max(1),
  minRetainedEnergyPercent: z.number().finite().min(0).max(100),
  maxConditionNumber: z.number().finite().positive(),
  promotionCount: z.number().int().positive(),
}).strict();
export type TangPromotionPolicyV1 = z.infer<typeof TangPromotionPolicyV1Schema>;

export const TangPromotionRowV1Schema = z.object({
  packetKey: z.string().min(1),
  squaredNorm: z.number().finite().nonnegative(),
  samplingProbability: z.number().finite().min(0).max(1),
  deterministicPriority: z.number().int().positive(),
}).strict();
export type TangPromotionRowV1 = z.infer<typeof TangPromotionRowV1Schema>;

export const TangPromotionRecommendationV1Schema = z.object({
  schema: z.literal('atlas.tang-promotion-recommendation.v1'),
  eligible: z.boolean(),
  status: z.enum(['ELIGIBLE', 'MEASURE_FIRST', 'LOW_RANK_NOT_SUPPORTED']),
  diagnosticsMeasured: z.boolean(),
  effectiveRankRatio: z.number().finite().min(0).max(1).nullable(),
  reasonCodes: z.array(z.string().min(1)).min(1),
  rows: z.array(TangPromotionRowV1Schema),
  selectedPacketKeys: z.array(z.string().min(1)),
  stochasticSamplingStillRequiredForTangFaithfulExecution: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type TangPromotionRecommendationV1 = z.infer<typeof TangPromotionRecommendationV1Schema>;

export const SEARCH_POLICY_FEATURE_NAMES = [
  ...PACKET_FEATURE_NAMES,
  'hopProximity',
  'pathCostUtility',
  'communityOverlap',
  'pprAffinity',
  'contextWindowUtility',
  'tangPromotionProbability',
  'exactEvidence',
] as const;
export type SearchPolicyFeatureName = (typeof SEARCH_POLICY_FEATURE_NAMES)[number];
export const SEARCH_POLICY_FEATURE_COUNT = SEARCH_POLICY_FEATURE_NAMES.length;

export const SearchPolicyCandidateFeaturesV1Schema = z.object({
  packetKey: z.string().min(1),
  hopProximity: z.number().finite().min(0).max(1),
  pathCostUtility: z.number().finite().min(0).max(1),
  communityOverlap: z.number().finite().min(0).max(1),
  pprAffinity: z.number().finite().min(0).max(1),
  contextWindowUtility: z.number().finite().min(0).max(1),
  tangPromotionProbability: z.number().finite().min(0).max(1),
  exactEvidence: z.number().finite().min(0).max(1),
}).strict();
export type SearchPolicyCandidateFeaturesV1 = z.infer<typeof SearchPolicyCandidateFeaturesV1Schema>;

export type SearchPolicyFeatureMatrixV1 = {
  schema: 'atlas.search-policy-feature-matrix.v1';
  packetKeys: string[];
  featureNames: readonly SearchPolicyFeatureName[];
  rows: number;
  cols: number;
  values: Float32Array;
  canonicalBaseFeatureCount: number;
  policyFeatureCount: number;
};

export const CuvsBenchmarkPointV1Schema = z.object({
  configId: z.string().min(1),
  recall: z.number().finite().min(0).max(1),
  latencyMs: z.number().finite().positive(),
  qps: z.number().finite().positive(),
}).strict();
export type CuvsBenchmarkPointV1 = z.infer<typeof CuvsBenchmarkPointV1Schema>;

export const CuvsParetoAnalysisV1Schema = z.object({
  schema: z.literal('atlas.cuvs-pareto-analysis.v1'),
  recallLatencyFrontier: z.array(CuvsBenchmarkPointV1Schema),
  recallQpsFrontier: z.array(CuvsBenchmarkPointV1Schema),
}).strict();
export type CuvsParetoAnalysisV1 = z.infer<typeof CuvsParetoAnalysisV1Schema>;

export const AdaptiveSearchPlanV1Schema = z.object({
  schema: z.literal('atlas.adaptive-search-plan.v1'),
  requestId: z.string().min(1),
  queryHash: z.string().regex(/^[a-f0-9]{16}$/),
  intents: z.array(SearchIntentSchema).min(1),
  recommendations: z.array(SearchAlgorithmRecommendationV1Schema).min(1),
  cuvsBench: CuvsBenchAnalysisPlanV1Schema,
  exactPromotionTopK: z.number().int().positive(),
  laneVoteInvariant: z.literal('ONE_VOTE_PER_LOGICAL_LANE'),
  graphNeverAnswersDirectly: z.literal(true),
  producerRevision: z.string().min(1),
}).strict();
export type AdaptiveSearchPlanV1 = z.infer<typeof AdaptiveSearchPlanV1Schema>;

const DEFAULT_TANG_POLICY: TangPromotionPolicyV1 = {
  maxEffectiveRankRatio: 0.35,
  minRetainedEnergyPercent: 80,
  maxConditionNumber: 1_000_000,
  promotionCount: 32,
};

function hash16(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function percent(value: number): number {
  return Math.round(clamp01(value) * 10_000) / 100;
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1),
  );
}

function hasAny(haystack: Set<string>, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.has(needle));
}

export function inferSearchIntents(queryText: string, input?: {
  filteredFraction?: number;
  exactRequested?: boolean;
}): SearchIntent[] {
  const t = tokens(queryText);
  const intents = new Set<SearchIntent>();

  if (hasAny(t, ['neighbor', 'neighbors', 'nearby', 'hop', 'hops', 'local'])) intents.add('LOCAL_NEIGHBORHOOD');
  if (hasAny(t, ['path', 'shortest', 'route', 'distance'])) intents.add('PATH_FINDING');
  if (hasAny(t, ['semantic', 'meaning', 'relevant']) && hasAny(t, ['path', 'route', 'graph'])) intents.add('SEMANTIC_PATH');
  if (hasAny(t, ['authority', 'important', 'importance', 'pagerank', 'central'])) intents.add('AUTHORITY');
  if (hasAny(t, ['personalized', 'personal', 'seeded', 'query']) && hasAny(t, ['pagerank', 'authority', 'importance'])) intents.add('PERSONAL_AUTHORITY');
  if (hasAny(t, ['community', 'communities', 'cluster', 'leiden', 'louvain', 'module'])) intents.add('COMMUNITY');
  if (hasAny(t, ['caller', 'callers', 'callee', 'callees', 'import', 'imports', 'reference', 'references', 'dependency', 'dependencies', 'fanout', 'blast'])) intents.add('STRUCTURAL_EXPANSION');
  if (input?.exactRequested || hasAny(t, ['exact', 'oracle', 'groundtruth', 'ground', 'truth'])) intents.add('VECTOR_EXACT');
  if (hasAny(t, ['ann', 'cagra', 'fast', 'latency', 'qps', 'nearest', 'knn'])) intents.add('VECTOR_FAST');
  if ((input?.filteredFraction ?? 0) >= 0.9 || hasAny(t, ['filtered', 'filter'])) intents.add('FILTERED_VECTOR');

  if (!intents.size) {
    intents.add('VECTOR_FAST');
    intents.add('STRUCTURAL_EXPANSION');
  }
  return [...intents].sort((a, b) => a.localeCompare(b));
}

function recommendation(
  algorithm: GraphSearchAlgorithm,
  intent: SearchIntent,
  logicalLane: SearchLogicalLane,
  priorityPercent: number,
  reasonCodes: string[],
  parameters: SearchAlgorithmRecommendationV1['parameters'],
  options: { exactOracle?: boolean; executorOnly?: boolean } = {},
): SearchAlgorithmRecommendationV1 {
  return SearchAlgorithmRecommendationV1Schema.parse({
    algorithm,
    intent,
    logicalLane,
    priorityPercent: Math.max(0, Math.min(100, Math.round(priorityPercent * 100) / 100)),
    executorOnly: options.executorOnly ?? true,
    independentLaneVote: false,
    exactOracle: options.exactOracle ?? false,
    reasonCodes,
    parameters,
  });
}

function buildCagraPlan(input: AdaptiveSearchInputV1): CuvsBenchAnalysisPlanV1 {
  const recallHeavy = input.budget.exactPromotionTopK >= Math.max(input.budget.topK, 64);
  const smallBatch = input.budget.queryBatchSize <= 8;
  const largeCorpus = input.candidateCount >= 1_000_000;

  const graphDegree = recallHeavy ? 64 : 32;
  const intermediate = recallHeavy ? 128 : 64;
  const itopk = Math.max(32, Math.min(256, recallHeavy ? Math.max(input.budget.topK, 64) : input.budget.topK));

  return CuvsBenchAnalysisPlanV1Schema.parse({
    schema: 'atlas.cuvs-bench-analysis-plan.v1',
    algorithm: 'cuvs_cagra',
    atlasArtifactFormat: 'JSON',
    officialCuvsBenchAuthoringFormat: 'YAML',
    build: {
      graph_degree: graphDegree,
      intermediate_graph_degree: intermediate,
      graph_build_algo: largeCorpus ? 'NN_DESCENT' : 'IVF_PQ',
      dataset_memory_type: largeCorpus ? 'mmap' : 'device',
      npartitions: 1,
    },
    search: {
      itopk,
      search_width: recallHeavy ? 2 : 1,
      max_iterations: 0,
      algo: smallBatch ? 'multi_cta' : 'auto',
      query_memory_type: 'device',
      graph_memory_type: 'device',
      internal_dataset_memory_type: 'device',
    },
    exactOracle: {
      algorithm: 'cuvs_brute_force',
      required: true,
      topK: input.budget.exactPromotionTopK,
    },
    benchmarkAxes: ['recall', 'latency_ms', 'qps'],
    notes: [
      'Atlas emits JSON as its revisioned plan artifact; current cuVS Bench authoring configs are YAML.',
      'CAGRA and brute-force are executors of one semantic lane, not independent fusion votes.',
      'Search algo remains auto unless small query batches justify a MULTI_CTA benchmark challenger.',
    ],
  });
}

export function buildAdaptiveSearchPlan(value: AdaptiveSearchInputV1): AdaptiveSearchPlanV1 {
  const input = AdaptiveSearchInputV1Schema.parse(value);
  const intents = inferSearchIntents(input.queryText, {
    filteredFraction: input.filteredFraction,
    exactRequested: false,
  });
  const out: SearchAlgorithmRecommendationV1[] = [];

  for (const intent of intents) {
    if (intent === 'LOCAL_NEIGHBORHOOD') {
      out.push(recommendation('BFS', intent, 'graph', 92, ['UNWEIGHTED_LOCAL_REACHABILITY', 'BOUNDED_BY_HOP_BUDGET'], {
        maxDepth: input.budget.maxGraphHops,
        maxFanout: input.budget.maxGraphFanout,
      }));
      out.push(recommendation('TWO_HOP', intent, 'graph', 78, ['CHEAP_LOCAL_STRUCTURAL_FEATURE'], { maxDepth: Math.min(2, input.budget.maxGraphHops) }));
    }

    if (intent === 'PATH_FINDING') {
      if (input.sourceNodeKnown && input.targetNodeKnown && !input.graphWeighted) {
        out.push(recommendation('BIDIRECTIONAL_BFS', intent, 'graph', 96, ['SOURCE_AND_TARGET_KNOWN', 'UNWEIGHTED_GRAPH'], { maxDepth: input.budget.maxGraphHops }));
      }
      if (input.graphWeighted) {
        out.push(recommendation('SSSP_DIJKSTRA', intent, 'graph', 96, ['WEIGHTED_GRAPH_PATH_COST'], { maxDepth: input.budget.maxGraphHops }));
      } else {
        out.push(recommendation('BFS', intent, 'graph', 88, ['UNWEIGHTED_SHORTEST_HOP_PATH'], { maxDepth: input.budget.maxGraphHops }));
      }
    }

    if (intent === 'SEMANTIC_PATH') {
      out.push(recommendation('A_STAR', intent, 'graph', 94, ['SEMANTIC_HEURISTIC_PATH', 'HEURISTIC_MUST_REMAIN_ADMISSIBILITY_AWARE'], {
        maxDepth: input.budget.maxGraphHops,
        heuristic: 'semantic_distance',
      }));
    }

    if (intent === 'AUTHORITY') {
      out.push(recommendation('PAGERANK', intent, 'graph', 90, ['GLOBAL_AUTHORITY_FEATURE_ONLY'], { alpha: 0.85, featureOnly: true }));
      out.push(recommendation('HITS', intent, 'graph', 74, ['HUB_AND_AUTHORITY_CHALLENGER_FEATURE'], { featureOnly: true }));
    }

    if (intent === 'PERSONAL_AUTHORITY') {
      out.push(recommendation('PERSONALIZED_PAGERANK', intent, 'graph', 98, ['QUERY_OR_SEED_CONDITIONED_AUTHORITY'], { alpha: 0.85, featureOnly: true }));
    }

    if (intent === 'COMMUNITY') {
      out.push(recommendation('LEIDEN', intent, 'graph', 94, ['COMMUNITY_PARTITION_FEATURE', 'UNDIRECTED_WEIGHTED_PROJECTION_REQUIRED'], { resolution: 1, featureOnly: true }));
      out.push(recommendation('RANDOM_WALK', intent, 'graph', 65, ['EXPLORATION_CHALLENGER'], { maxDepth: input.budget.maxGraphHops }));
    }

    if (intent === 'STRUCTURAL_EXPANSION') {
      out.push(recommendation('K_HOP', intent, 'structural', 96, ['BOUNDED_REFERENCE_IMPORT_CALL_EXPANSION'], {
        maxDepth: input.budget.maxGraphHops,
        maxFanout: input.budget.maxGraphFanout,
      }));
      out.push(recommendation('BFS', intent, 'structural', 84, ['DETERMINISTIC_BREADTH_FIRST_FALLBACK'], { maxDepth: input.budget.maxGraphHops }));
    }

    if (intent === 'VECTOR_EXACT') {
      out.push(recommendation('CUVS_BRUTE_FORCE', intent, 'semantic', 100, ['EXACT_NEAREST_NEIGHBOR_ORACLE'], {
        topK: input.budget.exactPromotionTopK,
        representation: 'semantic_768',
      }, { exactOracle: true }));
    }

    if (intent === 'FILTERED_VECTOR') {
      out.push(recommendation('CUVS_BRUTE_FORCE', intent, 'semantic', input.filteredFraction >= 0.9 ? 98 : 86, ['HEAVILY_FILTERED_EXACT_SEARCH_CHALLENGER'], {
        topK: input.budget.exactPromotionTopK,
        filteredFraction: input.filteredFraction,
      }, { exactOracle: true }));
      out.push(recommendation('QDRANT_ANN', intent, 'semantic', 72, ['PERSISTENT_FILTERED_VECTOR_STORE'], { topK: input.budget.topK }));
    }

    if (intent === 'VECTOR_FAST') {
      out.push(recommendation('CUVS_CAGRA', intent, 'semantic', input.candidateCount >= 100_000 ? 97 : 82, ['GPU_GRAPH_ANN_EXECUTOR', 'EXACT_PROMOTION_REQUIRED'], {
        topK: input.budget.topK,
        corpusRows: input.candidateCount,
      }));
      out.push(recommendation('QDRANT_ANN', intent, 'semantic', 88, ['PERSISTENT_CANONICAL_VECTOR_RETRIEVAL_EXECUTOR'], { topK: input.budget.topK }));
      out.push(recommendation('CUVS_BRUTE_FORCE', 'VECTOR_EXACT', 'semantic', 76, ['CORRECTNESS_ORACLE_FOR_CAGRA_RECALL'], {
        topK: input.budget.exactPromotionTopK,
      }, { exactOracle: true }));
    }
  }

  const dedup = new Map<string, SearchAlgorithmRecommendationV1>();
  for (const row of out) {
    const key = `${row.algorithm}\0${row.intent}\0${row.logicalLane}`;
    const previous = dedup.get(key);
    if (!previous || row.priorityPercent > previous.priorityPercent) dedup.set(key, row);
  }
  const recommendations = [...dedup.values()].sort(
    (a, b) => b.priorityPercent - a.priorityPercent || a.algorithm.localeCompare(b.algorithm),
  );

  return AdaptiveSearchPlanV1Schema.parse({
    schema: 'atlas.adaptive-search-plan.v1',
    requestId: input.requestId,
    queryHash: hash16(input.queryText),
    intents,
    recommendations,
    cuvsBench: buildCagraPlan(input),
    exactPromotionTopK: input.budget.exactPromotionTopK,
    laneVoteInvariant: 'ONE_VOTE_PER_LOGICAL_LANE',
    graphNeverAnswersDirectly: true,
    producerRevision: input.producerRevision,
  });
}

export function analyzeCuvsParetoFrontier(points: readonly CuvsBenchmarkPointV1[]): CuvsParetoAnalysisV1 {
  const parsed = points.map((point) => CuvsBenchmarkPointV1Schema.parse(point));
  const recallLatencyFrontier = parsed.filter((point) => !parsed.some((other) =>
    other.configId !== point.configId
    && other.recall >= point.recall
    && other.latencyMs <= point.latencyMs
    && (other.recall > point.recall || other.latencyMs < point.latencyMs),
  )).sort((a, b) => a.latencyMs - b.latencyMs || b.recall - a.recall || a.configId.localeCompare(b.configId));

  const recallQpsFrontier = parsed.filter((point) => !parsed.some((other) =>
    other.configId !== point.configId
    && other.recall >= point.recall
    && other.qps >= point.qps
    && (other.recall > point.recall || other.qps > point.qps),
  )).sort((a, b) => b.qps - a.qps || b.recall - a.recall || a.configId.localeCompare(b.configId));

  return CuvsParetoAnalysisV1Schema.parse({
    schema: 'atlas.cuvs-pareto-analysis.v1',
    recallLatencyFrontier,
    recallQpsFrontier,
  });
}

export function buildTangPromotionRecommendation(input: {
  packetKeys: readonly string[];
  matrixRows: readonly (readonly number[])[];
  diagnostics: MatrixDiagnosticsV1 | null;
  policy?: TangPromotionPolicyV1;
}): TangPromotionRecommendationV1 {
  if (input.packetKeys.length !== input.matrixRows.length) {
    throw new Error('TANG_PACKET_MATRIX_ROW_MISMATCH');
  }
  const columnCount = input.matrixRows[0]?.length ?? 0;
  if (!columnCount || input.matrixRows.some((row) => row.length !== columnCount)) {
    throw new Error('TANG_MATRIX_SHAPE_INVALID');
  }

  const policy = TangPromotionPolicyV1Schema.parse(input.policy ?? DEFAULT_TANG_POLICY);
  const diagnostics = input.diagnostics ? MatrixDiagnosticsV1Schema.parse(input.diagnostics) : null;
  const norms = input.matrixRows.map((row) => row.reduce((sum, value) => sum + value * value, 0));
  const total = norms.reduce((sum, value) => sum + value, 0);
  const rankedIndices = norms
    .map((squaredNorm, index) => ({ index, squaredNorm }))
    .sort((a, b) => b.squaredNorm - a.squaredNorm || input.packetKeys[a.index].localeCompare(input.packetKeys[b.index]));
  const priority = new Map(rankedIndices.map((row, index) => [row.index, index + 1]));

  const rows = input.packetKeys.map((packetKey, index) => TangPromotionRowV1Schema.parse({
    packetKey,
    squaredNorm: norms[index],
    samplingProbability: total > 0 ? norms[index] / total : 1 / input.packetKeys.length,
    deterministicPriority: priority.get(index) ?? index + 1,
  })).sort((a, b) => a.deterministicPriority - b.deterministicPriority);

  if (!diagnostics?.measured || diagnostics.effectiveRank == null || diagnostics.retainedEnergyPercent == null || diagnostics.conditionNumber == null) {
    return TangPromotionRecommendationV1Schema.parse({
      schema: 'atlas.tang-promotion-recommendation.v1',
      eligible: false,
      status: 'MEASURE_FIRST',
      diagnosticsMeasured: false,
      effectiveRankRatio: null,
      reasonCodes: ['LOW_RANK_DIAGNOSTICS_REQUIRED_BEFORE_EWIN_TANG_PROMOTION'],
      rows,
      selectedPacketKeys: [],
      stochasticSamplingStillRequiredForTangFaithfulExecution: true,
      canonicalWritesAllowed: false,
    });
  }

  const effectiveRankRatio = diagnostics.effectiveRank / diagnostics.columnCount;
  const eligible = effectiveRankRatio <= policy.maxEffectiveRankRatio
    && diagnostics.retainedEnergyPercent >= policy.minRetainedEnergyPercent
    && diagnostics.conditionNumber <= policy.maxConditionNumber;

  return TangPromotionRecommendationV1Schema.parse({
    schema: 'atlas.tang-promotion-recommendation.v1',
    eligible,
    status: eligible ? 'ELIGIBLE' : 'LOW_RANK_NOT_SUPPORTED',
    diagnosticsMeasured: true,
    effectiveRankRatio,
    reasonCodes: eligible
      ? ['MEASURED_LOW_EFFECTIVE_RANK', 'RETAINED_ENERGY_THRESHOLD_MET', 'CONDITION_NUMBER_WITHIN_POLICY']
      : ['MEASURED_MATRIX_DOES_NOT_SATISFY_LOW_RANK_PROMOTION_POLICY'],
    rows,
    selectedPacketKeys: eligible ? rows.slice(0, Math.min(policy.promotionCount, rows.length)).map((row) => row.packetKey) : [],
    stochasticSamplingStillRequiredForTangFaithfulExecution: true,
    canonicalWritesAllowed: false,
  });
}

export function buildSearchPolicyFeatureMatrix(input: {
  baseRows: readonly PacketFeatureRow[];
  policyRows: readonly SearchPolicyCandidateFeaturesV1[];
}): SearchPolicyFeatureMatrixV1 {
  if (input.baseRows.length !== input.policyRows.length) {
    throw new Error('SEARCH_POLICY_FEATURE_ROW_COUNT_MISMATCH');
  }
  const policyByPacket = new Map(input.policyRows.map((row) => {
    const parsed = SearchPolicyCandidateFeaturesV1Schema.parse(row);
    return [parsed.packetKey, parsed] as const;
  }));
  if (policyByPacket.size !== input.policyRows.length) {
    throw new Error('SEARCH_POLICY_DUPLICATE_POLICY_PACKET_KEY');
  }

  const values = new Float32Array(input.baseRows.length * SEARCH_POLICY_FEATURE_COUNT);
  const packetKeys: string[] = [];

  for (let i = 0; i < input.baseRows.length; i += 1) {
    const base = input.baseRows[i];
    const policy = policyByPacket.get(base.packetKey);
    if (!policy) throw new Error(`SEARCH_POLICY_MISSING_POLICY_ROW:${base.packetKey}`);
    packetKeys.push(base.packetKey);
    const row = [
      clamp01(base.semanticScore),
      clamp01(base.centroidAffinity),
      clamp01(base.quaternionAffinity),
      clamp01(base.graphAuthority),
      clamp01(base.demandUtility),
      clamp01(base.executionUtility),
      clamp01(base.recency),
      clamp01(base.cacheHotness),
      clamp01(base.normalizedCost),
      policy.hopProximity,
      policy.pathCostUtility,
      policy.communityOverlap,
      policy.pprAffinity,
      policy.contextWindowUtility,
      policy.tangPromotionProbability,
      policy.exactEvidence,
    ];
    values.set(row, i * SEARCH_POLICY_FEATURE_COUNT);
  }

  return {
    schema: 'atlas.search-policy-feature-matrix.v1',
    packetKeys,
    featureNames: SEARCH_POLICY_FEATURE_NAMES,
    rows: packetKeys.length,
    cols: SEARCH_POLICY_FEATURE_COUNT,
    values,
    canonicalBaseFeatureCount: PACKET_FEATURE_NAMES.length,
    policyFeatureCount: SEARCH_POLICY_FEATURE_COUNT - PACKET_FEATURE_NAMES.length,
  };
}

export function readinessPercentFromRecommendation(row: SearchAlgorithmRecommendationV1): number {
  return percent(row.priorityPercent / 100);
}
