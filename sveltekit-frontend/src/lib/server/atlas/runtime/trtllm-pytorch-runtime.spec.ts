import { describe, expect, it } from 'vitest';
import {
  canPromoteTrtLlmForOrnith,
  currentTrtLlmPyTorchRuntime,
  torchTensorRtCompilerIdentity,
} from './trtllm-pytorch-runtime.js';

describe('TensorRT-LLM current PyTorch runtime identity', () => {
  it('records PyTorch as the sole TRT-LLM execution backend without legacy engine build', () => {
    const runtime = currentTrtLlmPyTorchRuntime('test');
    expect(runtime.executionBackend).toBe('PYTORCH');
    expect(runtime.legacyTensorRtEngineBackendRemoved).toBe(true);
    expect(runtime.requiresTensorRtEngineBuild).toBe(false);
    expect(runtime.requiresPerModelCheckpointConversion).toBe(false);
    expect(runtime.loadsHuggingFaceCheckpointDirectly).toBe(true);
    expect(runtime.executor).toBe('PYEXECUTOR');
    expect(runtime.schedulerOwnsBatching).toBe(true);
    expect(runtime.kvCacheManagerOwnedByRuntime).toBe(true);
  });

  it('keeps TensorRT-LLM inference-only despite its PyTorch backend', () => {
    const runtime = currentTrtLlmPyTorchRuntime('test');
    expect(runtime.inferenceOnlyAuthority).toBe(true);
    expect(runtime.trainingAutogradAuthority).toBe(false);
    expect(runtime.qloraTrainingAuthority).toBe(false);
    expect(runtime.rlTrainingAuthority).toBe(false);
  });

  it('gates Ornith promotion on exact hybrid support and same-revision parity', () => {
    expect(canPromoteTrtLlmForOrnith({
      linuxAvailable: true, exactHybridModelSupportProven: false,
      sameModelRevisionAvailable: true, producerRevision: 'test',
    }).eligible).toBe(false);

    expect(canPromoteTrtLlmForOrnith({
      linuxAvailable: true, exactHybridModelSupportProven: true,
      sameModelRevisionAvailable: true, producerRevision: 'test',
    }).eligible).toBe(true);
  });

  it('does not conflate Torch-TensorRT torch.compile with TensorRT-LLM', () => {
    const compiler = torchTensorRtCompilerIdentity('test');
    expect(compiler.framework).toBe('PYTORCH');
    expect(compiler.compiler).toBe('TORCH_TENSORRT');
    expect(compiler.entrypoint).toBe('torch.compile');
    expect(compiler.tensorRtLlmRuntime).toBe(false);
  });
});
