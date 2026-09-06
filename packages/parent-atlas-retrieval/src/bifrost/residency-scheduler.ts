import { z } from 'zod';

/**
 * Composition-only scheduler contract. It chooses bounded execution and
 * residency hints; it does not retrieve, write, or promote any artifact.
 * `semantic_768` is the only query representation in this contract. MRL and
 * nested latent views are derived representations for bounded hydration or
 * routing only.
 */

export const SemanticRepresentationV1Schema = z.enum([
  'semantic_768',
  'semantic_mrl_512',
  'semantic_mrl_256',
  'semantic_mrl_128',
  'latent_256',
  'latent_128',
  'latent_64',
]);
export type SemanticRepresentationV1 = z.infer<typeof SemanticRepresentationV1Schema>;

export const ResidencyTierV1Schema = z.enum(['COLD', 'WARM', 'HOT_CPU', 'HOT_GPU']);
export type ResidencyTierV1 = z.infer<typeof ResidencyTierV1Schema>;

export const RetrievalBranchV1Schema = z.enum(['LEXICAL', 'STRUCTURAL', 'SEMANTIC', 'GRAPH']);
export type RetrievalBranchV1 = z.infer<typeof RetrievalBranchV1Schema>;

export const ExecutionHeadroomV1Schema = z.object({
  schema: z.literal('atlas.execution-headroom.v1'),
  cpuWorkerSlots: z.number().int().min(1).max(4),
  maxConcurrentEvidenceBranches: z.number().int().min(1).max(3),
  freeVramBytes: z.number().int().nonnegative(),
  reservedVramBytes: z.number().int().nonnegative(),
  usableVramBytes: z.number().int().nonnegative(),
  gpuAdmission: z.boolean(),
  prefetchDepth: z.number().int().min(0).max(2),
}).strict().superRefine((value, ctx) => {
  if (value.reservedVramBytes > value.freeVramBytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reservedVramBytes'], message: 'reserved VRAM cannot exceed free VRAM' });
  }
  if (value.usableVramBytes !== value.freeVramBytes - value.reservedVramBytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['usableVramBytes'], message: 'usable VRAM must equal free minus reserved' });
  }
  if (value.gpuAdmission && value.usableVramBytes < MIN_GPU_ADMISSION_BYTES) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gpuAdmission'], message: 'GPU admission requires minimum headroom' });
  }
});
export type ExecutionHeadroomV1 = z.infer<typeof ExecutionHeadroomV1Schema>;

export const ResidencyHintV1Schema = z.object({
  representation: SemanticRepresentationV1Schema,
  tier: ResidencyTierV1Schema,
  derivedFrom: SemanticRepresentationV1Schema.nullable(),
  queryExecutable: z.boolean(),
}).strict();
export type ResidencyHintV1 = z.infer<typeof ResidencyHintV1Schema>;

export const ResidencySchedulerPlanV1Schema = z.object({
  schema: z.literal('atlas.residency-scheduler-plan.v1'),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  candidateSnapshotChecksum: z.string().min(1),
  requestedCandidateCount: z.number().int().nonnegative(),
  queryRepresentation: z.literal('semantic_768'),
  selectedBranches: z.array(RetrievalBranchV1Schema).min(1).max(3),
  executionHeadroom: ExecutionHeadroomV1Schema,
  residencyHints: z.array(ResidencyHintV1Schema).min(1),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  modelCallsPerformed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const seen = new Set(value.selectedBranches);
  if (seen.size !== value.selectedBranches.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedBranches'], message: 'branches must be unique' });
  }
  const queryHint = value.residencyHints.find((hint) => hint.representation === 'semantic_768');
  if (!queryHint || !queryHint.queryExecutable || queryHint.derivedFrom !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['residencyHints'], message: 'semantic_768 must be the executable root representation' });
  }
});
export type ResidencySchedulerPlanV1 = z.infer<typeof ResidencySchedulerPlanV1Schema>;

export const MIN_GPU_ADMISSION_BYTES = 256 * 1024 * 1024;
export const RESIDENCY_PROMOTE_SCORE = 0.75;
export const RESIDENCY_RELEASE_SCORE = 0.45;

const MRL_DERIVATIONS: Record<'semantic_mrl_512' | 'semantic_mrl_256' | 'semantic_mrl_128', SemanticRepresentationV1> = {
  semantic_mrl_512: 'semantic_768',
  semantic_mrl_256: 'semantic_768',
  semantic_mrl_128: 'semantic_768',
};

const LATENT_DERIVATIONS: Record<'latent_256' | 'latent_128' | 'latent_64', SemanticRepresentationV1> = {
  latent_256: 'semantic_768',
  latent_128: 'latent_256',
  latent_64: 'latent_128',
};

export function chooseResidencyTierV1(input: {
  score: number;
  currentTier: ResidencyTierV1;
  gpuEligible: boolean;
}): ResidencyTierV1 {
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 1) {
    throw new Error('RESIDENCY_SCORE_OUT_OF_RANGE');
  }

  if (input.currentTier === 'HOT_GPU' && !input.gpuEligible) return 'HOT_CPU';
  if (input.currentTier === 'HOT_GPU' || input.currentTier === 'HOT_CPU') {
    return input.score < RESIDENCY_RELEASE_SCORE ? 'WARM' : input.currentTier;
  }
  if (input.currentTier === 'WARM') {
    if (input.score >= RESIDENCY_PROMOTE_SCORE) return input.gpuEligible ? 'HOT_GPU' : 'HOT_CPU';
    return input.score < RESIDENCY_RELEASE_SCORE ? 'COLD' : 'WARM';
  }
  if (input.score >= RESIDENCY_PROMOTE_SCORE) return input.gpuEligible ? 'HOT_GPU' : 'HOT_CPU';
  return input.score >= RESIDENCY_RELEASE_SCORE ? 'WARM' : 'COLD';
}

function derivedHint(representation: SemanticRepresentationV1, tier: ResidencyTierV1): ResidencyHintV1 {
  if (representation === 'semantic_768') {
    return { representation, tier, derivedFrom: null, queryExecutable: true };
  }
  const derivedFrom = representation.startsWith('semantic_mrl_')
    ? MRL_DERIVATIONS[representation as keyof typeof MRL_DERIVATIONS]
    : LATENT_DERIVATIONS[representation as keyof typeof LATENT_DERIVATIONS];
  return { representation, tier, derivedFrom, queryExecutable: false };
}

export function planResidencySchedulerV1(input: {
  workspaceRevision: string;
  sourceRevision: string;
  candidateSnapshotChecksum: string;
  requestedCandidateCount: number;
  requestedBranches?: RetrievalBranchV1[];
  cpuWorkerSlots?: number;
  freeVramBytes?: number;
  reservedVramBytes?: number;
  gpuAvailable?: boolean;
  prefetchDepth?: number;
  derivedRepresentations?: SemanticRepresentationV1[];
}): ResidencySchedulerPlanV1 {
  if (!Number.isInteger(input.requestedCandidateCount) || input.requestedCandidateCount < 0) {
    throw new Error('REQUESTED_CANDIDATE_COUNT_INVALID');
  }
  const requestedBranches = input.requestedBranches ?? ['LEXICAL', 'SEMANTIC', 'STRUCTURAL'];
  const selectedBranches = [...new Set(requestedBranches)].slice(0, 3);
  if (selectedBranches.length === 0) throw new Error('NO_RETRIEVAL_BRANCHES_REQUESTED');

  const freeVramBytes = Math.max(0, Math.trunc(input.freeVramBytes ?? 0));
  const reservedVramBytes = Math.min(freeVramBytes, Math.max(0, Math.trunc(input.reservedVramBytes ?? 0)));
  const usableVramBytes = freeVramBytes - reservedVramBytes;
  const gpuAdmission = Boolean(input.gpuAvailable) && usableVramBytes >= MIN_GPU_ADMISSION_BYTES && input.requestedCandidateCount > 0;
  const headroom = ExecutionHeadroomV1Schema.parse({
    schema: 'atlas.execution-headroom.v1',
    cpuWorkerSlots: Math.max(1, Math.min(4, Math.trunc(input.cpuWorkerSlots ?? 4))),
    maxConcurrentEvidenceBranches: selectedBranches.length,
    freeVramBytes,
    reservedVramBytes,
    usableVramBytes,
    gpuAdmission,
    prefetchDepth: Math.max(0, Math.min(2, Math.trunc(input.prefetchDepth ?? 1))),
  });
  const hotTier: ResidencyTierV1 = gpuAdmission ? 'HOT_GPU' : 'HOT_CPU';
  const derived = [...new Set(input.derivedRepresentations ?? [])]
    .filter((representation) => representation !== 'semantic_768')
    .map((representation) => derivedHint(representation, 'WARM'));

  return ResidencySchedulerPlanV1Schema.parse({
    schema: 'atlas.residency-scheduler-plan.v1',
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    candidateSnapshotChecksum: input.candidateSnapshotChecksum,
    requestedCandidateCount: input.requestedCandidateCount,
    queryRepresentation: 'semantic_768',
    selectedBranches,
    executionHeadroom: headroom,
    residencyHints: [derivedHint('semantic_768', hotTier), ...derived],
    canonicalAuthority: false,
    writesPerformed: false,
    modelCallsPerformed: false,
  });
}
