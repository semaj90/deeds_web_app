// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mock refs ────────────────────────────────────────────────────────
const mockRedisGet = vi.fn();
const mockRedisMget = vi.fn();
const mockRedisKeys = vi.fn();

const mockBatchCosineSimilarity = vi.fn();
const mockIsCudaAvailable = vi.fn();
const mockIsSimdJsonAvailable = vi.fn();
const mockFastJsonParse = vi.fn((s: string) => JSON.parse(s));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get: mockRedisGet,
    mget: mockRedisMget,
    keys: mockRedisKeys,
  }),
}));

vi.mock('$lib/server/gpu/libtorch-bridge.js', () => ({
  batchCosineSimilarity: mockBatchCosineSimilarity,
  isCudaAvailable: mockIsCudaAvailable,
}));

vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
  fastJsonParse: mockFastJsonParse,
  isSimdJsonAvailable: mockIsSimdJsonAvailable,
}));

vi.mock('$lib/server/db/client', () => ({
  db: {},
  default: {},
}));

vi.mock('$lib/server/db/schema/codebase-intelligence.js', () => ({
  gpuClusterCentroids: {},
}));

vi.mock('$lib/server/cache-keys.js', () => ({
  centroidKey: {
    cluster: (id: number) => `centroid:cluster:${id}`,
    som: (x: number, y: number) => `centroid:som:${x}:${y}`,
  },
  TTL: { CENTROID: 21600 },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVec(dim = 4, seed = 1): number[] {
  return Array.from({ length: dim }, (_, i) => ((i + seed) % 7) * 0.1 + 0.05);
}

function vecJson(vec: number[]): string {
  return JSON.stringify(vec);
}

describe('nearestCluster — GPU vs CPU centroid matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSimdJsonAvailable.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('uses batchCosineSimilarity when CUDA is available and centroid count >= 4', async () => {
    const centroids = Array.from({ length: 5 }, (_, i) => makeVec(4, i + 1));
    const keys = centroids.map((_, i) => `centroid:cluster:${i}`);

    mockRedisKeys.mockResolvedValue(keys);
    mockRedisMget.mockResolvedValue(centroids.map(vecJson));
    mockIsCudaAvailable.mockReturnValue(true);
    mockBatchCosineSimilarity.mockResolvedValue({
      scores: [0.1, 0.9, 0.3, 0.2, 0.05],
      n: 5,
      source: 'gpu',
    });

    const { nearestCluster } = await import(
      '$lib/server/retrieval/centroid-cache.js'
    );

    const result = await nearestCluster(makeVec(4, 2));

    expect(mockBatchCosineSimilarity).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.clusterId).toBe(1);
    expect(result!.similarity).toBeCloseTo(0.9);
    expect(result!.source).toBe('cuda-batch-cosine');
    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back to CPU cosine when CUDA is unavailable', async () => {
    const centroids = Array.from({ length: 4 }, (_, i) => makeVec(4, i + 1));
    const keys = centroids.map((_, i) => `centroid:cluster:${i}`);

    mockRedisKeys.mockResolvedValue(keys);
    mockRedisMget.mockResolvedValue(centroids.map(vecJson));
    mockIsCudaAvailable.mockReturnValue(false);

    const { nearestCluster } = await import(
      '$lib/server/retrieval/centroid-cache.js'
    );

    const queryVec = makeVec(4, 2);
    const result = await nearestCluster(queryVec);

    expect(mockBatchCosineSimilarity).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.source).toBe('cpu-cosine');
    expect(typeof result!.clusterId).toBe('number');
    expect(result!.similarity).toBeGreaterThan(-1);
    expect(result!.similarity).toBeLessThanOrEqual(1);
  });

  it('falls back to CPU cosine when batchCosineSimilarity throws', async () => {
    const centroids = Array.from({ length: 4 }, (_, i) => makeVec(4, i + 1));
    const keys = centroids.map((_, i) => `centroid:cluster:${i}`);

    mockRedisKeys.mockResolvedValue(keys);
    mockRedisMget.mockResolvedValue(centroids.map(vecJson));
    mockIsCudaAvailable.mockReturnValue(true);
    mockBatchCosineSimilarity.mockRejectedValue(new Error('OOM'));

    const { nearestCluster } = await import(
      '$lib/server/retrieval/centroid-cache.js'
    );

    const result = await nearestCluster(makeVec(4, 2));

    expect(result).not.toBeNull();
    expect(result!.source).toBe('cpu-cosine');
  });

  it('skips GPU path when centroid count is below threshold (< 4)', async () => {
    const centroids = [makeVec(4, 1), makeVec(4, 2), makeVec(4, 3)];
    const keys = centroids.map((_, i) => `centroid:cluster:${i}`);

    mockRedisKeys.mockResolvedValue(keys);
    mockRedisMget.mockResolvedValue(centroids.map(vecJson));
    mockIsCudaAvailable.mockReturnValue(true);

    const { nearestCluster } = await import(
      '$lib/server/retrieval/centroid-cache.js'
    );

    const result = await nearestCluster(makeVec(4, 2));

    expect(mockBatchCosineSimilarity).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.source).toBe('cpu-cosine');
  });

  it('returns null when Redis has no centroid keys', async () => {
    mockRedisKeys.mockResolvedValue([]);

    const { nearestCluster } = await import(
      '$lib/server/retrieval/centroid-cache.js'
    );

    const result = await nearestCluster(makeVec(4, 1));

    expect(result).toBeNull();
  });

  it('returns same top cluster as CPU path when GPU and CPU agree', async () => {
    const v0 = [1, 0, 0, 0];
    const v1 = [0, 1, 0, 0];
    const query = [0.99, 0.1, 0, 0];

    const keys = ['centroid:cluster:0', 'centroid:cluster:1'];
    mockRedisKeys.mockResolvedValue(keys);
    mockRedisMget.mockResolvedValue([vecJson(v0), vecJson(v1)]);
    mockIsCudaAvailable.mockReturnValue(true);

    function cosine(a: number[], b: number[]) {
      const dot = a.reduce((s, x, i) => s + x * b[i], 0);
      const na = Math.sqrt(a.reduce((s, x) => s + x ** 2, 0));
      const nb = Math.sqrt(b.reduce((s, x) => s + x ** 2, 0));
      return dot / (na * nb);
    }
    const gpuScores = [cosine(query, v0), cosine(query, v1)];
    mockBatchCosineSimilarity.mockResolvedValue({ scores: gpuScores, n: 2, source: 'gpu' });

    const { nearestCluster } = await import(
      '$lib/server/retrieval/centroid-cache.js'
    );

    const gpuResult = await nearestCluster(query);

    vi.mocked(mockIsCudaAvailable).mockReturnValue(false);
    vi.resetModules();
    const { nearestCluster: nearestClusterCpu } = await import(
      '$lib/server/retrieval/centroid-cache.js'
    );

    mockRedisKeys.mockResolvedValue(keys);
    mockRedisMget.mockResolvedValue([vecJson(v0), vecJson(v1)]);
    const cpuResult = await nearestClusterCpu(query);

    expect(gpuResult!.clusterId).toBe(cpuResult!.clusterId);
  });
});
