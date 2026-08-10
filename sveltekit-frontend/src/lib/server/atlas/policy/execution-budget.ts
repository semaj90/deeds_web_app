import type { BudgetTier, HmmState } from './policy-types';

export interface ExecutionBudget {
  tier: BudgetTier;
  maxParallelToolCalls: number;
  maxActiveLanes: number;
  maxInitialCandidates: number;
  maxGraphSeeds: number;
  maxGraphDepth: number;
  maxGraphNodes: number;
  maxFastRerankCandidates: number;
  maxDeepRerankCandidates: number;
  maxContextTokens: number;
  maxGpuBytes: number;
  maxPinnedHostBytes: number;
  maxLatencyMs: number;
}

const GiB = 1024 ** 3;

const BASE: Record<BudgetTier, ExecutionBudget> = {
  SMALL: {
    tier: 'SMALL', maxParallelToolCalls: 2, maxActiveLanes: 3, maxInitialCandidates: 80,
    maxGraphSeeds: 8, maxGraphDepth: 1, maxGraphNodes: 40,
    maxFastRerankCandidates: 24, maxDeepRerankCandidates: 0,
    maxContextTokens: 3_000, maxGpuBytes: 0.6 * GiB, maxPinnedHostBytes: 0.5 * GiB, maxLatencyMs: 1_500,
  },
  MEDIUM: {
    tier: 'MEDIUM', maxParallelToolCalls: 3, maxActiveLanes: 5, maxInitialCandidates: 160,
    maxGraphSeeds: 16, maxGraphDepth: 2, maxGraphNodes: 120,
    maxFastRerankCandidates: 40, maxDeepRerankCandidates: 12,
    maxContextTokens: 7_000, maxGpuBytes: 1.2 * GiB, maxPinnedHostBytes: 1 * GiB, maxLatencyMs: 4_000,
  },
  DEEP: {
    tier: 'DEEP', maxParallelToolCalls: 3, maxActiveLanes: 6, maxInitialCandidates: 320,
    maxGraphSeeds: 24, maxGraphDepth: 4, maxGraphNodes: 260,
    maxFastRerankCandidates: 56, maxDeepRerankCandidates: 20,
    maxContextTokens: 12_000, maxGpuBytes: 1.8 * GiB, maxPinnedHostBytes: 2 * GiB, maxLatencyMs: 9_000,
  },
};

export function budgetFor(tier: BudgetTier, state: HmmState): ExecutionBudget {
  const budget = { ...BASE[tier] };
  if (state === 'VALIDATE') {
    budget.maxGraphDepth = Math.min(budget.maxGraphDepth, 1);
    budget.maxInitialCandidates = Math.min(budget.maxInitialCandidates, 24);
  }
  if (state === 'TRACE') budget.maxGraphDepth = Math.max(2, budget.maxGraphDepth);
  if (state === 'RECOVER') budget.maxGraphDepth = Math.min(4, budget.maxGraphDepth + 1);
  return budget;
}
