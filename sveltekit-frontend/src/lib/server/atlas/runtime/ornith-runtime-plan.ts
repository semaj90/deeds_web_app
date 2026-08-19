import { z } from 'zod';

/**
 * Ornith-1.0-9B runtime identity.
 *
 * Important distinction:
 * - model architecture/training identity: dense ~9B coding model trained with
 *   a self-improving RL/scaffolding framework.
 * - serving runtime: llama-server, PyTorch/Transformers, TensorRT-LLM, etc.
 * - kernel/compiler layer: Triton/torch.compile is not a model server by itself.
 */
export const OrnithModelArchitectureSchema = z.enum(['DENSE_TRANSFORMER', 'UNKNOWN']);
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
  supportsQuantizedLocalInference: z.boolean(),
  supportsFullTrainingAutograd: z.boolean(),
  supportsQLoRATraining: z.boolean(),
  supportsModelInternalInstrumentation: z.boolean(),
  supportsCustomTritonKernels: z.boolean(),
  openAiCompatibleServing: z.boolean(),
  requiresLinux: z.boolean(),
  requiresModelConversionOrEngineBuild: z.boolean(),
}).strict();
export type OrnithRuntimeCapabilityV1 = z.infer<typeof OrnithRuntimeCapabilityV1Schema>;

export const OrnithRuntimePlanV1Schema = z.object({
  schema: z.literal('atlas.ornith-runtime-plan.v1'),
  modelId: z.literal('deepreinforce-ai/Ornith-1.0-9B'),
  modelArchitecture: OrnithModelArchitectureSchema,
  isSsm: z.literal(false),
  trainingIdentity: OrnithTrainingIdentitySchema,
  workload: OrnithWorkloadSchema,
  primaryRuntime: OrnithRuntimeSchema,
  challengerRuntimes: z.array(OrnithRuntimeSchema).max(4),
  reasons: z.array(z.string().min(1)).min(1).max(16),
  exactSameWeightsRequiredForParity: z.literal(true),
  producerRevision: z.string().min(1),
}).strict();
export type OrnithRuntimePlanV1 = z.infer<typeof OrnithRuntimePlanV1Schema>;

export function ornithRuntimeCapabilities(runtime: OrnithRuntime): OrnithRuntimeCapabilityV1 {
  switch (runtime) {
    case 'LLAMA_SERVER_GGUF':
      return {
        runtime,
        supportsQuantizedLocalInference: true,
        supportsFullTrainingAutograd: false,
        supportsQLoRATraining: false,
        supportsModelInternalInstrumentation: false,
        supportsCustomTritonKernels: false,
        openAiCompatibleServing: true,
        requiresLinux: false,
        requiresModelConversionOrEngineBuild: true,
      };
    case 'PYTORCH_TRANSFORMERS':
      return {
        runtime,
        supportsQuantizedLocalInference: true,
        supportsFullTrainingAutograd: true,
        supportsQLoRATraining: true,
        supportsModelInternalInstrumentation: true,
        supportsCustomTritonKernels: true,
        openAiCompatibleServing: false,
        requiresLinux: false,
        requiresModelConversionOrEngineBuild: false,
      };
    case 'PYTORCH_COMPILE_INDUCTOR':
      return {
        runtime,
        supportsQuantizedLocalInference: false,
        supportsFullTrainingAutograd: true,
        supportsQLoRATraining: true,
        supportsModelInternalInstrumentation: true,
        supportsCustomTritonKernels: true,
        openAiCompatibleServing: false,
        requiresLinux: false,
        requiresModelConversionOrEngineBuild: false,
      };
    case 'PYTORCH_CUSTOM_TRITON':
      return {
        runtime,
        supportsQuantizedLocalInference: false,
        supportsFullTrainingAutograd: true,
        supportsQLoRATraining: true,
        supportsModelInternalInstrumentation: true,
        supportsCustomTritonKernels: true,
        openAiCompatibleServing: false,
        requiresLinux: false,
        requiresModelConversionOrEngineBuild: false,
      };
    case 'TENSORRT_LLM':
      return {
        runtime,
        supportsQuantizedLocalInference: true,
        supportsFullTrainingAutograd: false,
        supportsQLoRATraining: false,
        supportsModelInternalInstrumentation: false,
        supportsCustomTritonKernels: false,
        openAiCompatibleServing: true,
        requiresLinux: true,
        requiresModelConversionOrEngineBuild: true,
      };
  }
}

export function planOrnithRuntime(input: {
  workload: OrnithWorkload;
  linuxAvailable: boolean;
  tensorrtLlmModelSupportProven?: boolean;
  sameWeightRevisionAvailable?: boolean;
  producerRevision: string;
}): OrnithRuntimePlanV1 {
  const trtProven = input.tensorrtLlmModelSupportProven ?? false;
  const sameWeights = input.sameWeightRevisionAvailable ?? false;
  let primaryRuntime: OrnithRuntime;
  const challengers: OrnithRuntime[] = [];
  const reasons: string[] = [];

  switch (input.workload) {
    case 'INTERACTIVE_INFERENCE':
    case 'TOOL_CALLING':
      primaryRuntime = 'LLAMA_SERVER_GGUF';
      reasons.push('GGUF llama-server is the simplest low-VRAM OpenAI-compatible inference owner');
      if (input.linuxAvailable && trtProven && sameWeights) challengers.push('TENSORRT_LLM');
      challengers.push('PYTORCH_TRANSFORMERS');
      break;
    case 'BATCH_INFERENCE':
      primaryRuntime = input.linuxAvailable && trtProven && sameWeights ? 'TENSORRT_LLM' : 'LLAMA_SERVER_GGUF';
      reasons.push(primaryRuntime === 'TENSORRT_LLM'
        ? 'TensorRT-LLM is enabled only after model-support and same-weight parity are proven'
        : 'TensorRT-LLM remains a challenger until model conversion/support and parity are proven');
      challengers.push('PYTORCH_TRANSFORMERS');
      break;
    case 'FEATURE_PROBE':
      primaryRuntime = 'PYTORCH_TRANSFORMERS';
      challengers.push('PYTORCH_COMPILE_INDUCTOR');
      reasons.push('Feature probes require model-internal tensors and exact architecture visibility');
      break;
    case 'QLORA_TRAINING':
    case 'RL_TRAINING':
      primaryRuntime = 'PYTORCH_TRANSFORMERS';
      challengers.push('PYTORCH_COMPILE_INDUCTOR');
      reasons.push('Training requires autograd; inference-only llama-server and TensorRT-LLM are not training owners');
      break;
    case 'KERNEL_EXPERIMENT':
      primaryRuntime = 'PYTORCH_COMPILE_INDUCTOR';
      challengers.push('PYTORCH_CUSTOM_TRITON', 'PYTORCH_TRANSFORMERS');
      reasons.push('Triton is a kernel/compiler seam inside a PyTorch experiment, not a standalone Ornith serving runtime');
      break;
  }

  return OrnithRuntimePlanV1Schema.parse({
    schema: 'atlas.ornith-runtime-plan.v1',
    modelId: 'deepreinforce-ai/Ornith-1.0-9B',
    modelArchitecture: 'DENSE_TRANSFORMER',
    isSsm: false,
    trainingIdentity: 'SELF_SCAFFOLDING_RL',
    workload: input.workload,
    primaryRuntime,
    challengerRuntimes: challengers.filter((value, index, all) => all.indexOf(value) === index && value !== primaryRuntime),
    reasons,
    exactSameWeightsRequiredForParity: true,
    producerRevision: input.producerRevision,
  });
}
