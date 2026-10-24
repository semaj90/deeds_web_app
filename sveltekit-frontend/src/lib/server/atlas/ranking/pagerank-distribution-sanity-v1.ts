import { z } from 'zod';

export const PageRankDistributionSanityReportV1Schema = z.object({
  schema: z.literal('atlas.pagerank-distribution-sanity-report.v1'),
  graphRevision: z.string().min(1),
  algorithm: z.literal('pagerank'),
  runId: z.string().min(1).nullable(),
  status: z.string().min(1),
  nodeCount: z.number().int().nonnegative(),
  distinctScores: z.number().int().nonnegative(),
  mean: z.number().finite(),
  variance: z.number().finite().nonnegative(),
  stdDev: z.number().finite().nonnegative(),
  minScore: z.number().finite(),
  maxScore: z.number().finite(),
  nonFiniteCount: z.number().int().nonnegative(),
  observedL1Sum: z.number().finite().nullable(),
  isFinite: z.boolean(),
  isVarianceSane: z.boolean(),
  isNonDegenerate: z.boolean(),
  hasLineage: z.boolean(),
  isPromoted: z.boolean(),
  overallSanityPassed: z.boolean(),
  rejectionReasons: z.array(z.string()),
}).strict();

export type PageRankDistributionSanityReportV1 = z.infer<typeof PageRankDistributionSanityReportV1Schema>;

export interface EvaluatePageRankDistributionSanityInputV1 {
  scores: readonly number[];
  lineage: {
    graphRevision: string;
    algorithm?: string;
    runId?: string | null;
    status?: string;
  };
  epsilon?: number;
  requirePromoted?: boolean;
  expectedL1SumTolerance?: number;
}

export const DEFAULT_PAGERANK_VARIANCE_EPSILON = 1e-12;
export const DEFAULT_L1_SUM_TOLERANCE = 1e-5;

/**
 * Validates PageRank score distributions for numerical sanity, non-degeneracy,
 * and lineage provenance before promotion or candidate assembly.
 *
 * Invariants:
 * 1. Finite: All scores must be real finite numbers (no NaN, Infinity, -Infinity).
 * 2. Non-degenerate: distinct(scores) > 1 (fails closed on uniform/constant fallback).
 * 3. Variance > epsilon: Score spread must exceed epsilon to provide ranking signal.
 * 4. Lineage: graphRevision and algorithm must be explicitly present.
 * 5. Promoted: When requirePromoted=true, status must strictly equal 'promoted'.
 */
export function evaluatePageRankDistributionSanityV1(
  input: EvaluatePageRankDistributionSanityInputV1,
): PageRankDistributionSanityReportV1 {
  const epsilon = input.epsilon ?? DEFAULT_PAGERANK_VARIANCE_EPSILON;
  const tolerance = input.expectedL1SumTolerance ?? DEFAULT_L1_SUM_TOLERANCE;
  const rejectionReasons: string[] = [];

  const rawScores = input.scores;
  let nonFiniteCount = 0;
  let minScore = Number.POSITIVE_INFINITY;
  let maxScore = Number.NEGATIVE_INFINITY;
  let sum = 0;
  const validScores: number[] = [];
  const uniqueScores = new Set<number>();

  for (const s of rawScores) {
    if (!Number.isFinite(s)) {
      nonFiniteCount++;
    } else {
      validScores.push(s);
      uniqueScores.add(s);
      sum += s;
      if (s < minScore) minScore = s;
      if (s > maxScore) maxScore = s;
    }
  }

  const nodeCount = validScores.length;
  const isFinite = nonFiniteCount === 0 && rawScores.length > 0;
  if (nonFiniteCount > 0) {
    rejectionReasons.push(`PAGERANK_NON_FINITE_SCORES:${nonFiniteCount}`);
  }
  if (rawScores.length === 0) {
    rejectionReasons.push('PAGERANK_EMPTY_SCORES');
    minScore = 0;
    maxScore = 0;
  }

  const mean = nodeCount > 0 ? sum / nodeCount : 0;
  let varianceSum = 0;
  for (const s of validScores) {
    varianceSum += Math.pow(s - mean, 2);
  }
  const variance = nodeCount > 0 ? varianceSum / nodeCount : 0;
  const stdDev = Math.sqrt(variance);

  const distinctScores = uniqueScores.size;
  const isNonDegenerate = distinctScores > 1;
  if (!isNonDegenerate && nodeCount > 1) {
    rejectionReasons.push(`PAGERANK_DEGENERATE_UNIFORM_DISTRIBUTION:distinct=${distinctScores}`);
  }

  const isVarianceSane = variance > epsilon;
  if (!isVarianceSane && nodeCount > 1) {
    rejectionReasons.push(`PAGERANK_NEGLIGIBLE_VARIANCE:${variance}<=epsilon=${epsilon}`);
  }

  // Validate L1 sum if scores appear to be L1-normalized (sum is near 1)
  let observedL1Sum: number | null = null;
  if (nodeCount > 0) {
    observedL1Sum = sum;
    if (Math.abs(sum - 1.0) > tolerance && Math.abs(sum - 1.0) < 0.5) {
      rejectionReasons.push(`PAGERANK_L1_SUM_OUT_OF_TOLERANCE:sum=${sum},expected=1.0`);
    }
  }

  // Lineage validation
  const graphRevision = input.lineage.graphRevision?.trim() ?? '';
  const algorithm = (input.lineage.algorithm ?? 'pagerank').trim();
  const runId = input.lineage.runId?.trim() ?? null;
  const status = (input.lineage.status ?? 'unpromoted').trim();

  const hasLineage = graphRevision.length > 0 && algorithm === 'pagerank';
  if (graphRevision.length === 0) {
    rejectionReasons.push('PAGERANK_LINEAGE_MISSING_GRAPH_REVISION');
  }
  if (algorithm !== 'pagerank') {
    rejectionReasons.push(`PAGERANK_ALGORITHM_MISMATCH:${algorithm}`);
  }

  const isPromoted = status === 'promoted';
  if (input.requirePromoted && !isPromoted) {
    rejectionReasons.push(`PAGERANK_NOT_PROMOTED:status=${status}`);
  }

  const overallSanityPassed = rejectionReasons.length === 0;

  return PageRankDistributionSanityReportV1Schema.parse({
    schema: 'atlas.pagerank-distribution-sanity-report.v1',
    graphRevision: graphRevision || 'unknown',
    algorithm: 'pagerank',
    runId,
    status,
    nodeCount,
    distinctScores,
    mean,
    variance,
    stdDev,
    minScore: Number.isFinite(minScore) ? minScore : 0,
    maxScore: Number.isFinite(maxScore) ? maxScore : 0,
    nonFiniteCount,
    observedL1Sum,
    isFinite,
    isVarianceSane,
    isNonDegenerate,
    hasLineage,
    isPromoted,
    overallSanityPassed,
    rejectionReasons,
  });
}

/**
 * Audits packet-facing PageRank scores (such as returned by MCP atlas.graph.pagerank
 * or queried from atlas_packets.pagerank_score).
 */
export function auditPacketFacingPageRankDistributionV1(
  results: readonly { packetKey: string; pageRankScore: number }[],
  options: {
    graphRevision?: string;
    runId?: string | null;
    status?: string;
    requirePromoted?: boolean;
    source?: string;
  } = {},
): PageRankDistributionSanityReportV1 {
  const scores = results.map((r) => r.pageRankScore);
  return evaluatePageRankDistributionSanityV1({
    scores,
    lineage: {
      graphRevision: options.graphRevision ?? 'atlas_packets-live',
      algorithm: 'pagerank',
      runId: options.runId ?? null,
      status: options.status ?? 'unpromoted',
    },
    requirePromoted: options.requirePromoted ?? false,
  });
}
