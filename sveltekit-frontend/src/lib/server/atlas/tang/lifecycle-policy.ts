import type { QueryAdaptiveWeights } from '../retrieval/query-adaptive-sampler.js';

export type TangLifecycleLane =
  | 'INDEXING'
  | 'RERANKING'
  | 'PREFILL'
  | 'DECODE'
  | 'INFERENCE'
  | 'ACE'
  | 'KANBAN'
  | 'WORKFLOW';

export interface TangLaneBudget {
  maxCandidates: number;
  maxTokens: number;
  maxGpuBytes: number;
  maxLatencyMs: number;
  maxToolCalls: number;
}

export interface TangLanePolicyV1 {
  schema: 'atlas.tang-lane-policy.v1';
  policyRevision: string;
  lane: TangLifecycleLane;
  sampleSize: number;
  deterministicTopK: number;
  explorationCount: number;
  seedNamespace: string;
  weights: QueryAdaptiveWeights;
  budgets: TangLaneBudget;
  exactPromotionRequired: boolean;
  canonicalWrites: false;
}

const DEFAULT_BUDGET: TangLaneBudget = {
  maxCandidates: 128,
  maxTokens: 4096,
  maxGpuBytes: 256 * 1024 * 1024,
  maxLatencyMs: 100,
  maxToolCalls: 2,
};

/**
 * Tang-inspired means only that we prioritize bounded work from compact/weighted
 * state rather than exhaustively materializing every possible result. It does
 * NOT claim Tang's sublinear theorem unless low-rank and l2-sampling assumptions
 * are separately proven for the concrete input structure.
 */
export function defaultTangLanePolicy(lane: TangLifecycleLane): TangLanePolicyV1 {
  const common = {
    schema: 'atlas.tang-lane-policy.v1' as const,
    policyRevision: 'tang-lifecycle-v1',
    lane,
    seedNamespace: `atlas:tang:${lane.toLowerCase()}`,
    canonicalWrites: false as const,
  };

  switch (lane) {
    case 'INDEXING':
      return { ...common, sampleSize: 64, deterministicTopK: 48, explorationCount: 16, weights: { semantic: 0.20, lexical: 0.10, structural: 0.35, domain: 0.10, execution: 0.25 }, budgets: { ...DEFAULT_BUDGET, maxCandidates: 512, maxLatencyMs: 500 }, exactPromotionRequired: false };
    case 'RERANKING':
      return { ...common, sampleSize: 48, deterministicTopK: 40, explorationCount: 8, weights: { semantic: 0.35, lexical: 0.10, structural: 0.25, domain: 0.10, execution: 0.20 }, budgets: DEFAULT_BUDGET, exactPromotionRequired: true };
    case 'PREFILL':
      return { ...common, sampleSize: 32, deterministicTopK: 28, explorationCount: 4, weights: { semantic: 0.30, lexical: 0.10, structural: 0.20, domain: 0.10, execution: 0.30 }, budgets: { ...DEFAULT_BUDGET, maxTokens: 8192 }, exactPromotionRequired: true };
    case 'DECODE':
      return { ...common, sampleSize: 8, deterministicTopK: 8, explorationCount: 0, weights: { semantic: 0.10, lexical: 0.05, structural: 0.10, domain: 0.05, execution: 0.70 }, budgets: { ...DEFAULT_BUDGET, maxCandidates: 32, maxTokens: 0, maxLatencyMs: 10, maxToolCalls: 0 }, exactPromotionRequired: false };
    case 'INFERENCE':
      return { ...common, sampleSize: 16, deterministicTopK: 12, explorationCount: 4, weights: { semantic: 0.15, lexical: 0.05, structural: 0.10, domain: 0.10, execution: 0.60 }, budgets: { ...DEFAULT_BUDGET, maxCandidates: 64, maxLatencyMs: 25, maxToolCalls: 0 }, exactPromotionRequired: false };
    case 'ACE':
      return { ...common, sampleSize: 32, deterministicTopK: 24, explorationCount: 8, weights: { semantic: 0.20, lexical: 0.10, structural: 0.15, domain: 0.05, execution: 0.50 }, budgets: { ...DEFAULT_BUDGET, maxLatencyMs: 50 }, exactPromotionRequired: false };
    case 'KANBAN':
      return { ...common, sampleSize: 24, deterministicTopK: 20, explorationCount: 4, weights: { semantic: 0.10, lexical: 0.05, structural: 0.25, domain: 0.10, execution: 0.50 }, budgets: { ...DEFAULT_BUDGET, maxCandidates: 128, maxTokens: 2048, maxLatencyMs: 100 }, exactPromotionRequired: false };
    case 'WORKFLOW':
      return { ...common, sampleSize: 16, deterministicTopK: 12, explorationCount: 4, weights: { semantic: 0.10, lexical: 0.05, structural: 0.30, domain: 0.05, execution: 0.50 }, budgets: { ...DEFAULT_BUDGET, maxCandidates: 64, maxTokens: 2048, maxLatencyMs: 50, maxToolCalls: 4 }, exactPromotionRequired: false };
  }
}
