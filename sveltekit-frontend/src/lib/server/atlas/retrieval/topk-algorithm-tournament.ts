import { z } from 'zod';

/**
 * Query-conditioned champion/challenger evaluation for retrieval/rerank plans.
 *
 * "GAN-style" here means adversarial/red-team tournament generation, not a
 * literal generative-adversarial network. The tournament never creates extra
 * retrieval votes and never replaces exact promotion. It evaluates alternative
 * executors/plans against a common reference under explicit quality/resource
 * constraints.
 */

export const TopKTournamentFamilySchema = z.enum([
  'SEMANTIC_EXECUTOR',
  'LEXICAL_EXECUTOR',
  'FUSION_PLAN',
  'RERANK_PLAN',
  'END_TO_END_RETRIEVAL_PLAN',
]);
export type TopKTournamentFamily = z.infer<typeof TopKTournamentFamilySchema>;

export const TopKTournamentAlgorithmIdSchema = z.enum([
  'CUVS_BRUTE_FORCE',
  'CUVS_CAGRA',
  'CUVS_IVF_FLAT',
  'CUVS_IVF_PQ',
  'HNSW',
  'TURBOVEC',
  'DISKANN_MEMORY',
  'DISKANN_SSD',
  'QDRANT_VECTOR',
  'BM25',
  'BM42',
  'POSTGRES_FTS',
  'HYBRID_RRF',
  'CROSS_ENCODER_RERANK',
  'COMPACT_STREAMING_TOPK',
]);
export type TopKTournamentAlgorithmId = z.infer<typeof TopKTournamentAlgorithmIdSchema>;

export const TopKAdversarialScenarioSchema = z.enum([
  'ORIGINAL',
  'TYPO_NOISE',
  'LEXICAL_AMBIGUITY',
  'OUT_OF_DOMAIN',
  'HIGH_FILTER_SELECTIVITY',
  'GRAPH_HEAVY',
  'SPARSE_RELEVANCE',
  'DUPLICATE_DISTANCE_TIES',
  'CACHE_COLD',
  'CACHE_WARM',
  'LOW_VRAM',
  'HOST_MEMORY_PRESSURE',
  'LONG_CONTEXT',
  'STRICT_LATENCY',
]);
export type TopKAdversarialScenario = z.infer<typeof TopKAdversarialScenarioSchema>;

export const TournamentLogicalLaneSchema = z.enum(['lexical', 'semantic', 'ast', 'graph', 'fusion', 'rerank']);

export const TopKTournamentContestantV1Schema = z.object({
  contestantId: z.string().min(1),
  family: TopKTournamentFamilySchema,
  algorithmId: TopKTournamentAlgorithmIdSchema,
  logicalLane: TournamentLogicalLaneSchema,
  executorId: z.string().min(1),
  implementationRevision: z.string().min(1),
  parameterRevision: z.string().min(1),
  parameterChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  exactness: z.enum(['EXACT', 'APPROXIMATE', 'DERIVED_RERANK', 'NOT_APPLICABLE']),
  exactPromotionStillRequired: z.boolean(),
}).strict();
export type TopKTournamentContestantV1 = z.infer<typeof TopKTournamentContestantV1Schema>;

export const TopKRelevanceJudgmentV1Schema = z.object({
  canonicalId: z.string().min(1),
  grade: z.number().int().min(0).max(4),
}).strict();

export const TopKTournamentReferenceV1Schema = z.object({
  schema: z.literal('atlas.topk-tournament-reference.v1'),
  queryId: z.string().min(1),
  k: z.number().int().positive(),
  exactNeighborCanonicalIds: z.array(z.string().min(1)),
  relevanceJudgments: z.array(TopKRelevanceJudgmentV1Schema),
  exactOracle: z.enum(['CUVS_BRUTE_FORCE', 'CANONICAL_EXACT_SERVICE', 'NONE']),
  referenceRevision: z.string().min(1),
}).strict();
export type TopKTournamentReferenceV1 = z.infer<typeof TopKTournamentReferenceV1Schema>;

export const TopKResourceEnvelopeV1Schema = z.object({
  maxLatencyMs: z.number().finite().positive(),
  maxPeakVramBytes: z.number().int().nonnegative(),
  maxHostMemoryBytes: z.number().int().nonnegative(),
  maxBytesMoved: z.number().int().nonnegative(),
  maxToolCalls: z.number().int().nonnegative(),
}).strict();
export type TopKResourceEnvelopeV1 = z.infer<typeof TopKResourceEnvelopeV1Schema>;

export const TopKQueryTournamentCaseV1Schema = z.object({
  schema: z.literal('atlas.topk-query-tournament-case.v1'),
  queryId: z.string().min(1),
  queryClass: z.string().min(1),
  domainClass: z.string().min(1),
  scenario: TopKAdversarialScenarioSchema,
  k: z.number().int().positive(),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable(),
  representationRevision: z.string().min(1),
  resourceEnvelope: TopKResourceEnvelopeV1Schema,
  mutationSensitive: z.boolean(),
  producerRevision: z.string().min(1),
}).strict();
export type TopKQueryTournamentCaseV1 = z.infer<typeof TopKQueryTournamentCaseV1Schema>;

export const TopKTournamentRunObservationV1Schema = z.object({
  schema: z.literal('atlas.topk-tournament-run.v1'),
  queryId: z.string().min(1),
  contestantId: z.string().min(1),
  resultCanonicalIds: z.array(z.string().min(1)),
  latencyMs: z.number().finite().nonnegative(),
  peakVramBytes: z.number().int().nonnegative(),
  peakHostMemoryBytes: z.number().int().nonnegative(),
  bytesMoved: z.number().int().nonnegative(),
  cacheHitRatio: z.number().finite().min(0).max(1),
  toolCalls: z.number().int().nonnegative(),
  validationSuccess: z.boolean(),
  executionReceiptRefs: z.array(z.string().min(1)),
}).strict();
export type TopKTournamentRunObservationV1 = z.infer<typeof TopKTournamentRunObservationV1Schema>;

export const TopKTournamentScoringPolicyV1Schema = z.object({
  schema: z.literal('atlas.topk-tournament-scoring-policy.v1'),
  minExactRecallAtK: z.number().finite().min(0).max(1),
  minNdcgAtK: z.number().finite().min(0).max(1),
  requireValidationSuccess: z.boolean(),
  weights: z.object({
    exactRecall: z.number().finite().nonnegative(),
    ndcg: z.number().finite().nonnegative(),
    reciprocalRank: z.number().finite().nonnegative(),
    cacheUtility: z.number().finite().nonnegative(),
    latencyPenalty: z.number().finite().nonnegative(),
    vramPenalty: z.number().finite().nonnegative(),
    hostMemoryPenalty: z.number().finite().nonnegative(),
    transferPenalty: z.number().finite().nonnegative(),
    toolCallPenalty: z.number().finite().nonnegative(),
  }).strict(),
  policyRevision: z.string().min(1),
}).strict();
export type TopKTournamentScoringPolicyV1 = z.infer<typeof TopKTournamentScoringPolicyV1Schema>;

export type TopKTournamentMetricsV1 = {
  exactRecallAtK: number;
  ndcgAtK: number;
  reciprocalRank: number;
};

function uniquePrefix(ids: readonly string[], k: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= k) break;
  }
  return out;
}

export function exactRecallAtK(resultIds: readonly string[], exactIds: readonly string[], k: number): number {
  if (!Number.isInteger(k) || k <= 0) throw new Error('k must be positive');
  const exact = uniquePrefix(exactIds, k);
  if (exact.length === 0) return 1;
  const got = new Set(uniquePrefix(resultIds, k));
  let hits = 0;
  for (const id of exact) if (got.has(id)) hits += 1;
  return hits / exact.length;
}

export function reciprocalRankAtK(resultIds: readonly string[], judgments: readonly z.infer<typeof TopKRelevanceJudgmentV1Schema>[], k: number): number {
  const relevant = new Set(judgments.filter((j) => j.grade > 0).map((j) => j.canonicalId));
  const result = uniquePrefix(resultIds, k);
  const index = result.findIndex((id) => relevant.has(id));
  return index < 0 ? 0 : 1 / (index + 1);
}

export function ndcgAtK(resultIds: readonly string[], judgments: readonly z.infer<typeof TopKRelevanceJudgmentV1Schema>[], k: number): number {
  const grades = new Map(judgments.map((j) => [j.canonicalId, j.grade]));
  const result = uniquePrefix(resultIds, k);
  const dcg = result.reduce((sum, id, index) => {
    const grade = grades.get(id) ?? 0;
    return sum + (Math.pow(2, grade) - 1) / Math.log2(index + 2);
  }, 0);
  const ideal = [...judgments]
    .sort((a, b) => b.grade - a.grade || a.canonicalId.localeCompare(b.canonicalId))
    .slice(0, k)
    .reduce((sum, row, index) => sum + (Math.pow(2, row.grade) - 1) / Math.log2(index + 2), 0);
  return ideal <= 0 ? 1 : dcg / ideal;
}

export function computeTournamentMetrics(input: {
  run: TopKTournamentRunObservationV1;
  reference: TopKTournamentReferenceV1;
}): TopKTournamentMetricsV1 {
  const run = TopKTournamentRunObservationV1Schema.parse(input.run);
  const reference = TopKTournamentReferenceV1Schema.parse(input.reference);
  if (run.queryId !== reference.queryId) throw new Error('tournament run/reference query mismatch');
  return {
    exactRecallAtK: reference.exactOracle === 'NONE'
      ? 1
      : exactRecallAtK(run.resultCanonicalIds, reference.exactNeighborCanonicalIds, reference.k),
    ndcgAtK: ndcgAtK(run.resultCanonicalIds, reference.relevanceJudgments, reference.k),
    reciprocalRank: reciprocalRankAtK(run.resultCanonicalIds, reference.relevanceJudgments, reference.k),
  };
}

export type ScoredTopKTournamentRunV1 = {
  contestantId: string;
  eligible: boolean;
  utility: number;
  metrics: TopKTournamentMetricsV1;
  violations: string[];
  approximateChampionRequiresExactPromotion: boolean;
};

function ratio(value: number, budget: number): number {
  if (budget <= 0) return value <= 0 ? 0 : 1;
  return value / budget;
}

export function scoreTopKTournamentRun(input: {
  tournamentCase: TopKQueryTournamentCaseV1;
  contestant: TopKTournamentContestantV1;
  run: TopKTournamentRunObservationV1;
  reference: TopKTournamentReferenceV1;
  policy: TopKTournamentScoringPolicyV1;
}): ScoredTopKTournamentRunV1 {
  const tc = TopKQueryTournamentCaseV1Schema.parse(input.tournamentCase);
  const contestant = TopKTournamentContestantV1Schema.parse(input.contestant);
  const run = TopKTournamentRunObservationV1Schema.parse(input.run);
  const reference = TopKTournamentReferenceV1Schema.parse(input.reference);
  const policy = TopKTournamentScoringPolicyV1Schema.parse(input.policy);
  if (tc.queryId !== run.queryId || tc.queryId !== reference.queryId) throw new Error('query identity mismatch');
  if (contestant.contestantId !== run.contestantId) throw new Error('contestant identity mismatch');

  const metrics = computeTournamentMetrics({ run, reference });
  const violations: string[] = [];
  if (reference.exactOracle !== 'NONE' && metrics.exactRecallAtK < policy.minExactRecallAtK) violations.push('MIN_EXACT_RECALL');
  if (metrics.ndcgAtK < policy.minNdcgAtK) violations.push('MIN_NDCG');
  if (policy.requireValidationSuccess && !run.validationSuccess) violations.push('VALIDATION_FAILED');
  if (run.latencyMs > tc.resourceEnvelope.maxLatencyMs) violations.push('LATENCY_BUDGET');
  if (run.peakVramBytes > tc.resourceEnvelope.maxPeakVramBytes) violations.push('VRAM_BUDGET');
  if (run.peakHostMemoryBytes > tc.resourceEnvelope.maxHostMemoryBytes) violations.push('HOST_MEMORY_BUDGET');
  if (run.bytesMoved > tc.resourceEnvelope.maxBytesMoved) violations.push('TRANSFER_BUDGET');
  if (run.toolCalls > tc.resourceEnvelope.maxToolCalls) violations.push('TOOL_CALL_BUDGET');

  const w = policy.weights;
  const quality = w.exactRecall * metrics.exactRecallAtK
    + w.ndcg * metrics.ndcgAtK
    + w.reciprocalRank * metrics.reciprocalRank
    + w.cacheUtility * run.cacheHitRatio;
  const cost = w.latencyPenalty * ratio(run.latencyMs, tc.resourceEnvelope.maxLatencyMs)
    + w.vramPenalty * ratio(run.peakVramBytes, tc.resourceEnvelope.maxPeakVramBytes)
    + w.hostMemoryPenalty * ratio(run.peakHostMemoryBytes, tc.resourceEnvelope.maxHostMemoryBytes)
    + w.transferPenalty * ratio(run.bytesMoved, tc.resourceEnvelope.maxBytesMoved)
    + w.toolCallPenalty * ratio(run.toolCalls, Math.max(1, tc.resourceEnvelope.maxToolCalls));

  return {
    contestantId: contestant.contestantId,
    eligible: violations.length === 0,
    utility: Number((quality - cost).toFixed(9)),
    metrics,
    violations,
    approximateChampionRequiresExactPromotion: contestant.exactness !== 'EXACT'
      && (contestant.exactPromotionStillRequired || tc.mutationSensitive),
  };
}

export function rankTopKTournament(input: {
  tournamentCase: TopKQueryTournamentCaseV1;
  contestants: readonly TopKTournamentContestantV1[];
  runs: readonly TopKTournamentRunObservationV1[];
  reference: TopKTournamentReferenceV1;
  policy: TopKTournamentScoringPolicyV1;
}): ScoredTopKTournamentRunV1[] {
  const byRun = new Map(input.runs.map((run) => [run.contestantId, run]));
  const scored = input.contestants.map((contestant) => {
    const run = byRun.get(contestant.contestantId);
    if (!run) throw new Error(`missing tournament run for ${contestant.contestantId}`);
    return scoreTopKTournamentRun({
      tournamentCase: input.tournamentCase,
      contestant,
      run,
      reference: input.reference,
      policy: input.policy,
    });
  });
  return scored.sort((a, b) =>
    Number(b.eligible) - Number(a.eligible)
    || b.utility - a.utility
    || b.metrics.exactRecallAtK - a.metrics.exactRecallAtK
    || a.contestantId.localeCompare(b.contestantId));
}

export const TopKTournamentPromotionV1Schema = z.object({
  schema: z.literal('atlas.topk-tournament-promotion.v1'),
  queryClass: z.string().min(1),
  domainClass: z.string().min(1),
  scenario: TopKAdversarialScenarioSchema,
  championContestantId: z.string().min(1),
  promotionRole: z.enum(['SHADOW_ONLY', 'PREFERRED_EXECUTOR', 'PRODUCTION_CHAMPION']),
  exactPromotionPreserved: z.literal(true),
  heldOutProofRequired: z.literal(true),
  rollbackRequired: z.literal(true),
  policyRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();

export function nominateTopKTournamentChampion(input: {
  tournamentCase: TopKQueryTournamentCaseV1;
  ranking: readonly ScoredTopKTournamentRunV1[];
  policyRevision: string;
  producerRevision: string;
  allowProductionRole?: boolean;
}) {
  const tc = TopKQueryTournamentCaseV1Schema.parse(input.tournamentCase);
  const champion = input.ranking.find((row) => row.eligible);
  if (!champion) throw new Error('no eligible tournament champion');
  const promotionRole = input.allowProductionRole && !champion.approximateChampionRequiresExactPromotion
    ? 'PRODUCTION_CHAMPION'
    : 'SHADOW_ONLY';
  return TopKTournamentPromotionV1Schema.parse({
    schema: 'atlas.topk-tournament-promotion.v1',
    queryClass: tc.queryClass,
    domainClass: tc.domainClass,
    scenario: tc.scenario,
    championContestantId: champion.contestantId,
    promotionRole,
    exactPromotionPreserved: true,
    heldOutProofRequired: true,
    rollbackRequired: true,
    policyRevision: input.policyRevision,
    producerRevision: input.producerRevision,
  });
}
