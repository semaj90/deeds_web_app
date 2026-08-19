import { describe, expect, it } from 'vitest';
import { ornithRuntimeCapabilities, planOrnithRuntime } from './ornith-runtime-plan.js';

describe('Ornith 9B runtime plan', () => {
  it('keeps Ornith 9B dense and explicitly not SSM', () => {
    const plan = planOrnithRuntime({
      workload: 'INTERACTIVE_INFERENCE',
      linuxAvailable: true,
      producerRevision: 'test',
    });
    expect(plan.modelArchitecture).toBe('DENSE_TRANSFORMER');
    expect(plan.isSsm).toBe(false);
    expect(plan.trainingIdentity).toBe('SELF_SCAFFOLDING_RL');
  });

  it('uses llama-server as the default interactive quantized inference owner', () => {
    const plan = planOrnithRuntime({
      workload: 'TOOL_CALLING',
      linuxAvailable: true,
      producerRevision: 'test',
    });
    expect(plan.primaryRuntime).toBe('LLAMA_SERVER_GGUF');
    expect(plan.challengerRuntimes).toContain('PYTORCH_TRANSFORMERS');
  });

  it('does not promote TensorRT-LLM until model support and same-weight parity are proven', () => {
    const unproven = planOrnithRuntime({
      workload: 'BATCH_INFERENCE', linuxAvailable: true,
      tensorrtLlmModelSupportProven: false, sameWeightRevisionAvailable: true,
      producerRevision: 'test',
    });
    expect(unproven.primaryRuntime).toBe('LLAMA_SERVER_GGUF');

    const proven = planOrnithRuntime({
      workload: 'BATCH_INFERENCE', linuxAvailable: true,
      tensorrtLlmModelSupportProven: true, sameWeightRevisionAvailable: true,
      producerRevision: 'test',
    });
    expect(proven.primaryRuntime).toBe('TENSORRT_LLM');
  });

  it('routes QLoRA and RL training to PyTorch rather than inference runtimes', () => {
    for (const workload of ['QLORA_TRAINING', 'RL_TRAINING'] as const) {
      const plan = planOrnithRuntime({ workload, linuxAvailable: true, producerRevision: 'test' });
      expect(plan.primaryRuntime).toBe('PYTORCH_TRANSFORMERS');
    }
    expect(ornithRuntimeCapabilities('LLAMA_SERVER_GGUF').supportsFullTrainingAutograd).toBe(false);
    expect(ornithRuntimeCapabilities('TENSORRT_LLM').supportsFullTrainingAutograd).toBe(false);
  });

  it('treats Triton as a kernel experiment under PyTorch, not a standalone model server', () => {
    const plan = planOrnithRuntime({ workload: 'KERNEL_EXPERIMENT', linuxAvailable: true, producerRevision: 'test' });
    expect(plan.primaryRuntime).toBe('PYTORCH_COMPILE_INDUCTOR');
    expect(plan.challengerRuntimes).toContain('PYTORCH_CUSTOM_TRITON');
    expect(ornithRuntimeCapabilities('PYTORCH_CUSTOM_TRITON').openAiCompatibleServing).toBe(false);
  });
});
