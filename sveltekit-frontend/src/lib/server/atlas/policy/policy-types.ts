export const HMM_STATES = [
  'LOCATE',
  'UNDERSTAND',
  'TRACE',
  'REPAIR',
  'VALIDATE',
  'RECOVER',
] as const;
export type HmmState = (typeof HMM_STATES)[number];

export const POLICY_ACTIONS = [
  'LEXICAL_SEARCH',
  'SEMANTIC_SEARCH',
  'GRAPH_TRACE',
  'GRAPH_EXPAND',
  'FAST_RERANK',
  'DEEP_RERANK',
  'INSPECT_SOURCE',
  'PATCH',
  'COMPILE',
  'TEST',
  'RECOVER',
  'TERMINATE',
] as const;
export type PolicyAction = (typeof POLICY_ACTIONS)[number];

export const MODEL_TARGETS = ['NO_LLM', 'ORNITH', 'GEMMA4'] as const;
export type ModelTarget = (typeof MODEL_TARGETS)[number];

export const BUDGET_TIERS = ['SMALL', 'MEDIUM', 'DEEP'] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

export type FitDecision = 'ACCEPT' | 'REVIEW' | 'ABSTAIN';

export interface RevisionTuple {
  workspaceRevision: string;
  sourceRevision: string;
  representationRevision: string;
  graphRevision?: string;
  featureRevision?: string;
}

export interface PolicyStateInput {
  okf: {
    naiveBayesScore: number;
    logisticRegressionScore: number;
    fitMargin: number;
    decision: FitDecision;
  };
  hmm: {
    stateHint: HmmState;
    posterior?: Partial<Record<HmmState, number>>;
  };
  retrieval: {
    bestCosine: number;
    cosineMargin: number;
    lexicalHitCount: number;
    rrfConfidence: number;
  };
  structural: {
    astEvidence: number;
    symbolMatch: number;
    exactPathMatch: number;
  };
  graph: {
    seedCount: number;
    shortestPathAvailable: boolean;
    communityAgreement: number;
    authority: number;
    hopBudgetRemaining: number;
  };
  execution: {
    compileFailed: boolean;
    testFailed: boolean;
    retryCount: number;
    historicalSuccess: number;
  };
  resource: {
    vramPressure: number;
    contextPressure: number;
    latencyPressure: number;
    cacheHitRatio: number;
  };
}

export interface PolicyStateTensor {
  revision: 'parent-atlas.policy-state.v1';
  featureRevision: 'parent-atlas.policy-features.v1';
  featureCount: number;
  features: readonly string[];
  values: Float32Array;
  stateHint: HmmState;
}

export type PolicyStateVector = PolicyStateTensor;

export interface PolicyDecision {
  revision: 'parent-atlas.policy-decision.v1';
  action: PolicyAction;
  model: ModelTarget;
  budget: BudgetTier;
  maxParallelToolCalls: number;
  rankedActions: Array<{ action: PolicyAction; score: number }>;
  stateHint: HmmState;
}
