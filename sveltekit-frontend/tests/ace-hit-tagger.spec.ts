// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mock refs ─────────────────────────────────────────────────────────
const {
  mockRedisPipeline,
  mockPipelineIncr,
  mockPipelineExec,
  mockRedisMget,
  mockQdrantSetPayload,
} = vi.hoisted(() => {
  const mockPipelineIncr = vi.fn().mockReturnThis();
  const mockPipelineExec = vi.fn().mockResolvedValue([]);
  const mockRedisPipeline = vi.fn(() => ({ incr: mockPipelineIncr, exec: mockPipelineExec }));
  const mockRedisMget     = vi.fn().mockResolvedValue([]);
  const mockQdrantSetPayload = vi.fn().mockResolvedValue(undefined);
  return { mockRedisPipeline, mockPipelineIncr, mockPipelineExec, mockRedisMget, mockQdrantSetPayload };
});

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    pipeline: mockRedisPipeline,
    mget:     mockRedisMget,
    get:      vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: { QDRANT_URL: 'http://localhost:6333' },
}));

// Mock QdrantClient so every instantiation returns our spy
vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn(() => ({ setPayload: mockQdrantSetPayload })),
}));

// ── Module under test (single import — mocks are stable, no resetModules needed) ──
const { tagAceHits, getChunkHitCountBulk } = await import('$lib/server/ace/ace-hit-tagger.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeChunk(filePath = 'src/lib/foo.ts', score = 0.8) {
  return { filePath, content: 'export function foo() {}', score };
}

const CHUNKS = [makeChunk('src/lib/a.ts'), makeChunk('src/lib/b.ts'), makeChunk('src/lib/a.ts')];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('tagAceHits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipelineExec.mockResolvedValue([]);
    mockQdrantSetPayload.mockResolvedValue(undefined);
  });

  it('increments Redis hit counter for each unique filePath', async () => {
    await tagAceHits(CHUNKS);

    // Pipeline incr called once per UNIQUE path (a.ts + b.ts = 2, not 3)
    expect(mockPipelineIncr).toHaveBeenCalledTimes(2);
    expect(mockPipelineIncr).toHaveBeenCalledWith('ace:chunk:hits:src/lib/a.ts');
    expect(mockPipelineIncr).toHaveBeenCalledWith('ace:chunk:hits:src/lib/b.ts');
    expect(mockPipelineExec).toHaveBeenCalled();
  });

  it('calls Qdrant setPayload with OR filter covering all unique filePaths', async () => {
    await tagAceHits(CHUNKS);

    expect(mockQdrantSetPayload).toHaveBeenCalledOnce();
    const [collection, arg] = mockQdrantSetPayload.mock.calls[0] as [string, { payload: Record<string, unknown>; filter: { should: unknown[] } }];
    expect(collection).toBe('codebase_chunks_768');
    expect(arg.payload.llm_synthesis_used).toBe(true);
    expect(arg.filter.should).toHaveLength(2); // 2 unique paths
  });

  it('sets ace_cache_hit=true in payload when fromCache is true', async () => {
    await tagAceHits([makeChunk('src/lib/c.ts')], { fromCache: true });

    const [, arg] = mockQdrantSetPayload.mock.calls[0] as [string, { payload: Record<string, unknown> }];
    expect(arg.payload.ace_cache_hit).toBe(true);
  });

  it('returns zero counts for empty chunk array without calling Redis or Qdrant', async () => {
    const result = await tagAceHits([]);

    expect(result.tagged).toBe(0);
    expect(result.skipped).toBe(0);
    expect(mockRedisPipeline).not.toHaveBeenCalled();
    expect(mockQdrantSetPayload).not.toHaveBeenCalled();
  });

  it('returns skipped count when Qdrant setPayload throws', async () => {
    mockQdrantSetPayload.mockRejectedValue(new Error('Qdrant down'));

    const result = await tagAceHits([makeChunk('src/lib/d.ts')]);

    expect(result.tagged).toBe(0);
    expect(result.skipped).toBe(1);
    // Redis pipeline should still have been called
    expect(mockPipelineIncr).toHaveBeenCalled();
  });

  it('still tags Qdrant even when Redis pipeline fails', async () => {
    mockPipelineExec.mockRejectedValue(new Error('Redis down'));

    const result = await tagAceHits([makeChunk('src/lib/e.ts')]);

    // Qdrant should still be called despite Redis failure
    expect(mockQdrantSetPayload).toHaveBeenCalled();
    expect(result.tagged).toBe(1);
  });
});

describe('getChunkHitCountBulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a Map with counts from Redis mget', async () => {
    mockRedisMget.mockResolvedValue(['5', '3', null]);

    const result = await getChunkHitCountBulk(['a.ts', 'b.ts', 'c.ts']);

    expect(result.get('a.ts')).toBe(5);
    expect(result.get('b.ts')).toBe(3);
    expect(result.get('c.ts')).toBe(0);
  });

  it('returns all-zero map when Redis throws', async () => {
    mockRedisMget.mockRejectedValue(new Error('Redis down'));

    const result = await getChunkHitCountBulk(['x.ts', 'y.ts']);

    expect(result.get('x.ts')).toBe(0);
    expect(result.get('y.ts')).toBe(0);
  });

  it('returns empty map for empty input', async () => {
    const result = await getChunkHitCountBulk([]);
    expect(result.size).toBe(0);
    expect(mockRedisMget).not.toHaveBeenCalled();
  });
});