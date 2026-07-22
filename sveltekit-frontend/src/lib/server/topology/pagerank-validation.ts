import type {
  PageRankEvaluation,
  RawPageRankScore,
} from './pagerank-types.js';

export interface ValidatePageRankOptions {
  expectedNodeCount: number;
  converged: boolean;
  actualIterations: number;
  requireProbabilitySum?: boolean;
  probabilitySumTolerance?: number;
  minimumCoverage?: number;
  runId?: string;
}

export function validateRawPageRank(
  scores: readonly RawPageRankScore[],
  options: ValidatePageRankOptions,
): PageRankEvaluation {
  const failures: string[] = [];
  const warnings: string[] = [];

  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let nonFiniteCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;

  const values: number[] = [];

  for (const row of scores) {
    const value = row.rawScore;

    if (!Number.isFinite(value)) {
      nonFiniteCount++;
      continue;
    }

    if (value < 0) negativeCount++;
    if (value === 0) zeroCount++;

    sum += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
    values.push(value);
  }

  const mean = values.length > 0 ? sum / values.length : 0;
  const variance = values.length > 0
    ? values.reduce((total, value) => total + Math.pow(value - mean, 2), 0) / values.length
    : 0;
  const standardDeviation = Math.sqrt(variance);
  const coverage = options.expectedNodeCount > 0 ? scores.length / options.expectedNodeCount : 0;

  if (nonFiniteCount > 0) {
    failures.push(`${nonFiniteCount} PageRank scores are non-finite`);
  }

  if (negativeCount > 0) {
    failures.push(`${negativeCount} PageRank scores are negative`);
  }

  if (!options.converged) {
    failures.push('PageRank did not converge');
  }

  const minimumCoverage = options.minimumCoverage ?? 0.95;
  if (coverage < minimumCoverage) {
    failures.push(
      `Coverage ${coverage.toFixed(4)} is below ${minimumCoverage.toFixed(4)}`,
    );
  }

  if (options.requireProbabilitySum ?? true) {
    const tolerance = options.probabilitySumTolerance ?? 1e-6;
    if (Math.abs(sum - 1) > tolerance) {
      failures.push(
        `Raw PageRank sum ${sum} differs from 1 by more than ${tolerance}`,
      );
    }
  }

  if (standardDeviation === 0 && values.length > 1) {
    warnings.push('All PageRank scores are identical');
  }

  return {
    runId: options.runId ?? 'unassigned',
    expectedNodeCount: options.expectedNodeCount,
    computedNodeCount: scores.length,
    matchedDatabaseRows: 0,
    persistedRows: 0,
    sumRaw: sum,
    minRaw: values.length > 0 ? min : 0,
    maxRaw: values.length > 0 ? max : 0,
    meanRaw: mean,
    standardDeviationRaw: standardDeviation,
    zeroCount,
    nonFiniteCount,
    negativeCount,
    converged: options.converged,
    actualIterations: options.actualIterations,
    rankCorrelationWithReference: null,
    topKOverlapWithReference: null,
    status: failures.length > 0 ? 'fail' : warnings.length > 0 ? 'pass-with-warnings' : 'pass',
    failures,
    warnings,
  };
}
