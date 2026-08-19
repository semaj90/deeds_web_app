import { describe, expect, it } from 'vitest';
import { ornithRuntimeCapabilities, planOrnithRuntime } from './ornith-runtime-plan.js';

describe('Ornith 9B runtime plan', () => {
  it('records dense FFN parameterization separately from hybrid recurrent sequence mixing', () => {
    const plan = planOrnithRuntime({
      workload: 'INTERACTIVE_INFERENCE',
      linuxAvailable: true,
      producerRevision: 'test',
    });
    expect(plan.parameterization).toBe('DENSE_FFN');
    expect(plan.isMixtureOfExperts).toBe(false);
    expect(plan.sequenceArchitecture).toBe('HYBRID_GATED_DELTANET_FULL_ATTENTION');
    expect(plan.statefulSequenceClass).toBe('RECURRENT_LINEAR_ATTENTION');
    expect(plan.isMambaStyleSsm).toBe(false);
    expect(plan.hasRecurrentLinearAttention).toBe(true);
    expect(plan.hasFullSoftmaxAttention).toBe(true);
    expect(plan.gatedDeltaNetLayerCount).toBe(24);
    expect(plan.fullAttentionLayerCount).toBe(8);
    expect(plan.totalTextLayers).toBe(32);
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
    expect(ornithRuntimeCapabilities('LLAMA_SERVER_GGUF').supportsGatedDeltaNet).toBe(true);
  });

  it('does not promote TensorRT-LLM until exact hybrid-model support and same-weight parity are proven', () => {
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
    expect(ornithRuntimeCapabilities('TENSORRT_LLM').supportsGatedDeltaNet).toBe(true);
  });

  it('routes QLoRA and RL training to PyTorch rather than inference runtimes', () => {
    for (const workload of ['QLORA_TRAINING', 'RL_TRAINING'] as const) {
      const plan = planOrnithRuntime({ workload, linuxAvailable: true, producerRevision: 'test' });
      expect(plan.primaryRuntime).toBe('PYTORCH_TRANSFORMERS');
    }
    expect(ornithRuntimeCapabilities('LLAMA_SERVER_GGUF').supportsFullTrainingAutograd).toBe(false);
    expect(ornithRuntimeCapabilities('TENSORRT_LLM').supportsFullTrainingAutograd).toBe(false);
  });

  it('treats Triton as separate kernel work for recurrent GDN versus full attention', () => {
    const plan = planOrnithRuntime({ workload: 'KERNEL_EXPERIMENT', linuxAvailable: true, producerRevision: 'test' });
    expect(plan.primaryRuntime).toBe('PYTORCH_COMPILE_INDUCTOR');
    expect(plan.challengerRuntimes).toContain('PYTORCH_CUSTOM_TRITON');
    expect(ornithRuntimeCapabilities('PYTORCH_CUSTOM_TRITON').openAiCompatibleServing).toBe(false);
    expect(plan.reasons.some((reason) => reason.includes('Gated-DeltaNet'))).toBe(true);
  });
});
