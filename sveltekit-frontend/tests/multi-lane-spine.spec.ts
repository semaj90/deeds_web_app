// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Static source paths — read at test runtime, not import time
const SRC_ROOT = resolve(process.cwd(), 'src/lib/server/ace');

const mocks = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockQuery = vi.fn();
  return { mockGet, mockQuery };
});

vi.mock('$lib/server/ace/ngram-retrieval.js', () => ({
  multiTextRecall: vi.fn().mockResolvedValue([]),
}));

vi.mock('$lib/server/ace/error-fingerprint.js', () => ({
  lookupErrorFingerprint: vi.fn().mockResolvedValue(null),
  extractSymbols: vi.fn().mockReturnValue([]),
  extractFilePaths: vi.fn().mockReturnValue([]),
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  hybridSearch: vi.fn().mockResolvedValue([]),
}));

describe('multi-lane-spine: regression guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGet.mockResolvedValue(null);
    mocks.mockQuery.mockResolvedValue({ rows: [] });
  });

  // ── 1. context-assembler is wired to runRetrievalLanes ─────────────────────

  it('context-assembler.ts imports and calls runRetrievalLanes', () => {
    const src = readFileSync(resolve(SRC_ROOT, 'context-assembler.ts'), 'utf-8');
    expect(src).toContain('runRetrievalLanes');
    // ensure it is a live call, not just a type import
    expect(src).toMatch(/runRetrievalLanes\s*\(/);
  });

  // ── 2. aceTopkKey is used as the shared key contract by both modules ────────

  it('aceTopkKey is imported by both retrieval-lanes.ts and context-assembler.ts', () => {
    const lanesSource = readFileSync(resolve(SRC_ROOT, 'retrieval-lanes.ts'), 'utf-8');
    const assemblerSource = readFileSync(resolve(SRC_ROOT, 'context-assembler.ts'), 'utf-8');

    expect(lanesSource).toContain('aceTopkKey');
    expect(assemblerSource).toContain('aceTopkKey');
  });

  // ── 3. skipVectorLane=true prevents the Qdrant/vector lane from running ─────

  it('multiLaneSearch skipped vector lane returns stable object with skipped=true', async () => {
    const { multiLaneSearch } = await import('$lib/server/ace/multi-lane-retrieval.js');
    const redis = { get: mocks.mockGet, setex: vi.fn() } as any;
    const pool = {
      query: mocks.mockQuery.mockResolvedValue({ rows: [] }),
    } as any;

    const result = await multiLaneSearch(redis, pool, {
      text: 'how does qdrant search work',
      skipVectorLane: true,
    });

    const vectorLane = result.lanes.find((l) => l.lane === "vector");
    expect(vectorLane).toBeDefined();
    expect(vectorLane?.skipped).toBe(true);
    expect(vectorLane?.skipReason).toBeTruthy();
    // qdrant-manager hybridSearch must NOT have been called
    const { hybridSearch } = await import('$lib/server/vector/qdrant-manager.js');
    expect(hybridSearch).not.toHaveBeenCalled();
  });

  // ── 4. postgres_trigram lane degrades gracefully when pool errors ────────────

  it('postgres_trigram lane is degraded (no throw) when pool.query rejects', async () => {
    const { runRetrievalLanes } = await import('$lib/server/ace/retrieval-lanes.js');
    const redis = { get: mocks.mockGet } as any;
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("relation does not exist")),
    } as any;

    const result = await runRetrievalLanes({ query: 'error fingerprints schema', pool, redis });

    const pgLane = result.lanes.find((l) => l.lane === "postgres_trigram");
    expect(pgLane?.degraded).toBe(true);
    // Overall result is still a valid MultiLaneOutput
    expect(result).toMatchObject({
      lanes: expect.any(Array),
      merged: expect.any(Array),
      totalHits: expect.any(Number),
    });
  });
});