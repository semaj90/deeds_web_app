import { z } from 'zod';
import { HMM_STATES, type HmmState } from './policy-types.js';

/**
 * Deterministic pattern extraction sits BEFORE DSPy/RL policy selection.
 * It summarizes already-observed evidence; it does not invent evidence or
 * mutate HMM legality. This gives the deterministic baseline, DSPy shadow
 * program, and learned policy the same revisioned input vocabulary.
 */
export const PolicyPatternInputV1Schema = z.object({
  schema: z.literal('atlas.policy-pattern-input.v1'),
  queryClass: z.string().min(1),
  classifier: z.object({
    naiveBayes: z.number().finite().min(0).max(1),
    logistic: z.number().finite().min(0).max(1),
    margin: z.number().finite().min(0).max(1),
    abstain: z.boolean(),
  }).strict(),
  hmmPosterior: z.record(z.enum(HMM_STATES), z.number().finite().min(0).max(1)),
  retrieval: z.object({
    bm25: z.number().finite().nullable(),
    bm42Experimental: z.number().finite().nullable(),
    denseCosine: z.number().finite().min(-1).max(1).nullable(),
    latent128Affinity: z.number().finite().min(-1).max(1).nullable(),
    latent64Affinity: z.number().finite().min(-1).max(1).nullable(),
    rerankerScore: z.number().finite().nullable(),
  }).strict(),
  structural: z.object({
    astEvidence: z.number().finite().min(0).max(1),
    quaternionAffinity: z.number().finite().min(0).max(1).nullable(),
    pageRank: z.number().finite().min(0).nullable(),
    hitsHub: z.number().finite().min(0).nullable(),
    hitsAuthority: z.number().finite().min(0).nullable(),
    communityAgreement: z.number().finite().min(0).max(1),
    naryHyperedgeCoverage: z.number().finite().min(0).max(1),
  }).strict(),
  execution: z.object({
    compileFailed: z.boolean(),
    testFailed: z.boolean(),
    retryCount: z.number().int().nonnegative(),
    historicalSuccess: z.number().finite().min(0).max(1),
  }).strict(),
  resource: z.object({
    vramPressure: z.number().finite().min(0).max(1),
    contextPressure: z.number().finite().min(0).max(1),
    latencyPressure: z.number().finite().min(0).max(1),
    cacheHitRatio: z.number().finite().min(0).max(1),
  }).strict(),
  revisions: z.object({
    workspaceRevision: z.string().min(1),
    featureRevision: z.string().min(1),
    graphRevision: z.string().min(1).nullable(),
    representationRevision: z.string().min(1),
  }).strict(),
}).strict();
export type PolicyPatternInputV1 = z.infer<typeof PolicyPatternInputV1Schema>;

export const PolicyPatternVectorV1Schema = z.object({
  schema: z.literal('atlas.policy-pattern-vector.v1'),
  stateHint: z.enum(HMM_STATES),
  stateConfidence: z.number().finite().min(0).max(1),
  classifierDisagreement: z.number().finite().min(0).max(1),
  lexicalStrength: z.number().finite().min(0).max(1),
  lexicalDisagreement: z.number().finite().min(0).max(1),
  semanticStrength: z.number().finite().min(0).max(1),
  lowRankAgreement: z.number().finite().min(0).max(1),
  graphAuthorityStrength: z.number().finite().min(0).max(1),
  graphPartitionStrength: z.number().finite().min(0).max(1),
  hypergraphStrength: z.number().finite().min(0).max(1),
  structuralStrength: z.number().finite().min(0).max(1),
  failurePressure: z.number().finite().min(0).max(1),
  resourcePressure: z.number().finite().min(0).max(1),
  cacheUtility: z.number().finite().min(0).max(1),
  producerRevision: z.string().min(1),
}).strict();
export type PolicyPatternVectorV1 = z.infer<typeof PolicyPatternVectorV1Schema>;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const normalizedPositive = (x: number | null): number => x == null ? 0 : clamp01(x / (1 + x));
const cosine01 = (x: number | null): number => x == null ? 0 : clamp01((x + 1) / 2);

function bestHmmState(posterior: Partial<Record<HmmState, number>>): { state: HmmState; confidence: number } {
  const ranked = HMM_STATES.map((state) => ({ state, value: posterior[state] ?? 0 }))
    .sort((a, b) => b.value - a.value || a.state.localeCompare(b.state));
  return { state: ranked[0]?.state ?? 'LOCATE', confidence: clamp01(ranked[0]?.value ?? 0) };
}

/**
 * Score normalization here is ONLY for policy pattern extraction. Original
 * BM25/BM42/reranker values remain in their own receipts and are not fused into
 * a new canonical retrieval score.
 */
export function extractPolicyPattern(
  inputValue: PolicyPatternInputV1,
  producerRevision: string,
): PolicyPatternVectorV1 {
  const input = PolicyPatternInputV1Schema.parse(inputValue);
  const hmm = bestHmmState(input.hmmPosterior);
  const classifierDisagreement = clamp01(Math.abs(input.classifier.naiveBayes - input.classifier.logistic));

  const bm25 = normalizedPositive(input.retrieval.bm25);
  const bm42 = normalizedPositive(input.retrieval.bm42Experimental);
  const lexicalPresent = input.retrieval.bm25 != null || input.retrieval.bm42Experimental != null;
  const lexicalStrength = lexicalPresent ? Math.max(bm25, bm42) : 0;
  const lexicalDisagreement = input.retrieval.bm25 != null && input.retrieval.bm42Experimental != null
    ? Math.abs(bm25 - bm42)
    : 0;

  const dense = cosine01(input.retrieval.denseCosine);
  const latent128 = cosine01(input.retrieval.latent128Affinity);
  const latent64 = cosine01(input.retrieval.latent64Affinity);
  const lowRankPresent = input.retrieval.latent128Affinity != null || input.retrieval.latent64Affinity != null;
  const lowRankAgreement = lowRankPresent
    ? clamp01(1 - (Math.abs(dense - latent128) + Math.abs(dense - latent64)) / 2)
    : 0;

  const graphAuthorityStrength = Math.max(
    normalizedPositive(input.structural.pageRank),
    normalizedPositive(input.structural.hitsHub),
    normalizedPositive(input.structural.hitsAuthority),
  );
  const quaternion = input.structural.quaternionAffinity ?? 0;
  const structuralStrength = clamp01((input.structural.astEvidence + quaternion) / (input.structural.quaternionAffinity == null ? 1 : 2));
  const failurePressure = clamp01(
    (Number(input.execution.compileFailed) + Number(input.execution.testFailed) + Math.min(1, input.execution.retryCount / 4)) / 3,
  );
  const resourcePressure = clamp01(
    Math.max(input.resource.vramPressure, input.resource.contextPressure, input.resource.latencyPressure),
  );

  return PolicyPatternVectorV1Schema.parse({
    schema: 'atlas.policy-pattern-vector.v1',
    stateHint: hmm.state,
    stateConfidence: hmm.confidence,
    classifierDisagreement,
    lexicalStrength,
    lexicalDisagreement,
    semanticStrength: dense,
    lowRankAgreement,
    graphAuthorityStrength,
    graphPartitionStrength: input.structural.communityAgreement,
    hypergraphStrength: input.structural.naryHyperedgeCoverage,
    structuralStrength,
    failurePressure,
    resourcePressure,
    cacheUtility: input.resource.cacheHitRatio,
    producerRevision,
  });
}

/** Viterbi may consume these emissions, but transition legality remains external and revisioned. */
export function policyPatternAsHmmEmissions(pattern: PolicyPatternVectorV1): Partial<Record<HmmState, number>> {
  const p = PolicyPatternVectorV1Schema.parse(pattern);
  return {
    LOCATE: clamp01((1 - p.semanticStrength + p.lexicalStrength) / 2),
    UNDERSTAND: clamp01((p.semanticStrength + p.structuralStrength) / 2),
    TRACE: clamp01((p.graphAuthorityStrength + p.hypergraphStrength) / 2),
    REPAIR: clamp01((p.failurePressure + p.structuralStrength) / 2),
    VALIDATE: clamp01(1 - p.failurePressure),
    RECOVER: clamp01((p.failurePressure + p.resourcePressure) / 2),
  };
}
