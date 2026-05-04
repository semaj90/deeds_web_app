// @vitest-environment node
/**
 * directory-summarizer.ts — Unit tests for ingestDirectorySummaries
 *
 * Covers:
 *   1. Happy path — wiki note written, community row upserted, Neo4j edge created
 *   2. Low-score entry — webSearchTriggered incremented, 'low-score' tag present
 *   3. No cluster match — wikiNotesWritten still increments, neo4j/community skipped
 *   4. CouchDB unreachable — error captured in result.errors, rest continues
 *   5. Empty input — zero counts, no errors
 *
 * Pattern (G26): vi.hoisted() + lazy-import in beforeEach
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── hoisted mock variables ────────────────────────────────────────────────────

const {
  mockPoolQuery,
  mockRedisSetex,
  mockRedisDel,
  mockGetRedis,
  mockGenerateSingleEmbedding,
  mockFetch,
  mockNeo4jRun,
  mockNeo4jSessionClose,
  mockNeo4jDriverClose,
} = vi.hoisted(() => {
  const mockPoolQuery           = vi.fn();
  const mockRedisSetex          = vi.fn().mockResolvedValue('OK');
  const mockRedisDel            = vi.fn().mockResolvedValue(1);
  const mockGetRedis            = vi.fn(() => ({ setex: mockRedisSetex, del: mockRedisDel }));
  const mockGenerateSingleEmbedding = vi.fn().mockResolvedValue(new Array(768).fill(0.1));
  const mockFetch               = vi.fn();
  const mockNeo4jRun            = vi.fn().mockResolvedValue({});
  const mockNeo4jSessionClose   = vi.fn().mockResolvedValue(undefined);
  const mockNeo4jDriverClose    = vi.fn().mockResolvedValue(undefined);
  return {
    mockPoolQuery,
    mockRedisSetex,
    mockRedisDel,
    mockGetRedis,
    mockGenerateSingleEmbedding,
    mockFetch,
    mockNeo4jRun,
    mockNeo4jSessionClose,
    mockNeo4jDriverClose,
  };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public',  () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    NEO4J_URI:      'bolt://127.0.0.1:7687',
    NEO4J_USER:     'neo4j',
    NEO4J_PASSWORD: 'test_pass',
    COUCHDB_URL:    'http://admin:legal_ai_pass@localhost:5984',
  },
}));

vi.mock('$lib/server/db/client', () => ({
  pool: { query: mockPoolQuery },
  db:   {},
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: mockGetRedis,
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateSingleEmbedding: mockGenerateSingleEmbedding,
}));

// neo4j-driver — dynamic import inside writeNeo4jEdges
vi.mock('neo4j-driver', () => ({
  default: {
    driver: vi.fn(() => ({
      session: vi.fn(() => ({
        run:   mockNeo4jRun,
        close: mockNeo4jSessionClose,
      })),
      close: mockNeo4jDriverClose,
    })),
    auth: { basic: vi.fn(() => ({})) },
  },
}));

// web-search-indexer — fire-and-forget import, just needs to not throw
vi.mock('$lib/server/indexer/web-search-indexer.js', () => ({
  runDeepResearchIndex: vi.fn().mockResolvedValue(undefined),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

/** Cluster row returned by pool.query (tags/metadata.topFiles match dirPath) */
function makeClusterRow(gpuCluster: number, filePath: string) {
  return {
    repo_id: 'default',
    gpu_cluster: gpuCluster,
    tags: [filePath],
    metadata: { topFiles: [filePath] },
  };
}

/** Minimal DirAuditEntry */
function makeEntry(overrides: Partial<{
  rel: string;
  score: number;
  agentSummary: string | null;
  ragSummary: string | null;
  tsErrors: number;
}> = {}) {
  return {
    rel:          overrides.rel       ?? 'src/lib/server/cache',
    score:        overrides.score     ?? 80,
    metrics:      { fileCount: 5, tsErrors: overrides.tsErrors ?? 0 },
    ragSummary:   overrides.ragSummary ?? 'RAG blurb',
    agentSummary: 'agentSummary' in overrides ? (overrides.agentSummary ?? null) : 'Agent summary text',
    hyperedge:    null,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ingestDirectorySummaries', () => {
  let ingestDirectorySummaries: (typeof import('$lib/server/indexer/directory-summarizer.js'))['ingestDirectorySummaries'];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default: CouchDB GET returns 404 (new doc), PUT returns 201
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (!opts || opts.method !== 'PUT') {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, status: 201, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', mockFetch);

    // Default: cluster_summaries returns one matching row for 'src/lib/server/cache'
    mockPoolQuery.mockImplementation((sql: string) => {
      if (sql.includes('cluster_summaries')) {
        return Promise.resolve({
          rows: [makeClusterRow(3, 'src/lib/server/cache/redis-exact-match.ts')],
        });
      }
      // community_reports upsert
      return Promise.resolve({ rows: [] });
    });

    const mod = await import('$lib/server/indexer/directory-summarizer.js');
    ingestDirectorySummaries = mod.ingestDirectorySummaries;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── 1. Happy path ─────────────────────────────────────────────────────────

  it('happy path: writes wiki note, upserts community row, creates Neo4j edge', async () => {
    const result = await ingestDirectorySummaries([makeEntry()]);

    expect(result.directoriesProcessed).toBe(1);
    expect(result.wikiNotesWritten).toBe(1);
    expect(result.communityRowsUpserted).toBe(1);
    expect(result.neo4jEdgesCreated).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Wiki PUT was called with the correct doc id prefix
    const putCall = mockFetch.mock.calls.find(
      ([, opts]: [string, RequestInit]) => opts?.method === 'PUT'
    );
    expect(putCall).toBeDefined();
    const [putUrl] = putCall as [string, RequestInit];
    expect(putUrl).toContain('dir%3A'); // "dir:" URL-encoded

    // community_reports upsert fired
    const communityCall = mockPoolQuery.mock.calls.find(
      ([sql]: [string]) => sql.includes('community_reports')
    );
    expect(communityCall).toBeDefined();

    // Neo4j MERGE was called
    expect(mockNeo4jRun).toHaveBeenCalledWith(
      expect.stringContaining('HAS_DIRECTORY_SUMMARY'),
      expect.objectContaining({ clusterId: 3, dir: 'src/lib/server/cache' })
    );
  });

  // ── 2. Low-score entry ────────────────────────────────────────────────────

  it('low-score entry: triggers web search, adds low-score tag in wiki doc', async () => {
    const result = await ingestDirectorySummaries([makeEntry({ score: 30 })]);

    expect(result.webSearchTriggered).toBe(1);
    expect(result.wikiNotesWritten).toBe(1);

    // Wiki body should contain 'low-score' tag
    const putCall = mockFetch.mock.calls.find(
      ([, opts]: [string, RequestInit]) => opts?.method === 'PUT'
    );
    const body = JSON.parse((putCall as [string, RequestInit])[1].body as string);
    expect(body.dominantTags).toContain('low-score');
    expect(body.warnings).toEqual(expect.arrayContaining([expect.stringContaining('30')]));
  });

  // ── 3. No cluster match ───────────────────────────────────────────────────

  it('no cluster match: still writes wiki note but skips community + Neo4j', async () => {
    // cluster_summaries returns a row whose file doesn't match our dir
    mockPoolQuery.mockImplementation((sql: string) => {
      if (sql.includes('cluster_summaries')) {
        return Promise.resolve({
          rows: [makeClusterRow(7, 'src/routes/api/unrelated/handler.ts')],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await ingestDirectorySummaries([makeEntry()]);

    expect(result.wikiNotesWritten).toBe(1);
    expect(result.communityRowsUpserted).toBe(0);
    expect(result.neo4jEdgesCreated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  // ── 4. CouchDB PUT fails ──────────────────────────────────────────────────

  it('CouchDB PUT failure: captures error, processing continues for other entries', async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'PUT') {
        return Promise.reject(new Error('ECONNREFUSED'));
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    const entries = [makeEntry({ rel: 'src/lib/server/cache' }), makeEntry({ rel: 'src/lib/server/ai' })];
    const result = await ingestDirectorySummaries(entries);

    expect(result.directoriesProcessed).toBe(2);
    expect(result.wikiNotesWritten).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain('ECONNREFUSED');
  });

  // ── 5. Empty input ────────────────────────────────────────────────────────

  it('empty input: returns all-zero result with no errors', async () => {
    const result = await ingestDirectorySummaries([]);

    expect(result).toEqual({
      directoriesProcessed:  0,
      wikiNotesWritten:      0,
      neo4jEdgesCreated:     0,
      communityRowsUpserted: 0,
      webSearchTriggered:    0,
      errors:                [],
    });
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockNeo4jRun).not.toHaveBeenCalled();
  });

  // ── 6. agentSummary null — uses ragSummary fallback ───────────────────────

  it('null agentSummary: uses ragSummary in wiki doc, triggers web search', async () => {
    const result = await ingestDirectorySummaries([
      makeEntry({ agentSummary: null, ragSummary: 'RAG fallback text', score: 80 }),
    ]);

    expect(result.errors).toHaveLength(0);
    expect(result.webSearchTriggered).toBe(1); // agentSummary null always triggers

    const putCall = mockFetch.mock.calls.find(
      ([, opts]: [string, RequestInit]) => opts?.method === 'PUT'
    );
    const body = JSON.parse((putCall as [string, RequestInit])[1].body as string);
    expect(body.summary).toBe('RAG fallback text');
  });

  // ── 7. Embedding failure — community row still upserted without vector ─────

  it('embedding failure: upsert still fires with null embedding', async () => {
    mockGenerateSingleEmbedding.mockRejectedValueOnce(new Error('embed-timeout'));

    const result = await ingestDirectorySummaries([makeEntry()]);

    expect(result.communityRowsUpserted).toBe(1);
    expect(result.errors).toHaveLength(0);

    // The community_reports upsert SQL should have been called with NULL vector
    const communityCall = mockPoolQuery.mock.calls.find(([sql]: [string]) =>
      sql.includes('INSERT INTO community_reports')
    );
    expect(communityCall).toBeDefined();
    expect(communityCall![0]).toContain('$8::vector');
    expect(communityCall![1][7]).toBeNull();
  });

  it('ensures community_reports exists before attempting the upsert', async () => {
    await ingestDirectorySummaries([makeEntry()]);

    const createTableCallIndex = mockPoolQuery.mock.calls.findIndex(([sql]: [string]) =>
      sql.includes('CREATE TABLE IF NOT EXISTS community_reports')
    );
    const insertCallIndex = mockPoolQuery.mock.calls.findIndex(([sql]: [string]) =>
      sql.includes('INSERT INTO community_reports')
    );

    expect(createTableCallIndex).toBeGreaterThan(-1);
    expect(insertCallIndex).toBeGreaterThan(-1);
    expect(createTableCallIndex).toBeLessThan(insertCallIndex);
  });

  it('strips CouchDB credentials from fetch URLs and sends Basic auth header', async () => {
    await ingestDirectorySummaries([makeEntry()]);

    const putCall = mockFetch.mock.calls.find(
      ([, opts]: [string, RequestInit]) => opts?.method === 'PUT'
    );

    expect(putCall).toBeDefined();

    const [putUrl, putOpts] = putCall as [string, RequestInit];
    expect(putUrl).not.toContain('@');
    expect((putOpts.headers as Record<string, string>).Authorization).toBe(
      'Basic ' + Buffer.from('admin:legal_ai_pass').toString('base64')
    );
  });

  // ── 8. Multiple entries — batch Neo4j write ───────────────────────────────

  it('multiple entries with cluster matches: Neo4j edges created for each', async () => {
    mockPoolQuery.mockImplementation((sql: string) => {
      if (sql.includes('cluster_summaries')) {
        return Promise.resolve({
          rows: [
            makeClusterRow(1, 'src/lib/server/cache/redis.ts'),
            makeClusterRow(2, 'src/lib/server/ai/gemma4-agent.ts'),
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await ingestDirectorySummaries([
      makeEntry({ rel: 'src/lib/server/cache' }),
      makeEntry({ rel: 'src/lib/server/ai' }),
    ]);

    expect(result.directoriesProcessed).toBe(2);
    expect(result.wikiNotesWritten).toBe(2);
    // Each dir matched 1 cluster → 2 Neo4j edges total
    expect(result.neo4jEdgesCreated).toBe(2);

    const clusterSummaryQueryCount = mockPoolQuery.mock.calls.filter(([sql]: [string]) =>
      sql.includes('FROM cluster_summaries')
    ).length;
    expect(clusterSummaryQueryCount).toBe(1);
  });
});
