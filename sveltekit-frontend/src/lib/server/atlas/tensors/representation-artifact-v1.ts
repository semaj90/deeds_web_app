import { z } from 'zod';

export const RepresentationArtifactV1Schema = z.object({
  schema: z.literal('atlas.representation-artifact.v1'),
  representationId: z.string().min(1),
  representationFamily: z.string().min(1),
  representationRevision: z.string().min(1),
  dimensions: z.number().int().positive(),
  dtype: z.enum(['float32', 'float16', 'int8', 'int4']),
  normalization: z.enum(['none', 'l2']),

  inputRepresentationId: z.string().min(1),
  inputRepresentationRevision: z.string().min(1),
  workspaceId: z.string().min(1),
  repositoryId: z.string().min(1),
  // Stable workspace/repository IDENTITY (above) is not the same claim as an admitted workspace
  // CONTENT revision. workspaceRevision/sourceRevisionDigest are optional -- forcing a fake
  // sha256:-prefixed value here just because the field used to be required would misrepresent
  // "content revision unproven" as "content revision proven". sourceAuthorityStatus records the
  // honest state instead; see SemanticCorpusBundleV1's identical distinction.
  workspaceRevision: z.string().startsWith('sha256:').optional(),
  sourceRevisionDigest: z.string().startsWith('sha256:').optional(),
  sourceAuthorityStatus: z.enum(['PROVEN', 'PARTIAL', 'UNPROVEN']),
  // Retrieval execution coordinates are optional. They belong on a bounded
  // candidate artifact, not on a corpus-wide representation artifact.
  candidateSnapshotRevision: z.string().min(1).optional(),
  ordinalMapChecksum: z.string().min(1).optional(),

  producerId: z.string().min(1),
  // Derived by the producer from its own implementation (source file checksums), never
  // caller-supplied -- a caller cannot assert "trust me, this is producer revision X".
  producerRevision: z.string().min(1),
  modelChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  modelRevision: z.string().min(1),
  parametersDigest: z.string().min(1),
  // Identity of the frozen transform contract (normalization, prefix semantics, quantization,
  // dtype, output ordering, model architecture, postprocessing) -- representationRevision must
  // change if any of these change, not just the model checksum. See
  // "Freeze the nested transform policy explicitly" in LATENT-PHASE16-CONVERGENCE-01B.1.
  transformPolicyRevision: z.string().min(1),
  inputDigest: z.string().min(1),
  inputPopulationChecksum: z.string().min(1),
  outputDigest: z.string().min(1),
  outputPopulationChecksum: z.string().min(1),

  // rowCount = total candidate population size this run considered (before eligibility
  // filtering). eligibleCount = rows that passed the eligibility/staleness filter (e.g. the
  // WHERE clause in backfill_latent_256.py). writtenCount = rows actually written this run —
  // may be less than eligibleCount on a --limit-bounded or interrupted run, and is 0 on a
  // fully-idempotent replay where every eligible row was already current.
  rowCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
  writtenCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  tensorDigest: z.string().min(1),
  artifactDigest: z.string().min(1),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((artifact, ctx) => {
  if (artifact.sourceAuthorityStatus === 'PROVEN' && artifact.sourceRevisionDigest === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceAuthorityStatus'],
      message: 'SOURCE_AUTHORITY_PROVEN_REQUIRES_SOURCE_REVISION_DIGEST',
    });
  }
  if ((artifact.candidateSnapshotRevision === undefined) !== (artifact.ordinalMapChecksum === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidateSnapshotRevision'],
      message: 'CANDIDATE_EXECUTION_COORDINATES_MUST_BE_PROVIDED_TOGETHER',
    });
  }
  if (artifact.eligibleCount > artifact.rowCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['eligibleCount'],
      message: 'ELIGIBLE_COUNT_EXCEEDS_ROW_COUNT',
    });
  }
  if (artifact.writtenCount > artifact.eligibleCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['writtenCount'],
      message: 'WRITTEN_COUNT_EXCEEDS_ELIGIBLE_COUNT',
    });
  }
  if (artifact.processedCount > artifact.eligibleCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['processedCount'],
      message: 'PROCESSED_COUNT_EXCEEDS_ELIGIBLE_COUNT',
    });
  }
});

export type RepresentationArtifactV1 = z.infer<typeof RepresentationArtifactV1Schema>;

export function assertPromotionReadyRepresentationArtifact(
  artifact: RepresentationArtifactV1,
): void {
  if (artifact.representationId === 'ae_latent_64' && artifact.dimensions !== 64) {
    throw new Error('AE_LATENT_64_DIMENSION_MISMATCH');
  }
  if (artifact.inputRepresentationId !== 'semantic_768') {
    throw new Error('LATENT_INPUT_REPRESENTATION_MISMATCH');
  }
  if (artifact.canonicalAuthority !== false) {
    throw new Error('DERIVED_ARTIFACT_CANNOT_CLAIM_CANONICAL_AUTHORITY');
  }
}
