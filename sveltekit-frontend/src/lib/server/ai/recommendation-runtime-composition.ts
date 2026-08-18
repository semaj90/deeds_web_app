import type { RecommendationPlan } from './resource-aware-recommendation-policy.js';

export type SemanticExecutor = 'QDRANT' | 'CUVS_EXACT' | 'CAGRA' | 'DISKANN' | 'TURBOVEC';

export interface SemanticExecutorDecisionV1 {
  lane: 'semantic';
  representation: 'semantic_768';
  executor: SemanticExecutor;
  voteKey: 'semantic';
  reason: string;
}

export interface SemanticExecutorChooser {
  choose(input: {
    exactness: 'REQUIRED' | 'APPROXIMATE_ALLOWED';
    corpusResidency: 'GPU_HOT' | 'RAM_WARM' | 'NVME_COLD' | 'REMOTE_PERSISTENT';
    availableGpuBytes: number;
  }): SemanticExecutorDecisionV1;
}

export interface RecommendationRuntimeDecisionV1 {
  schema: 'atlas.recommendation-runtime-decision.v1';
  evidencePlan: RecommendationPlan;
  semanticExecutor: SemanticExecutorDecisionV1 | null;
  semanticVoteCount: 0 | 1;
  invariants: {
    laneSelectionOwnsWhetherToCompute: true;
    executorSelectionOwnsHowToCompute: true;
    semanticExecutorDoesNotAddVote: true;
  };
}

/**
 * Compose the two policy layers without letting either become the other's owner.
 * Evidence policy selects WHETHER semantic evidence is admitted. Executor policy
 * selects HOW that one semantic lane is executed.
 */
export function composeRecommendationRuntime(input: {
  evidencePlan: RecommendationPlan;
  semanticChooser: SemanticExecutorChooser;
  exactSemanticRequired?: boolean;
  corpusResidency: 'GPU_HOT' | 'RAM_WARM' | 'NVME_COLD' | 'REMOTE_PERSISTENT';
  availableGpuBytes: number;
}): RecommendationRuntimeDecisionV1 {
  if (!input.evidencePlan.admissible) {
    return {
      schema: 'atlas.recommendation-runtime-decision.v1',
      evidencePlan: input.evidencePlan,
      semanticExecutor: null,
      semanticVoteCount: 0,
      invariants: { laneSelectionOwnsWhetherToCompute: true, executorSelectionOwnsHowToCompute: true, semanticExecutorDoesNotAddVote: true },
    };
  }
  const semanticSelected = input.evidencePlan.selected.includes('semantic');
  const semanticExecutor = semanticSelected
    ? input.semanticChooser.choose({
        exactness: input.exactSemanticRequired ? 'REQUIRED' : 'APPROXIMATE_ALLOWED',
        corpusResidency: input.corpusResidency,
        availableGpuBytes: input.availableGpuBytes,
      })
    : null;
  if (semanticExecutor && semanticExecutor.voteKey !== 'semantic') throw new Error('SEMANTIC_EXECUTOR_VOTE_INFLATION_FORBIDDEN');
  return {
    schema: 'atlas.recommendation-runtime-decision.v1',
    evidencePlan: input.evidencePlan,
    semanticExecutor,
    semanticVoteCount: semanticExecutor ? 1 : 0,
    invariants: { laneSelectionOwnsWhetherToCompute: true, executorSelectionOwnsHowToCompute: true, semanticExecutorDoesNotAddVote: true },
  };
}
