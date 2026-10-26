import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_RERANK_MAX_ROWS, GpuReranker, scoreDocFeaturesCPU, type DocFeatures } from './gpu-reranker.js';

const doc: DocFeatures = { trust_tier: 0.6, som_cluster: 3, karpathy_blend: 0.8, pagerank: 0.2, risk_score: 0.1 };

function gpuFixture(options: { failMap?: boolean; failAllocation?: boolean; mismatch?: boolean } = {}) {
  const buffers: Array<{ destroy: ReturnType<typeof vi.fn>; mapAsync: ReturnType<typeof vi.fn>; unmap: ReturnType<typeof vi.fn>; getMappedRange: () => ArrayBuffer }> = [];
  const pipeline = { getBindGroupLayout: vi.fn().mockReturnValue({}) };
  const device = {
    destroy: vi.fn(), lost: new Promise(() => {}),
    limits: { maxStorageBufferBindingSize: 1024 * 1024, maxBufferSize: 1024 * 1024 },
    createShaderModule: vi.fn().mockReturnValue({}),
    createComputePipelineAsync: vi.fn().mockResolvedValue(pipeline),
    createBuffer: vi.fn(() => {
      if (options.failAllocation && buffers.length === 1) throw new Error('allocation');
      const values = options.mismatch ? new Float32Array([42]) : scoreDocFeaturesCPU([doc]);
      const buffer = { destroy: vi.fn(), mapAsync: options.failMap ? vi.fn().mockRejectedValue(new Error('map')) : vi.fn().mockResolvedValue(undefined),
        unmap: vi.fn(), getMappedRange: () => values.buffer as ArrayBuffer };
      buffers.push(buffer);
      return buffer;
    }),
    queue: { writeBuffer: vi.fn(), submit: vi.fn() },
    createBindGroup: vi.fn().mockReturnValue({}),
    createCommandEncoder: vi.fn().mockReturnValue({
      beginComputePass: () => ({ setPipeline: vi.fn(), setBindGroup: vi.fn(), dispatchWorkgroups: vi.fn(), end: vi.fn() }),
      copyBufferToBuffer: vi.fn(), finish: vi.fn().mockReturnValue({}),
    }),
  };
  const requestAdapter = vi.fn().mockResolvedValue({ requestDevice: vi.fn().mockResolvedValue(device) });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { gpu: { requestAdapter } });
  vi.stubGlobal('GPUBufferUsage', { STORAGE: 1, COPY_DST: 2, COPY_SRC: 4, MAP_READ: 8 });
  vi.stubGlobal('GPUMapMode', { READ: 1 });
  return { device, buffers, requestAdapter };
}

afterEach(() => vi.unstubAllGlobals());

describe('bounded optional browser scorer', () => {
  it('provides finite FP32 CPU reference and preserves row order', async () => {
    const scores = scoreDocFeaturesCPU([doc, { ...doc, risk_score: 1 }]);
    expect(scores[0]).toBeCloseTo(0.76, 5);
    expect(scores[1]).toBeCloseTo(0.58, 5);
    expect(await new GpuReranker().rerank([doc])).toEqual(scoreDocFeaturesCPU([doc]));
  });

  it('rejects oversized, missing, nonfinite and non-FP32 input', () => {
    expect(() => scoreDocFeaturesCPU(Array(BROWSER_RERANK_MAX_ROWS + 1).fill(doc))).toThrow('BATCH_INVALID');
    for (const value of [NaN, Infinity, 1e100, undefined]) {
      expect(() => scoreDocFeaturesCPU([{ ...doc, trust_tier: value } as DocFeatures])).toThrow('FEATURE_INVALID');
    }
  });

  it('returns empty without allocating buffers', async () => {
    const gpu = gpuFixture();
    const reranker = new GpuReranker();
    await reranker.init();
    expect(await reranker.rerank([])).toEqual(new Float32Array());
    expect(gpu.device.createBuffer).not.toHaveBeenCalled();
  });

  it('handles SSR/insecure contexts and adapter denial without requesting a device', async () => {
    const gpu = gpuFixture();
    vi.stubGlobal('isSecureContext', false);
    expect(await new GpuReranker().init()).toBe(false);
    expect(gpu.requestAdapter).not.toHaveBeenCalled();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', undefined);
    expect(await new GpuReranker().init()).toBe(false);
    vi.stubGlobal('navigator', { gpu: { requestAdapter: vi.fn().mockRejectedValue(new Error('denied')) } });
    expect(await new GpuReranker().init()).toBe(false);
  });

  it('shares concurrent initialization and releases a device on dispose', async () => {
    const gpu = gpuFixture();
    const reranker = new GpuReranker();
    expect(await Promise.all([reranker.init(), reranker.init()])).toEqual([true, true]);
    expect(gpu.requestAdapter).toHaveBeenCalledTimes(1);
    reranker.dispose();
    expect(gpu.device.destroy).toHaveBeenCalledTimes(1);
    expect(await reranker.rerank([doc])).toEqual(scoreDocFeaturesCPU([doc]));
  });

  it('validates readback against the CPU oracle and destroys successful buffers', async () => {
    const gpu = gpuFixture();
    const reranker = new GpuReranker();
    await reranker.init();
    expect(await reranker.rerank([doc])).toEqual(scoreDocFeaturesCPU([doc]));
    expect(gpu.buffers).toHaveLength(3);
    expect(gpu.buffers.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
  });

  it.each([{ failMap: true }, { failAllocation: true }, { mismatch: true }])('falls back and cleans partial buffers on %j', async (options) => {
    const gpu = gpuFixture(options);
    const reranker = new GpuReranker();
    await reranker.init();
    expect(await reranker.rerank([doc])).toEqual(scoreDocFeaturesCPU([doc]));
    expect(gpu.buffers.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
    expect(gpu.device.destroy).toHaveBeenCalledTimes(1);
  });

  it('uses CPU when device buffer limits cannot fit the batch', async () => {
    const gpu = gpuFixture();
    gpu.device.limits.maxBufferSize = 4;
    const reranker = new GpuReranker();
    await reranker.init();
    expect(await reranker.rerank([doc])).toEqual(scoreDocFeaturesCPU([doc]));
    expect(gpu.device.createBuffer).not.toHaveBeenCalled();
  });
});
