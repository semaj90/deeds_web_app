import { describe, expect, it } from 'vitest';
import { chooseNativeComputeExecutor, type GpuEnvironmentCapabilities } from '../src/lib/server/atlas/runtime/native-compute-policy.js';

const windows: GpuEnvironmentCapabilities = {
  receiptId: 'env:windows', runtime: 'windows-native', status: 'PROVEN', computeCapability: '8.6', freeGpuBytes: 3_000_000_000,
  cublas: true, cublasLt: true, libtorch: true, cusolver: true, tensorrtRtx: true,
};
const wsl: GpuEnvironmentCapabilities = {
  receiptId: 'env:wsl', runtime: 'wsl2', status: 'PROVEN', computeCapability: '8.6', freeGpuBytes: 3_000_000_000,
  pytorch: true, cuvs: true, cugraph: true, cugraphPyg: true, tensorrtLlm: true,
};

describe('chooseNativeComputeExecutor', () => {
  it('prefers Windows cuBLASLt FP16 with FP32 accumulation for dense rerank math', () => {
    const result = chooseNativeComputeExecutor({ operation: 'GEMM', capability: 'recommendation.rerank', shape: [128, 768], requiredGpuBytes: 64_000_000 }, [windows, wsl]);
    expect(result.runtime).toBe('windows-native');
    expect(result.executor).toBe('cublaslt');
    expect(result.dtype).toBe('fp16');
    expect(result.accumulationDtype).toBe('fp32');
  });

  it('routes PageRank to WSL cuGraph while keeping the operation semantically unchanged', () => {
    const result = chooseNativeComputeExecutor({ operation: 'PAGERANK', capability: 'graph.pagerank', shape: [1000, 1000], requiredGpuBytes: 64_000_000 }, [windows, wsl]);
    expect(result.runtime).toBe('wsl2');
    expect(result.executor).toBe('cugraph');
    expect(result.dtype).toBe('fp32');
  });

  it('routes exact KNN to cuVS, not CAGRA', () => {
    const result = chooseNativeComputeExecutor({ operation: 'KNN_EXACT', capability: 'semantic.exact', shape: [1, 768, 10000], requiredGpuBytes: 128_000_000 }, [windows, wsl]);
    expect(result.executor).toBe('cuvs-exact');
  });

  it('requires an explicit accuracy proof before selecting int8', () => {
    const unproven = chooseNativeComputeExecutor({ operation: 'RERANK', capability: 'model.rerank', shape: [32, 768], requiredGpuBytes: 64_000_000, preferWindowsLowLatency: true, allowQuantizedInt8: true, int8AccuracyProven: false }, [windows, wsl]);
    expect(unproven.dtype).toBe('fp16');
    const proven = chooseNativeComputeExecutor({ operation: 'RERANK', capability: 'model.rerank', shape: [32, 768], requiredGpuBytes: 64_000_000, preferWindowsLowLatency: true, allowQuantizedInt8: true, int8AccuracyProven: true }, [windows, wsl]);
    expect(proven.dtype).toBe('int8');
  });

  it('keeps unavailable enrichment on CPU/unavailable rather than inventing a GPU path', () => {
    const result = chooseNativeComputeExecutor({ operation: 'GNN_INFER', capability: 'graph.gnn', shape: [100, 16], requiredGpuBytes: 64_000_000 }, [{ ...wsl, status: 'DEGRADED' }]);
    expect(result.runtime).toBe('cpu-only');
    expect(result.executor).toBe('cpu');
  });
});
