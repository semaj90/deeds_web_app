import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ event: vi.fn(), addon: vi.fn(), room: vi.fn(), redis: vi.fn() }));
vi.mock('./libtorch-bridge.js', () => ({ getAddonInternal: mocks.addon, gpuHasRoom: mocks.room, vramNeededMB: () => 0 }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { CUDA_MAX_STREAMS: 2, CUDA_DEVICE_ID: 0 } }));
vi.mock('../telemetry/packet-centric-telemetry.js', () => ({ recordPacketCentricTelemetry: mocks.event }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: mocks.redis }));

beforeEach(() => {
  vi.resetModules();
  mocks.event.mockReset().mockResolvedValue(undefined);
  mocks.addon.mockReset().mockReturnValue(null);
  mocks.room.mockReset().mockReturnValue(false);
  mocks.redis.mockReset().mockImplementation(() => { throw new Error('NUMERIC_REDIS_ACCESS_FORBIDDEN'); });
});

describe('GPU pipeline resource observations and cache boundary', () => {
  it('runs all six CPU operations and emits one bounded observation per operation without Redis', async () => {
    const pipeline = await import('./gpu-pipeline.js');
    const attention = await pipeline.pipelineAttention(new Float32Array([1, 0]), new Float32Array([1, 0, 0, 1]), 2, 2);
    expect(attention.source).toBe('cpu');
    expect(attention.weights[0] + attention.weights[1]).toBeCloseTo(1);
    const pagerank = await pipeline.pipelinePageRank(new Float32Array([0, 1, 1, 0]), 2, 0.85, 5);
    expect(Array.from(pagerank.scores)).toEqual([0.5, 0.5]);
    const reward = await pipeline.pipelineReward(new Float32Array([1, 0]), new Float32Array([0, 1]), 1, 2);
    expect(reward.scores.length).toBe(1);
    const top = await pipeline.pipelineTopK(new Float32Array([0.2, 0.9, 0.4]), 3, 2);
    expect(Array.from(top.indices)).toEqual([1, 2]);
    const clusters = await pipeline.pipelineKmeans(new Float32Array([0, 0, 1, 1, 10, 10, 11, 11]), 4, 2, 2, 5);
    expect(clusters.assignments.length).toBe(4);
    expect(clusters.centroids.length).toBe(4);
    const softmax = await pipeline.pipelineSoftmax(new Float32Array([1, 2]), 2);
    expect(softmax.probs[0] + softmax.probs[1]).toBeCloseTo(1);
    await vi.waitFor(() => expect(mocks.event).toHaveBeenCalledTimes(6));
    expect(mocks.event.mock.calls.map(([event]) => event.resource_observation.operation))
      .toEqual(['attention', 'pagerank', 'reward', 'topk', 'kmeans', 'softmax']);
    for (const [event] of mocks.event.mock.calls) {
      expect(event.resource_observation).toMatchObject({ execution_backend: 'CPU_REFERENCE', kernel_ms: null,
        kernel_name: null, duration_scope: 'PIPELINE_WALL_TIME', canonicalAuthority: false });
      expect(event.resource_observation.wall_ms).toBeGreaterThanOrEqual(0);
      expect(event.packet_context.rpc_transport).toBeUndefined();
      expect(event.packet_context.embedding_version).toBeUndefined();
    }
    expect(mocks.redis).not.toHaveBeenCalled();
    expect(pipeline.gpuPipelineStats()).toMatchObject({ resultCachePolicy: 'DISABLED_LEGACY_NUMERIC_STORAGE',
      concurrencyScope: 'HOST_TASK_QUEUE_NOT_CUDA_STREAMS' });
  });

  it('never returns a cached result for changed attention keys or tail-only score changes', async () => {
    const pipeline = await import('./gpu-pipeline.js');
    const query = new Float32Array([1, 0]);
    const first = await pipeline.pipelineAttention(query, new Float32Array([1, 0, 0, 1]), 2, 2);
    const second = await pipeline.pipelineAttention(query, new Float32Array([0, 1, 1, 0]), 2, 2);
    expect(first.weights[0]).not.toBe(second.weights[0]);
    const scores = new Float32Array(66);
    scores[65] = 1;
    expect(Array.from((await pipeline.pipelineTopK(scores, 66, 1)).indices)).toEqual([65]);
    scores[64] = 2;
    expect(Array.from((await pipeline.pipelineTopK(scores, 66, 1)).indices)).toEqual([64]);
    expect(mocks.redis).not.toHaveBeenCalled();
  });

  it('does not claim CUDA kernel proof just because a native export returned', async () => {
    mocks.room.mockReturnValue(true);
    mocks.addon.mockReturnValue({ topKIndicesGPU: () => new Int32Array([1]) });
    const pipeline = await import('./gpu-pipeline.js');
    await pipeline.pipelineTopK(new Float32Array([0, 1]), 2, 1);
    await vi.waitFor(() => expect(mocks.event).toHaveBeenCalledTimes(1));
    expect(mocks.event.mock.calls[0][0].resource_observation).toMatchObject({ native_export: 'topKIndicesGPU',
      execution_backend: 'NATIVE_EXPORT_UNVERIFIED', kernel_name: null, kernel_ms: null, input_dim: 1, output_dim: 1 });
  });

  it('records the CPU fallback after a native exception, without breaking numerical output', async () => {
    mocks.room.mockReturnValue(true);
    mocks.addon.mockReturnValue({ topKIndicesGPU: () => { throw new Error('fixture native failure'); } });
    const pipeline = await import('./gpu-pipeline.js');
    const result = await pipeline.pipelineTopK(new Float32Array([0, 1]), 2, 1);
    expect(result.source).toBe('cpu');
    expect(Array.from(result.indices)).toEqual([1]);
    await vi.waitFor(() => expect(mocks.event).toHaveBeenCalledTimes(1));
    expect(mocks.event.mock.calls[0][0].resource_observation.execution_backend).toBe('CPU_REFERENCE');
  });
});
