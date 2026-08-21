import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const bytes = z.number().int().nonnegative();

export const GPU_TRACE_ARTIFACT_ROLES = [
  'NSYS_REP',
  'NSYS_JSONLINES',
  'NSYS_SQLITE',
  'NCU_REP',
  'NCU_CSV',
  'FIXTURE_RECEIPT',
] as const;

export const gpuTraceArtifactSchema = z.object({
  artifact_id: id,
  role: z.enum(GPU_TRACE_ARTIFACT_ROLES),
  relative_path: z.string().min(1),
  sha256: checksum,
  size_bytes: bytes,
  canonical_trace_artifact: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.canonical_trace_artifact !== (value.role === 'NSYS_REP')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['canonical_trace_artifact'],
      message: 'only the .nsys-rep trace is canonical execution-trace evidence; exports are derived',
    });
  }
});
export type GpuTraceArtifactV1 = z.infer<typeof gpuTraceArtifactSchema>;

export const blasApiObservationSchema = z.object({
  library: z.enum(['CUBLAS', 'CUBLASLT']),
  api_name: z.string().min(1),
  call_count: z.number().int().positive(),
  nvtx_range: z.string().min(1),
  input_type: z.string().min(1).nullable().default(null),
  output_type: z.string().min(1).nullable().default(null),
  compute_type: z.string().min(1).nullable().default(null),
  algorithm: z.string().min(1).nullable().default(null),
  source: z.literal('NSYS_CUBLAS_VERBOSE'),
}).strict();
export type BlasApiObservationV1 = z.infer<typeof blasApiObservationSchema>;

export const tensorCoreMetricObservationSchema = z.object({
  metric_name: z.string().min(1),
  metric_value: z.number().finite(),
  metric_unit: z.string().min(1),
  kernel_name: z.string().min(1),
  nvtx_range: z.string().min(1),
  source: z.literal('NSIGHT_COMPUTE'),
}).strict();
export type TensorCoreMetricObservationV1 = z.infer<typeof tensorCoreMetricObservationSchema>;

export const gpuExecutionEvidenceReceiptSchema = z.object({
  schema: z.literal('atlas.gpu-execution-evidence-receipt.v1').default('atlas.gpu-execution-evidence-receipt.v1'),
  receipt_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  source_snapshot_revision: revision,
  graph_revision: revision,
  fixture_checksum: checksum,
  nvtx_domain: z.string().min(1),
  nvtx_range: z.string().min(1),
  requested_backend: z.enum(['CUGRAPH', 'CUBLAS_CUBLASLT', 'CUGRAPH_WITH_BLAS_TELEMETRY']),
  observed_backend: z.enum(['NONE', 'CUDA_ONLY', 'CUBLAS', 'CUBLASLT', 'CUBLAS_AND_CUBLASLT']),
  precision_policy: z.enum(['IEEE_FP32', 'TF32_ALLOWED', 'FP16_ALLOWED', 'BF16_ALLOWED', 'MIXED']),
  tensor_core_expectation: z.enum(['REQUIRED', 'OPTIONAL', 'NOT_EXPECTED']),
  tensor_core_used: z.boolean().nullable().default(null),
  nsys_version: revision,
  ncu_version: revision.nullable().default(null),
  cuda_version: revision.nullable().default(null),
  cugraph_version: revision.nullable().default(null),
  device_name: z.string().min(1).nullable().default(null),
  compute_capability: z.string().regex(/^\d+\.\d+$/).nullable().default(null),
  blas_api_observations: z.array(blasApiObservationSchema).default([]),
  tensor_core_metrics: z.array(tensorCoreMetricObservationSchema).default([]),
  artifacts: z.array(gpuTraceArtifactSchema).min(1),
  status: z.enum([
    'TRACE_CAPTURED',
    'BLAS_API_OBSERVED',
    'TENSOR_CORE_METRIC_OBSERVED',
    'VERIFIED',
    'REJECTED',
  ]),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  const canonicalTraceCount = value.artifacts.filter((artifact) => artifact.role === 'NSYS_REP' && artifact.canonical_trace_artifact).length;
  if (canonicalTraceCount !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifacts'], message: 'receipt requires exactly one canonical NSYS_REP artifact' });
  }
  const hasNcuArtifact = value.artifacts.some((artifact) => artifact.role === 'NCU_REP' || artifact.role === 'NCU_CSV');
  const hasBlas = value.blas_api_observations.length > 0;
  const hasTensorMetric = value.tensor_core_metrics.length > 0;
  if (value.tensor_core_used === true && !hasTensorMetric) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tensor_core_used'], message: 'Tensor Core use cannot be claimed without Nsight Compute metric evidence' });
  }
  if (value.tensor_core_expectation === 'REQUIRED' && value.status === 'VERIFIED' && value.tensor_core_used !== true) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tensor_core_used'], message: 'required Tensor Core proof must observe Tensor Core activity' });
  }
  if (value.status === 'BLAS_API_OBSERVED' && !hasBlas) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blas_api_observations'], message: 'BLAS_API_OBSERVED requires cuBLAS/cuBLASLt API evidence' });
  }
  if (value.status === 'TENSOR_CORE_METRIC_OBSERVED' && (!hasTensorMetric || !hasNcuArtifact)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tensor_core_metrics'], message: 'Tensor Core metric status requires Nsight Compute artifact and metrics' });
  }
  if (value.status === 'VERIFIED') {
    if (!hasBlas && value.requested_backend !== 'CUGRAPH') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blas_api_observations'], message: 'verified requested BLAS telemetry requires observed cuBLAS/cuBLASLt API calls' });
    }
    if (value.tensor_core_expectation !== 'NOT_EXPECTED' && !hasNcuArtifact) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifacts'], message: 'verified Tensor Core telemetry requires an Nsight Compute artifact' });
    }
  }
});
export type GpuExecutionEvidenceReceiptV1 = z.infer<typeof gpuExecutionEvidenceReceiptSchema>;

export const liveGraphAlgorithmMetricSchema = z.object({
  algorithm: z.enum(['PAGERANK', 'SPECTRAL_BALANCED_CUT', 'SPECTRAL_MODULARITY', 'LEIDEN', 'KMEANS_BASELINE', 'SOM_BASELINE']),
  assignment_checksum: checksum.nullable().default(null),
  cluster_count: z.number().int().positive().nullable().default(null),
  modularity_score: z.number().finite().nullable().default(null),
  edge_cut_score: z.number().finite().nullable().default(null),
  ratio_cut_score: z.number().finite().nullable().default(null),
  stability_ari: z.number().finite().min(-1).max(1).nullable().default(null),
  recall_at_k: z.number().finite().min(0).max(1).nullable().default(null),
  source_coverage_at_k: z.number().finite().min(0).max(1).nullable().default(null),
  historical_repair_success_at_k: z.number().finite().min(0).max(1).nullable().default(null),
  runtime_ms: z.number().finite().nonnegative(),
}).strict();

export const liveGraphFixtureReceiptSchema = z.object({
  schema: z.literal('atlas.live-graph-fixture-receipt.v1').default('atlas.live-graph-fixture-receipt.v1'),
  receipt_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  source_snapshot_revision: revision,
  graph_revision: revision,
  feature_revision: revision,
  row_identity_checksum: checksum,
  fixture_checksum: checksum,
  vertex_count: z.number().int().min(500).max(5000),
  edge_count: z.number().int().positive(),
  random_seed: z.number().int().nonnegative(),
  algorithms: z.array(liveGraphAlgorithmMetricSchema).min(4),
  gpu_memory_receipt: z.record(z.string(), z.unknown()),
  rapids_version: revision,
  cugraph_version: revision,
  cuda_version: revision.nullable().default(null),
  status: z.enum(['IMPLEMENTED_UNPROVEN', 'EXECUTED', 'VERIFIED', 'REJECTED']),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();
export type LiveGraphFixtureReceiptV1 = z.infer<typeof liveGraphFixtureReceiptSchema>;
