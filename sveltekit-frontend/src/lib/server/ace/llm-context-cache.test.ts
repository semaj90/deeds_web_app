import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  redis: {
    throwOnGet: false,
    values: new Map<string, string>(),
  },
  db: {
    mode: 'miss' as 'miss' | 'hit' | 'throw',
    rows: [] as Array<Record<string, unknown>>,
    inserted: [] as Array<Record<string, unknown>>,
    updated: [] as Array<Record<string, unknown>>,
  },
}));

const mockFixtures = vi.hoisted(() => {
  const redisClient = {
    get: vi.fn(async (key: string) => {
      if (mockState.redis.throwOnGet) {
        throw new Error('redis unavailable');
      }
      return mockState.redis.values.get(key) ?? null;
    }),
    set: vi.fn(async (key: string, value: string) => {
      mockState.redis.values.set(key, value);
      return 'OK';
    }),
  };

  const selectChain = {
    from() {
      return this;
    },
    where() {
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      if (mockState.db.mode === 'throw') {
        throw new Error('postgres unavailable');
      }
      return mockState.db.mode === 'hit' ? mockState.db.rows : [];
    },
  };

  const dbMock = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => ({
      values: (payload: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => {
          mockState.db.inserted.push(payload);
        },
      }),
    })),
    update: vi.fn(() => ({
      set: (payload: Record<string, unknown>) => ({
        where: async () => {
          mockState.db.updated.push(payload);
        },
      }),
    })),
  };

  return { redisClient, dbMock };
});

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => mockFixtures.redisClient,
  redis: mockFixtures.redisClient,
  ensureRedis: vi.fn(async () => undefined),
  createRedisConnection: vi.fn(() => mockFixtures.redisClient),
  default: vi.fn(() => mockFixtures.redisClient),
}));

vi.mock('$lib/server/db/client', () => ({
  db: mockFixtures.dbMock,
}));

import {
  buildContextCacheKey,
  getContextCachePath,
  getContextCacheWithSource,
  resolveContextCacheSources,
  setContextCache,
  type CachedContextPacket,
  type ContextCacheIdentity,
} from './llm-context-cache.js';

function makeIdentity(overrides: Partial<ContextCacheIdentity> = {}): ContextCacheIdentity {
  return {
    queryHash: 'query-hash',
    modelName: 'gemma4-rotorquant:latest',
    modelQuant: 'rotorquant',
    kvQuant: 'q8_0/q8_0',
    draftModel: true,
    backend: 'turboquant',
    tokenizerHash: 'tokenizer-hash',
    systemPromptHash: 'system-hash',
    toolDefinitionsHash: 'tools-hash',
    repoGitSha: 'repo-sha',
    corpusHash: 'corpus-hash',
    evidenceBundleHash: 'evidence-hash',
    ragBundleHash: 'rag-hash',
    graphSnapshotHash: 'graph-hash',
    retrievalModeHash: 'retrieval-hash',
    sectionTypesHash: 'section-hash',
    personaKey: 'default',
    tokenAwarePacking: true,
    ...overrides,
  };
}

function makePacket(overrides: Partial<CachedContextPacket> = {}): CachedContextPacket {
  return {
    summary: 'compact summary',
    chunkIds: ['chunk-1'],
    graphPaths: ['a | b | c'],
    toolPolicy: { allowed: ['rg'], forbidden: ['read_full_file'] },
    prefixTokensEstimated: 42,
    cacheHit: true,
    retrievalSkipped: true,
    backend: 'turboquant',
    modelName: 'gemma4-rotorquant:latest',
    modelQuant: 'rotorquant',
    kvQuant: 'q8_0/q8_0',
    draftModel: true,
    tokenizerHash: 'tokenizer-hash',
    systemPromptHash: 'system-hash',
    toolDefinitionsHash: 'tools-hash',
    repoGitSha: 'repo-sha',
    corpusHash: 'corpus-hash',
    ragBundleHash: 'rag-hash',
    graphSnapshotHash: 'graph-hash',
    hitCount: 0,
    topFiles: ['src/lib/server/ace/llm-context-cache.ts'],
    topTriples: [['a', 'b', 'c']],
    selectedSourceIds: ['chunk-1'],
    cacheKeys: ['cache-key-1'],
    warnings: ['warn-1'],
    plannerState: {
      backend: 'turboquant',
    },
    ...overrides,
  };
}

function cleanupLocalCache(cacheKey: string) {
  const path = getContextCachePath(cacheKey);
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

beforeEach(() => {
  mockState.redis.throwOnGet = false;
  mockState.redis.values.clear();
  mockState.db.mode = 'miss';
  mockState.db.rows = [];
  mockState.db.inserted = [];
  mockState.db.updated = [];
  mockFixtures.redisClient.get.mockClear();
  mockFixtures.redisClient.set.mockClear();
  mockFixtures.dbMock.select.mockClear();
  mockFixtures.dbMock.insert.mockClear();
  mockFixtures.dbMock.update.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildContextCacheKey', () => {
  it('includes the TurboQuant identity fields in the key', () => {
    const base = makeIdentity();
    const modelQuantChanged = buildContextCacheKey({ ...base, modelQuant: 'iq4_xs' });
    const backendChanged = buildContextCacheKey({ ...base, backend: 'bifrost' });
    const repoChanged = buildContextCacheKey({ ...base, repoGitSha: 'repo-sha-2' });
    const same = buildContextCacheKey(base);

    expect(modelQuantChanged).not.toBe(same);
    expect(backendChanged).not.toBe(same);
    expect(repoChanged).not.toBe(same);
  });
});

describe('resolveContextCacheSources', () => {
  it('returns redis first and preserves toolPolicy', async () => {
    const cacheKey = `llmctx:redis-${randomUUID()}`;
    const packet = makePacket();
    mockState.redis.values.set(`ace:ctx:${cacheKey}`, JSON.stringify(packet));
    mockState.db.mode = 'hit';
    mockState.db.rows = [
      {
        cacheKey,
        contextPackJson: makePacket({ summary: 'postgres fallback' }),
        hitCount: 7,
        lastUsedAt: new Date('2026-05-25T00:00:00.000Z'),
        backend: 'turboquant',
        modelName: packet.modelName,
        modelQuant: packet.modelQuant,
        tokenizerHash: packet.tokenizerHash,
        systemPromptHash: packet.systemPromptHash,
        toolDefinitionsHash: packet.toolDefinitionsHash,
        repoGitSha: packet.repoGitSha,
        corpusHash: packet.corpusHash,
        ragBundleHash: packet.ragBundleHash,
        graphSnapshotHash: packet.graphSnapshotHash,
        estimatedPrefixTokens: 123,
        chunkIds: packet.chunkIds,
        graphPaths: packet.graphPaths,
        toolPolicy: packet.toolPolicy,
      },
    ];

    const result = await resolveContextCacheSources(cacheKey);

    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.source).toBe('redis');
      expect(result.packet.toolPolicy).toEqual(packet.toolPolicy);
      expect(result.packet.summary).toBe(packet.summary);
    }
  });

  it('falls back from redis to postgres when redis is unavailable', async () => {
    const cacheKey = `llmctx:postgres-${randomUUID()}`;
    mockState.redis.throwOnGet = true;
    const packet = makePacket({ summary: 'postgres summary' });
    mockState.db.mode = 'hit';
    mockState.db.rows = [
      {
        cacheKey,
        contextPackJson: packet,
        hitCount: 2,
        lastUsedAt: new Date('2026-05-25T01:00:00.000Z'),
        backend: packet.backend,
        modelName: packet.modelName,
        modelQuant: packet.modelQuant,
        tokenizerHash: packet.tokenizerHash,
        systemPromptHash: packet.systemPromptHash,
        toolDefinitionsHash: packet.toolDefinitionsHash,
        repoGitSha: packet.repoGitSha,
        corpusHash: packet.corpusHash,
        ragBundleHash: packet.ragBundleHash,
        graphSnapshotHash: packet.graphSnapshotHash,
        estimatedPrefixTokens: 77,
        chunkIds: packet.chunkIds,
        graphPaths: packet.graphPaths,
        toolPolicy: packet.toolPolicy,
      },
    ];

    const result = await resolveContextCacheSources(cacheKey);

    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.source).toBe('postgres');
      expect(result.packet.toolPolicy).toEqual(packet.toolPolicy);
      expect(result.packet.summary).toBe(packet.summary);
    }
  });

  it('falls back from postgres to local json and preserves toolPolicy', async () => {
    const cacheKey = `llmctx:local-${randomUUID()}`;
    const packet = makePacket({ summary: 'local summary', toolPolicy: { route: 'local-json' } });
    mockState.redis.throwOnGet = true;
    mockState.db.mode = 'throw';
    cleanupLocalCache(cacheKey);
    await setContextCache(cacheKey, packet);
    mockState.redis.values.delete(`ace:ctx:${cacheKey}`);

    const result = await resolveContextCacheSources(cacheKey);

    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.source).toBe('local-json');
      expect(result.packet.toolPolicy).toEqual(packet.toolPolicy);
      expect(result.packet.summary).toBe(packet.summary);
    }
  });

  it('returns miss when local json is corrupt', async () => {
    const cacheKey = `llmctx:corrupt-${randomUUID()}`;
    mockState.redis.throwOnGet = true;
    mockState.db.mode = 'throw';
    const path = getContextCachePath(cacheKey);
    cleanupLocalCache(cacheKey);
    rmSync(path, { force: true });
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '{not-json', 'utf8');

    const result = await resolveContextCacheSources(cacheKey);

    expect(result.hit).toBe(false);
    expect(result.source).toBe('miss');
  });

  it('writes and reads a local cache roundtrip with toolPolicy intact', async () => {
    const cacheKey = `llmctx:roundtrip-${randomUUID()}`;
    const packet = makePacket({
      summary: 'roundtrip summary',
      toolPolicy: { allowed: ['rg'], forbidden: ['read_full_file'], custom: true },
    });
    cleanupLocalCache(cacheKey);
    mockState.redis.throwOnGet = false;
    await setContextCache(cacheKey, packet);
    mockState.redis.values.delete(`ace:ctx:${cacheKey}`);
    mockState.db.mode = 'miss';

    const lookup = await getContextCacheWithSource(cacheKey);
    const source = await resolveContextCacheSources(cacheKey);

    expect(lookup.source).toBe('local-json');
    expect(source.hit).toBe(true);
    if (source.hit) {
      expect(source.packet.toolPolicy).toEqual(packet.toolPolicy);
      expect(source.packet.summary).toBe(packet.summary);
    }
  });
});
