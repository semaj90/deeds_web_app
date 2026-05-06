// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mock refs ────────────────────────────────────────────────────────
const mockRedisSadd   = vi.fn();
const mockDbUpdate    = vi.fn();

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    sadd:   mockRedisSadd,
    get:    vi.fn().mockResolvedValue(null),
    setex:  vi.fn().mockResolvedValue('OK'),
    pipeline: vi.fn(() => ({ setex: vi.fn(), exec: vi.fn().mockResolvedValue([]) })),
  }),
}));

const mockDbUpdateSet  = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) })),
  })),
  update: vi.fn(() => ({ set: mockDbUpdateSet })),
};

vi.mock('$lib/server/db/client', () => ({
  // named export used by centroid-cache.ts
  db: dbMock,
  // default export used by tensor-analysis-cache.ts  (`import db from ...`)
  default: dbMock,
}));

vi.mock('$lib/server/db/schema/topology.js', () => ({
  tensorAnalysisCache: { stableKey: 'stableKey' },
}));

vi.mock('$lib/server/tensor/topology-byte-mapper.js', () => ({
  topoByteFromPath:  vi.fn(() => 0x02),
  unpackTopoByte:    vi.fn(() => ({ topoClass: 2, hex: '0x02' })),
  classifyPath:      vi.fn(() => 2),
  TOPO_CLASS_LABEL:  { 2: 'server' },
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public',  () => ({ env: {} }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecord(manifold4: [number, number, number, number]) {
  return {
    stableKey:           `key-${manifold4.join('-')}`,
    contentHash:         'abc123',
    topoByte:            0x02,
    topoHex:             '0x02',
    topoClass:           'server',
    manifold4,
    centroidKey:         null,
    somCluster:          null,
    graphAuthorityScore: 0,
    tensorAffinityScore: 0,
    tensorJson:          {},
    qdrantPayload:       {},
    outputMeta:          {},
  };
}

describe('enqueueGpuProjectionIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues a record with all-zero manifold4 via Redis SADD', async () => {
    mockRedisSadd.mockResolvedValue(1);

    const { enqueueGpuProjectionIfNeeded } = await import(
      '$lib/server/tensor/tensor-analysis-cache.js'
    );

    await enqueueGpuProjectionIfNeeded([makeRecord([0, 0, 0, 0])]);

    expect(mockRedisSadd).toHaveBeenCalledWith(
      'topo:gpu:pending',
      expect.stringContaining('key-'),
    );
  });

  it('enqueues a record with missing manifold4 (null-like)', async () => {
    mockRedisSadd.mockResolvedValue(1);

    const { enqueueGpuProjectionIfNeeded } = await import(
      '$lib/server/tensor/tensor-analysis-cache.js'
    );

    const record = makeRecord([0, 0, 0, 0]);
    (record as Record<string, unknown>).manifold4 = null;

    await enqueueGpuProjectionIfNeeded([record as never]);

    expect(mockRedisSadd).toHaveBeenCalledOnce();
  });

  it('does NOT enqueue a record with a valid non-zero manifold4', async () => {
    const { enqueueGpuProjectionIfNeeded } = await import(
      '$lib/server/tensor/tensor-analysis-cache.js'
    );

    await enqueueGpuProjectionIfNeeded([makeRecord([0.1, 0.2, 0.3, 0.4])]);

    expect(mockRedisSadd).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when at least one coord is non-zero', async () => {
    const { enqueueGpuProjectionIfNeeded } = await import(
      '$lib/server/tensor/tensor-analysis-cache.js'
    );

    await enqueueGpuProjectionIfNeeded([makeRecord([0, 0, 0, 0.001])]);

    expect(mockRedisSadd).not.toHaveBeenCalled();
  });

  it('enqueues multiple pending records in a single SADD call', async () => {
    mockRedisSadd.mockResolvedValue(3);

    const { enqueueGpuProjectionIfNeeded } = await import(
      '$lib/server/tensor/tensor-analysis-cache.js'
    );

    await enqueueGpuProjectionIfNeeded([
      makeRecord([0, 0, 0, 0]),
      makeRecord([0, 0, 0, 0]),
      makeRecord([0.5, 0.5, 0.5, 0.5]),
      makeRecord([0, 0, 0, 0]),
    ]);

    expect(mockRedisSadd).toHaveBeenCalledWith(
      'topo:gpu:pending',
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
  });

  it('falls back to Postgres needsProjection flag when Redis SADD throws', async () => {
    mockRedisSadd.mockRejectedValue(new Error('Redis unavailable'));

    const { enqueueGpuProjectionIfNeeded } = await import(
      '$lib/server/tensor/tensor-analysis-cache.js'
    );

    await expect(
      enqueueGpuProjectionIfNeeded([makeRecord([0, 0, 0, 0])])
    ).resolves.not.toThrow();

    expect(mockDbUpdateSet).toHaveBeenCalled();
  });

  it('never throws even when both Redis and Postgres fail', async () => {
    mockRedisSadd.mockRejectedValue(new Error('Redis down'));
    mockDbUpdateSet.mockImplementation(() => {
      throw new Error('Postgres down');
    });

    const { enqueueGpuProjectionIfNeeded } = await import(
      '$lib/server/tensor/tensor-analysis-cache.js'
    );

    await expect(
      enqueueGpuProjectionIfNeeded([makeRecord([0, 0, 0, 0])])
    ).resolves.not.toThrow();
  });

  it('is called fire-and-forget from writeTensorAnalysis for zero-manifold4 rows', async () => {
    mockRedisSadd.mockResolvedValue(1);

    const { writeTensorAnalysis } = await import(
      '$lib/server/tensor/tensor-analysis-cache.js'
    );

    await writeTensorAnalysis(makeRecord([0, 0, 0, 0]));

    await vi.waitFor(() => {
      expect(mockRedisSadd).toHaveBeenCalledWith('topo:gpu:pending', expect.any(String));
    }, { timeout: 500 });
  });

  it('is called fire-and-forget from writeTensorAnalysisBatch for zero-manifold4 rows', async () => {
    mockRedisSadd.mockResolvedValue(1);

    const { writeTensorAnalysisBatch } = await import(
      '$lib/server/tensor/tensor-analysis-cache.js'
    );

    await writeTensorAnalysisBatch([
      makeRecord([0, 0, 0, 0]),
      makeRecord([0.1, 0.2, 0.3, 0.4]),
    ]);

    await vi.waitFor(() => {
      expect(mockRedisSadd).toHaveBeenCalledWith('topo:gpu:pending', expect.any(String));
    }, { timeout: 500 });
  });
});
