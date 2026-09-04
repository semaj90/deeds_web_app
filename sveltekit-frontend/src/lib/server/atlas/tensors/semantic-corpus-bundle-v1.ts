import { z } from 'zod';

/**
 * SemanticCorpusBundleV1 — the admitted input-authority object for Phase 16 (and any other
 * consumer that needs to know "which exact semantic_768 corpus" it is reading).
 *
 * authorityScope is REPRESENTATION_INPUT, not CANONICAL_SOURCE_LINEAGE: this bundle proves the
 * exact semantic_768 population, its representation revision, its producer, and a deterministic
 * population checksum -- it does NOT claim the underlying source/workspace world has been
 * canonically lineage-qualified. That is a separate, still-open authority (LINEAGE-01), and this
 * bundle must never pretend otherwise. `canonicalAuthority` is always `false`.
 *
 * sourceAuthorityStatus records that distinction explicitly rather than forcing a binary
 * admitted/not-admitted collapse: PROVEN (an independently admitted workspace/source revision
 * exists and is referenced), PARTIAL (real evidence exists on one or both sides but promotion is
 * not proven -- e.g. a workspace revision value exists but revisionOwnerProven=false, or a source
 * audit proves individual byte-matches but not a corpus-wide source-set revision), or UNPROVEN
 * (no meaningful evidence at all). sourceSnapshotRevision/sourceRevisionSetChecksum are optional
 * and must only be populated when an actual authoritative owner supplies them -- never fabricated
 * to satisfy this schema.
 */
export const SemanticCorpusBundleV1Schema = z.object({
  schemaVersion: z.literal('semantic-corpus-bundle.v1'),

  workspaceId: z.string().min(1),
  repositoryId: z.string().min(1),

  representationId: z.literal('semantic_768'),
  // Revision of the semantic_768 INPUT representation itself -- derived from the real producer's
  // constituents (model tag, prompt/formatting policy, producer implementation revision), never
  // a hardcoded string.
  representationRevision: z.string().min(1),

  // Frozen description of which rows count as "eligible" for this bundle (e.g. "embedding_model
  // = X AND content_embedding_768 IS NOT NULL"), hashed. Must change if the eligibility definition
  // changes, independent of whether the underlying data changes.
  eligibilityPolicyRevision: z.string().min(1),

  eligibleCount: z.number().int().nonnegative(),
  // Deterministic checksum over the ordered eligible population: ORDER BY stable chunk identity,
  // hash(chunk identity, semantic input digest, semantic representation revision, eligibility
  // status) per row. Never a checksum of raw row order, timestamps, or vector bytes alone.
  populationChecksum: z.string().min(1),

  modelRevision: z.string().min(1),
  producerRevision: z.string().min(1),

  sourceAuthorityStatus: z.enum(['PROVEN', 'PARTIAL', 'UNPROVEN']),
  sourceSnapshotRevision: z.string().min(1).optional(),
  sourceRevisionSetChecksum: z.string().min(1).optional(),

  // Bundle-level checksum over every field above (computed last, excluded from its own input).
  checksum: z.string().min(1),

  canonicalAuthority: z.literal(false),
  authorityScope: z.literal('REPRESENTATION_INPUT'),
}).strict().superRefine((bundle, ctx) => {
  if (bundle.sourceAuthorityStatus === 'PROVEN'
    && bundle.sourceSnapshotRevision === undefined
    && bundle.sourceRevisionSetChecksum === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceAuthorityStatus'],
      message: 'SOURCE_AUTHORITY_PROVEN_REQUIRES_A_REFERENCED_SOURCE_REVISION',
    });
  }
});

export type SemanticCorpusBundleV1 = z.infer<typeof SemanticCorpusBundleV1Schema>;
