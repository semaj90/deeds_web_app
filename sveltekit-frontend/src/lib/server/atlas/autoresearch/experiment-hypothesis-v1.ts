import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';
import { SUPPORTED_DTYPES } from './hardware-profile-v1.js';

/**
 * AUTORESEARCH-01: ExperimentHypothesisV1.
 *
 * Pure schema + admission check. No execution, no GPU touch, no worktree
 * creation -- that is AUTORESEARCH-03+, out of scope here. Per
 * openspec/changes/parent-atlas-autoresearch-fabric/proposal.md: "one
 * declared, independent change per hypothesis instance", reference
 * implementation is always PyTorch/ATen (AUTORESEARCH-08's own invariant,
 * asserted here as a schema literal so a hypothesis cannot silently name a
 * different reference), and a hypothesis carries no identity authority.
 */

export const EXPERIMENT_HYPOTHESIS_SCHEMA = 'atlas.autoresearch.experiment-hypothesis.v1' as const;

export const CHALLENGER_PROVIDERS = Object.freeze([
  'CUDA_SIMT',
  'CUTILE',
  'TRITON',
  'CUTLASS',
  'CUTEDSL',
] as const);
export type ChallengerProvider = typeof CHALLENGER_PROVIDERS[number];

export const BENCHMARK_METRICS = Object.freeze([
  'p50_latency_ms',
  'p95_latency_ms',
  'peak_vram_bytes',
  'end_to_end_ms',
] as const);
export type BenchmarkMetric = typeof BENCHMARK_METRICS[number];

const positiveInt = z.number().int().positive();

export const inputSpecSchema = z.object({
  dtype: z.enum(SUPPORTED_DTYPES),
  shape: z.array(positiveInt).min(1).max(4),
}).strict();
export type InputSpecV1 = z.infer<typeof inputSpecSchema>;

export const correctnessContractSchema = z.object({
  /** Identifies the exact fixture (e.g. a checksum over the fixture tensor set); no OOB, no speculative shapes. */
  fixtureChecksum: sha256HexSchema,
  toleranceAbs: z.number().nonnegative(),
  toleranceRel: z.number().nonnegative(),
  noOutOfBoundsAccess: z.literal(true),
  deterministicReplayRequired: z.literal(true),
}).strict();
export type CorrectnessContractV1 = z.infer<typeof correctnessContractSchema>;

export const benchmarkRequirementsSchema = z.object({
  warmupIterations: positiveInt,
  measuredIterations: positiveInt,
  requiredMetrics: z.array(z.enum(BENCHMARK_METRICS)).min(1),
  endToEndRequired: z.literal(true),
}).strict().superRefine((value, ctx) => {
  const set = new Set(value.requiredMetrics);
  if (set.size !== value.requiredMetrics.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredMetrics'], message: 'BENCHMARK_REQUIREMENTS_DUPLICATE_METRIC' });
  }
  if (!set.has('end_to_end_ms')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredMetrics'], message: 'BENCHMARK_REQUIREMENTS_MUST_INCLUDE_END_TO_END' });
  }
});
export type BenchmarkRequirementsV1 = z.infer<typeof benchmarkRequirementsSchema>;

export const promotionThresholdSchema = z.object({
  metric: z.enum(BENCHMARK_METRICS),
  minImprovementPct: z.number().positive(),
  zeroCorrectnessRegression: z.literal(true),
}).strict();
export type PromotionThresholdV1 = z.infer<typeof promotionThresholdSchema>;

export const experimentHypothesisV1Schema = z.object({
  schema: z.literal(EXPERIMENT_HYPOTHESIS_SCHEMA),
  hypothesisId: z.string().min(1),
  /** e.g. "RMSNormV1". Names the operation, not a vague goal like "make it faster". */
  targetOperation: z.string().min(1),
  hardwareProfileChecksum: sha256HexSchema,
  /** AUTORESEARCH-08: the reference implementation is always PyTorch/ATen. */
  referenceProvider: z.literal('PYTORCH_ATEN'),
  referenceRevision: z.string().min(1),
  allowedChallengers: z.array(z.enum(CHALLENGER_PROVIDERS)).min(1),
  inputSpec: inputSpecSchema,
  correctnessContract: correctnessContractSchema,
  benchmarkRequirements: benchmarkRequirementsSchema,
  promotionThreshold: promotionThresholdSchema,
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  createdAt: z.string().datetime(),
  producerRevision: z.string().min(1),
  hypothesisChecksum: sha256HexSchema,
}).strict().superRefine((value, ctx) => {
  const set = new Set(value.allowedChallengers);
  if (set.size !== value.allowedChallengers.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedChallengers'], message: 'EXPERIMENT_HYPOTHESIS_DUPLICATE_CHALLENGER' });
  }
  const { hypothesisChecksum, ...body } = value;
  if (canonicalSha256V1(body) !== hypothesisChecksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hypothesisChecksum'], message: 'EXPERIMENT_HYPOTHESIS_CHECKSUM_MISMATCH' });
  }
});

export type ExperimentHypothesisV1 = z.infer<typeof experimentHypothesisV1Schema>;

export function buildExperimentHypothesisV1(
  input: Omit<z.input<typeof experimentHypothesisV1Schema>, 'schema' | 'identityAuthority' | 'canonicalOwnerChanged' | 'hypothesisChecksum'>,
): ExperimentHypothesisV1 {
  const body = {
    schema: EXPERIMENT_HYPOTHESIS_SCHEMA,
    ...input,
    identityAuthority: false as const,
    canonicalOwnerChanged: false as const,
  };
  return experimentHypothesisV1Schema.parse({
    ...body,
    hypothesisChecksum: canonicalSha256V1(body),
  });
}

/**
 * AUTORESEARCH-01 admission rule: reject a hypothesis that exactly duplicates
 * an already-admitted one (same target operation, hardware profile,
 * reference revision, and input spec). This is the simple interim exact-
 * match check named in tasks.md -- the fuzzier "nearest prior experiment"
 * lookup is AUTORESEARCH-15 (HyperGraphRAG-backed), not built here.
 */
export function admitExperimentHypothesisV1(
  candidate: ExperimentHypothesisV1,
  alreadyAdmitted: readonly ExperimentHypothesisV1[],
): { status: 'ADMITTED' | 'REJECTED'; reason: string | null } {
  const duplicate = alreadyAdmitted.find((existing) =>
    existing.targetOperation === candidate.targetOperation &&
    existing.hardwareProfileChecksum === candidate.hardwareProfileChecksum &&
    existing.referenceRevision === candidate.referenceRevision &&
    JSON.stringify(existing.inputSpec) === JSON.stringify(candidate.inputSpec)
  );
  if (duplicate) {
    return { status: 'REJECTED', reason: `EXPERIMENT_HYPOTHESIS_DUPLICATE_OF:${duplicate.hypothesisId}` };
  }
  return { status: 'ADMITTED', reason: null };
}
