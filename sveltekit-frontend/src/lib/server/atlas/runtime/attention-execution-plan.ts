import { z } from 'zod';

export const AttentionBackendSchema = z.enum([
  'FLASH_ATTENTION_2',
  'PYTORCH_SDPA_FLASH',
  'PYTORCH_SDPA_EFFICIENT',
  'PYTORCH_SDPA_CUDNN',
  'PYTORCH_SDPA_MATH',
]);
export type AttentionBackend = z.infer<typeof AttentionBackendSchema>;

export const AttentionExecutionPlanV1Schema = z.object({
  schema: z.literal('atlas.attention-execution-plan.v1'),
  algorithm: z.literal('SCALED_DOT_PRODUCT_ATTENTION'),
  requestedBackend: AttentionBackendSchema,
  executable: z.boolean(),
  exactAttentionSemantics: z.boolean(),
  device: z.enum(['CPU', 'CUDA']),
  computeCapability: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).nullable(),
  dtype: z.enum(['FP16', 'BF16', 'FP32']),
  headDimension: z.number().int().positive(),
  cudaMajor: z.number().int().nonnegative().nullable(),
  reasons: z.array(z.string().min(1)).min(1).max(16),
  producerRevision: z.string().min(1),
}).strict();
export type AttentionExecutionPlanV1 = z.infer<typeof AttentionExecutionPlanV1Schema>;

/**
 * Capability planner only. Runtime parity must still force/select the backend
 * explicitly and record the observed execution identity.
 */
export function planAttentionExecution(input: {
  requestedBackend: AttentionBackend;
  device: 'CPU' | 'CUDA';
  computeCapability?: [number, number] | null;
  dtype: 'FP16' | 'BF16' | 'FP32';
  headDimension: number;
  cudaMajor?: number | null;
  producerRevision: string;
}): AttentionExecutionPlanV1 {
  if (!Number.isInteger(input.headDimension) || input.headDimension <= 0) throw new Error('headDimension must be positive');
  const reasons: string[] = [];
  let executable = true;
  const cc = input.computeCapability ?? null;
  const cudaMajor = input.cudaMajor ?? null;

  switch (input.requestedBackend) {
    case 'FLASH_ATTENTION_2':
    case 'PYTORCH_SDPA_FLASH': {
      if (input.device !== 'CUDA') {
        executable = false;
        reasons.push('FLASH_ATTENTION_REQUIRES_CUDA');
      }
      if (!cc || cc[0] < 8) {
        executable = false;
        reasons.push('FLASH_ATTENTION_REQUIRES_AMPERE_OR_NEWER');
      }
      if (cudaMajor !== null && cudaMajor < 12) {
        executable = false;
        reasons.push('FLASH_ATTENTION_2_REQUIRES_CUDA_12_OR_NEWER');
      }
      if (input.dtype !== 'FP16' && input.dtype !== 'BF16') {
        executable = false;
        reasons.push('FLASH_ATTENTION_2_REQUIRES_FP16_OR_BF16');
      }
      if (input.headDimension > 256) {
        executable = false;
        reasons.push('FLASH_ATTENTION_2_HEAD_DIMENSION_EXCEEDS_256');
      }
      if (executable) reasons.push('FLASH_ATTENTION_2_CAPABILITY_MATCH');
      break;
    }
    case 'PYTORCH_SDPA_EFFICIENT':
    case 'PYTORCH_SDPA_CUDNN':
      if (input.device !== 'CUDA') {
        executable = false;
        reasons.push('REQUESTED_SDPA_BACKEND_REQUIRES_CUDA');
      } else {
        reasons.push('CUDA_SDPA_BACKEND_REQUESTED');
      }
      break;
    case 'PYTORCH_SDPA_MATH':
      reasons.push('MATH_SDPA_REFERENCE_PATH');
      break;
  }

  return AttentionExecutionPlanV1Schema.parse({
    schema: 'atlas.attention-execution-plan.v1',
    algorithm: 'SCALED_DOT_PRODUCT_ATTENTION',
    requestedBackend: input.requestedBackend,
    executable,
    // FlashAttention/SDPA backend changes implementation, not the mathematical
    // scaled-dot-product-attention target. Dropout/numerics may still affect
    // bitwise parity, so this is semantic—not bitwise—exactness.
    exactAttentionSemantics: true,
    device: input.device,
    computeCapability: cc,
    dtype: input.dtype,
    headDimension: input.headDimension,
    cudaMajor,
    reasons: reasons.length > 0 ? reasons : ['NO_SPECIAL_CONSTRAINT'],
    producerRevision: input.producerRevision,
  });
}
