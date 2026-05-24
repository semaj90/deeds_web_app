// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildContextCacheKey,
  getContextCachePath,
  resolveContextCacheSources,
} from '$lib/server/ace/llm-context-cache.js';

const {
  mockRedisGet,
  mockDbSelect,
  mockQuery,
  mockExistsSync,
  mockReadFileSync,
  mockMkdirSync,
  mockWriteFileSync,
} = vi.hoisted(() => {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(),
  };

  return {
    mockRedisGet: vi.fn(),
    mockDbSelect: vi.fn(() => chain),
    mockQuery: chain,
    mockExistsSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  desc: vi.fn((value: unknown) => value),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get: mockRedisGet,
    set: vi.fn(),
  }),
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  llmContextCache: {
    cacheKey: 'cacheKey',
    lastUsedAt: 'lastUsedAt',
  },
}));

const baseIdentity = {
  queryHash: 'query-a',
  modelName: 'gemma4-rotorquant:latest',
  modelQuant: 'iq4_xs',
  backend: 'openai-facade',
  tokenizerHash: 'tok-a',
  systemPromptHash: 'sys-a',
  toolDefinitionsHash: 'tools-a',
  repoGitSha: 'repo-a',
  corpusHash: 'corpus-a',
  evidenceBundleHash: 'evidence-a',
  ragBundleHash: 'rag-a',
  graphSnapshotHash: 'graph-a',
  retrievalModeHash: 'retrieval-a',
  sectionTypesHash: 'section-a',
  personaKey: 'neutral',
  tokenAwarePacking: true,
  userId: 'user-a',
  caseId: 'case-a',
  conversationId: 'conv-a',
  filePath: 'src/lib/server/ace/context-assembler.ts',
};

describe('llm-context-cache', () => {
  beforeEach(() => {
    mockRedisGet.mockReset();
    mockDbSelect.mockReset();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockQuery.from.mockClear();
    mockQuery.where.mockClear();
    mockQuery.orderBy.mockClear();
    mockQuery.limit.mockReset();
    mockDbSelect.mockReturnValue(mockQuery);
    mockRedisGet.mockResolvedValue(null);
    mockExistsSync.mockReturnValue(false);
    mockQuery.limit.mockResolvedValue([]);
  });

  it('keeps the same key for the same repo SHA and RAG bundle', () => {
    const keyA = buildContextCacheKey(baseIdentity);
    const keyB = buildContextCacheKey({ ...baseIdentity });
    expect(keyA).toBe(keyB);
  });

  it('misses when repo sha changes', () => {
    const keyA = buildContextCacheKey(baseIdentity);
    const keyB = buildContextCacheKey({ ...baseIdentity, repoGitSha: 'repo-b' });
    expect(keyA).not.toBe(keyB);
  });

  it('misses when system prompt hash changes', () => {
    const keyA = buildContextCacheKey(baseIdentity);
    const keyB = buildContextCacheKey({ ...baseIdentity, systemPromptHash: 'sys-b' });
    expect(keyA).not.toBe(keyB);
  });

  it('changes when tool definitions change', () => {
    const keyA = buildContextCacheKey(baseIdentity);
    const keyB = buildContextCacheKey({ ...baseIdentity, toolDefinitionsHash: 'tools-b' });
    expect(keyA).not.toBe(keyB);
  });

  it('returns a Redis hit when Redis has the packet', async () => {
    const cacheKey = buildContextCacheKey(baseIdentity);
    const packet = {
      summary: 'cached summary',
      chunkIds: ['chunk-1'],
      graphPaths: ['a|b|c'],
      toolPolicy: { allowWriteTools: false },
      prefixTokensEstimated: 123,
      cacheHit: true,
      retrievalSkipped: true,
      backend: 'openai-facade',
      modelName: 'gemma4-rotorquant:latest',
      modelQuant: 'iq4_xs',
      tokenizerHash: 'tok-a',
      systemPromptHash: 'sys-a',
      toolDefinitionsHash: 'tools-a',
      repoGitSha: 'repo-a',
      corpusHash: 'corpus-a',
      ragBundleHash: 'rag-a',
      graphSnapshotHash: 'graph-a',
    };

    mockRedisGet.mockResolvedValueOnce(JSON.stringify(packet));

    const hit = await resolveContextCacheSources(cacheKey);

    expect(hit).toEqual(
      expect.objectContaining({
        hit: true,
        source: 'redis',
        cacheKey,
      })
    );
    if (hit.hit) {
      expect(hit.packet.toolPolicy).toEqual({ allowWriteTools: false });
    }
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('falls back to Postgres when Redis is unavailable', async () => {
    const cacheKey = buildContextCacheKey(baseIdentity);
    mockRedisGet.mockRejectedValueOnce(new Error('redis down'));
    mockQuery.limit.mockResolvedValueOnce([
      {
        cacheKey,
        contextPackJson: {
          summary: 'postgres summary',
          chunkIds: ['chunk-2'],
          graphPaths: ['x|y|z'],
          toolPolicy: { allowWriteTools: true },
          prefixTokensEstimated: 77,
          cacheHit: true,
          retrievalSkipped: true,
          backend: 'openai-facade',
          modelName: 'gemma4-rotorquant:latest',
          modelQuant: 'iq4_xs',
          tokenizerHash: 'tok-a',
          systemPromptHash: 'sys-a',
          toolDefinitionsHash: 'tools-a',
          repoGitSha: 'repo-a',
          corpusHash: 'corpus-a',
          ragBundleHash: 'rag-a',
          graphSnapshotHash: 'graph-a',
        },
        hitCount: 3,
        lastUsedAt: new Date('2026-05-13T00:00:00.000Z'),
        backend: 'openai-facade',
        modelName: 'gemma4-rotorquant:latest',
        modelQuant: 'iq4_xs',
        tokenizerHash: 'tok-a',
        systemPromptHash: 'sys-a',
        toolDefinitionsHash: 'tools-a',
        repoGitSha: 'repo-a',
        corpusHash: 'corpus-a',
        ragBundleHash: 'rag-a',
        graphSnapshotHash: 'graph-a',
        estimatedPrefixTokens: 77,
        chunkIds: ['chunk-2'],
        graphPaths: ['x|y|z'],
        toolPolicy: { allowWriteTools: true },
      },
    ]);

    const hit = await resolveContextCacheSources(cacheKey);

    expect(hit).toEqual(
      expect.objectContaining({
        hit: true,
        source: 'postgres',
        cacheKey,
      })
    );
    if (hit.hit) {
      expect(hit.packet.toolPolicy).toEqual({ allowWriteTools: true });
    }
  });

  it('falls back to local JSON when Postgres is unavailable', async () => {
    const cacheKey = buildContextCacheKey(baseIdentity);
    const localPacket = {
      summary: 'local summary',
      chunkIds: ['chunk-3'],
      graphPaths: ['l|m|n'],
      toolPolicy: { allowWriteTools: false, source: 'local-json' },
      prefixTokensEstimated: 11,
      cacheHit: true,
      retrievalSkipped: true,
      backend: 'openai-facade',
      modelName: 'gemma4-rotorquant:latest',
      modelQuant: 'iq4_xs',
      tokenizerHash: 'tok-a',
      systemPromptHash: 'sys-a',
      toolDefinitionsHash: 'tools-a',
      repoGitSha: 'repo-a',
      corpusHash: 'corpus-a',
      ragBundleHash: 'rag-a',
      graphSnapshotHash: 'graph-a',
    };

    mockRedisGet.mockResolvedValueOnce(null);
    mockQuery.limit.mockRejectedValueOnce(new Error('postgres down'));
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(localPacket));

    const hit = await resolveContextCacheSources(cacheKey);

    expect(hit).toEqual(
      expect.objectContaining({
        hit: true,
        source: 'local-json',
        cacheKey,
      })
    );
    if (hit.hit) {
      expect(hit.packet.toolPolicy).toEqual({ allowWriteTools: false, source: 'local-json' });
    }
  });

  it('returns miss when local JSON is unavailable', async () => {
    const cacheKey = buildContextCacheKey(baseIdentity);
    mockRedisGet.mockResolvedValueOnce(null);
    mockQuery.limit.mockRejectedValueOnce(new Error('postgres down'));
    mockExistsSync.mockReturnValueOnce(false);

    const hit = await resolveContextCacheSources(cacheKey);

    expect(hit).toEqual(
      expect.objectContaining({
        hit: false,
        source: 'miss',
        cacheKey,
      })
    );
  });

  it('returns miss when local JSON is corrupt', async () => {
    const cacheKey = buildContextCacheKey(baseIdentity);
    mockRedisGet.mockResolvedValueOnce(null);
    mockQuery.limit.mockRejectedValueOnce(new Error('postgres down'));
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce('{not json');

    const hit = await resolveContextCacheSources(cacheKey);

    expect(hit).toEqual(
      expect.objectContaining({
        hit: false,
        source: 'miss',
        cacheKey,
      })
    );
  });

  it('maps cache keys to NVMe JSON paths', () => {
    const cacheKey = buildContextCacheKey(baseIdentity);
    expect(getContextCachePath(cacheKey)).toContain(`.cache\\ace\\context-packs\\${cacheKey}.json`);
  });
});
