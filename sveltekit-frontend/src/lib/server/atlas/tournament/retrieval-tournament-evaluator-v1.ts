/**
 * retrieval-tournament-evaluator-v1.ts
 *
 * Parent Atlas: Unified Binary Retrieval, GraphRAG, and AI Tournament Architecture.
 * Implements the 5-Competitor "Street Fighter / SNES" evaluation framework:
 *
 *   - Fighter A: PostgreSQL 18 Lexical + GIN/B-tree Prefilter
 *   - Fighter B: Canonical Dense Vector (Qdrant / pgvector 768-D)
 *   - Fighter C: Aligned Bitset + Hardware AVX2 POPCNT Hamming Scan
 *   - Fighter D: GraphRAG Traversal (CSR BFS cursor + PageRank / PPR)
 *   - Fighter E: SearchRuntime Production Hybrid (Dual-Lane + Bounded Min-Heap Top-K + RRF Fusion)
 *
 * Deterministic FSM:
 *   REGISTERED -> VALIDATED -> CPU_VS_CPU -> EVALUATED -> SHADOW_CHALLENGER -> HUMAN_REVIEW
 *
 * Invariants:
 *   - writesPerformed: false
 *   - canonicalStoreMutated: false
 *   - Strict immutable SHA-256 receipt generation
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const RETRIEVAL_TOURNAMENT_RECEIPT_SCHEMA = 'atlas.retrieval-tournament-receipt.v1' as const;

export const FighterIdSchema = z.enum([
  'fighter_a_pg_lexical',
  'fighter_b_dense_vector',
  'fighter_c_avx2_hamming',
  'fighter_d_graphrag_csr',
  'fighter_e_hybrid_rrf',
]);
export type FighterId = z.infer<typeof FighterIdSchema>;

export const TournamentFsmStateSchema = z.enum([
  'REGISTERED',
  'VALIDATED',
  'CPU_VS_CPU',
  'EVALUATED',
  'SHADOW_CHALLENGER',
  'HUMAN_REVIEW',
  'PROMOTED',
  'REJECTED',
]);
export type TournamentFsmState = z.infer<typeof TournamentFsmStateSchema>;

export const CompetitorClassSchema = z.enum([
  'LEXICAL_BTREE',
  'DENSE_VECTOR',
  'AVX2_HAMMING',
  'GRAPHRAG_CSR',
  'HYBRID_RRF',
]);
export type CompetitorClass = z.infer<typeof CompetitorClassSchema>;

export const HardwareRequirementSchema = z.enum(['CPU', 'SIMD_AVX2', 'GPU_OPTIONAL']);
export type HardwareRequirement = z.infer<typeof HardwareRequirementSchema>;

export const CompetitorProfileSchema = z
  .object({
    id: FighterIdSchema,
    name: z.string().min(1),
    fighterClass: CompetitorClassSchema,
    hardwareRequirement: HardwareRequirementSchema,
    description: z.string().min(1),
    laneWeight: z.number().nonnegative().default(1.0),
  })
  .strict();
export type CompetitorProfile = z.infer<typeof CompetitorProfileSchema>;

export const RetrievalBenchmarkQuerySchema = z
  .object({
    queryId: z.string().min(1),
    queryText: z.string().min(1),
    domain: z.string().min(1),
    groundTruthCandidateIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type RetrievalBenchmarkQuery = z.infer<typeof RetrievalBenchmarkQuerySchema>;

export const CompetitorQueryResultSchema = z
  .object({
    queryId: z.string().min(1),
    retrievedCandidateIds: z.array(z.string()),
    scores: z.array(z.number()),
    latencyMs: z.number().nonnegative(),
    memoryBytesEstimate: z.number().int().nonnegative(),
  })
  .strict();
export type CompetitorQueryResult = z.infer<typeof CompetitorQueryResultSchema>;

export const CompetitorBenchmarkMetricsSchema = z
  .object({
    fighterId: FighterIdSchema,
    recallAt10: z.number().min(0).max(1),
    ndcgAt10: z.number().min(0).max(1),
    p95LatencyMs: z.number().nonnegative(),
    avgLatencyMs: z.number().nonnegative(),
    peakMemoryBytes: z.number().int().nonnegative(),
    compositeScore: z.number().finite(),
    passedSla: z.boolean(),
  })
  .strict();
export type CompetitorBenchmarkMetrics = z.infer<typeof CompetitorBenchmarkMetricsSchema>;

export const MatchupResultSchema = z
  .object({
    fighterA: FighterIdSchema,
    fighterB: FighterIdSchema,
    winnerId: FighterIdSchema,
    scoreDiff: z.number().finite(),
    reasoning: z.string(),
  })
  .strict();
export type MatchupResult = z.infer<typeof MatchupResultSchema>;

export const RetrievalTournamentReceiptV1Schema = z
  .object({
    schema: z.literal(RETRIEVAL_TOURNAMENT_RECEIPT_SCHEMA),
    tournamentId: z.string().min(1),
    receiptChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    workspaceRevision: z.string().min(1),
    fsmFinalState: TournamentFsmStateSchema,
    fsmHistory: z.array(
      z.object({
        from: TournamentFsmStateSchema,
        to: TournamentFsmStateSchema,
        timestamp: z.string().datetime(),
      })
    ),
    competitors: z.array(CompetitorProfileSchema).min(2),
    metrics: z.array(CompetitorBenchmarkMetricsSchema).min(2),
    matchups: z.array(MatchupResultSchema),
    winnerFighterId: FighterIdSchema,
    winnerMetrics: CompetitorBenchmarkMetricsSchema,
    slaTargetMs: z.number().positive(),
    canPromote: z.boolean(),
    reviewStatus: z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']),
    reviewedBy: z.string().nullable(),
    writesPerformed: z.literal(false),
    canonicalStoreMutated: z.literal(false),
  })
  .strict();
export type RetrievalTournamentReceiptV1 = z.infer<typeof RetrievalTournamentReceiptV1Schema>;

export const STANDARD_FIGHTERS: readonly CompetitorProfile[] = [
  {
    id: 'fighter_a_pg_lexical',
    name: 'PostgreSQL 18 Lexical + GIN/B-tree',
    fighterClass: 'LEXICAL_BTREE',
    hardwareRequirement: 'CPU',
    description: 'PostgreSQL 18 canonical GIN tsvector and B-tree prefilter lane',
    laneWeight: 1.0,
  },
  {
    id: 'fighter_b_dense_vector',
    name: 'Canonical Dense Vector (Qdrant 768-D)',
    fighterClass: 'DENSE_VECTOR',
    hardwareRequirement: 'CPU',
    description: 'Canonical semantic_768 EmbeddingGemma vector projection',
    laneWeight: 1.2,
  },
  {
    id: 'fighter_c_avx2_hamming',
    name: 'Aligned Bitset + AVX2 POPCNT',
    fighterClass: 'AVX2_HAMMING',
    hardwareRequirement: 'SIMD_AVX2',
    description: 'Hardware-accelerated aligned bitset scan with AVX2 Hamming distance',
    laneWeight: 1.1,
  },
  {
    id: 'fighter_d_graphrag_csr',
    name: 'GraphRAG CSR BFS + PageRank',
    fighterClass: 'GRAPHRAG_CSR',
    hardwareRequirement: 'CPU',
    description: 'Compressed Sparse Row graph traversal with personalized PageRank',
    laneWeight: 1.15,
  },
  {
    id: 'fighter_e_hybrid_rrf',
    name: 'SearchRuntime Production Hybrid (RRF)',
    fighterClass: 'HYBRID_RRF',
    hardwareRequirement: 'CPU',
    description: 'Production dual-lane RRF fusion with bounded min-heap Top-K paginator',
    laneWeight: 1.3,
  },
];

/**
 * Valid transitions for Tournament FSM.
 */
const VALID_TRANSITIONS: Record<TournamentFsmState, readonly TournamentFsmState[]> = {
  REGISTERED: ['VALIDATED', 'REJECTED'],
  VALIDATED: ['CPU_VS_CPU', 'REJECTED'],
  CPU_VS_CPU: ['EVALUATED', 'REJECTED'],
  EVALUATED: ['SHADOW_CHALLENGER', 'REJECTED'],
  SHADOW_CHALLENGER: ['HUMAN_REVIEW', 'REJECTED'],
  HUMAN_REVIEW: ['PROMOTED', 'REJECTED'],
  PROMOTED: [],
  REJECTED: [],
};

export class TournamentFsm {
  private _state: TournamentFsmState = 'REGISTERED';
  private _history: Array<{
    from: TournamentFsmState;
    to: TournamentFsmState;
    timestamp: string;
  }> = [];

  get state(): TournamentFsmState {
    return this._state;
  }

  get history(): ReadonlyArray<{
    from: TournamentFsmState;
    to: TournamentFsmState;
    timestamp: string;
  }> {
    return this._history;
  }

  transitionTo(next: TournamentFsmState, nowIso = new Date().toISOString()): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.includes(next)) {
      throw new Error(
        `INVALID_FSM_TRANSITION: Cannot transition from '${this._state}' to '${next}'. Allowed: [${allowed.join(', ')}]`
      );
    }
    this._history.push({
      from: this._state,
      to: next,
      timestamp: nowIso,
    });
    this._state = next;
  }
}

/**
 * Computes Recall@K:
 * Proportion of relevant documents (groundTruth) retrieved in top K.
 */
export function calculateRecallAtK(
  retrieved: readonly string[],
  groundTruth: readonly string[],
  k = 10
): number {
  if (groundTruth.length === 0) return 1.0;
  const topKRetrieved = new Set(retrieved.slice(0, k));
  let hits = 0;
  for (const id of groundTruth) {
    if (topKRetrieved.has(id)) hits += 1;
  }
  return Math.min(1.0, hits / groundTruth.length);
}

/**
 * Computes nDCG@K (Normalized Discounted Cumulative Gain):
 * Evaluates ranking order relevance.
 */
export function calculateNdcgAtK(
  retrieved: readonly string[],
  groundTruth: readonly string[],
  k = 10
): number {
  if (groundTruth.length === 0) return 1.0;
  const groundTruthSet = new Set(groundTruth);
  const topK = retrieved.slice(0, k);

  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    const isRel = groundTruthSet.has(topK[i]) ? 1 : 0;
    if (isRel > 0) {
      dcg += isRel / Math.log2(i + 2); // i=0 => log2(2) = 1
    }
  }

  // Calculate ideal DCG (IDCG)
  const idealCount = Math.min(k, groundTruth.length);
  let idcg = 0;
  for (let i = 0; i < idealCount; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  if (idcg === 0) return 0.0;
  return Math.min(1.0, dcg / idcg);
}

/**
 * Computes percentile from an array of numbers.
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Evaluates a single competitor across all benchmark queries.
 */
export function evaluateCompetitorRun(
  fighter: CompetitorProfile,
  queryResults: readonly CompetitorQueryResult[],
  benchmarkQueries: readonly RetrievalBenchmarkQuery[],
  slaTargetMs = 50.0
): CompetitorBenchmarkMetrics {
  const queryMap = new Map(benchmarkQueries.map((q) => [q.queryId, q]));
  const recalls: number[] = [];
  const ndcgs: number[] = [];
  const latencies: number[] = [];
  let peakMemory = 0;

  for (const result of queryResults) {
    const q = queryMap.get(result.queryId);
    if (!q) continue;

    recalls.push(calculateRecallAtK(result.retrievedCandidateIds, q.groundTruthCandidateIds, 10));
    ndcgs.push(calculateNdcgAtK(result.retrievedCandidateIds, q.groundTruthCandidateIds, 10));
    latencies.push(result.latencyMs);
    if (result.memoryBytesEstimate > peakMemory) {
      peakMemory = result.memoryBytesEstimate;
    }
  }

  const avgRecall = recalls.length > 0 ? recalls.reduce((a, b) => a + b, 0) / recalls.length : 0;
  const avgNdcg = ndcgs.length > 0 ? ndcgs.reduce((a, b) => a + b, 0) / ndcgs.length : 0;
  const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p95Latency = calculatePercentile(latencies, 95);
  const passedSla = p95Latency <= slaTargetMs;

  // Composite Score Formula:
  // 50% nDCG@10 + 30% Recall@10 + 20% Latency Penalty Factor * laneWeight
  const latencyPenaltyFactor = Math.max(0, 1 - p95Latency / (slaTargetMs * 2));
  const qualityScore = (0.5 * avgNdcg + 0.3 * avgRecall + 0.2 * latencyPenaltyFactor) * fighter.laneWeight;
  const compositeScore = Math.round(qualityScore * 1000) / 1000;

  return {
    fighterId: fighter.id,
    recallAt10: Math.round(avgRecall * 1000) / 1000,
    ndcgAt10: Math.round(avgNdcg * 1000) / 1000,
    p95LatencyMs: Math.round(p95Latency * 100) / 100,
    avgLatencyMs: Math.round(avgLatency * 100) / 100,
    peakMemoryBytes: peakMemory,
    compositeScore,
    passedSla,
  };
}

/**
 * Evaluates head-to-head match between two fighters ("Street Fighter Round").
 */
export function evaluateFighterMatchup(
  mA: CompetitorBenchmarkMetrics,
  mB: CompetitorBenchmarkMetrics
): MatchupResult {
  const diff = Math.round((mA.compositeScore - mB.compositeScore) * 1000) / 1000;
  const winnerId = diff >= 0 ? mA.fighterId : mB.fighterId;
  const winner = diff >= 0 ? mA : mB;
  const loser = diff >= 0 ? mB : mA;

  const reasoning =
    `${winner.fighterId} defeats ${loser.fighterId} (Composite: ${winner.compositeScore} vs ${loser.compositeScore}, ` +
    `nDCG: ${winner.ndcgAt10} vs ${loser.ndcgAt10}, p95: ${winner.p95LatencyMs}ms vs ${loser.p95LatencyMs}ms)`;

  return {
    fighterA: mA.fighterId,
    fighterB: mB.fighterId,
    winnerId,
    scoreDiff: diff,
    reasoning,
  };
}

export interface RunRetrievalTournamentInputV1 {
  tournamentId: string;
  workspaceRevision: string;
  benchmarkQueries: readonly RetrievalBenchmarkQuery[];
  fighterQueryResults: Record<FighterId, readonly CompetitorQueryResult[]>;
  customFighters?: readonly CompetitorProfile[];
  slaTargetMs?: number;
  approvalDecision?: {
    approved: boolean;
    approvedBy: string;
  };
}

/**
 * Executes a full 5-competitor retrieval tournament through the deterministic FSM.
 */
export function runRetrievalTournamentV1(
  input: RunRetrievalTournamentInputV1
): RetrievalTournamentReceiptV1 {
  const fsm = new TournamentFsm();
  const slaTargetMs = input.slaTargetMs ?? 50.0;
  const competitors = input.customFighters ?? STANDARD_FIGHTERS;

  // 1. REGISTERED -> VALIDATED
  if (input.benchmarkQueries.length === 0) {
    fsm.transitionTo('REJECTED');
    throw new Error('TOURNAMENT_BENCHMARK_EMPTY: At least 1 benchmark query is required');
  }
  for (const c of competitors) {
    const results = input.fighterQueryResults[c.id];
    if (!results || results.length === 0) {
      fsm.transitionTo('REJECTED');
      throw new Error(`TOURNAMENT_RESULTS_MISSING: Missing query results for competitor '${c.id}'`);
    }
  }
  fsm.transitionTo('VALIDATED');

  // 2. VALIDATED -> CPU_VS_CPU
  fsm.transitionTo('CPU_VS_CPU');

  // Evaluate all competitors
  const evaluatedMetrics: CompetitorBenchmarkMetrics[] = competitors.map((c) =>
    evaluateCompetitorRun(c, input.fighterQueryResults[c.id], input.benchmarkQueries, slaTargetMs)
  );

  // Round-robin matchups
  const matchups: MatchupResult[] = [];
  for (let i = 0; i < evaluatedMetrics.length; i++) {
    for (let j = i + 1; j < evaluatedMetrics.length; j++) {
      matchups.push(evaluateFighterMatchup(evaluatedMetrics[i], evaluatedMetrics[j]));
    }
  }

  // 3. CPU_VS_CPU -> EVALUATED
  fsm.transitionTo('EVALUATED');

  // Find winner: highest composite score among those passing SLA (or highest composite overall)
  const sorted = [...evaluatedMetrics].sort((a, b) => {
    if (a.passedSla !== b.passedSla) return a.passedSla ? -1 : 1;
    return b.compositeScore - a.compositeScore;
  });
  const winnerMetrics = sorted[0];

  // 4. EVALUATED -> SHADOW_CHALLENGER
  fsm.transitionTo('SHADOW_CHALLENGER');

  // 5. SHADOW_CHALLENGER -> HUMAN_REVIEW
  fsm.transitionTo('HUMAN_REVIEW');

  let reviewStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' = 'PENDING_APPROVAL';
  let reviewedBy: string | null = null;
  let canPromote = false;

  if (input.approvalDecision) {
    if (input.approvalDecision.approved && input.approvalDecision.approvedBy.trim()) {
      reviewStatus = 'APPROVED';
      reviewedBy = input.approvalDecision.approvedBy.trim();
      canPromote = winnerMetrics.passedSla;
      if (canPromote) {
        fsm.transitionTo('PROMOTED');
      } else {
        fsm.transitionTo('REJECTED');
      }
    } else {
      reviewStatus = 'REJECTED';
      fsm.transitionTo('REJECTED');
    }
  }

  const receiptPreimage = {
    schema: RETRIEVAL_TOURNAMENT_RECEIPT_SCHEMA,
    tournamentId: input.tournamentId,
    workspaceRevision: input.workspaceRevision,
    fsmFinalState: fsm.state,
    fsmHistory: [...fsm.history],
    competitors: [...competitors],
    metrics: evaluatedMetrics,
    matchups,
    winnerFighterId: winnerMetrics.fighterId,
    winnerMetrics,
    slaTargetMs,
    canPromote,
    reviewStatus,
    reviewedBy,
    writesPerformed: false as const,
    canonicalStoreMutated: false as const,
  };

  const receiptChecksum =
    'sha256:' +
    createHash('sha256')
      .update(JSON.stringify(receiptPreimage))
      .digest('hex');

  const receipt: RetrievalTournamentReceiptV1 = {
    ...receiptPreimage,
    receiptChecksum,
  };

  return RetrievalTournamentReceiptV1Schema.parse(receipt);
}
