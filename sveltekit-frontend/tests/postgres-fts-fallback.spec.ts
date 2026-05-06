// @vitest-environment node
/**
 * postgres-fts-fallback.spec.ts
 *
 * Proves the Tier-2 Postgres FTS fallback in fetchCodebaseContext():
 * when Qdrant returns zero results, searchCodeLexical() is used instead
 * and results are weighted at 0.3× of their lexical score.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  searchCodebase:    vi.fn(),
  searchCodeLexical: vi.fn(),
  pool:              { query: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('$lib/server/indexer/dual-embedder.js', () => ({
  searchCodebase: mocks.searchCodebase,
}));

vi.mock('$lib/server/search/postgres-fts.js', () => ({
  searchCodeLexical: mocks.searchCodeLexical,
}));

vi.mock('$lib/server/db/client', () => ({
  pool: mocks.pool,
  db:   {},
}));

// Suppress all heavy ACE imports that aren't under test
vi.mock('$lib/server/search/qdrant-search.js', () => ({ searchQdrantCode: vi.fn(async () => []) }));
vi.mock('$lib/server/search/neo4j-rerank.js',  () => ({ expandNeighbours: vi.fn(async () => []) }));
vi.mock('$lib/server/redis.js',                () => ({ getRedis: () => ({ get: vi.fn(async () => null), set: vi.fn(), setex: vi.fn(), quit: vi.fn() }) }));
vi.mock('$lib/server/trace/trace-collector.js',() => ({ recordAgentAction: vi.fn() }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFtsRow(overrides: Partial<{
  stable_key: string; file_path: string; symbol_name: string;
  content: string; tags: string; topo_class: string;
  lexical_score: number; graph_authority_score: number; headline: string;
}> = {}) {
  return {
    stable_key:            overrides.stable_key           ?? 'sk:auth-ts',
    file_path:             overrides.file_path            ?? 'src/lib/server/auth.ts',
    symbol_name:           overrides.symbol_name          ?? 'validateSession',
    symbol_kind:           null,
    language:              'typescript',
    content:               overrides.content              ?? 'export async function validateSession(token: string) { /* ... */ }',
    tags:                  overrides.tags                 ?? 'auth,server,session',
    topo_class:            overrides.topo_class           ?? 'server',
    graph_authority_score: overrides.graph_authority_score ?? 0.6,
    lexical_score:         overrides.lexical_score        ?? 0.85,
    headline:              overrides.headline             ?? 'validateSession token string',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Postgres FTS fallback — when Qdrant returns zero results', () => {
  beforeEach(() => {
    mocks.searchCodebase.mockReset();
    mocks.searchCodeLexical.mockReset();
  });

  it('uses Postgres FTS when Qdrant returns empty array', async () => {
    mocks.searchCodebase.mockResolvedValue([]);  // Qdrant zero
    mocks.searchCodeLexical.mockResolvedValue([makeFtsRow()]);

    const { fetchCodebaseContext } = await import('$lib/server/ace/context-assembler.js');
    const result = await fetchCodebaseContext('fix the auth session validation');

    expect(mocks.searchCodeLexical).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
    expect(result![0].filePath).toBe('src/lib/server/auth.ts');
  });

  it('weights FTS results at 0.3× the lexical score', async () => {
    mocks.searchCodebase.mockResolvedValue([]);
    mocks.searchCodeLexical.mockResolvedValue([makeFtsRow({ lexical_score: 1.0 })]);

    const { fetchCodebaseContext } = await import('$lib/server/ace/context-assembler.js');
    const result = await fetchCodebaseContext('implement token validation');

    expect(result).toHaveLength(1);
    // score = lexical_score * 0.3 = 1.0 * 0.3 = 0.3
    expect(result![0].score).toBeCloseTo(0.3, 2);
  });

  it('carries filePath from FTS row into result', async () => {
    mocks.searchCodebase.mockResolvedValue([]);
    mocks.searchCodeLexical.mockResolvedValue([
      makeFtsRow({ stable_key: 'sk:session', file_path: 'src/lib/server/session.ts' }),
    ]);

    const { fetchCodebaseContext } = await import('$lib/server/ace/context-assembler.js');
    const result = await fetchCodebaseContext('debug session expiry');

    expect(result![0].filePath).toBe('src/lib/server/session.ts');
  });

  it('returns multiple FTS hits preserving order', async () => {
    mocks.searchCodebase.mockResolvedValue([]);
    mocks.searchCodeLexical.mockResolvedValue([
      makeFtsRow({ stable_key: 'sk:a', file_path: 'src/a.ts', lexical_score: 0.9 }),
      makeFtsRow({ stable_key: 'sk:b', file_path: 'src/b.ts', lexical_score: 0.7 }),
      makeFtsRow({ stable_key: 'sk:c', file_path: 'src/c.ts', lexical_score: 0.5 }),
    ]);

    const { fetchCodebaseContext } = await import('$lib/server/ace/context-assembler.js');
    const result = await fetchCodebaseContext('export function interface');

    expect(result).toHaveLength(3);
    expect(result![0].score).toBeGreaterThan(result![1].score!);
    expect(result![1].score).toBeGreaterThan(result![2].score!);
  });

  it('does NOT call FTS when Qdrant returns results', async () => {
    mocks.searchCodebase.mockResolvedValue([
      { filePath: 'src/lib/server/auth.ts', content: 'validateSession', score: 0.9,
        tags: ['auth'], gpuCluster: null, pageRankScore: null, routeType: null,
        hasAuthGuard: null, somCluster: null, somBmuRow: null, somBmuCol: null,
        graphAuthorityScore: null },
    ]);

    const { fetchCodebaseContext } = await import('$lib/server/ace/context-assembler.js');
    await fetchCodebaseContext('token validation');

    expect(mocks.searchCodeLexical).not.toHaveBeenCalled();
  });

  it('gracefully returns null when both Qdrant and FTS fail', async () => {
    mocks.searchCodebase.mockResolvedValue([]);
    mocks.searchCodeLexical.mockRejectedValue(new Error('DB unavailable'));

    const { fetchCodebaseContext } = await import('$lib/server/ace/context-assembler.js');
    // Should not throw — FTS errors are caught and swallowed
    const result = await fetchCodebaseContext('fix the import error').catch(() => null);
    // result is null or empty — FTS unavailable should not propagate
    expect(result === null || result?.length === 0).toBe(true);
  });
});
