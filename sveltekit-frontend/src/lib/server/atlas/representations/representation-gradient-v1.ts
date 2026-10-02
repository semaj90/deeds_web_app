import { z } from 'zod';

const sha256Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/**
 * REPRESENTATION-GRADIENT-V1
 * 
 * Formalizes the representation derivation authority gradient:
 * Level 0: CANONICAL_SEMANTIC_768 (ground truth vector)
 * Level 1: PCA_SVD_DETERMINISTIC_128 (deterministic linear projection)
 * Level 2: MLP_LEARNED_64 (learned nonlinear projection)
 * Level 3: DISCRETE_CLUSTER_512 (approximate routing/locality codebook)
 * 
 * Invariant: Lower-level representations cannot override higher-level ones.
 */

export const AuthorityLevelSchema = z.enum([
  'CANONICAL_SEMANTIC_768',
  'PCA_SVD_DETERMINISTIC_128',
  'MLP_LEARNED_64',
  'DISCRETE_CLUSTER_512',
]);

export type AuthorityLevel = z.infer<typeof AuthorityLevelSchema>;

export const AUTHORITY_RANKS: Record<AuthorityLevel, number> = {
  CANONICAL_SEMANTIC_768: 0,
  PCA_SVD_DETERMINISTIC_128: 1,
  MLP_LEARNED_64: 2,
  DISCRETE_CLUSTER_512: 3,
};

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
export type MlpProvenance = z.infer<typeof MlpProvenanceSchema>;
export type ClusterCodebook = z.infer<typeof ClusterCodebookSchema>;

export function compareAuthority(a: AuthorityLevel, b: AuthorityLevel): number {
  return AUTHORITY_RANKS[a] - AUTHORITY_RANKS[b];
}

export function isHigherAuthority(candidate: AuthorityLevel, baseline: AuthorityLevel): boolean {
  return AUTHORITY_RANKS[candidate] < AUTHORITY_RANKS[baseline];
}
