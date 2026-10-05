// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  rgSearch: vi.fn(),
  fetch: vi.fn(),
  pgQuery: vi.fn(),
}));

vi.mock('$lib/server/llm/runtime-contract.js', () => { throw new Error('contract not loaded in retrieval'); });
vi.mock('./embedding-service.js', () => ({ embedQueryForLane: mocks.embed }));
vi.mock('$lib/server/search/rg-pool.js', () => ({ getRgPool: () => ({ search: mocks.rgSearch }) }));
vi.mock('$lib/server/search/create-codebase-search-backend.js', () => ({ createCodebaseSearchBackendFromEnv: () => ({ kind: 'qdrant' }) }));
vi.mock('node-fetch', () => ({ default: mocks.fetch }));
vi.mock('pg', () => ({ Pool: class { query = mocks.pgQuery; end = () => Promise.resolve(); on = () => this; connect = () => Promise.resolve({ release() {} }); } }));
vi.mock('./parent-atlas-bridge.js', () => ({
  resolveParentAtlasContext: vi.fn(),
  enrichFilterWithDomainTaxonomy: vi.fn(async (f: unknown) => f),
  batchResolveParentAtlasContext: vi.fn(async () => new Map()),
}));

import { executeUnifiedRetrieval, type RetrievalConfig } from './unified-orchestrator';

const config = {
  qdrant: { host: '127.0.0.1', port: 6333 },
  turbovec: { host: '127.0.0.1', port: 8791 },
  goRetrieval: { host: '127.0.0.1', port: 8100 },
  postgres: { host: '127.0.0.1', port: 5434, user: 'u', password: 'pw', database: 'd' },
  ollama: { host: '127.0.0.1', port: 11434 },
  gemma4: { host: '127.0.0.1', port: 8090 },
} as unknown as RetrievalConfig;

const okVector = () => ({ vector: new Float32Array(768).fill(0.1), model: 'm', dimension: 768, cached: false, exec_ms: 1 });
const rgHit = { file: 'src/a.ts', line: 3, column: 0, content: 'x', match: 'x' };

beforeEach(() => {
  process.env.UNIFIED_SEMANTIC_EXECUTOR = 'qdrant'; // these cases exercise the Qdrant executor; the pgvector executor is covered below
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.embed.mockResolvedValue(okVector());
  mocks.rgSearch.mockResolvedValue([rgHit]);
  mocks.pgQuery.mockResolvedValue({ rows: [{ id: 'c1', qdrant_id: 'p1', relative_path: 'src/a.ts', symbol: 'a', kind: 'function' }] });
  mocks.fetch.mockImplementation(async (url: string) => {
    if (String(url).includes('/points/query')) {
      return { ok: true, status: 200, json: async () => ({ result: { points: [{ id: 'p1', score: 0.9, payload: { relative_path: 'src/a.ts', source_ref: 'src/a.ts' } }] } }) };
    }
    return { ok: false, status: 503, json: async () => ({}) };
  });
});

describe('unified orchestrator lane degradation (KERNEL-REAL-02B)', () => {
  it('A: semantic + lexical both available -> both participate', async () => {
    const r = await executeUnifiedRetrieval({ query: 'find a' }, config);
    expect(r.lanes).toEqual({ semantic: { status: 'OK' }, lexical: { status: 'OK' } });
    expect(r.evidence_status).toBe('OK');
    expect(r.stages_completed).toEqual(expect.arrayContaining(['embedding', 'qdrant_search', 'rg_pool_lexical']));
    expect(r.candidates.length).toBeGreaterThan(0);
  });

  it('B: embedding fails -> semantic UNAVAILABLE, lexical survives, no throw, no dense search', async () => {
    mocks.embed.mockRejectedValue(new Error('embedding backend down'));
    const r = await executeUnifiedRetrieval({ query: 'find a' }, config);
    expect(r.lanes?.semantic).toMatchObject({ status: 'UNAVAILABLE', reason: 'EMBEDDING_FAILED' });
    expect(r.lanes?.lexical).toEqual({ status: 'OK' });
    expect(r.stages_completed).toContain('embedding_unavailable');
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(mocks.fetch.mock.calls.some(([u]) => String(u).includes('/points/query'))).toBe(false);
  });

  it('C: lexical fails -> lexical UNAVAILABLE with a reason, semantic survives', async () => {
    mocks.rgSearch.mockRejectedValue(new Error('rg exited with code 2: bad flag'));
    const r = await executeUnifiedRetrieval({ query: 'find a' }, config);
    expect(r.lanes?.lexical).toMatchObject({ status: 'UNAVAILABLE', reason: 'RG_EXEC_FAILED' });
    expect(r.lanes?.semantic).toEqual({ status: 'OK' });
    expect(r.stages_completed).toContain('rg_pool_lexical_unavailable');
    expect(r.candidates.length).toBeGreaterThan(0);
  });

  it('D: both lanes unavailable -> typed NO_EVIDENCE, no fabricated candidates', async () => {
    mocks.embed.mockRejectedValue(new Error('down'));
    mocks.rgSearch.mockRejectedValue(new Error('rg binary not found'));
    const r = await executeUnifiedRetrieval({ query: 'find a' }, config);
    expect(r.evidence_status).toBe('NO_EVIDENCE');
    expect(r.candidates).toEqual([]);
    expect(r.lanes?.lexical).toMatchObject({ status: 'UNAVAILABLE', reason: 'RG_NOT_FOUND' });
  });

  it('a wrong-dimension vector is a contract violation, not an availability failure', async () => {
    mocks.embed.mockResolvedValue({ ...okVector(), vector: new Float32Array(384) });
    await expect(executeUnifiedRetrieval({ query: 'find a' }, config)).rejects.toThrow();
  });
});

describe('unified orchestrator execution mode (KERNEL-REAL-02B, E)', () => {
  it('READ_ONLY: receipt records reads only, every Postgres statement is a SELECT, no Qdrant write endpoint is called', async () => {
    const r = await executeUnifiedRetrieval({ query: 'find a', executionMode: 'READ_ONLY' }, config);
    expect(r.read_only_receipt).toMatchObject({ executionMode: 'READ_ONLY', attemptedWrites: 0, committedWrites: 0 });
    expect(r.read_only_receipt!.entries.map((e) => e.operation)).toEqual(
      expect.arrayContaining(['embedding', 'qdrant_search', 'rg_pool_lexical', 'postgres_join']),
    );
    for (const [sql] of mocks.pgQuery.mock.calls) expect(String(sql).trim().toUpperCase()).toMatch(/^SELECT/);
    for (const [url] of mocks.fetch.mock.calls) {
      expect(String(url)).not.toMatch(/upsert|\/points(\?|$)|\/payload|\/delete|\/snapshots/);
    }
  });

  it('defaults to READ_ONLY and rejects MUTATING (retrieval has no mutating mode)', async () => {
    const r = await executeUnifiedRetrieval({ query: 'find a' }, config);
    expect(r.read_only_receipt?.executionMode).toBe('READ_ONLY');
    await expect(executeUnifiedRetrieval({ query: 'find a', executionMode: 'MUTATING' }, config))
      .rejects.toThrow('UNIFIED_RETRIEVAL_HAS_NO_MUTATING_MODE');
  });
});

describe('unified orchestrator pgvector semantic executor (default; Qdrant projection unfinished)', () => {
  const chunk = { id: 'chunk-uuid-1', relative_path: 'src/a.ts', symbol: 'a', kind: 'function', source_ref: 'src/a.ts', source_revision: null, workspace_revision: null, representation_revision: null, cosine: 0.9 };
  const wirePg = (opts: { chunkRows?: unknown[]; packets?: unknown[]; fail?: boolean } = {}) => {
    mocks.pgQuery.mockImplementation(async (sql: string) => {
      if (opts.fail) throw new Error('pg down');
      if (/atlas_packets/.test(sql)) return { rows: opts.packets ?? [{ source_ref: 'src/a.ts', packet_key: 'packet:abc', n: 1 }] };
      if (/<=>/.test(sql)) return { rows: /content_embedding_768/.test(sql) ? [] : (opts.chunkRows ?? [chunk]) };
      return { rows: [] };
    });
  };
  beforeEach(() => { delete process.env.UNIFIED_SEMANTIC_EXECUTOR; });

  it('uses Postgres by default: canonical candidateId comes straight from the chunk row, no Qdrant call, executor and caveat reported on the lane', async () => {
    wirePg();
    const r = await executeUnifiedRetrieval({ query: 'find a' }, config);
    expect(r.lanes?.semantic).toMatchObject({ status: 'OK', executor: 'postgres_pgvector', note: expect.stringMatching(/DIFFERENT_RECIPES/) });
    expect(r.stages_completed).toContain('postgres_pgvector_search');
    expect(mocks.fetch.mock.calls.some((c) => String(c[0]).includes('/points/query'))).toBe(false);
    expect(r.candidates[0].identity).toMatchObject({ candidateId: 'chunk-uuid-1', packetKey: 'packet:abc', sourceRef: 'src/a.ts', identitySource: 'POSTGRES_CANONICAL_V1', qdrantPointId: null });
    expect(r.candidates[0].identity.missingFields).toEqual(['sourceRevision', 'workspaceRevision']); // never invented
  });

  it('does not guess a packet_key when a source_ref has several packets', async () => {
    wirePg({ packets: [{ source_ref: 'src/a.ts', packet_key: 'packet:abc', n: 2 }] });
    const r = await executeUnifiedRetrieval({ query: 'find a' }, config);
    expect(r.candidates[0].identity.packetKey).toBeNull();
    expect(r.candidates[0].identity.missingFields).toContain('packetKey');
  });

  it('only issues SELECTs and fails the lane (not the query) on a database error', async () => {
    wirePg({ fail: true });
    const r = await executeUnifiedRetrieval({ query: 'find a' }, config);
    expect(r.lanes?.semantic).toMatchObject({ status: 'UNAVAILABLE', reason: 'SEMANTIC_SEARCH_FAILED' });
    wirePg();
    await executeUnifiedRetrieval({ query: 'find a' }, config);
    for (const [sql] of mocks.pgQuery.mock.calls) expect(String(sql)).toMatch(/^s*SELECT/i);
  });

  it('fails the lane instead of silently dropping a filter it cannot apply', async () => {
    wirePg();
    const r = await executeUnifiedRetrieval({ query: 'find a', filters: { feature_ids: ['f1'] } as never }, config);
    expect(r.lanes?.semantic).toMatchObject({ status: 'UNAVAILABLE', detail: expect.stringMatching(/PGVECTOR_FILTER_UNSUPPORTED:feature_ids/) });
  });
});
