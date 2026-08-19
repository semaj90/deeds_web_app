import {
  sampleQueryAdaptiveCandidates,
  buildQueryAdaptiveSamplingReceipt,
  type QueryAdaptiveCandidate,
  type QueryAdaptiveSample,
  type QueryAdaptiveSamplingReceipt,
} from '../retrieval/query-adaptive-sampler.js';
import { defaultTangLanePolicy, type TangLifecycleLane, type TangLanePolicyV1 } from './lifecycle-policy.js';

export interface TangLaneSampleResult {
  lane: TangLifecycleLane;
  policy: TangLanePolicyV1;
  samples: QueryAdaptiveSample[];
  receipt: QueryAdaptiveSamplingReceipt;
}

export function sampleTangLifecycleLane(input: {
  lane: TangLifecycleLane;
  candidates: QueryAdaptiveCandidate[];
  workspaceRevision: string;
  representationRevision: string;
  queryRevision: string;
  featureRevision?: string | null;
  policy?: TangLanePolicyV1;
  seed?: string;
}): TangLaneSampleResult {
  const policy = input.policy ?? defaultTangLanePolicy(input.lane);
  if (policy.lane !== input.lane) throw new Error(`Tang policy lane mismatch: ${policy.lane} != ${input.lane}`);

  const bounded = input.candidates.slice(0, policy.budgets.maxCandidates);
  const samples = sampleQueryAdaptiveCandidates({
    candidates: bounded,
    weights: policy.weights,
    sampleSize: Math.min(policy.sampleSize, bounded.length || 1),
    seed: input.seed ?? `${policy.seedNamespace}:${input.queryRevision}`,
  });

  const receipt = buildQueryAdaptiveSamplingReceipt({
    status: bounded.length > 0 ? 'PROVEN_INPUT' : 'DEFERRED_NO_FEATURE_MATRIX',
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    queryRevision: input.queryRevision,
    candidateCount: bounded.length,
    featureRevision: input.featureRevision ?? null,
    samples,
  });

  return { lane: input.lane, policy, samples, receipt };
}
