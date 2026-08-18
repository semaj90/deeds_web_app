import { describe, expect, it } from 'vitest';
import { buildNativeComputePlan } from '../src/lib/server/atlas/runtime/native-compute-plan.js';

describe('buildNativeComputePlan', () => {
  it('requires an environment receipt and lease for GPU execution', () => {
    expect(() => buildNativeComputePlan({
      planId: 'p1',
      request: { operation: 'GEMM', capability: 'recommendation.rerank', shape: [128, 768], requiredGpuBytes: 64_000_000 },
      decision: { runtime: 'windows-native', executor: 'cublaslt', dtype: 'fp16', accumulationDtype: 'fp32', environmentReceiptId: 'env:windows', reason: 'test' },
      referenceBackend: 'pytorch-cpu', numericalTolerance: { maxAbsError: 1e-3, maxRelError: 1e-3, minTopKOverlap: 0.99 },
      smArchitecture: '8.6',
    })).toThrow(/GPU_LEASE_REQUIRED/);
  });

  it('requires an accuracy receipt for int8', () => {
    expect(() => buildNativeComputePlan({
      planId: 'p2',
      request: { operation: 'RERANK', capability: 'model.rerank', shape: [32, 768], requiredGpuBytes: 32_000_000 },
      decision: { runtime: 'windows-native', executor: 'tensorrt-rtx', dtype: 'int8', accumulationDtype: 'int32', environmentReceiptId: 'env:windows', reason: 'test' },
      referenceBackend: 'pytorch-cpu', numericalTolerance: { maxAbsError: 0.02, maxRelError: 0.05, minTopKOverlap: 0.98 },
      gpuLeaseId: 'lease:1', smArchitecture: '8.6',
    })).toThrow(/INT8_ACCURACY_RECEIPT_REQUIRED/);
  });

  it('creates a GPU plan only when proof artifacts are present', () => {
    const plan = buildNativeComputePlan({
      planId: 'p3',
      request: { operation: 'PAGERANK', capability: 'graph.pagerank', shape: [1000, 1000], requiredGpuBytes: 64_000_000 },
      decision: { runtime: 'wsl2', executor: 'cugraph', dtype: 'fp32', accumulationDtype: 'fp32', environmentReceiptId: 'env:wsl', reason: 'test' },
      referenceBackend: 'networkx', numericalTolerance: { maxAbsError: 1e-5, maxRelError: 1e-5, minTopKOverlap: 0.99 },
      gpuLeaseId: 'lease:2', smArchitecture: '8.6',
    });
    expect(plan.selectedRuntime).toBe('wsl2');
    expect(plan.referenceBackend).toBe('networkx');
    expect(plan.gpuLeaseId).toBe('lease:2');
  });
});
