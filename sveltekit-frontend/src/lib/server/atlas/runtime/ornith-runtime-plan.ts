import { z } from 'zod';

/**
 * Ornith-1.0-9B runtime identity.
 *
 * Important distinction:
 * - parameterization: dense ~9B checkpoint (not an MoE checkpoint)
 * - sequence mixer: Qwen3.5 hybrid stack with recurrent Gated DeltaNet linear
 *   attention plus periodic full softmax-attention layers
 * - training identity: self-improving RL/scaffolding lineage
 * - serving runtime: llama-server, PyTorch/Transformers, TensorRT-LLM, etc.
 * - kernel/compiler layer: Triton/torch.compile is not a model server by itself.
 *
 * Do NOT collapse this to `isSsm=false`: Gated DeltaNet is a stateful/recurrent
 * linear-attention mechanism. The manifest records the exact hybrid structure
 * instead of a lossy boolean.
 *
 * TensorRT-LLM 1.2 removed its legacy TensorRT engine backend. TensorRT-LLM is
 * now a PyTorch-backed inference runtime and directly loads supported HF
 * checkpoints. This is still distinct from Torch-TensorRT, which is a compiler
 * backend for torch.compile that lowers supported PyTorch subgraphs to TensorRT.
 */
export const OrnithParameterizationSchema = z.enum(['DENSE_FFN', 'MOE', 'UNKNOWN']);
export const OrnithSequenceArchitectureSchema = z.enum([
  'HYBRID_GATED_DELTANET_FULL_ATTENTION',
  'UNKNOWN',
]);
export const OrnithStatefulSequenceClassSchema = z.enum([
  'RECURRENT_LINEAR_ATTENTION',
  'MAMBA_STYLE_SSM',
  'ATTENTION_ONLY',
  'UNKNOWN',
]);
export const OrnithTrainingIdentitySchema = z.enum(['SELF_SCAFFOLDING_RL', 'UNKNOWN']);
export const OrnithRuntimeSchema = z.enum([
  'LLAMA_SERVER_GGUF',
  'PYTORCH_TRANSFORMERS',
  'PYTORCH_COMPILE_INDUCTOR',
  'PYTORCH_CUSTOM_TRITON',
  'TENSORRT_LLM',
]);
export type OrnithRuntime = z.infer<typeof OrnithRuntimeSchema>;

export const OrnithWorkloadSchema = z.enum([
  'INTERACTIVE_INFERENCE',
  'BATCH_INFERENCE',
  'TOOL_CALLING',
  'FEATURE_PROBE',
  'QLORA_TRAINING',
  'RL_TRAINING',
  'KERNEL_EXPERIMENT',
]);
export type OrnithWorkload = z.infer<typeof OrnithWorkloadSchema>;

export const OrnithRuntimeCapabilityV1Schema = z.object({
  runtime: OrnithRuntimeSchema,
  executionFramework: z.enum(['LLAMA_CPP', 'PYTORCH']),
  supportsQuantizedLocalInference: z.boolean(),
  supportsFullTrainingAutograd: z.boolean(),
  supportsQLoRATraining: z.boolean(),
  supportsModelInternalInstrumentation: z.boolean(),
  supportsCustomTritonKernels: z.boolean(),
  supportsGatedDeltaNet: z.boolean(),
  supportsFullAttentionLayers: z.boolean(),
  openAiCompatibleServing: z.boolean(),
  requiresLinux: z.boolean(),
  requiresModelConversionOrEngineBuild: z.boolean(),
}).strict();
export type OrnithRuntimeCapabilityV1 = z.infer<typeof OrnithRuntimeCapabilityV1Schema>;

export const OrnithRuntimePlanV1Schema = z.object({
  schema: z.literal('atlas.ornith-runtime-plan.v1'),
  modelId: z.literal('deepreinforce-ai/Ornith-1.0-9B'),
  parameterization: OrnithParameterizationSchema,
  sequenceArchitecture: OrnithSequenceArchitectureSchema,
  statefulSequenceClass: OrnithStatefulSequenceClassSchema,
  isMixtureOfExperts: z.literal(false),
  isMambaStyleSsm: z.literal(false),
  hasRecurrentLinearAttention: z.literal(true),
  hasFullSoftmaxAttention: z.literal(true),
  totalTextLayers: z.literal(32),
  gatedDeltaNetLayerCount: z.literal(24),
  fullAttentionLayerCount: z.literal(8),
  fullAttentionInterval: z.literal(4),
  trainingIdentity: OrnithTrainingIdentitySchema,
  workload: OrnithWorkloadSchema,
  primaryRuntime: OrnithRuntimeSchema,
  challengerRuntimes: z.array(OrnithRuntimeSchema).max(4),
  reasons: z.array(z.string().min(1)).min(1).max(20),
  exactSameWeightsRequiredForParity: z.literal(true),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.gatedDeltaNetLayerCount + value.fullAttentionLayerCount !== value.totalTextLayers) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalTextLayers'], message: 'layer counts must sum to totalTextLayers' });
  }
});
export type OrnithRuntimePlanV1 = z.infer<typeof OrnithRuntimePlanV1Schema>;

export function ornithRuntimeCapabilities(runtime: OrnithRuntime): OrnithRuntimeCapabilityV1 {
  switch (runtime) {
    case 'LLAMA_SERVER_GGUF':
      return {
        runtime,
        executionFramework: 'LLAMA_CPP',
        supportsQuantizedLocalInference: true,
        supportsFullTrainingAutograd: false,
        supportsQLoRATraining: false,
        supportsModelInternalInstrumentation: false,
        supportsCustomTritonKernels: false,
        supportsGatedDeltaNet: true,
        supportsFullAttentionLayers: true,
        openAiCompatibleServing: true,
        requiresLinux: false,
        requiresModelConversionOrEngineBuild: true,
      };
    case 'PYTORCH_TRANSFORMERS':
    case 'PYTORCH_COMPILE_INDUCTOR':
    case 'PYTORCH_CUSTOM_TRITON':
      return {
        runtime,
        executionFramework: 'PYTORCH',
        supportsQuantizedLocalInference: runtime === 'PYTORCH_TRANSFORMERS',
        supportsFullTrainingAutograd: true,
        supportsQLoRATraining: true,
        supportsModelInternalInstrumentation: true,
        supportsCustomTritonKernels: true,
        supportsGatedDeltaNet: true,
        supportsFullAttentionLayers: true,
        openAiCompatibleServing: false,
        requiresLinux: false,
        requiresModelConversionOrEngineBuild: false,
      };
    case 'TENSORRT_LLM':
      return {
        runtime,
        executionFramework: 'PYTORCH',
        supportsQuantizedLocalInference: true,
        supportsFullTrainingAutograd: false,
        supportsQLoRATraining: false,
        supportsModelInternalInstrumentation: false,
        supportsCustomTritonKernels: false,
        supportsGatedDeltaNet: true,
        supportsFullAttentionLayers: true,
        openAiCompatibleServing: true,
        requiresLinux: true,
        requiresModelConversionOrEngineBuild: false,
      };
  }
}

export function planOrnithRuntime(input: {
  workload: OrnithWorkload;
  linuxAvailable: boolean;
  /** Exact Ornith/Qwen3.5 hybrid support must be proven in the selected TRT-LLM revision. */
  tensorrtLlmModelSupportProven?: boolean;
  sameWeightRevisionAvailable?: boolean;
  producerRevision: string;
}): OrnithRuntimePlanV1 {
  const trtProven = input.tensorrtLlmModelSupportProven ?? false;
  const sameWeights = input.sameWeightRevisionAvailable ?? false;
  let primaryRuntime: OrnithRuntime;
  const challengers: OrnithRuntime[] = [];
  const reasons: string[] = [
    'Ornith 9B is a dense-FFN Qwen3.5 hybrid: 24 Gated DeltaNet linear-attention layers plus 8 full-attention layers',
    'Gated DeltaNet is stateful recurrent linear attention; do not collapse architecture identity to isSsm=false',
  ];

  switch (input.workload) {
    case 'INTERACTIVE_INFERENCE':
    case 'TOOL_CALLING':
      primaryRuntime = 'LLAMA_SERVER_GGUF';
      reasons.push('GGUF llama-server remains the bounded interactive/tool inference owner');
      if (input.linuxAvailable && trtProven && sameWeights) challengers.push('TENSORRT_LLM');
      challengers.push('PYTORCH_TRANSFORMERS');
      break;
    case 'BATCH_INFERENCE':
      primaryRuntime = input.linuxAvailable && trtProven && sameWeights ? 'TENSORRT_LLM' : 'LLAMA_SERVER_GGUF';
      reasons.push(primaryRuntime === 'TENSORRT_LLM'
        ? 'TensorRT-LLM PyTorch runtime is promoted only after exact hybrid-model and same-revision parity proof; no legacy engine-build step is required'
        : 'TensorRT-LLM PyTorch runtime remains a challenger until exact Ornith hybrid support and same-revision parity are proven');
      challengers.push('PYTORCH_TRANSFORMERS');
      break;
    case 'FEATURE_PROBE':
      primaryRuntime = 'PYTORCH_TRANSFORMERS';
      challengers.push('PYTORCH_COMPILE_INDUCTOR');
      reasons.push('Feature probes require model-internal visibility into recurrent Gated-DeltaNet and full-attention layers');
      break;
    case 'QLORA_TRAINING':
    case 'RL_TRAINING':
      primaryRuntime = 'PYTORCH_TRANSFORMERS';
      challengers.push('PYTORCH_COMPILE_INDUCTOR');
      reasons.push('Training requires autograd; TensorRT-LLM is PyTorch-backed but remains an inference runtime rather than the training owner');
      break;
    case 'KERNEL_EXPERIMENT':
      primaryRuntime = 'PYTORCH_COMPILE_INDUCTOR';
      challengers.push('PYTORCH_CUSTOM_TRITON', 'PYTORCH_TRANSFORMERS');
      reasons.push('Kernel experiments distinguish Gated-DeltaNet recurrent kernels, full-attention SDPA kernels, and Atlas-side GEMM/reduction kernels');
      break;
  }

  return OrnithRuntimePlanV1Schema.parse({
    schema: 'atlas.ornith-runtime-plan.v1',
    modelId: 'deepreinforce-ai/Ornith-1.0-9B',
    parameterization: 'DENSE_FFN',
    sequenceArchitecture: 'HYBRID_GATED_DELTANET_FULL_ATTENTION',
    statefulSequenceClass: 'RECURRENT_LINEAR_ATTENTION',
    isMixtureOfExperts: false,
    isMambaStyleSsm: false,
    hasRecurrentLinearAttention: true,
    hasFullSoftmaxAttention: true,
    totalTextLayers: 32,
    gatedDeltaNetLayerCount: 24,
    fullAttentionLayerCount: 8,
    fullAttentionInterval: 4,
    trainingIdentity: 'SELF_SCAFFOLDING_RL',
    workload: input.workload,
    primaryRuntime,
    challengerRuntimes: challengers.filter((value, index, all) => all.indexOf(value) === index && value !== primaryRuntime),
    reasons,
    exactSameWeightsRequiredForParity: true,
    producerRevision: input.producerRevision,
  });
}
