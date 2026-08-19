import { z } from 'zod';

/**
 * AlgorithmExecutionManifestV1 answers one question for every bounded DAG node:
 * "what actually ran?"
 *
 * It deliberately separates representation/geometry, algorithm, executor,
 * model routing, parser/codec, and transport. None of these identities imply
 * an additional retrieval vote.
 */

export const ExecutionGeometryKindSchema = z.enum([
  'EUCLIDEAN_SEMANTIC',
  'LATENT_LINEAR',
  'QUATERNION_S3',
  'HILBERT_2D_LOCALITY_ORDER',
  'JACOBIAN_SENSITIVITY',
  'NARY_INCIDENCE',
  'GRAPH_TOPOLOGY',
  'NONE',
]);
export type ExecutionGeometryKind = z.infer<typeof ExecutionGeometryKindSchema>;

export const ExecutionGeometryRoleSchema = z.enum([
  'SEARCH_SPACE',
  'DERIVED_RERANK_FEATURE',
  'LOCALITY_ORDER',
  'DIAGNOSTIC',
  'RELATION_SPACE',
  'STRUCTURAL_SPACE',
  'NONE',
]);

export const DistanceMetricSchema = z.enum([
  'COSINE',
  'INNER_PRODUCT',
  'L2',
  'SQUARED_L2',
  'ANGULAR_ABS_DOT',
  'GRAPH_HOPS',
  'WEIGHTED_PATH_COST',
  'NONE',
]);
export type DistanceMetric = z.infer<typeof DistanceMetricSchema>;

export const RepresentationExecutionRefV1Schema = z.object({
  representationId: z.string().min(1),
  representationRevision: z.string().min(1),
  dimensions: z.number().int().positive().nullable(),
  canonical: z.boolean(),
  derivedFromRepresentationId: z.string().min(1).nullable(),
}).strict();
export type RepresentationExecutionRefV1 = z.infer<typeof RepresentationExecutionRefV1Schema>;

export const ExecutionGeometryV1Schema = z.object({
  kind: ExecutionGeometryKindSchema,
  role: ExecutionGeometryRoleSchema,
  dimensions: z.number().int().positive().nullable(),
  metric: DistanceMetricSchema,
  /** Ternary relation => relationshipDegree=3. Null for non-n-ary geometry. */
  relationshipDegree: z.number().int().positive().nullable(),
  notes: z.array(z.string().min(1)).max(8).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'QUATERNION_S3' && value.dimensions !== 4) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimensions'], message: 'QUATERNION_S3 requires exactly 4 components' });
  }
  if (value.kind === 'HILBERT_2D_LOCALITY_ORDER' && value.role !== 'LOCALITY_ORDER') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'Hilbert is a locality ordering, not a semantic search space' });
  }
  if (value.kind === 'JACOBIAN_SENSITIVITY' && value.role !== 'DIAGNOSTIC') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'Jacobian identity is diagnostic/local sensitivity' });
  }
  if (value.kind === 'NARY_INCIDENCE' && value.relationshipDegree === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relationshipDegree'], message: 'N-ary incidence requires relationshipDegree' });
  }
  if (value.kind !== 'NARY_INCIDENCE' && value.relationshipDegree !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relationshipDegree'], message: 'relationshipDegree belongs only to NARY_INCIDENCE' });
  }
});
export type ExecutionGeometryV1 = z.infer<typeof ExecutionGeometryV1Schema>;

export const AlgorithmFamilySchema = z.enum([
  'VECTOR_SEARCH',
  'VECTOR_TOPK',
  'GRAPH_SEARCH',
  'GRAPH_ANALYTICS',
  'GRAPH_SORT',
  'LOCALITY_ORDER',
  'GEOMETRY_RERANK',
  'DERIVATIVE_DIAGNOSTIC',
  'HYPERGRAPH_FANOUT',
  'DENSE_PROJECTION',
  'NEURAL_RERANK',
  'MODEL_ROUTING',
  'PAYLOAD_PARSE',
  'TOOL_EXECUTION',
]);
export type AlgorithmFamily = z.infer<typeof AlgorithmFamilySchema>;

export const AlgorithmIdSchema = z.enum([
  'QDRANT_KNN',
  'CUVS_BRUTE_FORCE_KNN',
  'CUVS_CAGRA_KNN',
  'PYTORCH_TOPK',
  'NETWORKX_ASTAR',
  'NETWORKX_BFS',
  'CUGRAPH_BFS',
  'CUGRAPH_SSSP',
  'NEO4J_NEIGHBORHOOD',
  'PAGERANK',
  'LEIDEN',
  'SCC_CONDENSATION',
  'HILBERT_2D_SORT',
  'QUATERNION_ABS_DOT',
  'JACOBIAN_JVP',
  'NARY_INCIDENCE_FANOUT',
  'PCA_SVD_PROJECTION',
  'AUTOENCODER_PROJECTION',
  'POINTWISE_RERANK',
  'CROSS_ENCODER_RERANK',
  'MODEL_MOE_ROUTING',
  'EXTERNAL_SOFTMAX_ROUTING',
  'SIMDJSON_PARSE',
  'MCP_TOOL_CALL',
]);
export type AlgorithmId = z.infer<typeof AlgorithmIdSchema>;

export const AlgorithmExactnessSchema = z.enum([
  'EXACT',
  'APPROXIMATE',
  'DERIVED_FEATURE',
  'DIAGNOSTIC_ONLY',
  'NOT_APPLICABLE',
]);

export const AlgorithmIdentityV1Schema = z.object({
  algorithmId: AlgorithmIdSchema,
  family: AlgorithmFamilySchema,
  exactness: AlgorithmExactnessSchema,
  metric: DistanceMetricSchema,
  topK: z.number().int().positive().nullable(),
  maxHops: z.number().int().nonnegative().nullable(),
  parameterRevision: z.string().min(1),
  parameterChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict();
export type AlgorithmIdentityV1 = z.infer<typeof AlgorithmIdentityV1Schema>;

export const ExecutionBackendSchema = z.enum([
  'TYPESCRIPT',
  'PYTHON',
  'NETWORKX',
  'PYTORCH_EAGER',
  'TORCH_COMPILE_INDUCTOR',
  'TRITON',
  'LIBTORCH_CPU',
  'LIBTORCH_CUDA',
  'CUBLASLT',
  'CUDNN',
  'CUVS',
  'CUGRAPH',
  'TENSORRT',
  'NEO4J',
  'QDRANT',
  'NAPI_NATIVE',
  'SIMDJSON',
  'MCP_RUNTIME',
]);
export type ExecutionBackend = z.infer<typeof ExecutionBackendSchema>;

export const DeviceKindSchema = z.enum(['CPU', 'CUDA', 'SERVICE', 'NONE']);

export const BackendExecutionV1Schema = z.object({
  backend: ExecutionBackendSchema,
  implementationId: z.string().min(1),
  implementationRevision: z.string().min(1),
  libraryVersion: z.string().min(1).nullable(),
  device: DeviceKindSchema,
  computeCapability: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).nullable(),
  compiled: z.boolean(),
  deterministicClaim: z.enum(['PROVEN', 'BEST_EFFORT', 'NONE']),
}).strict();
export type BackendExecutionV1 = z.infer<typeof BackendExecutionV1Schema>;

export const TransportKindSchema = z.enum([
  'LOCAL_CALL',
  'HTTP_JSON',
  'GRPC',
  'MCP',
  'RABBITMQ',
  'KAFKA',
  'ACP',
  'A2A',
  'NONE',
]);
export type TransportKind = z.infer<typeof TransportKindSchema>;

export const TransportExecutionV1Schema = z.object({
  kind: TransportKindSchema,
  endpointClass: z.string().min(1).nullable(),
  serialization: z.enum(['JSON', 'MSGPACK', 'PROTOBUF', 'ARROW', 'RAW_BYTES', 'NONE']),
  parserBackend: z.enum(['NATIVE_JSON', 'SIMDJSON', 'PROTOBUF_RUNTIME', 'ARROW_RUNTIME', 'NONE']),
}).strict();
export type TransportExecutionV1 = z.infer<typeof TransportExecutionV1Schema>;

export const ModelRouterKindSchema = z.enum([
  'NONE',
  'EXTERNAL_SOFTMAX',
  'MODEL_MOE',
  'UNKNOWN_MODEL_TOPOLOGY',
]);
export type ModelRouterKind = z.infer<typeof ModelRouterKindSchema>;

export const ModelExecutionIdentityV1Schema = z.object({
  modelId: z.string().min(1).nullable(),
  modelRevision: z.string().min(1).nullable(),
  routerKind: ModelRouterKindSchema,
  expertCount: z.number().int().positive().nullable(),
  expertsPerToken: z.number().int().positive().nullable(),
  compiledBackend: z.enum(['EAGER', 'TORCH_COMPILE', 'TENSORRT', 'LLAMA_SERVER', 'NONE']),
}).strict().superRefine((value, ctx) => {
  if (value.routerKind === 'MODEL_MOE') {
    if (value.expertCount === null || value.expertsPerToken === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['routerKind'], message: 'MODEL_MOE requires explicit expertCount and expertsPerToken' });
    } else if (value.expertsPerToken > value.expertCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expertsPerToken'], message: 'expertsPerToken cannot exceed expertCount' });
    }
  } else if (value.expertCount !== null || value.expertsPerToken !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expertCount'], message: 'Expert topology is only valid for MODEL_MOE' });
  }
});
export type ModelExecutionIdentityV1 = z.infer<typeof ModelExecutionIdentityV1Schema>;

export const AlgorithmExecutionManifestV1Schema = z.object({
  schema: z.literal('atlas.algorithm-execution-manifest.v1'),
  manifestId: z.string().min(1),
  executionId: z.string().min(1),
  requestId: z.string().min(1),
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().nonnegative(),
  dagNodeId: z.string().min(1),
  actionId: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable(),
  logicalLane: z.enum(['lexical', 'semantic', 'ast', 'graph', 'tool', 'validator', 'materializer', 'none']),
  representations: z.array(RepresentationExecutionRefV1Schema).max(16),
  geometry: ExecutionGeometryV1Schema,
  algorithm: AlgorithmIdentityV1Schema,
  backend: BackendExecutionV1Schema,
  transport: TransportExecutionV1Schema,
  model: ModelExecutionIdentityV1Schema,
  evidenceRefs: z.array(z.string().min(1)).max(4096),
  canonicalWrites: z.boolean(),
  exactPromotionRequired: z.boolean(),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.geometry.kind === 'HILBERT_2D_LOCALITY_ORDER' && value.algorithm.algorithmId !== 'HILBERT_2D_SORT') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['algorithm', 'algorithmId'], message: 'Hilbert geometry must identify HILBERT_2D_SORT' });
  }
  if (value.geometry.kind === 'JACOBIAN_SENSITIVITY' && value.algorithm.algorithmId !== 'JACOBIAN_JVP') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['algorithm', 'algorithmId'], message: 'Jacobian diagnostics must identify JACOBIAN_JVP' });
  }
  if (value.algorithm.algorithmId === 'MODEL_MOE_ROUTING' && value.model.routerKind !== 'MODEL_MOE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['model', 'routerKind'], message: 'MODEL_MOE_ROUTING requires model-declared MoE topology' });
  }
  if (value.algorithm.algorithmId === 'EXTERNAL_SOFTMAX_ROUTING' && value.model.routerKind === 'MODEL_MOE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['model', 'routerKind'], message: 'External softmax routing must not masquerade as model MoE routing' });
  }
  if (value.backend.device === 'CUDA' && value.backend.computeCapability === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['backend', 'computeCapability'], message: 'CUDA execution must record compute capability' });
  }
});
export type AlgorithmExecutionManifestV1 = z.infer<typeof AlgorithmExecutionManifestV1Schema>;

export const WorkflowActionExecutionEnvelopeV1Schema = z.object({
  schema: z.literal('atlas.workflow-action-execution.v1'),
  workflowId: z.string().min(1),
  dagNodeId: z.string().min(1),
  actionId: z.string().min(1),
  manifest: AlgorithmExecutionManifestV1Schema,
}).strict().superRefine((value, ctx) => {
  if (value.manifest.workflowId !== value.workflowId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manifest', 'workflowId'], message: 'manifest workflowId mismatch' });
  }
  if (value.manifest.dagNodeId !== value.dagNodeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manifest', 'dagNodeId'], message: 'manifest dagNodeId mismatch' });
  }
  if (value.manifest.actionId !== null && value.manifest.actionId !== value.actionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manifest', 'actionId'], message: 'manifest actionId mismatch' });
  }
});
export type WorkflowActionExecutionEnvelopeV1 = z.infer<typeof WorkflowActionExecutionEnvelopeV1Schema>;

export function validateAlgorithmExecutionManifest(value: unknown): AlgorithmExecutionManifestV1 {
  return AlgorithmExecutionManifestV1Schema.parse(value);
}

export function bindAlgorithmManifestToAction(input: {
  workflowId: string;
  dagNodeId: string;
  actionId: string;
  manifest: AlgorithmExecutionManifestV1;
}): WorkflowActionExecutionEnvelopeV1 {
  return WorkflowActionExecutionEnvelopeV1Schema.parse({
    schema: 'atlas.workflow-action-execution.v1',
    ...input,
  });
}
