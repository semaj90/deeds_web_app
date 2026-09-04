import { z } from 'zod';

/**
 * LATENT-SOURCE-MANIFEST-01 (parent-atlas-retrieval-lineage-dag-convergence, 2026-09-04).
 *
 * LatentSourceManifestV1 is the checksum-sealed provenance of a latent tensor: exact
 * CandidateOrdinal universe + semantic input representation/revision + learned family/checkpoint/
 * model parameters + parent representation/derivation policy + output tensor checksum. Storage
 * location and execution backend (Postgres row, Qdrant point, GPU runtime, BitFrost cache slot,
 * the :8121 neural-decoder service) are separate MATERIALIZATION metadata and do NOT define
 * latent source identity -- see RepresentationMaterializationV1 below.
 *
 * Cohort/artifact-level, NOT per-CandidateOrdinal-row: one manifest covers the whole admitted
 * cohort producing one representation output at one revision, matching this repo's existing
 * artifact-level (not row-level) provenance contracts (CandidateFeatureMatrixManifestV1,
 * RepresentationArtifactV1). Putting the full semantic->checkpoint->latent provenance chain on
 * every candidate row would duplicate an identity surface this repo already keeps at the artifact
 * level.
 *
 * The producer contract is prefix-derived: `NestedSemanticAutoencoder.encode()` emits latent_256
 * and then creates latent_128 and latent_64 by prefix slicing and L2 renormalization. The schema
 * therefore treats latent_128 and latent_64 as DERIVED views of latent_256, while keeping storage
 * materialization separate from mathematical origin.
 */

export const LATENT_SOURCE_MANIFEST_V1 = 'atlas.latent-source-manifest.v1' as const;

const revision = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
const artifactRef = z.string().min(1);

export const latentOutputOriginV1Schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('LEARNED'),
    /** Set only for latent_64: the sibling representation co-produced by the same forward pass
     * (currently always 'latent_256'). Null for latent_256 itself, which has no sibling. */
    coProducedWith: z.enum(['latent_256']).nullable(),
  }).strict(),
  z.object({
    kind: z.literal('DERIVED'),
    parentRepresentationId: z.literal('latent_256'),
    parentRepresentationRevision: revision,
    transform: z.literal('NESTED_PREFIX_L2_RENORMALIZE'),
    prefixDimensions: z.union([z.literal(128), z.literal(64)]),
    parentVectorsChecksum: sha256Hex,
  }).strict(),
]);
export type LatentOutputOriginV1 = z.infer<typeof latentOutputOriginV1Schema>;

export const latentSourceManifestV1Schema = z.object({
  schema: z.literal(LATENT_SOURCE_MANIFEST_V1),

  candidateSnapshotRevision: artifactRef,
  candidateOrdinalMapChecksum: sha256Hex,
  candidateCount: z.number().int().positive(),

  inputRepresentation: z.object({
    representationId: z.literal('semantic_768'),
    representationRevision: revision,
    artifactRef,
    vectorsChecksum: sha256Hex,
    ordinalAlignmentChecksum: sha256Hex,
  }).strict(),

  latentFamily: z.object({
    familyId: z.literal('nested-semantic-autoencoder'),
    familyRevision: revision,
    checkpointRevision: revision,
    modelChecksum: sha256Hex,
    parametersDigest: z.string().min(1),
    transformPolicyRevision: revision,
  }).strict(),

  output: z.object({
    representationId: z.enum(['latent_256', 'latent_128', 'latent_64']),
    representationRevision: revision,
    dimensions: z.union([z.literal(256), z.literal(128), z.literal(64)]),
    origin: latentOutputOriginV1Schema,
  }).strict(),

  outputVectorsChecksum: sha256Hex,
  ordinalAlignmentChecksum: sha256Hex,
  sourceManifestChecksum: sha256Hex,

  canonicalAuthority: z.literal(false),
}).strict().superRefine((manifest, ctx) => {
  const { output } = manifest;
  const expectedDims: Record<string, 256 | 128 | 64> = { latent_256: 256, latent_128: 128, latent_64: 64 };
  if (output.dimensions !== expectedDims[output.representationId]) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['output', 'dimensions'], message: 'LATENT_SOURCE_MANIFEST_DIMENSION_MISMATCH' });
  }
  if (output.representationId === 'latent_256') {
    if (output.origin.kind !== 'LEARNED' || output.origin.coProducedWith !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['output', 'origin'], message: 'LATENT_256_MUST_BE_LEARNED_WITH_NO_SIBLING' });
    }
  }
  if (output.representationId === 'latent_64') {
    if (output.origin.kind !== 'DERIVED' || output.origin.prefixDimensions !== 64) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['output', 'origin'], message: 'LATENT_64_MUST_BE_DERIVED_WITH_PREFIX_DIMENSIONS_64' });
    }
  }
  if (output.representationId === 'latent_128') {
    if (output.origin.kind !== 'DERIVED' || output.origin.prefixDimensions !== 128) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['output', 'origin'], message: 'LATENT_128_MUST_BE_DERIVED_WITH_PREFIX_DIMENSIONS_128' });
    }
  }
});
export type LatentSourceManifestV1 = z.infer<typeof latentSourceManifestV1Schema>;

export function buildLatentSourceManifestV1(
  input: Omit<LatentSourceManifestV1, 'schema' | 'canonicalAuthority'>,
): LatentSourceManifestV1 {
  return latentSourceManifestV1Schema.parse({
    ...input,
    schema: LATENT_SOURCE_MANIFEST_V1,
    canonicalAuthority: false as const,
  });
}

/**
 * Storage location / execution backend -- deliberately separate from LatentSourceManifestV1.
 * "latent_256 read from Postgres" and "latent_256 returned from :8121" can be the SAME
 * mathematical source (same sourceManifestChecksum) materialized two different ways.
 */
export const representationMaterializationV1Schema = z.object({
  kind: z.enum(['POSTGRES', 'QDRANT', 'DERIVED_RUNTIME', 'GPU_RUNTIME', 'BITFROST_CACHE']),
  artifactRef,
  storageRevision: revision.optional(),
  materializationChecksum: sha256Hex,
}).strict();
export type RepresentationMaterializationV1 = z.infer<typeof representationMaterializationV1Schema>;

/**
 * What CandidateFeatureMatrixManifestV1's representation columns (latent256Ref, latent128ViewRef,
 * latent64ViewRef) should each point to: the tensor AND the manifest that proves how it was
 * produced. representationId 'semantic_768' has no LatentSourceManifestV1 (it is the canonical
 * input, not a latent output) -- sourceManifestRef/sourceManifestChecksum are optional for that
 * case only.
 */
export const candidateRepresentationBindingV1Schema = z.object({
  representationId: z.enum(['semantic_768', 'latent_256', 'latent_128', 'latent_64']),
  representationRevision: revision,
  dimensions: z.number().int().positive(),

  representationArtifactRef: artifactRef,
  representationVectorsChecksum: sha256Hex,

  sourceManifestRef: artifactRef.optional(),
  sourceManifestChecksum: sha256Hex.optional(),

  candidateSnapshotRevision: artifactRef,
  candidateOrdinalMapChecksum: sha256Hex,
  ordinalAlignmentChecksum: sha256Hex,

  presenceMaskRef: artifactRef.optional(),
  presenceMaskChecksum: sha256Hex,

  canonicalAuthority: z.boolean(),
}).strict().superRefine((binding, ctx) => {
  const requiresSourceManifest = binding.representationId !== 'semantic_768';
  const hasSourceManifest = binding.sourceManifestRef !== undefined && binding.sourceManifestChecksum !== undefined;
  if (requiresSourceManifest && !hasSourceManifest) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceManifestRef'], message: 'LATENT_REPRESENTATION_BINDING_REQUIRES_SOURCE_MANIFEST' });
  }
  if (!requiresSourceManifest && hasSourceManifest) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceManifestRef'], message: 'SEMANTIC_768_BINDING_MUST_NOT_CLAIM_A_LATENT_SOURCE_MANIFEST' });
  }
});
export type CandidateRepresentationBindingV1 = z.infer<typeof candidateRepresentationBindingV1Schema>;
