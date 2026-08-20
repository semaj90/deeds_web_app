import { z } from 'zod';

export const HypergraphProjectionKindSchema = z.enum([
  'BIPARTITE_INCIDENCE',
  'CLIQUE_EXPANSION',
  'STAR_EXPANSION',
]);
export type HypergraphProjectionKind = z.infer<typeof HypergraphProjectionKindSchema>;

export const SpectralAffinityKindSchema = z.enum([
  'PRECOMPUTED_ADJACENCY',
  'NEAREST_NEIGHBOR_GRAPH',
  'NARY_INCIDENCE_NORMALIZED',
]);
export type SpectralAffinityKind = z.infer<typeof SpectralAffinityKindSchema>;

export const HypergraphSpectralPlanV1Schema = z.object({
  schema: z.literal('atlas.hypergraph-spectral-plan.v1'),
  workspaceRevision: z.string().min(1),
  hypergraphRevision: z.string().min(1),
  projectionKind: HypergraphProjectionKindSchema,
  affinityKind: SpectralAffinityKindSchema,
  vertexCount: z.number().int().positive(),
  hyperedgeCount: z.number().int().positive(),
  relationshipDegreeMin: z.number().int().positive(),
  relationshipDegreeMax: z.number().int().positive(),
  nClusters: z.number().int().positive(),
  nEigenvectors: z.number().int().positive(),
  normalizedLaplacian: z.boolean(),
  canonicalRelationCreationAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.relationshipDegreeMax < value.relationshipDegreeMin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relationshipDegreeMax'], message: 'max relationship degree must be >= min' });
  }
  if (value.nClusters > value.vertexCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nClusters'], message: 'nClusters cannot exceed vertexCount' });
  }
  if (value.nEigenvectors > value.vertexCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nEigenvectors'], message: 'nEigenvectors cannot exceed vertexCount' });
  }
});
export type HypergraphSpectralPlanV1 = z.infer<typeof HypergraphSpectralPlanV1Schema>;

export const HyperparameterKindSchema = z.enum([
  'CLUSTER_COUNT',
  'EIGENVECTOR_COUNT',
  'NEIGHBOR_COUNT',
  'BEAM_WIDTH',
  'CHECKPOINT_SEGMENTS',
  'TILE_ROWS',
  'LATENT_RANK',
]);
export type HyperparameterKind = z.infer<typeof HyperparameterKindSchema>;

export const HyperparameterObservationV1Schema = z.object({
  name: z.string().min(1),
  kind: HyperparameterKindSchema,
  value: z.number().finite(),
  objective: z.string().min(1),
  objectiveValue: z.number().finite().nullable(),
  revision: z.string().min(1),
}).strict();
export type HyperparameterObservationV1 = z.infer<typeof HyperparameterObservationV1Schema>;

/**
 * Build a conservative spectral plan over n-ary incidence. A degree-5 edge
 * means exactly five participating vertices; it does NOT mean a 5-D vector.
 */
export function buildHypergraphSpectralPlan(input: {
  workspaceRevision: string;
  hypergraphRevision: string;
  vertexCount: number;
  hyperedgeCount: number;
  relationshipDegreeMin: number;
  relationshipDegreeMax: number;
  nClusters: number;
  nEigenvectors?: number;
  projectionKind?: HypergraphProjectionKind;
  affinityKind?: SpectralAffinityKind;
  producerRevision: string;
}): HypergraphSpectralPlanV1 {
  return HypergraphSpectralPlanV1Schema.parse({
    schema: 'atlas.hypergraph-spectral-plan.v1',
    workspaceRevision: input.workspaceRevision,
    hypergraphRevision: input.hypergraphRevision,
    projectionKind: input.projectionKind ?? 'BIPARTITE_INCIDENCE',
    affinityKind: input.affinityKind ?? 'NARY_INCIDENCE_NORMALIZED',
    vertexCount: input.vertexCount,
    hyperedgeCount: input.hyperedgeCount,
    relationshipDegreeMin: input.relationshipDegreeMin,
    relationshipDegreeMax: input.relationshipDegreeMax,
    nClusters: input.nClusters,
    nEigenvectors: input.nEigenvectors ?? input.nClusters,
    normalizedLaplacian: true,
    canonicalRelationCreationAllowed: false,
    producerRevision: input.producerRevision,
  });
}
