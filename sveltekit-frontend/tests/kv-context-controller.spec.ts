// @vitest-environment node
/**
 * kv-context-controller.spec.ts
 *
 * Unit tests for the 3-level KV context compression system.
 * All Redis / Postgres / Qdrant calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const store = new Map<string, string>();
const mockRedis = {
  get:    vi.fn(async (k: string) => store.get(k) ?? null),
  setex:  vi.fn(async (k: string, _ttl: number, v: string) => { store.set(k, v); return 'OK'; }),
  del:    vi.fn(async (k: string) => { store.delete(k); return 1; }),
  keys:   vi.fn(async () => [] as string[]),
  quit:   vi.fn(async () => 'OK'),
};

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => mockRedis,
}));

vi.mock('$lib/server/db/client', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  db:   {},
}));

// ── Imports (lazy — after mocks are set up) ───────────────────────────────────

import {
  compressChunkToSentence,
  compressFileToCard,
  compressTraceToCard,
  compressResearchToCard,
  buildAttentionToc,
} from '$lib/server/ai/context-compression.js';

import {
  buildKvContextPacket,
  getCompressedCard,
  explainCompression,
  refreshTaskToc,
  getStableSystemPrefix,
  getStablePrefixHash,
  formatKvPacketForPrompt,
} from '$lib/server/ai/kv-context-controller.js';

// ── context-compression tests ─────────────────────────────────────────────────

describe('context-compression — compressChunkToSentence', () => {
  it('returns first 1-2 sentences capped at 200 chars', async () => {
    const chunk = 'This is sentence one. This is sentence two. This is sentence three.';
    const result = await compressChunkToSentence(chunk);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result).toContain('sentence one');
  });

  it('handles chunk with no sentence delimiters', async () => {
    const chunk = 'A'.repeat(400);
    const result = await compressChunkToSentence(chunk);
    expect(result.length).toBeLessThanOrEqual(200);
  });
});

describe('context-compression — compressFileToCard', () => {
  beforeEach(() => {
    store.clear();
    mockRedis.get.mockClear();
    mockRedis.setex.mockClear();
  });

  it('builds a card with stableKey, filePath, and summary', async () => {
    const card = await compressFileToCard('src/lib/server/gpu/libtorch-bridge.ts');
    expect(card.stableKey).toBe('file:src/lib/server/gpu/libtorch-bridge.ts');
    expect(card.filePath).toBe('src/lib/server/gpu/libtorch-bridge.ts');
    expect(card.oneLineSummary).toBeTruthy();
    expect(typeof card.score).toBe('number');
  });

  it('returns cached card on second call (Redis hit)', async () => {
    const card = await compressFileToCard('src/lib/server/ace/context-assembler.ts');
    // Second call — should hit Redis cache
    const card2 = await compressFileToCard('src/lib/server/ace/context-assembler.ts');
    expect(card2.stableKey).toBe(card.stableKey);
    // setex called once (first build), get called at least once per call
    const setexCalls = mockRedis.setex.mock.calls.filter(c => String(c[0]).startsWith('kv:card:file:'));
    expect(setexCalls.length).toBe(1); // cached after first build
  });

  it('uses wiki note when available', async () => {
    const dirPath = 'src/lib/server/gpu';
    store.set(`wiki:note:dir:${dirPath}`, JSON.stringify({ summary: 'GPU acceleration module for CUDA ops' }));
    const card = await compressFileToCard(`${dirPath}/libtorch-bridge.ts`);
    expect(card.oneLineSummary).toContain('GPU acceleration');
  });
});

describe('context-compression — compressTraceToCard', () => {
  beforeEach(() => { store.clear(); });

  it('builds a card with traceId and summary', async () => {
    const card = await compressTraceToCard('trace-abc123');
    expect(card.stableKey).toBe('trace:trace-abc123');
    expect(card.traceId).toBe('trace-abc123');
    expect(card.oneLineSummary).toBeTruthy();
  });

  it('picks up cached ACE trace data', async () => {
    store.set('ace:trace:q42', JSON.stringify({ query: 'graphSimilaritySafe dispatch', sources: ['gpu', 'libtorch'], cacheHit: true, durationMs: 42 }));
    const card = await compressTraceToCard('q42');
    expect(card.query).toContain('graphSimilaritySafe');
    expect(card.cacheHit).toBe(true);
    expect(card.topSources).toContain('gpu');
  });
});

describe('context-compression — compressResearchToCard', () => {
  beforeEach(() => { store.clear(); });

  it('builds a research card and caches it', async () => {
    const card = await compressResearchToCard(
      'How does KV quantization work?',
      'KV quantization reduces VRAM by representing attention keys and values at lower precision.',
      ['CUDA docs', 'llama.cpp readme'],
      { confidence: 0.85, recommendedAction: 'Use q8_0 for stability' },
    );
    expect(card.stableKey).toMatch(/^research:/);
    expect(card.question).toContain('KV quantization');
    expect(card.confidence).toBe(0.85);
    expect(card.recommendedAction).toBe('Use q8_0 for stability');
    // Should be cached
    expect(mockRedis.setex.mock.calls.some(c => String(c[0]).startsWith('kv:card:research:'))).toBe(true);
  });
});

describe('context-compression — buildAttentionToc', () => {
  beforeEach(() => { store.clear(); });

  it('builds TOC with hot files, symbols, and tools', async () => {
    const toc = await buildAttentionToc(
      'task_001',
      ['src/lib/server/gpu/libtorch-bridge.ts', 'tests/cuda-async.spec.ts'],
      ['graphSimilaritySafe', 'batchCosineSimilarityAsync', 'GPU_ASYNC_THRESHOLD_N'],
      ['src/routes/api'],
    );
    expect(toc.hotFiles).toHaveLength(2);
    expect(toc.hotSymbols).toContain('graphSimilaritySafe');
    expect(toc.blockedAreas).toContain('src/routes/api');
    expect(toc.hotTools.length).toBeGreaterThan(0);
  });

  it('returns cached TOC on repeat call', async () => {
    await buildAttentionToc('task_cache_test', ['a.ts'], ['foo'], []);
    mockRedis.setex.mockClear();
    await buildAttentionToc('task_cache_test', ['b.ts'], ['bar'], []); // should be served from cache
    // setex should NOT be called again (Redis cache hit)
    expect(mockRedis.setex.mock.calls.filter(c => String(c[0]).startsWith('kv:toc:task:')).length).toBe(0);
  });
});

// ── kv-context-controller tests ───────────────────────────────────────────────

describe('kv-context-controller — stable prefix', () => {
  it('getStableSystemPrefix returns non-empty stable text', () => {
    const prefix = getStableSystemPrefix();
    expect(prefix.length).toBeGreaterThan(100);
    expect(prefix).toContain('TRACE dev agent');
  });

  it('getStablePrefixHash is deterministic and non-empty', () => {
    const h1 = getStablePrefixHash();
    const h2 = getStablePrefixHash();
    expect(h1).toBe(h2);
    expect(h1.length).toBeGreaterThan(8);
  });
});

describe('kv-context-controller — buildKvContextPacket', () => {
  beforeEach(() => {
    store.clear();
    mockRedis.get.mockClear();
    mockRedis.setex.mockClear();
  });

  it('builds a packet with correct structure', async () => {
    const packet = await buildKvContextPacket({
      taskId:   'task_gpu_async_001',
      query:    'Finish async GPU Step 2',
      hotFiles: ['src/lib/workers/gpu-worker.mjs', 'src/lib/server/gpu/libtorch-bridge.ts'],
      hotSymbols: ['graphSimilaritySafe', 'batchCosineSimilarityAsync'],
      blockedAreas: ['src/routes/api'],
    });

    expect(packet.taskId).toBe('task_gpu_async_001');
    expect(packet.stablePrefixHash).toBeTruthy();
    expect(packet.level1Runtime.cachePolicy).toBe('reuse-stable-prefix');
    expect(packet.level2Compressed.fileCards).toHaveLength(2);
    expect(packet.level3AttentionToc.hotFiles).toHaveLength(2);
    expect(packet.level3AttentionToc.hotSymbols).toContain('graphSimilaritySafe');
    expect(packet.level3AttentionToc.blockedAreas).toContain('src/routes/api');
  });

  it('respects maxInputTokens in tokenBudget', async () => {
    const packet = await buildKvContextPacket({
      taskId: 'task_budget_test',
      query:  'test query',
      maxInputTokens: 8000,
    });
    expect(packet.tokenBudget.maxInputTokens).toBe(8000);
    expect(packet.tokenBudget.dynamicContextTokens).toBeLessThan(8000);
    expect(packet.tokenBudget.dynamicContextTokens).toBeGreaterThan(0);
  });

  it('caches packet on second call (query-level cache hit)', async () => {
    const packet1 = await buildKvContextPacket({ taskId: 'task_repeat', query: 'exact same query' });
    mockRedis.setex.mockClear();
    const packet2 = await buildKvContextPacket({ taskId: 'task_repeat', query: 'exact same query' });
    // setex should NOT be called on second build (served from Redis cache)
    expect(mockRedis.setex.mock.calls.filter(c => String(c[0]).startsWith('kv:toc:query:')).length).toBe(0);
    expect(packet2.taskId).toBe(packet1.taskId);
  });

  it('caps hotFiles to 8 even if more are provided', async () => {
    const manyFiles = Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`);
    const packet = await buildKvContextPacket({ taskId: 'task_cap', query: 'test', hotFiles: manyFiles });
    expect(packet.level2Compressed.fileCards.length).toBeLessThanOrEqual(8);
  });
});

describe('kv-context-controller — getCompressedCard', () => {
  beforeEach(() => { store.clear(); });

  it('returns a FileCard for file: stableKey', async () => {
    const card = await getCompressedCard('file:src/lib/server/gpu/libtorch-bridge.ts');
    expect(card).not.toBeNull();
    expect((card as { filePath: string }).filePath).toBe('src/lib/server/gpu/libtorch-bridge.ts');
  });

  it('returns a TraceCard for trace: stableKey', async () => {
    const card = await getCompressedCard('trace:my-trace-id');
    expect(card).not.toBeNull();
    expect((card as { traceId: string }).traceId).toBe('my-trace-id');
  });

  it('returns null for unknown stableKey type', async () => {
    const card = await getCompressedCard('unknown:foo');
    expect(card).toBeNull();
  });
});

describe('kv-context-controller — explainCompression', () => {
  beforeEach(() => { store.clear(); });

  it('returns hint when no packet exists', async () => {
    const result = JSON.parse(await explainCompression('nonexistent-task'));
    expect(result.status).toBe('no-packet-found');
    expect(result.hint).toMatch(/build_kv_packet/);
  });

  it('returns packet summary after building', async () => {
    await buildKvContextPacket({ taskId: 'task_explain', query: 'explain test', hotFiles: ['src/a.ts'] });
    const result = JSON.parse(await explainCompression('task_explain'));
    expect(result.taskId).toBe('task_explain');
    expect(typeof result.fileCards).toBe('number');
  });
});

describe('kv-context-controller — refreshTaskToc', () => {
  it('invalidates cache and returns new TOC', async () => {
    store.clear();
    // Build initial
    await buildAttentionToc('task_refresh', ['old-file.ts'], ['oldSymbol'], []);
    // Refresh with new data
    const newToc = await refreshTaskToc('task_refresh', ['new-file.ts'], ['newSymbol'], ['blocked.ts']);
    expect(newToc.hotFiles).toContain('new-file.ts');
    expect(newToc.hotSymbols).toContain('newSymbol');
    expect(newToc.blockedAreas).toContain('blocked.ts');
  });
});

describe('kv-context-controller — formatKvPacketForPrompt', () => {
  it('produces text with task, TOC, and file cards', async () => {
    const packet = await buildKvContextPacket({
      taskId:     'task_format',
      query:      'Wire the GPU async path',
      hotFiles:   ['src/lib/workers/gpu-worker.mjs'],
      hotSymbols: ['graphSimilaritySafe'],
    });
    const text = formatKvPacketForPrompt(packet);
    expect(text).toContain('task_format');
    expect(text).toContain('Wire the GPU async path');
    expect(text).toContain('gpu-worker.mjs');
    expect(text).toContain('graphSimilaritySafe');
    expect(text).toContain('Token budget');
  });

  it('keeps stable prefix separate from formatted packet text', () => {
    const prefix = getStableSystemPrefix();
    const fakePacket = {
      taskId: 'x', stablePrefixHash: 'h',
      level1Runtime: { model: 'm', cachePolicy: 'reuse-stable-prefix' as const, cacheTypeK: 'q8_0', cacheTypeV: 'q8_0' },
      level2Compressed: { taskSummary: 'task', fileCards: [], traceCards: [], researchCards: [] },
      level3AttentionToc: { hotFiles: [], hotSymbols: [], hotTools: [], blockedAreas: [], nextToolSuggestions: [] },
      tokenBudget: { maxInputTokens: 12000, stablePrefixTokens: 400, dynamicContextTokens: 9552, reservedOutputTokens: 2048 },
    };
    const dynamic = formatKvPacketForPrompt(fakePacket);
    // The stable prefix must NOT appear in the dynamic section
    expect(dynamic).not.toContain('TRACE dev agent');
    // But it must be in the actual system prompt
    expect(prefix).toContain('TRACE dev agent');
  });
});
