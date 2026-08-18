import { describe, expect, it } from 'vitest';
import {
  deferredAeTrainingGate,
  planNeuralExecution,
} from './neural-execution-policy.js';

const idleGpu = {
  schema: 'atlas.runtime-resource-state.v1' as const,
  cudaAvailable: true,
  gpuUtilization: 0.1,
  freeVramBytes: 4 * 1024 * 1024 * 1024,
  reservedVramBytes: 512 * 1024 * 1024,
  cpuUtilization: 0.2,
  freeHostMemoryBytes: 16 * 1024 * 1024 * 1024,
  foregroundQueueDepth: 0,
};

describe('neural execution policy', () => {
  it('selects GEMM for an idle-GPU dense projection', () => {
    const plan = planNeuralExecution({ workload: 'DENSE_PROJECTION', resource: idleGpu });
    expect(plan.primary.executor).toBe('CUBLASLT_GEMM');
    expect(plan.onlineTrainingAllowed).toBe(false);
  });

  it('falls back to CPU when CUDA is unavailable', () => {
    const plan = planNeuralExecution({
      workload: 'POINTWISE_RERANK',
      resource: { ...idleGpu, cudaAvailable: false, freeVramBytes: 0 },
    });
    expect(plan.primary.executor).toBe('LIBTORCH_CPU');
  });

  it('keeps autoencoder training deferred and routing-only until promotion', () => {
    const gate = deferredAeTrainingGate();
    expect(gate.state).toBe('DEFERRED');
    expect(gate.onlineTrainingAllowed).toBe(false);
    expect(gate.routingOnlyUntilPromoted).toBe(true);
    expect(gate.hiddenDimension).toBe(128);
    expect(gate.latentDimension).toBe(64);
  });
});
