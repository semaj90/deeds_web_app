import { z } from 'zod';
import { HMM_STATES, type HmmState, type PolicyStateInput, type PolicyStateTensor } from './policy-types';
import { normalizeByRange, type FeatureRange } from './feature-ranges';

export const POLICY_FEATURES = [
  'okf_naive_bayes',
  'okf_logistic',
  'okf_margin',
  'okf_review_or_abstain',
  'hmm_locate',
  'hmm_understand',
  'hmm_trace',
  'hmm_repair',
  'hmm_validate',
  'hmm_recover',
  'best_cosine',
  'cosine_margin',
  'lexical_hit_count',
  'rrf_confidence',
  'ast_evidence',
  'symbol_match',
  'exact_path_match',
  'graph_seed_count',
  'shortest_path_available',
  'community_agreement',
  'authority',
  'hop_budget_remaining',
  'compile_failed',
  'test_failed',
  'retry_count',
  'historical_success',
  'vram_pressure',
  'context_pressure',
  'latency_pressure',
  'cache_hit_ratio',
] as const;

export type PolicyFeatureName = (typeof POLICY_FEATURES)[number];
export const POLICY_FEATURE_REVISION = 'parent-atlas.policy-features.v1' as const;
export const POLICY_STATE_TENSOR_REVISION = 'parent-atlas.policy-state.v1' as const;

const RANGE: Record<PolicyFeatureName, FeatureRange> = {
  okf_naive_bayes: { min: 0, max: 1, mode: 'MINMAX' },
  okf_logistic: { min: 0, max: 1, mode: 'MINMAX' },
  okf_margin: { min: 0, max: 1, mode: 'MINMAX' },
  okf_review_or_abstain: { min: 0, max: 1, mode: 'MINMAX' },
  hmm_locate: { min: 0, max: 1, mode: 'MINMAX' },
  hmm_understand: { min: 0, max: 1, mode: 'MINMAX' },
  hmm_trace: { min: 0, max: 1, mode: 'MINMAX' },
  hmm_repair: { min: 0, max: 1, mode: 'MINMAX' },
  hmm_validate: { min: 0, max: 1, mode: 'MINMAX' },
  hmm_recover: { min: 0, max: 1, mode: 'MINMAX' },
  best_cosine: { min: -1, max: 1, mode: 'MINMAX' },
  cosine_margin: { min: 0, max: 2, mode: 'MINMAX' },
  lexical_hit_count: { min: 0, max: 64, mode: 'LOG1P_MINMAX' },
  rrf_confidence: { min: 0, max: 1, mode: 'MINMAX' },
  ast_evidence: { min: 0, max: 1, mode: 'MINMAX' },
  symbol_match: { min: 0, max: 1, mode: 'MINMAX' },
  exact_path_match: { min: 0, max: 1, mode: 'MINMAX' },
  graph_seed_count: { min: 0, max: 128, mode: 'LOG1P_MINMAX' },
  shortest_path_available: { min: 0, max: 1, mode: 'MINMAX' },
  community_agreement: { min: 0, max: 1, mode: 'MINMAX' },
  authority: { min: 0, max: 100, mode: 'LOG1P_MINMAX' },
  hop_budget_remaining: { min: 0, max: 4, mode: 'MINMAX' },
  compile_failed: { min: 0, max: 1, mode: 'MINMAX' },
  test_failed: { min: 0, max: 1, mode: 'MINMAX' },
  retry_count: { min: 0, max: 8, mode: 'MINMAX' },
  historical_success: { min: 0, max: 1, mode: 'MINMAX' },
  vram_pressure: { min: 0, max: 1, mode: 'MINMAX' },
  context_pressure: { min: 0, max: 1, mode: 'MINMAX' },
  latency_pressure: { min: 0, max: 1, mode: 'MINMAX' },
  cache_hit_ratio: { min: 0, max: 1, mode: 'MINMAX' },
};

function hmmValue(input: PolicyStateInput, state: HmmState): number {
  if (input.hmm.posterior?.[state] != null) return input.hmm.posterior[state] ?? 0;
  return input.hmm.stateHint === state ? 1 : 0;
}

export const PolicyStateTensorSchema = z
  .object({
    revision: z.literal(POLICY_STATE_TENSOR_REVISION),
    featureRevision: z.literal(POLICY_FEATURE_REVISION),
    featureCount: z.number().int().positive(),
    features: z.array(z.string()),
    values: z.instanceof(Float32Array),
    stateHint: z.enum(HMM_STATES),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.features.length !== POLICY_FEATURES.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['features'],
        message: `Expected ${POLICY_FEATURES.length} feature names, received ${value.features.length}.`,
      });
    }
    if (value.featureCount !== POLICY_FEATURES.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['featureCount'],
        message: `Expected featureCount ${POLICY_FEATURES.length}, received ${value.featureCount}.`,
      });
    }
    if (value.values.length !== POLICY_FEATURES.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['values'],
        message: `Expected ${POLICY_FEATURES.length} tensor values, received ${value.values.length}.`,
      });
    }
  });

export function buildPolicyStateTensor(input: PolicyStateInput): PolicyStateTensor {
  const raw: Record<PolicyFeatureName, number> = {
    okf_naive_bayes: input.okf.naiveBayesScore,
    okf_logistic: input.okf.logisticRegressionScore,
    okf_margin: input.okf.fitMargin,
    okf_review_or_abstain: input.okf.decision === 'ACCEPT' ? 0 : 1,
    hmm_locate: hmmValue(input, 'LOCATE'),
    hmm_understand: hmmValue(input, 'UNDERSTAND'),
    hmm_trace: hmmValue(input, 'TRACE'),
    hmm_repair: hmmValue(input, 'REPAIR'),
    hmm_validate: hmmValue(input, 'VALIDATE'),
    hmm_recover: hmmValue(input, 'RECOVER'),
    best_cosine: input.retrieval.bestCosine,
    cosine_margin: input.retrieval.cosineMargin,
    lexical_hit_count: input.retrieval.lexicalHitCount,
    rrf_confidence: input.retrieval.rrfConfidence,
    ast_evidence: input.structural.astEvidence,
    symbol_match: input.structural.symbolMatch,
    exact_path_match: input.structural.exactPathMatch,
    graph_seed_count: input.graph.seedCount,
    shortest_path_available: input.graph.shortestPathAvailable ? 1 : 0,
    community_agreement: input.graph.communityAgreement,
    authority: input.graph.authority,
    hop_budget_remaining: input.graph.hopBudgetRemaining,
    compile_failed: input.execution.compileFailed ? 1 : 0,
    test_failed: input.execution.testFailed ? 1 : 0,
    retry_count: input.execution.retryCount,
    historical_success: input.execution.historicalSuccess,
    vram_pressure: input.resource.vramPressure,
    context_pressure: input.resource.contextPressure,
    latency_pressure: input.resource.latencyPressure,
    cache_hit_ratio: input.resource.cacheHitRatio,
  };

  return {
    revision: POLICY_STATE_TENSOR_REVISION,
    featureRevision: POLICY_FEATURE_REVISION,
    featureCount: POLICY_FEATURES.length,
    features: POLICY_FEATURES,
    values: Float32Array.from(POLICY_FEATURES.map((name) => normalizeByRange(raw[name], RANGE[name]))),
    stateHint: input.hmm.stateHint,
  };
}

export function buildPolicyStateVector(input: PolicyStateInput): PolicyStateTensor {
  return buildPolicyStateTensor(input);
}
