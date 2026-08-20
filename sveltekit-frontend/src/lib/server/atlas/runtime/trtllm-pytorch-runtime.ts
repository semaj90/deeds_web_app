import { z } from 'zod';

/**
 * TensorRT-LLM current runtime identity.
 *
 * Current TensorRT-LLM removed the legacy TensorRT engine backend. The LLM
 * runtime is PyTorch-backed and loads supported Hugging Face checkpoints
 * directly. This remains an inference runtime: it is not the Parent Atlas
 * QLoRA/RL training owner and it is distinct from Torch-TensorRT's
 * `torch.compile(backend="tensorrt")` compiler path.
 */
export const TrtLlmPhaseSchema = z.enum(['PREFILL', 'DECODE', 'BATCH_INFERENCE']);
export type TrtLlmPhase = z.infer<typeof TrtLlmPhaseSchema>;

export const TrtLlmPyTorchRuntimeV1Schema = z.object({
  schema: z.literal('atlas.trtllm-pytorch-runtime.v1'),
  runtime: z.literal('TENSORRT_LLM'),
  executionBackend: z.literal('PYTORCH'),
  legacyTensorRtEngineBackendRemoved: z.literal(true),
  requiresTensorRtEngineBuild: z.literal(false),
  requiresPerModelCheckpointConversion: z.literal(false),
  loadsHuggingFaceCheckpointDirectly: z.literal(true),
  inferenceOnlyAuthority: z.literal(true),
  trainingAutogradAuthority: z.literal(false),
  qloraTrainingAuthority: z.literal(false),
  rlTrainingAuthority: z.literal(false),
  executor: z.literal('PYEXECUTOR'),
  schedulerOwnsBatching: z.literal(true),
  kvCacheManagerOwnedByRuntime: z.literal(true),
  phases: z.tuple([
    z.literal('PREFILL'),
    z.literal('DECODE'),
    z.literal('BATCH_INFERENCE'),
  ]),
  producerRevision: z.string().min(1),
}).strict();
export type TrtLlmPyTorchRuntimeV1 = z.infer<typeof TrtLlmPyTorchRuntimeV1Schema>;

export function currentTrtLlmPyTorchRuntime(producerRevision: string): TrtLlmPyTorchRuntimeV1 {
  return TrtLlmPyTorchRuntimeV1Schema.parse({
    schema: 'atlas.trtllm-pytorch-runtime.v1',
    runtime: 'TENSORRT_LLM',
    executionBackend: 'PYTORCH',
    legacyTensorRtEngineBackendRemoved: true,
    requiresTensorRtEngineBuild: false,
    requiresPerModelCheckpointConversion: false,
    loadsHuggingFaceCheckpointDirectly: true,
    inferenceOnlyAuthority: true,
    trainingAutogradAuthority: false,
    qloraTrainingAuthority: false,
    rlTrainingAuthority: false,
    executor: 'PYEXECUTOR',
    schedulerOwnsBatching: true,
    kvCacheManagerOwnedByRuntime: true,
    phases: ['PREFILL', 'DECODE', 'BATCH_INFERENCE'],
    producerRevision,
  });
}

export const TrtLlmPromotionDecisionV1Schema = z.object({
  schema: z.literal('atlas.trtllm-promotion-decision.v1'),
  eligible: z.boolean(),
  exactHybridModelSupportProven: z.boolean(),
  sameModelRevisionAvailable: z.boolean(),
  linuxAvailable: z.boolean(),
  reasons: z.array(z.string().min(1)).min(1).max(8),
  producerRevision: z.string().min(1),
}).strict();
export type TrtLlmPromotionDecisionV1 = z.infer<typeof TrtLlmPromotionDecisionV1Schema>;

export function canPromoteTrtLlmForOrnith(input: {
  linuxAvailable: boolean;
  exactHybridModelSupportProven: boolean;
  sameModelRevisionAvailable: boolean;
  producerRevision: string;
}): TrtLlmPromotionDecisionV1 {
  const reasons: string[] = [];
  if (!input.linuxAvailable) reasons.push('LINUX_RUNTIME_REQUIRED');
  if (!input.exactHybridModelSupportProven) reasons.push('ORNITH_HYBRID_GATED_DELTANET_SUPPORT_UNPROVEN');
  if (!input.sameModelRevisionAvailable) reasons.push('SAME_MODEL_REVISION_REQUIRED_FOR_PARITY');
  const eligible = input.linuxAvailable && input.exactHybridModelSupportProven && input.sameModelRevisionAvailable;
  if (eligible) reasons.push('READY_FOR_INFERENCE_SHADOW_OR_CHALLENGER');

  return TrtLlmPromotionDecisionV1Schema.parse({
    schema: 'atlas.trtllm-promotion-decision.v1',
    eligible,
    exactHybridModelSupportProven: input.exactHybridModelSupportProven,
    sameModelRevisionAvailable: input.sameModelRevisionAvailable,
    linuxAvailable: input.linuxAvailable,
    reasons,
    producerRevision: input.producerRevision,
  });
}

/**
 * Torch-TensorRT is a separate compiler identity and must never be serialized as
 * TensorRT-LLM merely because both names contain TensorRT.
 */
export const TorchTensorRtCompilerIdentityV1Schema = z.object({
  schema: z.literal('atlas.torch-tensorrt-compiler.v1'),
  framework: z.literal('PYTORCH'),
  compiler: z.literal('TORCH_TENSORRT'),
  entrypoint: z.literal('torch.compile'),
  backend: z.literal('torch_tensorrt'),
  inferenceCompilerOnly: z.literal(true),
  tensorRtLlmRuntime: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();

export function torchTensorRtCompilerIdentity(producerRevision: string) {
  return TorchTensorRtCompilerIdentityV1Schema.parse({
    schema: 'atlas.torch-tensorrt-compiler.v1',
    framework: 'PYTORCH',
    compiler: 'TORCH_TENSORRT',
    entrypoint: 'torch.compile',
    backend: 'torch_tensorrt',
    inferenceCompilerOnly: true,
    tensorRtLlmRuntime: false,
    producerRevision,
  });
}
