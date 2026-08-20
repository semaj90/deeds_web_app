import { describe, expect, it } from 'vitest';
import { planAttentionExecution } from './attention-execution-plan.js';

describe('attention execution planning', () => {
  it('accepts FlashAttention-2 on an Ampere-class CUDA 12 fp16 configuration', () => {
    const plan = planAttentionExecution({
      requestedBackend: 'FLASH_ATTENTION_2',
      device: 'CUDA',
      computeCapability: [8, 6],
      dtype: 'FP16',
      headDimension: 128,
      cudaMajor: 12,
      producerRevision: 'test',
    });
    expect(plan.executable).toBe(true);
    expect(plan.reasons).toContain('FLASH_ATTENTION_2_CAPABILITY_MATCH');
    expect(plan.exactAttentionSemantics).toBe(true);
  });

  it('rejects FlashAttention-2 on pre-Ampere capability', () => {
    const plan = planAttentionExecution({
      requestedBackend: 'FLASH_ATTENTION_2',
      device: 'CUDA',
      computeCapability: [7, 5],
      dtype: 'FP16',
      headDimension: 64,
      cudaMajor: 12,
      producerRevision: 'test',
    });
    expect(plan.executable).toBe(false);
    expect(plan.reasons).toContain('FLASH_ATTENTION_REQUIRES_AMPERE_OR_NEWER');
  });

  it('rejects unsupported fp32 FlashAttention-2 requests', () => {
    const plan = planAttentionExecution({
      requestedBackend: 'PYTORCH_SDPA_FLASH',
      device: 'CUDA',
      computeCapability: [8, 6],
      dtype: 'FP32',
      headDimension: 64,
      cudaMajor: 12,
      producerRevision: 'test',
    });
    expect(plan.executable).toBe(false);
    expect(plan.reasons).toContain('FLASH_ATTENTION_2_REQUIRES_FP16_OR_BF16');
  });

  it('rejects FlashAttention-2 head dimensions above 256', () => {
    const plan = planAttentionExecution({
      requestedBackend: 'FLASH_ATTENTION_2',
      device: 'CUDA',
      computeCapability: [8, 6],
      dtype: 'BF16',
      headDimension: 320,
      cudaMajor: 12,
      producerRevision: 'test',
    });
    expect(plan.executable).toBe(false);
    expect(plan.reasons).toContain('FLASH_ATTENTION_2_HEAD_DIMENSION_EXCEEDS_256');
  });

  it('keeps the PyTorch math backend available as a CPU reference path', () => {
    const plan = planAttentionExecution({
      requestedBackend: 'PYTORCH_SDPA_MATH',
      device: 'CPU',
      computeCapability: null,
      dtype: 'FP32',
      headDimension: 64,
      cudaMajor: null,
      producerRevision: 'test',
    });
    expect(plan.executable).toBe(true);
    expect(plan.reasons).toContain('MATH_SDPA_REFERENCE_PATH');
  });
});
