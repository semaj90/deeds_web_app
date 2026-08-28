import { z } from 'zod';

export const RepresentationArtifactV1Schema = z.object({
  schema: z.literal('atlas.representation-artifact.v1'),
  representationId: z.string().min(1),
  representationRevision: z.string().min(1),
  dimensions: z.number().int().positive(),
  dtype: z.enum(['float32', 'float16', 'int8', 'int4']),
  normalization: z.enum(['none', 'l2']),

  inputRepresentationId: z.string().min(1),
  inputRepresentationRevision: z.string().min(1),
  workspaceRevision: z.string().startsWith('sha256:'),
  sourceRevisionDigest: z.string().startsWith('sha256:'),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().min(1),

  producerId: z.string().min(1),
  producerRevision: z.string().min(1),
  modelRevision: z.string().min(1),
  parametersDigest: z.string().min(1),
  inputDigest: z.string().min(1),
  outputDigest: z.string().min(1),

  rowCount: z.number().int().positive(),
  tensorDigest: z.string().min(1),
  artifactDigest: z.string().min(1),
  canonicalAuthority: z.literal(false),
}).strict();

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
