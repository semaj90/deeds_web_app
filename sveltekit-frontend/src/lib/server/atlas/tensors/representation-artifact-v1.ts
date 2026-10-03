import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

const RepresentationArtifactV1BaseSchema = z
  .object({
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
  })
  .strict();

const RepresentationArtifactBodyV1Schema = RepresentationArtifactV1BaseSchema.omit({
  artifactDigest: true,
});

export const RepresentationArtifactV1Schema = RepresentationArtifactV1BaseSchema.superRefine(
  (artifact, ctx) => {
    if (
      artifact.sourceAuthorityStatus === 'PROVEN' &&
      artifact.sourceRevisionDigest === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceAuthorityStatus'],
        message: 'SOURCE_AUTHORITY_PROVEN_REQUIRES_SOURCE_REVISION_DIGEST',
      });
    }
    if (
      (artifact.candidateSnapshotRevision === undefined) !==
      (artifact.ordinalMapChecksum === undefined)
    ) {
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
  }
);

export type RepresentationArtifactV1 = z.infer<typeof RepresentationArtifactV1Schema>;

const REPRESENTATION_ARTIFACT_DIGEST_SCHEMA_V1 = 'atlas.representation-artifact-digest.v1' as const;

function representationArtifactDigestV1(
  body: z.infer<typeof RepresentationArtifactBodyV1Schema>
): string {
  return `sha256:${canonicalSha256V1({ schema: REPRESENTATION_ARTIFACT_DIGEST_SCHEMA_V1, artifact: body })}`;
}

export function buildRepresentationArtifactV1(
  input: z.input<typeof RepresentationArtifactBodyV1Schema>
): RepresentationArtifactV1 {
  const body = RepresentationArtifactBodyV1Schema.parse(input);
  return RepresentationArtifactV1Schema.parse({
    ...body,
    artifactDigest: representationArtifactDigestV1(body),
  });
}

export function assertRepresentationArtifactDigestV1(
  value: RepresentationArtifactV1
): RepresentationArtifactV1 {
  const artifact = RepresentationArtifactV1Schema.parse(value);
  const { artifactDigest, ...body } = artifact;
  if (artifactDigest !== representationArtifactDigestV1(body)) {
    throw new Error('REPRESENTATION_ARTIFACT_DIGEST_MISMATCH');
  }
  return artifact;
}

// This registry preserves the live representation IDs. The producer learns the
// 256- and 128-dimensional stages; the 64-dimensional output is a normalized
// prefix of latent_128. Persistence and mathematical origin remain separate.
export const NESTED_LATENT_REPRESENTATION_FAMILY_V1 = {
  familyId: 'nested-semantic-autoencoder',
  members: {
    latent_256: {
      dimensions: 256,
      physical: true,
      origin: 'LEARNED' as const,
      materialization: 'PERSISTED' as const,
      parentRepresentationId: null as string | null,
      coProducedWith: null as string | null,
      inputRepresentationId: 'semantic_768',
    },
    latent_128: {
      dimensions: 128,
      physical: false,
      origin: 'LEARNED' as const,
      materialization: 'VIRTUAL' as const,
      parentRepresentationId: 'latent_256' as string | null,
      coProducedWith: null as string | null,
      inputRepresentationId: 'latent_256',
    },
    latent_64: {
      dimensions: 64,
      physical: true,
      origin: 'DERIVED' as const,
      materialization: 'PERSISTED' as const,
      parentRepresentationId: 'latent_128' as string | null,
      coProducedWith: null as string | null,
      inputRepresentationId: 'latent_128',
      transform: 'NESTED_PREFIX_L2_RENORMALIZE' as const,
    },
  },
} as const;

export type NestedLatentRepresentationId =
  keyof typeof NESTED_LATENT_REPRESENTATION_FAMILY_V1.members;

export function assertPromotionReadyRepresentationArtifact(
  artifact: RepresentationArtifactV1
): void {
  const member =
    NESTED_LATENT_REPRESENTATION_FAMILY_V1.members[
      artifact.representationId as NestedLatentRepresentationId
    ];
  if (!member) {
    throw new Error('REPRESENTATION_NOT_IN_NESTED_LATENT_FAMILY');
  }
  if (artifact.representationFamily !== NESTED_LATENT_REPRESENTATION_FAMILY_V1.familyId) {
    throw new Error('REPRESENTATION_FAMILY_ID_MISMATCH');
  }
  if (artifact.dimensions !== member.dimensions) {
    throw new Error(`${artifact.representationId.toUpperCase()}_DIMENSION_MISMATCH`);
  }
  if (artifact.inputRepresentationId !== member.inputRepresentationId) {
    throw new Error('LATENT_INPUT_REPRESENTATION_MISMATCH');
  }
  if (artifact.canonicalAuthority !== false) {
    throw new Error('DERIVED_ARTIFACT_CANNOT_CLAIM_CANONICAL_AUTHORITY');
  }
}

/**
 * Cross-artifact check the single-artifact assertion above cannot express: every artifact
 * belonging to the same NestedSemanticAutoencoder family instance must share an identical
 * modelChecksum/modelRevision/parametersDigest/transformPolicyRevision — the exact binding this
 * gate exists to enforce, so a latent_128 (or latent_64) artifact can never be silently derived
 * from one latent_256 checkpoint while claiming a different revision. Pass every artifact
 * produced by one materialization run (typically 2-3: latent_256 + latent_64, and optionally a
 * persisted latent_128 snapshot if one is ever built).
 */
export function assertRepresentationFamilyRevisionBinding(
  artifacts: readonly RepresentationArtifactV1[]
): void {
  for (const artifact of artifacts) assertRepresentationArtifactDigestV1(artifact);

  const familyMembers = artifacts.filter(
    (a) => a.representationId in NESTED_LATENT_REPRESENTATION_FAMILY_V1.members
  );
  if (familyMembers.length < 2) return;
  const [root, ...rest] = familyMembers;
  for (const other of rest) {
    if (
      other.modelChecksum !== root.modelChecksum ||
      other.modelRevision !== root.modelRevision ||
      other.parametersDigest !== root.parametersDigest ||
      other.transformPolicyRevision !== root.transformPolicyRevision
    ) {
      throw new Error(
        `REPRESENTATION_FAMILY_REVISION_MISMATCH:${root.representationId}!=${other.representationId}`
      );
    }
  }

  for (const child of familyMembers) {
    const member =
      NESTED_LATENT_REPRESENTATION_FAMILY_V1.members[
        child.representationId as NestedLatentRepresentationId
      ];
    if (!member.parentRepresentationId) continue;

    const parent = familyMembers.find(
      (candidate) => candidate.representationId === member.parentRepresentationId
    );
    if (!parent)
      throw new Error(`REPRESENTATION_PARENT_ARTIFACT_MISSING:${member.parentRepresentationId}`);
    if (
      child.inputRepresentationId !== parent.representationId ||
      child.inputRepresentationRevision !== parent.representationRevision ||
      child.inputDigest !== parent.outputDigest ||
      child.inputPopulationChecksum !== parent.outputPopulationChecksum
    ) {
      throw new Error(
        `REPRESENTATION_PARENT_REVISION_MISMATCH:${parent.representationId}!=${child.representationId}`
      );
    }
    if (
      child.workspaceId !== parent.workspaceId ||
      child.repositoryId !== parent.repositoryId ||
      child.workspaceRevision !== parent.workspaceRevision ||
      child.sourceRevisionDigest !== parent.sourceRevisionDigest ||
      child.sourceAuthorityStatus !== parent.sourceAuthorityStatus ||
      child.candidateSnapshotRevision !== parent.candidateSnapshotRevision ||
      child.ordinalMapChecksum !== parent.ordinalMapChecksum ||
      child.outputPopulationChecksum !== parent.outputPopulationChecksum ||
      child.rowCount !== parent.rowCount ||
      child.eligibleCount !== parent.eligibleCount
    ) {
      throw new Error(
        `REPRESENTATION_FAMILY_COHORT_MISMATCH:${parent.representationId}!=${child.representationId}`
      );
    }
  }
}
