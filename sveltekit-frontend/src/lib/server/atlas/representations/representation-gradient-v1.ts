import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

const sha256Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const RepresentationFamilyV1Schema = z.enum([
  'SEMANTIC_EMBEDDING',
  'AUTOENCODER_LATENT',
  'LINEAR_PROJECTION',
  'CLUSTER_ASSIGNMENT',
  'TOPOLOGY_COORDINATE',
]);

export type RepresentationFamilyV1 = z.infer<typeof RepresentationFamilyV1Schema>;

export const PcaSvdProvenanceSchema = z
  .object({
    basisRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    trainingCohortRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    meanDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    componentsDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export const ManifoldPca4V1Schema = z.object({
  schema: z.literal('atlas.manifold-pca4.v1'),
  representationId: z.literal('manifold_pca_4'),
  representationRevision: sha256Revision,
  canonicalCandidateId: z.string().min(1),
  workspaceRevision: sha256Revision,
  candidateRevision: sha256Revision,
  inputArtifactRef: z.string().min(1),
  inputArtifactRevision: sha256Revision,
  pcaProvenance: PcaSvdProvenanceSchema,
  pcaCoordinates: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
  outputChecksum: sha256Revision,
  canonicalAuthority: z.literal(false),
}).strict();

export const SOMAssignmentV1Schema = z.object({
  schema: z.literal('atlas.som-assignment.v1'),
  canonicalCandidateId: z.string().min(1),
  candidateOrdinal: z.number().int().nonnegative(),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: sha256Revision,
  workspaceRevision: sha256Revision,
  sourceRevision: sha256Revision,
  inputArtifactRef: z.string().min(1),
  inputArtifactChecksum: sha256Revision,
  inputRepresentationId: z.string().min(1),
  inputRepresentationRevision: sha256Revision,
  somModelRevision: sha256Revision,
  cell: z.object({
    row: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
  }).strict(),
  assignmentChecksum: sha256Revision,
  canonicalAuthority: z.literal(false),
}).strict();

export const KMeansAssignmentV1Schema = z.object({
  schema: z.literal('atlas.kmeans-assignment.v1'),
  canonicalCandidateId: z.string().min(1),
  candidateOrdinal: z.number().int().nonnegative(),
  candidateCount: z.number().int().positive(),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: sha256Revision,
  workspaceRevision: sha256Revision,
  sourceRevision: sha256Revision,
  inputArtifactRef: z.string().min(1),
  inputArtifactChecksum: sha256Revision,
  inputRepresentationId: z.string().min(1),
  inputRepresentationRevision: sha256Revision,
  algorithmRevision: sha256Revision,
  parametersChecksum: sha256Revision,
  centroidId: z.string().min(1),
  centroidChecksum: sha256Revision,
  clusterOrdinal: z.number().int().nonnegative(),
  assignmentChecksum: sha256Revision,
  canonicalAuthority: z.literal(false),
}).strict();

export const MlpProvenanceSchema = z
  .object({
    modelRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    trainingCohortRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    featureSchemaRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    optimizerReceipt: z.string().min(1),
  })
  .strict();

export const ClusterCodebookSchema = z
  .object({
    clusterOrdinal: z.number().int().min(0).max(511),
    clusteringMethod: z.enum(['KMEANS', 'SOM', 'VQ']),
    clusteringRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    isSemanticTruth: z.literal(false),
  })
  .strict();

export type PcaSvdProvenance = z.infer<typeof PcaSvdProvenanceSchema>;
export type ManifoldPca4V1 = z.infer<typeof ManifoldPca4V1Schema>;
export type SOMAssignmentV1 = z.infer<typeof SOMAssignmentV1Schema>;
export type KMeansAssignmentV1 = z.infer<typeof KMeansAssignmentV1Schema>;
export type MlpProvenance = z.infer<typeof MlpProvenanceSchema>;
export type ClusterCodebook = z.infer<typeof ClusterCodebookSchema>;

export function buildKMeansAssignmentV1(
  input: Omit<KMeansAssignmentV1, 'schema' | 'assignmentChecksum' | 'canonicalAuthority'>,
): KMeansAssignmentV1 {
  if (input.candidateOrdinal >= input.candidateCount) {
    throw new Error('KMEANS_ASSIGNMENT_ORDINAL_OUT_OF_RANGE');
  }
  const body = {
    schema: 'atlas.kmeans-assignment.v1' as const,
    canonicalCandidateId: input.canonicalCandidateId,
    candidateOrdinal: input.candidateOrdinal,
    candidateCount: input.candidateCount,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    inputArtifactRef: input.inputArtifactRef,
    inputArtifactChecksum: input.inputArtifactChecksum,
    inputRepresentationId: input.inputRepresentationId,
    inputRepresentationRevision: input.inputRepresentationRevision,
    algorithmRevision: input.algorithmRevision,
    parametersChecksum: input.parametersChecksum,
    centroidId: input.centroidId,
    centroidChecksum: input.centroidChecksum,
    clusterOrdinal: input.clusterOrdinal,
    canonicalAuthority: false as const,
  };
  return KMeansAssignmentV1Schema.parse({
    ...body,
    assignmentChecksum: `sha256:${canonicalSha256V1(body)}`,
  });
}

export function assertKMeansAssignmentV1(value: KMeansAssignmentV1): KMeansAssignmentV1 {
  const assignment = KMeansAssignmentV1Schema.parse(value);
  if (assignment.candidateOrdinal >= assignment.candidateCount) {
    throw new Error('KMEANS_ASSIGNMENT_ORDINAL_OUT_OF_RANGE');
  }
  const { assignmentChecksum, ...body } = assignment;
  if (`sha256:${canonicalSha256V1(body)}` !== assignmentChecksum) {
    throw new Error('KMEANS_ASSIGNMENT_CHECKSUM_MISMATCH');
  }
  return assignment;
}
