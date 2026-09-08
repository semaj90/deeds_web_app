import { z } from 'zod';

/**
 * AtlasPassCheckpointV1 — the shared resumability contract for bounded, resumable compute passes
 * (K-means, PCA/SVD, SOM training, Graphify AST/graph lowering, Hilbert-range topology enrichment,
 * agent/error-fixing traversal). See
 * openspec/changes/parent-atlas-packet-control-word-record/specs/pass-checkpoint/spec.md.
 *
 * Checkpoint taxonomy — do NOT conflate these four kinds of "checkpoint":
 *   1. ML activation checkpoint (`torch.utils.checkpoint`) — PyTorch forward/backward memory
 *      tradeoff (recompute vs. store). Not modeled here at all.
 *   2. AtlasPassCheckpointV1 (this contract) — bounded, resumable compute-pass state: identity +
 *      revisions + input checksum + algorithm state + derived-artifact checksum + ordinal mapping
 *      + convergence state.
 *   3. Residency checkpoint — what's currently hot in VRAM/RAM/BitFrost/SeaweedFS. Already covered
 *      by the existing ACE/BitFrost residency state (residency/packet-lod-v1.ts); not redefined
 *      here.
 *   4. LLM KV cache — ephemeral model execution state. Never persisted as durable state, never
 *      serialized into this contract or any other durable Atlas contract.
 */

export const ATLAS_PASS_CHECKPOINT_SCHEMA = 'atlas.pass-checkpoint.v1' as const;

export const ATLAS_PASS_CHECKPOINT_STOP_REASONS = [
  'RELATIVE_TOLERANCE',
  'MAX_ITERATIONS',
  'NO_ASSIGNMENT_CHANGE',
  'NUMERIC_FAILURE',
  'BOUNDED_RANGE_COMPLETE',
] as const;
export type AtlasPassCheckpointStopReason = (typeof ATLAS_PASS_CHECKPOINT_STOP_REASONS)[number];

export const AtlasPassConvergenceMetricSchema = z
  .object({
    previous: z.number(),
    current: z.number(),
    relativeImprovement: z.number(),
  })
  .strict();
export type AtlasPassConvergenceMetric = z.infer<typeof AtlasPassConvergenceMetricSchema>;

export const AtlasPassCheckpointV1Schema = z
  .object({
    schema: z.literal(ATLAS_PASS_CHECKPOINT_SCHEMA),
    passId: z.string().min(1),
    algorithmRevision: z.string().min(1),
    inputSnapshotChecksum: z.string().min(1),
    seed: z.number().int().optional(),
    iteration: z.number().int().nonnegative(),
    maxIterations: z.number().int().positive(),
    convergenceMetric: AtlasPassConvergenceMetricSchema.optional(),
    derivedArtifactChecksum: z.string().min(1),
    ordinalMapChecksum: z.string().min(1),
    converged: z.boolean(),
    stopReason: z.enum(ATLAS_PASS_CHECKPOINT_STOP_REASONS).nullable(),
  })
  .strict()
  .refine((c) => c.iteration <= c.maxIterations, {
    message: 'iteration must not exceed maxIterations',
  })
  .refine((c) => !(c.converged || c.iteration >= c.maxIterations) || c.stopReason !== null, {
    message: 'stopReason must be set (non-null) once a pass has converged or terminated',
  });
export type AtlasPassCheckpointV1 = z.infer<typeof AtlasPassCheckpointV1Schema>;

/**
 * createAtlasPassCheckpointV1 — construct a checkpoint for a pass still in progress (or one that
 * just converged/terminated on this call). Callers own computing `derivedArtifactChecksum` and
 * `ordinalMapChecksum` from their own pass state; this function does not compute checksums itself
 * since the checksummed artifact shape differs per algorithm (K-means centroids vs. PCA
 * components vs. SOM weight grid, etc.).
 */
export function createAtlasPassCheckpointV1(input: {
  passId: string;
  algorithmRevision: string;
  inputSnapshotChecksum: string;
  seed?: number;
  iteration: number;
  maxIterations: number;
  convergenceMetric?: AtlasPassConvergenceMetric;
  derivedArtifactChecksum: string;
  ordinalMapChecksum: string;
  converged: boolean;
  stopReason?: AtlasPassCheckpointStopReason | null;
}): AtlasPassCheckpointV1 {
  return AtlasPassCheckpointV1Schema.parse({
    schema: ATLAS_PASS_CHECKPOINT_SCHEMA,
    passId: input.passId,
    algorithmRevision: input.algorithmRevision,
    inputSnapshotChecksum: input.inputSnapshotChecksum,
    seed: input.seed,
    iteration: input.iteration,
    maxIterations: input.maxIterations,
    convergenceMetric: input.convergenceMetric,
    derivedArtifactChecksum: input.derivedArtifactChecksum,
    ordinalMapChecksum: input.ordinalMapChecksum,
    converged: input.converged,
    stopReason: input.stopReason ?? null,
  });
}

/**
 * canResumeAtlasPassCheckpointV1 — a resume attempt is only valid against the SAME input snapshot
 * and algorithm revision the checkpoint was taken under; otherwise "resuming" would silently
 * splice together state from two different problems.
 */
export function canResumeAtlasPassCheckpointV1(
  checkpoint: AtlasPassCheckpointV1,
  current: { algorithmRevision: string; inputSnapshotChecksum: string },
): boolean {
  return (
    !checkpoint.converged &&
    checkpoint.stopReason === null &&
    checkpoint.algorithmRevision === current.algorithmRevision &&
    checkpoint.inputSnapshotChecksum === current.inputSnapshotChecksum
  );
}
