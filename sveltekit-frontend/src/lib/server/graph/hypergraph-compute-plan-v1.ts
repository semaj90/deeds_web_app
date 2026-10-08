import { z } from 'zod';

export const HypergraphComputeBackendV1Schema = z.enum([
  'NETWORKX_CPU',
  'CUGRAPH_RAPIDS',
  'CUVS_GPU',
  'CUBLASLT_GEMM',
  'CUTILE_CHALLENGER',
]);

export const HypergraphComputePlanV1Schema = z.object({
  schema: z.literal('atlas.hypergraph-compute-plan.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  proposalSetChecksum: z.string().regex(/^[0-9a-f]{64}$/),
  backend: HypergraphComputeBackendV1Schema,
  algorithm: z.enum([
    'PAGERANK',
    'CHEIRANK',
    'LOUVAIN',
    'LEIDEN',
    'KCORE',
    'BETWEENNESS',
    'INCIDENCE_GEMM',
    'EXACT_KNN',
  ]),
  maxNodes: z.number().int().positive().max(2_000_000),
  maxEdges: z.number().int().positive().max(8_000_000),
  maxIterations: z.number().int().positive().max(10_000),
  artifactRefs: z.array(z.string().min(1)).max(16),
  cpuOracleRequired: z.boolean(),
  writesAllowed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.backend !== 'NETWORKX_CPU' && value.cpuOracleRequired === false) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cpuOracleRequired'],
      message: 'ACCELERATOR_REQUIRES_CPU_ORACLE',
    });
  }
  if (
    (value.backend === 'CUGRAPH_RAPIDS' ||
      value.backend === 'CUVS_GPU' ||
      value.backend === 'CUBLASLT_GEMM' ||
      value.backend === 'CUTILE_CHALLENGER') &&
    value.artifactRefs.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['artifactRefs'],
      message: 'ACCELERATOR_REQUIRES_ARTIFACT_REFERENCE',
    });
  }
});
export type HypergraphComputePlanV1 = z.infer<typeof HypergraphComputePlanV1Schema>;

export const HypergraphContextProjectionV1Schema = z.object({
  schema: z.literal('atlas.hypergraph-context-projection.v1'),
  requestId: z.string().min(1),
  proposalSetChecksum: z.string().regex(/^[0-9a-f]{64}$/),
  rankedProposalIds: z.array(z.string().min(1)).max(256),
  acePacketRefs: z.array(z.string().min(1)).max(128),
  bitfrostCacheEligible: z.boolean(),
  contextTokenBudget: z.number().int().nonnegative(),
  graphAlgorithmRevision: z.string().min(1),
  canonicalAuthority: z.literal(false),
}).strict();

export type HypergraphContextProjectionV1 = z.infer<typeof HypergraphContextProjectionV1Schema>;
