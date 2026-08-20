import { z } from 'zod';

/**
 * Parent Atlas neural execution policy.
 *
 * This is an executor-selection contract, not a second model owner. It keeps
 * model semantics separate from how a workload is executed on RTX/CPU.
 */
export const NeuralWorkloadSchema = z.enum([
  'DENSE_PROJECTION',
  'AUTOENCODER_ENCODE',
  'AUTOENCODER_DECODE',
  'POINTWISE_RERANK',
  'CROSS_ENCODER_RERANK',
  'CNN_LOCAL_PATTERN',
  'GNN_MESSAGE_PASSING',
]);
export type NeuralWorkload = z.infer<typeof NeuralWorkloadSchema>;

export const NeuralExecutorSchema = z.enum([
  'CUBLASLT_GEMM',
  'LIBTORCH_CUDA',
  'TRITON_CROSS_ENCODER',
  'TENSORRT_CROSS_ENCODER',
  'CUDNN_GRAPH',
  'PYTORCH_CUDA_GNN',
  'CUGRAPH_GPU',
  'LIBTORCH_CPU',
  'BOOST_GRAPH_CPU',
  'NETWORKX_REFERENCE',
  'TYPESCRIPT_CPU',
]);
export type NeuralExecutor = z.infer<typeof NeuralExecutorSchema>;

export const FallbackSemanticsSchema = z.enum([
  'SAME_NUMERICAL_OPERATION',
  'SAME_MODEL_DIFFERENT_RUNTIME',
  'LOWER_FIDELITY_MODEL',
  'STRUCTURAL_APPROXIMATION',
  'REFERENCE_ONLY',
]);
export type FallbackSemantics = z.infer<typeof FallbackSemanticsSchema>;

export const RuntimeResourceStateV1Schema = z.object({
  schema: z.literal('atlas.runtime-resource-state.v1'),
  cudaAvailable: z.boolean(),
  gpuUtilization: z.number().min(0).max(1),
  freeVramBytes: z.number().int().nonnegative(),
  reservedVramBytes: z.number().int().nonnegative(),
  cpuUtilization: z.number().min(0).max(1),
  freeHostMemoryBytes: z.number().int().nonnegative(),
  foregroundQueueDepth: z.number().int().nonnegative(),
}).strict();
export type RuntimeResourceStateV1 = z.infer<typeof RuntimeResourceStateV1Schema>;

export const NeuralExecutionCandidateV1Schema = z.object({
  executor: NeuralExecutorSchema,
  fallbackSemantics: FallbackSemanticsSchema,
  requiresCuda: z.boolean(),
  estimatedVramBytes: z.number().int().nonnegative(),
  requiresModelRuntime: z.boolean(),
  notes: z.array(z.string().min(1)).max(8),
}).strict();
export type NeuralExecutionCandidateV1 = z.infer<typeof NeuralExecutionCandidateV1Schema>;

export const NeuralExecutionPlanV1Schema = z.object({
  schema: z.literal('atlas.neural-execution-plan.v1'),
  workload: NeuralWorkloadSchema,
  primary: NeuralExecutionCandidateV1Schema,
  fallbacks: z.array(NeuralExecutionCandidateV1Schema),
  reasonCodes: z.array(z.string().min(1)).min(1).max(16),
  onlineTrainingAllowed: z.literal(false),
}).strict();
export type NeuralExecutionPlanV1 = z.infer<typeof NeuralExecutionPlanV1Schema>;

export const AeTrainingGateV1Schema = z.object({
  schema: z.literal('atlas.ae-training-gate.v1'),
  state: z.enum(['DEFERRED', 'DATASET_READY', 'SHADOW_TRAINING', 'VALIDATED', 'REJECTED']),
  semanticRepresentation: z.literal('semantic_768'),
  hiddenDimension: z.literal(128),
  latentDimension: z.literal(64),
  datasetRevision: z.string().min(1).nullable(),
  baselineRevision: z.string().min(1).nullable(),
  encoderRevision: z.string().min(1).nullable(),
  decoderRevision: z.string().min(1).nullable(),
  exactRecallBaselineRequired: z.literal(true),
  reconstructionMetricRequired: z.literal(true),
  routingOnlyUntilPromoted: z.literal(true),
  onlineTrainingAllowed: z.literal(false),
}).strict();
export type AeTrainingGateV1 = z.infer<typeof AeTrainingGateV1Schema>;

const candidate = (
  executor: NeuralExecutor,
  fallbackSemantics: FallbackSemantics,
  requiresCuda: boolean,
  estimatedVramBytes: number,
  requiresModelRuntime: boolean,
  notes: string[],
): NeuralExecutionCandidateV1 => ({
  executor,
  fallbackSemantics,
  requiresCuda,
  estimatedVramBytes,
  requiresModelRuntime,
  notes,
});

/** Static preference taxonomy before the live resource gate is applied. */
export function neuralExecutorPreference(workload: NeuralWorkload): NeuralExecutionCandidateV1[] {
  switch (workload) {
    case 'DENSE_PROJECTION':
      return [
        candidate('CUBLASLT_GEMM', 'SAME_NUMERICAL_OPERATION', true, 128 * 1024 * 1024, false, [
          'Preferred for stable dense matrix projections such as semantic_768 -> PCA/latent basis.',
        ]),
        candidate('LIBTORCH_CUDA', 'SAME_NUMERICAL_OPERATION', true, 192 * 1024 * 1024, true, [
          'Convenient CUDA tensor fallback when a direct cuBLASLt owner is not wired.',
        ]),
        candidate('LIBTORCH_CPU', 'SAME_NUMERICAL_OPERATION', false, 0, true, [
          'CPU parity/fallback for the identical dense projection.',
        ]),
      ];

    case 'AUTOENCODER_ENCODE':
    case 'AUTOENCODER_DECODE':
      return [
        candidate('LIBTORCH_CUDA', 'SAME_MODEL_DIFFERENT_RUNTIME', true, 256 * 1024 * 1024, true, [
          'Reuse the trained 768->128->64 encoder/decoder weights; no online training.',
        ]),
        candidate('CUBLASLT_GEMM', 'SAME_NUMERICAL_OPERATION', true, 128 * 1024 * 1024, false, [
          'Eligible once weights/activations are exported under an exact inference contract.',
        ]),
        candidate('LIBTORCH_CPU', 'SAME_MODEL_DIFFERENT_RUNTIME', false, 0, true, [
          'CPU inference fallback with the same weights.',
        ]),
      ];

    case 'POINTWISE_RERANK':
      return [
        candidate('LIBTORCH_CUDA', 'SAME_NUMERICAL_OPERATION', true, 128 * 1024 * 1024, true, [
          'Matches the existing in-process LibTorch attention/dot-product reranking path.',
        ]),
        candidate('LIBTORCH_CPU', 'SAME_NUMERICAL_OPERATION', false, 0, true, [
          'CPU scoring preserves the operation when the native CUDA bridge is unavailable.',
        ]),
        candidate('TYPESCRIPT_CPU', 'REFERENCE_ONLY', false, 0, false, [
          'Last-resort deterministic dot-product reference, not a learned cross-encoder substitute.',
        ]),
      ];

    case 'CROSS_ENCODER_RERANK':
      return [
        candidate('TENSORRT_CROSS_ENCODER', 'SAME_MODEL_DIFFERENT_RUNTIME', true, 1024 * 1024 * 1024, true, [
          'Use only when the selected cross-encoder has a validated TensorRT engine.',
        ]),
        candidate('TRITON_CROSS_ENCODER', 'SAME_MODEL_DIFFERENT_RUNTIME', true, 1024 * 1024 * 1024, true, [
          'Aligned with the existing Triton-first cross-encoder runtime.',
        ]),
        candidate('LIBTORCH_CUDA', 'LOWER_FIDELITY_MODEL', true, 256 * 1024 * 1024, true, [
          'Pointwise embedding scorer is a degraded reranker, not numerically equivalent to a cross-encoder.',
        ]),
        candidate('LIBTORCH_CPU', 'LOWER_FIDELITY_MODEL', false, 0, true, [
          'CPU degraded scorer when GPU/model-serving runtimes are unavailable.',
        ]),
      ];

    case 'CNN_LOCAL_PATTERN':
      return [
        candidate('CUDNN_GRAPH', 'SAME_NUMERICAL_OPERATION', true, 512 * 1024 * 1024, true, [
          'Preferred only for workloads that are genuinely local/convolutional; use cuDNN engine heuristics/autotuning.',
        ]),
        candidate('LIBTORCH_CUDA', 'SAME_MODEL_DIFFERENT_RUNTIME', true, 512 * 1024 * 1024, true, [
          'CUDA model fallback through LibTorch.',
        ]),
        candidate('LIBTORCH_CPU', 'SAME_MODEL_DIFFERENT_RUNTIME', false, 0, true, [
          'CPU inference fallback; not preferred for large batches.',
        ]),
      ];

    case 'GNN_MESSAGE_PASSING':
      return [
        candidate('PYTORCH_CUDA_GNN', 'SAME_MODEL_DIFFERENT_RUNTIME', true, 1024 * 1024 * 1024, true, [
          'Neural message passing remains a derived challenger over revisioned graph snapshots.',
        ]),
        candidate('CUGRAPH_GPU', 'STRUCTURAL_APPROXIMATION', true, 512 * 1024 * 1024, false, [
          'Graph analytics/sampling can provide structural features or neighborhoods but are not the same learned GNN.',
        ]),
        candidate('BOOST_GRAPH_CPU', 'STRUCTURAL_APPROXIMATION', false, 0, false, [
          'C++ structural fallback for traversal/SCC/topology when neural inference is unavailable.',
        ]),
        candidate('NETWORKX_REFERENCE', 'REFERENCE_ONLY', false, 0, false, [
          'Correctness/fixture graph reference; not a learned GNN replacement.',
        ]),
      ];
  }
}

function fitsResources(candidate: NeuralExecutionCandidateV1, resource: RuntimeResourceStateV1): boolean {
  if (candidate.requiresCuda && !resource.cudaAvailable) return false;
  const availableVram = Math.max(0, resource.freeVramBytes - resource.reservedVramBytes);
  if (candidate.requiresCuda && candidate.estimatedVramBytes > availableVram) return false;
  return true;
}

/**
 * Select the first executor that fits the live envelope. Foreground pressure
 * biases away from large GPU model runtimes, but does not change model truth.
 */
export function planNeuralExecution(input: {
  workload: NeuralWorkload;
  resource: RuntimeResourceStateV1;
}): NeuralExecutionPlanV1 {
  const preferences = neuralExecutorPreference(input.workload);
  const foregroundBusy = input.resource.foregroundQueueDepth > 0 || input.resource.gpuUtilization >= 0.85;
  const ordered = foregroundBusy
    ? [...preferences].sort((a, b) => {
        const aPenalty = a.requiresCuda ? a.estimatedVramBytes : 0;
        const bPenalty = b.requiresCuda ? b.estimatedVramBytes : 0;
        return aPenalty - bPenalty;
      })
    : preferences;

  const eligible = ordered.filter((entry) => fitsResources(entry, input.resource));
  if (eligible.length === 0) {
    throw new Error(`No executor fits workload ${input.workload} under the current resource envelope`);
  }

  return {
    schema: 'atlas.neural-execution-plan.v1',
    workload: input.workload,
    primary: eligible[0],
    fallbacks: eligible.slice(1),
    reasonCodes: [
      input.resource.cudaAvailable ? 'CUDA_STATE_OBSERVED' : 'CPU_ONLY',
      foregroundBusy ? 'FOREGROUND_PRESSURE' : 'FOREGROUND_CLEAR',
      'RESOURCE_ENVELOPE_FILTERED',
    ],
    onlineTrainingAllowed: false,
  };
}

export function deferredAeTrainingGate(): AeTrainingGateV1 {
  return {
    schema: 'atlas.ae-training-gate.v1',
    state: 'DEFERRED',
    semanticRepresentation: 'semantic_768',
    hiddenDimension: 128,
    latentDimension: 64,
    datasetRevision: null,
    baselineRevision: null,
    encoderRevision: null,
    decoderRevision: null,
    exactRecallBaselineRequired: true,
    reconstructionMetricRequired: true,
    routingOnlyUntilPromoted: true,
    onlineTrainingAllowed: false,
  };
}
