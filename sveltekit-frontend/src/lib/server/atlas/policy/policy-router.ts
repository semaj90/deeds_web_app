import {
  BUDGET_TIERS,
  MODEL_TARGETS,
  POLICY_ACTIONS,
  type BudgetTier,
  type HmmState,
  type ModelTarget,
  type PolicyAction,
  type PolicyDecision,
  type PolicyStateVector,
} from './policy-types';
import { chooseModel, type ModelRoutingPolicy } from './model-routing';

export interface PolicyRouterWeights {
  revision: string;
  featureCount: number;
  actionWeights?: Partial<Record<PolicyAction, number[]>>;
  actionBias?: Partial<Record<PolicyAction, number>>;
  modelWeights?: Partial<Record<ModelTarget, number[]>>;
  modelBias?: Partial<Record<ModelTarget, number>>;
  budgetWeights?: Partial<Record<BudgetTier, number[]>>;
  budgetBias?: Partial<Record<BudgetTier, number>>;
}

const ALLOWED: Record<HmmState, readonly PolicyAction[]> = {
  LOCATE: ['LEXICAL_SEARCH', 'SEMANTIC_SEARCH', 'GRAPH_TRACE', 'FAST_RERANK', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE'],
  UNDERSTAND: ['SEMANTIC_SEARCH', 'GRAPH_TRACE', 'FAST_RERANK', 'DEEP_RERANK', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE'],
  TRACE: ['GRAPH_TRACE', 'GRAPH_EXPAND', 'FAST_RERANK', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE'],
  REPAIR: ['INSPECT_SOURCE', 'PATCH', 'COMPILE', 'TEST', 'RECOVER', 'TERMINATE'],
  VALIDATE: ['COMPILE', 'TEST', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE'],
  RECOVER: ['LEXICAL_SEARCH', 'SEMANTIC_SEARCH', 'GRAPH_EXPAND', 'DEEP_RERANK', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE'],
};

function dot(weights: number[] | undefined, values: Float32Array): number {
  if (!weights || weights.length !== values.length) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += weights[i] * values[i];
  return sum;
}

function baselineScore(action: PolicyAction, state: HmmState, x: Float32Array): number {
  // Features 26-28 are VRAM/context/latency pressure after normalization.
  const pressure = Math.max(x[26] ?? 0, x[27] ?? 0, x[28] ?? 0);
  const preferred: Partial<Record<HmmState, PolicyAction>> = {
    LOCATE: 'SEMANTIC_SEARCH', UNDERSTAND: 'INSPECT_SOURCE', TRACE: 'GRAPH_TRACE',
    REPAIR: 'PATCH', VALIDATE: 'TEST', RECOVER: 'LEXICAL_SEARCH',
  };
  let score = preferred[state] === action ? 2 : 0;
  if (pressure > 0.8 && ['DEEP_RERANK', 'GRAPH_EXPAND'].includes(action)) score -= 2;
  if (pressure > 0.9 && action === 'TERMINATE') score += 0.5;
  return score;
}

function chooseBudget(x: Float32Array, state: HmmState): BudgetTier {
  const pressure = Math.max(x[26] ?? 0, x[27] ?? 0, x[28] ?? 0);
  if (pressure >= 0.8) return 'SMALL';
  if (state === 'RECOVER' || state === 'TRACE') return 'MEDIUM';
  return 'SMALL';
}

export function routePolicy(
  state: PolicyStateVector,
  weights?: PolicyRouterWeights,
  modelPolicy?: ModelRoutingPolicy,
): PolicyDecision {
  const allowed = new Set(ALLOWED[state.stateHint]);
  const rankedActions = POLICY_ACTIONS
    .filter((action) => allowed.has(action))
    .map((action) => ({
      action,
      score:
        baselineScore(action, state.stateHint, state.values) +
        dot(weights?.actionWeights?.[action], state.values) +
        (weights?.actionBias?.[action] ?? 0),
    }))
    .sort((a, b) => b.score - a.score || a.action.localeCompare(b.action));

  const action = rankedActions[0]?.action ?? 'TERMINATE';
  let model = chooseModel(action, state.stateHint, modelPolicy);
  let budget = chooseBudget(state.values, state.stateHint);

  if (weights?.modelWeights) {
    model = [...MODEL_TARGETS]
      .map((candidate) => ({ candidate, score: dot(weights.modelWeights?.[candidate], state.values) + (weights.modelBias?.[candidate] ?? 0) }))
      .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))[0]?.candidate ?? model;
  }
  if (weights?.budgetWeights) {
    budget = [...BUDGET_TIERS]
      .map((candidate) => ({ candidate, score: dot(weights.budgetWeights?.[candidate], state.values) + (weights.budgetBias?.[candidate] ?? 0) }))
      .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))[0]?.candidate ?? budget;
  }

  return {
    revision: 'parent-atlas.policy-decision.v1',
    action,
    model,
    budget,
    maxParallelToolCalls: 3,
    rankedActions,
    stateHint: state.stateHint,
  };
}
