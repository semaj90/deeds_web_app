import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ALGORITHM_EXECUTION_STAGE_VALUES = [
  'query_analysis',
  'semantic_nomination',
  'identity_promotion',
  'relationship_retrieval',
  'incidence_traversal',
  'graph_ranking',
  'derived_projection',
  'rerank',
  'evidence_validation',
  'sufficient_context',
  'ace_materialization',
] as const;

export const ALGORITHM_CLASS_VALUES = [
  'canonical_fact_operator',
  'exact_reference',
  'approximate_executor',
  'derived_projection',
  'policy_challenger',
] as const;

export const ALGORITHM_KIND_VALUES = [
  'pos_tagger',
  'ontology_classifier',
  'exact_gemm',
  'qdrant_exact',
  'hnsw',
  'cagra',
  'turbovec',
  'nary_incidence',
  'bfs',
  'scc',
  'condensation_dag',
  'pagerank',
  'ppr',
  'eigensolve',
  'pca',
  'svd',
  'randomized_low_rank',
  'autoencoder',
  'kmeans',
  'som',
  'cubic_interpolation',
  'quaternion_projection',
  'hilbert_curve_order',
  'jacobian_diagnostic',
  'crossencoder',
  'neural_executor_router',
  'moe_router',
  'grouped_gemm',
  'canonical_db_join',
  'evidence_materializer',
] as const;

export const GEOMETRY_KIND_VALUES = [
  'none',
  'euclidean_real',
  'cosine_hypersphere',
  'inner_product',
  'nary_incidence',
  'quaternion_s3',
  'hilbert_curve_locality',
  'jacobian_tangent',
  'spectral_eigenspace',
  'som_lattice',
  'topology_field',
] as const;

export const COMPUTE_BACKEND_VALUES = [
  'typescript_node',
  'python_numpy',
  'pytorch_eager',
  'torch_compile_inductor',
  'triton_jit',
  'torch_library_triton_op',
  'cuvs',
  'cugraph',
  'tensorrt',
  'tensorrt_rtx',
  'libtorch',
  'webgpu',
  'napi_cpp',
  'napi_rust',
  'grpc_sidecar',
  'postgresql',
  'qdrant',
  'neo4j',
  'networkx',
] as const;

export const TRANSPORT_BACKEND_VALUES = [
  'local',
  'napi',
  'grpc',
  'kafka_cdc',
  'redis_valkey',
  'qdrant_http',
  'qdrant_grpc',
  'postgres',
  'file',
] as const;

export const SERIALIZATION_BACKEND_VALUES = [
  'none',
  'json',
  'simdjson_ondemand',
  'protobuf',
  'arrow',
  'numpy',
  'dlpack',
  'ndjson',
] as const;

export const COMPILATION_MODE_VALUES = [
  'eager',
  'torch_compile',
  'aot_inductor',
  'triton_jit',
  'triton_op',
  'tensorrt',
  'tensorrt_rtx',
  'libtorch',
] as const;

const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const algorithmExecutionStageSchema = z.enum(ALGORITHM_EXECUTION_STAGE_VALUES);
export const algorithmClassSchema = z.enum(ALGORITHM_CLASS_VALUES);
export const algorithmKindSchema = z.enum(ALGORITHM_KIND_VALUES);
export const geometryKindSchema = z.enum(GEOMETRY_KIND_VALUES);
export const computeBackendSchema = z.enum(COMPUTE_BACKEND_VALUES);
export const transportBackendSchema = z.enum(TRANSPORT_BACKEND_VALUES);
export const serializationBackendSchema = z.enum(SERIALIZATION_BACKEND_VALUES);
export const compilationModeSchema = z.enum(COMPILATION_MODE_VALUES);

export const modelTopologySchema = z.object({
  architecture: z.enum(['dense', 'moe']),
  model_id: z.string().min(1),
  model_revision: revision,
  hidden_size: z.number().int().positive().optional(),
  num_experts: z.number().int().positive().optional(),
  top_k: z.number().int().positive().optional(),
  expert_ids: z.array(z.string().min(1)).optional(),
  router_revision: revision.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.architecture === 'moe') {
    if (!value.num_experts || !value.top_k || value.top_k > value.num_experts) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'MoE requires num_experts and top_k <= num_experts' });
    }
  } else if (value.num_experts || value.top_k || value.expert_ids?.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dense model cannot declare MoE expert topology' });
  }
}).optional();

export const algorithmExecutionManifestSchema = z.object({
  schema: z.literal('atlas.algorithm-execution-manifest.v1').default('atlas.algorithm-execution-manifest.v1'),
  execution_id: z.string().min(1),
  workflow_id: z.string().min(1).optional(),
  action_id: z.string().min(1).optional(),
  dag_node_id: z.string().min(1),
  stage: algorithmExecutionStageSchema,
  logical_lane: z.enum(['query_analysis', 'lexical', 'ast', 'semantic', 'graph', 'tool', 'validator', 'materializer', 'policy']),
  algorithm_class: algorithmClassSchema,
  algorithm: algorithmKindSchema,
  geometry: geometryKindSchema,
  metric: z.enum(['none', 'cosine', 'inner_product', 'sqeuclidean']).default('none'),
  dimensions: z.number().int().positive().optional(),
  dtype: z.string().min(1).optional(),
  compute_backend: computeBackendSchema,
  compute_backend_revision: revision,
  compilation_mode: compilationModeSchema,
  transport: transportBackendSchema,
  serialization: serializationBackendSchema,
  cache_backend: z.enum(['none', 'valkey', 'redis', 'bitfrost', 'local_memory']).default('none'),
  source_snapshot_revision: revision,
  representation_revision: revision.optional(),
  graph_snapshot_revision: revision.optional(),
  relationship_snapshot_revision: revision.optional(),
  canonical_ordinal_map_revision: revision.optional(),
  input_checksum: checksum,
  output_checksum: checksum.optional(),
  device: z.object({
    kind: z.enum(['cpu', 'cuda', 'webgpu']),
    name: z.string().min(1).optional(),
    compute_capability: z.string().regex(/^\d+\.\d+$/).optional(),
  }).strict(),
  model_topology: modelTopologySchema,
  policy: z.object({
    deterministic_policy_revision: revision,
    eligible_executors: z.array(z.string().min(1)).default([]),
    selected_executor: z.string().min(1),
    neural_suggestion: z.string().min(1).optional(),
    neural_suggestion_probability: z.number().min(0).max(1).optional(),
  }).strict().optional(),
  mutation: z.object({
    mutates_tensor: z.boolean().default(false),
    mutates_cache: z.boolean().default(false),
    mutates_derived_projection: z.boolean().default(false),
    proposes_dag_mutation: z.boolean().default(false),
    canonical_state_mutated: z.boolean().default(false),
  }).strict().default({}),
  latency_ms: z.number().nonnegative().optional(),
  peak_vram_bytes: z.number().int().nonnegative().optional(),
  fallback_used: z.boolean().default(false),
  fallback_reason: z.string().min(1).optional(),
  canonical_authority: z.boolean().default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  const semanticAlgorithms = new Set(['exact_gemm', 'qdrant_exact', 'hnsw', 'cagra', 'turbovec']);
  if (semanticAlgorithms.has(value.algorithm) && value.logical_lane !== 'semantic') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['logical_lane'], message: `${value.algorithm} must remain in the semantic logical lane` });
  }
  if ((value.algorithm === 'hnsw' || value.algorithm === 'cagra') && value.algorithm_class !== 'approximate_executor') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['algorithm_class'], message: `${value.algorithm} must be approximate_executor` });
  }
  if (value.algorithm === 'nary_incidence' && value.geometry !== 'nary_incidence') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['geometry'], message: 'N-ary relationship traversal must use nary_incidence geometry' });
  }
  if (value.stage === 'relationship_retrieval' || value.stage === 'incidence_traversal') {
    if (value.geometry === 'hilbert_curve_locality' || value.geometry === 'quaternion_s3' || value.geometry === 'jacobian_tangent') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['geometry'], message: 'Derived topology geometry cannot replace canonical N-ary relationship incidence' });
    }
  }
  if (['quaternion_projection', 'hilbert_curve_order', 'jacobian_diagnostic', 'pca', 'svd', 'randomized_low_rank', 'autoencoder', 'kmeans', 'som', 'cubic_interpolation', 'eigensolve', 'neural_executor_router'].includes(value.algorithm) && value.canonical_authority) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['canonical_authority'], message: `${value.algorithm} is derived/policy evidence and cannot own canonical truth` });
  }
  if (value.algorithm === 'moe_router') {
    if (value.model_topology?.architecture !== 'moe') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['model_topology'], message: 'moe_router requires a model that explicitly declares MoE topology' });
    }
  }
  if (value.algorithm === 'grouped_gemm' && value.model_topology?.architecture !== 'moe') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['model_topology'], message: 'grouped_gemm is only labeled MoE execution when model_topology.architecture=moe' });
  }
  if (value.canonical_authority && !['canonical_db_join', 'evidence_materializer'].includes(value.algorithm)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['canonical_authority'], message: 'Only canonical DB/evidence materializer operators may claim canonical authority' });
  }
  if (value.transport === 'kafka_cdc' && value.canonical_authority) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transport'], message: 'Kafka CDC transports receipts/state changes; it is not canonical authority' });
  }
  if (value.serialization === 'simdjson_ondemand' && value.algorithm_class === 'canonical_fact_operator') {
    // Parsing may feed a canonical materializer, but parser implementation itself is not the fact operator.
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['serialization'], message: 'simdjson is a parsing implementation detail, not a canonical fact algorithm' });
  }
});

export type AlgorithmExecutionManifestV1 = z.infer<typeof algorithmExecutionManifestSchema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function checksumAlgorithmExecutionManifest(value: AlgorithmExecutionManifestV1): string {
  const parsed = algorithmExecutionManifestSchema.parse(value);
  return createHash('sha256').update(canonicalJson(parsed)).digest('hex');
}

export function assertAlgorithmManifestConsistent(value: unknown): AlgorithmExecutionManifestV1 {
  return algorithmExecutionManifestSchema.parse(value);
}

export function describeAlgorithmExecutionBoundary(): string {
  return [
    'Each DAG node records the actual algorithm, geometry, metric, backend, compilation mode, transport and revisions used.',
    'HNSW/CAGRA remain semantic ANN executors; they are never application relationship graphs.',
    'Quaternion, Hilbert-curve, Jacobian, spectral, PCA/SVD/AE/KMeans/SOM and interpolation outputs are derived signals only.',
    'N-ary facts and participant roles remain canonical relationship state independently of any embedding geometry.',
    'An external neural executor router is policy, not model MoE. MoE labels require explicit expert topology on the model.',
    'N-API, gRPC, Kafka CDC, Redis/Valkey and simdjson are infrastructure dimensions recorded separately from the mathematical algorithm.',
  ].join(' ');
}
