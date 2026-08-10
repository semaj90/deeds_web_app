import type { HmmState, ModelTarget, PolicyAction } from './policy-types';

export interface ModelRoutingPolicy {
  revision: string;
  preferredByState: Partial<Record<HmmState, Exclude<ModelTarget, 'NO_LLM'>>>;
}

export const DEFAULT_MODEL_ROUTING_POLICY: ModelRoutingPolicy = {
  revision: 'parent-atlas.model-routing.v1',
  preferredByState: {
    UNDERSTAND: 'GEMMA4',
    REPAIR: 'ORNITH',
    RECOVER: 'ORNITH',
  },
};

const DETERMINISTIC_ACTIONS = new Set<PolicyAction>([
  'LEXICAL_SEARCH', 'SEMANTIC_SEARCH', 'GRAPH_TRACE', 'GRAPH_EXPAND',
  'FAST_RERANK', 'DEEP_RERANK', 'COMPILE', 'TEST', 'TERMINATE',
]);

export function chooseModel(
  action: PolicyAction,
  state: HmmState,
  policy: ModelRoutingPolicy = DEFAULT_MODEL_ROUTING_POLICY,
): ModelTarget {
  if (DETERMINISTIC_ACTIONS.has(action)) return 'NO_LLM';
  return policy.preferredByState[state] ?? 'ORNITH';
}
