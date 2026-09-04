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

// LATENT256-REPRESENTATION-CONTRACT-02 (parent-atlas-retrieval-lineage-dag-convergence):
// frozen description of the live NestedSemanticAutoencoder family. Corrects two real gaps found
// live, not assumed:
//   1. This file previously hardcoded a single 'ae_latent_64' / 'semantic_768' special case,
//      which (a) didn't match the naming this file's own test fixtures already use
//      (bare 'latent_256'/'latent_128'/'latent_64', matching the live Postgres column names —
//      never an 'ae_'-prefixed variant anywhere in production), and (b) unconditionally rejected
//      ANY inputRepresentationId other than 'semantic_768' for EVERY representationId, which
//      would incorrectly reject a legitimate latent_128 artifact declaring latent_256 as its
//      input (the actual derived-view relationship this family is supposed to support).
//   2. latent_64 is NOT a pure derived view of latent_256 the way latent_128 is — verified live
//      (see GRAPHIFY... / PARENT ATLAS REPRESENTATION FABRIC registration, and
//      LATENT-PHASE16-OWNER-01 above): codebase_chunk_index.latent_64 is a real, physically
//      persisted vector(64) column with its own HNSW index, written by the SAME
//      NestedSemanticAutoencoder.encode() forward pass as latent_256 (both read content_embedding
//      directly) — not computed on demand by prefixing/renormalizing a persisted latent_256 row.
//      latent_128 genuinely has no physical storage anywhere (no column, no Qdrant collection) —
//      it stays a true derived view.
// LATENT-REPRESENTATION-SEMANTICS-03 (parent-atlas-retrieval-lineage-dag-convergence, 2026-09-03):
// `physical` (above) conflated two independent axes into one boolean, which cannot express
// latent_64's actual shape -- it is NOT a transform of latent_256 (would be `origin: 'DERIVED'`)
// and it IS physically stored (would be `materialization: 'PERSISTED'`), but it is also NOT
// LEARNED-FROM-SCRATCH the way latent_256 is: both are produced by the SAME
// NestedSemanticAutoencoder.encode() forward pass over semantic_768 within one materialization
// run, sharing one modelChecksum/checkpointRevision (see the comment above this const). Modeling
// that as a single `origin`/`materialization` pair per representation would still lose the "same
// forward pass, same checkpoint, two output heads" relationship. `coProducedWith` captures it
// explicitly: latent_64 and latent_256 are marked as siblings of one production event, distinct
// from latent_128's true derived-view relationship (a separate, later, purely mathematical
// transform of an already-persisted latent_256 row). This directly corrects an operator proposal
// in this same OpenSpec change that framed latent_64 as "DERIVED + materialization depending on
// the admitted artifact" -- live evidence (this file's own prior audit, unchanged since) says
// latent_64 is co-produced with latent_256, not derived from it.
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
      origin: 'DERIVED' as const,
      materialization: 'VIRTUAL' as const,
      parentRepresentationId: 'latent_256' as string | null,
      coProducedWith: null as string | null,
      inputRepresentationId: 'latent_256',
      transform: 'NESTED_PREFIX_L2_RENORMALIZE' as const,
    },
    latent_64: {
      dimensions: 64,
      physical: true,
      origin: 'LEARNED' as const,
      materialization: 'PERSISTED' as const,
      parentRepresentationId: null as string | null,
      coProducedWith: 'latent_256' as string | null,
      inputRepresentationId: 'semantic_768',
    },
  },
} as const;

export type NestedLatentRepresentationId = keyof typeof NESTED_LATENT_REPRESENTATION_FAMILY_V1.members;

export function assertPromotionReadyRepresentationArtifact(
  artifact: RepresentationArtifactV1,
): void {
  const member =
    NESTED_LATENT_REPRESENTATION_FAMILY_V1.members[
      artifact.representationId as NestedLatentRepresentationId
    ];
  if (member) {
    if (artifact.dimensions !== member.dimensions) {
      throw new Error(`${artifact.representationId.toUpperCase()}_DIMENSION_MISMATCH`);
    }
    if (artifact.inputRepresentationId !== member.inputRepresentationId) {
      throw new Error('LATENT_INPUT_REPRESENTATION_MISMATCH');
    }
  } else if (artifact.inputRepresentationId !== 'semantic_768') {
    // Unrecognized representationId (not a member of this frozen family) — fall back to the
    // original, stricter default rather than silently accepting an unknown shape.
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
  artifacts: readonly RepresentationArtifactV1[],
): void {
  const familyMembers = artifacts.filter(
    (a) => a.representationId in NESTED_LATENT_REPRESENTATION_FAMILY_V1.members,
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
        `REPRESENTATION_FAMILY_REVISION_MISMATCH:${root.representationId}!=${other.representationId}`,
      );
    }
  }
}
