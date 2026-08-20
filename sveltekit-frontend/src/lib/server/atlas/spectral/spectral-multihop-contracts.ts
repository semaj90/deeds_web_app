import { z } from 'zod';

export const SpectralRepresentationIdSchema = z.enum([
  'semantic_768',
  'pca_128',
  'pca_64',
  'spectral_4d',
]);

export type SpectralRepresentationId = z.infer<typeof SpectralRepresentationIdSchema>;

export const SpectralOperatorSchema = z.enum([
  'NORMALIZED_LAPLACIAN',
  'ADJACENCY',
  'PAGERANK_TRANSITION',
  'DAG_REACHABILITY',
]);

export const FloatVectorSchema = z.array(z.number().finite());

export const SpectralNodeRowV1Schema = z.object({
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  generation: z.number().int().nonnegative().nullable(),
  pagerank: z.number().finite().nonnegative().nullable(),
  eigenvectorCentrality: z.number().finite().nonnegative().nullable(),
  latent128: z.array(z.number().finite()).length(128).nullable(),
  latent64: z.array(z.number().finite()).length(64).nullable(),
  topology4: z.array(z.number().finite()).length(4).nullable(),
}).strict();

export type SpectralNodeRowV1 = z.infer<typeof SpectralNodeRowV1Schema>;

export const SpectralProjectionReceiptV1Schema = z.object({
  schema: z.literal('atlas.spectral-projection.v1'),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  projectionRevision: z.string().min(1),
  operator: SpectralOperatorSchema,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  semanticDimension: z.literal(768),
  latentDimensions: z.tuple([z.literal(128), z.literal(64)]),
  topologyDimension: z.literal(4),
  singularValues: FloatVectorSchema.max(128),
  eigenvalues: FloatVectorSchema.max(64),
  spectralGap: z.number().finite().nonnegative().nullable(),
  pca128ExplainedVariance: z.number().finite().min(0).max(1).nullable(),
  pca64ExplainedVariance: z.number().finite().min(0).max(1).nullable(),
  rowsByteaSha256: z.string().regex(/^[a-f0-9]{64}$/),
  producerRevision: z.string().min(1),
}).strict();

export type SpectralProjectionReceiptV1 = z.infer<typeof SpectralProjectionReceiptV1Schema>;

export const DagMutationKindSchema = z.enum([
  'ADD_NODE',
  'ADD_EDGE',
  'REMOVE_EDGE',
  'REPLACE_NODE',
  'RETRY_SUBGRAPH',
  'ESCALATE_SUBGRAPH',
]);

export const DagMutationV1Schema = z.object({
  schema: z.literal('atlas.dag-mutation.v1'),
  mutationId: z.string().min(1),
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().nonnegative(),
  parentDagRevision: z.string().min(1),
  mutationKind: DagMutationKindSchema,
  targetNodeIds: z.array(z.string().min(1)).max(256),
  reasonCodes: z.array(z.string().min(1)).max(64),
  evidenceRefs: z.array(z.string().min(1)).max(128),
  expectedQualityGain: z.number().finite().min(0).max(1),
  estimatedLatencyMs: z.number().finite().nonnegative(),
  estimatedVramBytes: z.number().int().nonnegative(),
  mutationRisk: z.number().finite().min(0).max(1),
  requiresValidation: z.literal(true),
}).strict();

export type DagMutationV1 = z.infer<typeof DagMutationV1Schema>;

export const MultihopSynthesisPlanV1Schema = z.object({
  schema: z.literal('atlas.multihop-synthesis-plan.v1'),
  requestId: z.string().min(1),
  queryRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  maxHops: z.number().int().min(1).max(8),
  maxCandidates: z.number().int().min(1).max(4096),
  maxToolCalls: z.number().int().min(0).max(128),
  vramBudgetBytes: z.number().int().positive(),
  tokenBudget: z.number().int().positive(),
  representations: z.array(SpectralRepresentationIdSchema).min(1),
  allowDagMutations: z.boolean(),
  exactPromotionRequired: z.literal(true),
}).strict();

export type MultihopSynthesisPlanV1 = z.infer<typeof MultihopSynthesisPlanV1Schema>;
