// @vitest-environment node
/**
 * codeintel-clusters-post.test.ts
 *
 * Covers POST /api/codeintel/clusters/[id] (re-summarize):
 *   1. Auth guard returns { ok, item, degraded, error } shape
 *   2. Bad cluster id guard returns same shape
 *   3. DB chunk fetch failure → degraded shape, no raw error
 *   4. No chunks found → degraded shape
 *   5. Ollama failure → degraded shape, no raw Ollama error
 *   6. DB upsert failure → degraded shape, no raw DB error
 *   7. Happy path → success shape with item populated
 *   8. All paths carry the same top-level keys
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const { mockDbExecute, mockFetch } = vi.hoisted(() => {
  const mockDbExecute = vi.fn();
  const mockFetch = vi.fn();
  return { mockDbExecute, mockFetch };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/db/client', () => ({
  db: { execute: mockDbExecute },
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://localhost:11434',
  },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  clusterSummaries: {
    id: 'id',
    repoId: 'repo_id',
    gpuCluster: 'gpu_cluster',
    summary: 'summary',
    purpose: 'purpose',
    patterns: 'patterns',
    warnings: 'warnings',
    tags: 'tags',
    memberCount: 'member_count',
    representativeChunkIds: 'representative_chunk_ids',
    summaryModel: 'summary_model',
    centroidDistanceMean: 'centroid_distance_mean',
  },
}));

// ── constants ─────────────────────────────────────────────────────────────────

/** All POST responses MUST carry exactly these top-level keys. */
const POST_SHAPE_KEYS = ['ok', 'item', 'degraded', 'error'] as const;

/** Strings that must NEVER appear in public error fields. */
const FORBIDDEN_LEAK_PATTERNS = [
  /ECONNREFUSED/i,
  /password/i,
  /stack:/i,
  /at Object\./i,
  /Error:/i,
  /DATABASE_URL/i,
  /localhost:\d{4,5}/i,
  /127\.0\.0\.1/i,
];

// ── helpers ───────────────────────────────────────────────────────────────────

function assertShape(body: Record<string, unknown>) {
  for (const key of POST_SHAPE_KEYS) {
    expect(body, `Missing top-level key "${key}"`).toHaveProperty(key);
  }
  // No extra keys beyond the four allowed
  const extra = Object.keys(body).filter(k => !(POST_SHAPE_KEYS as readonly string[]).includes(k));
  expect(extra, `Unexpected extra keys in response: ${extra.join(', ')}`).toHaveLength(0);
}

function assertNoLeak(errorField: unknown) {
  if (typeof errorField !== 'string') return;
  for (const pattern of FORBIDDEN_LEAK_PATTERNS) {
    expect(errorField, `Raw error leaked to public field`).not.toMatch(pattern);
  }
}

function makeRequest(clusterId: string | number, body: Record<string, unknown> = {}) {
  return {
    params: { id: String(clusterId) },
    request: {
      json: () => Promise.resolve(body),
    },
    locals: { user: { id: 'user-1' } },
  } as any;
}

function makeUnauthedRequest(clusterId: string | number) {
  return {
    params: { id: String(clusterId) },
    request: { json: () => Promise.resolve({}) },
    locals: { user: null },
  } as any;
}

/** A chunk row shape matching what the DB returns. */
function makeChunkRow(symbol = 'handleFoo', kind = 'function', path = 'src/foo.ts', content = 'export function handleFoo() { return 1; }') {
  return { symbol, kind, relative_path: path, content };
}

function makeOllamaGenOk(summaryText: string) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ response: summaryText }),
  } as unknown as Response);
}

function makeOllamaEmbedOk(vec: number[]) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ embeddings: [vec] }),
  } as unknown as Response);
}

function makeOllamaDown() {
  return Promise.reject(new Error('ECONNREFUSED 127.0.0.1:11434'));
}

// ── lazy handler import ───────────────────────────────────────────────────────

let POST: (event: any) => Promise<Response>;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('fetch', mockFetch);
  mockDbExecute.mockReset();
  mockFetch.mockReset();

  const mod = await import(
    '../../src/routes/api/codeintel/clusters/[id]/+server.js'
  );
  POST = mod.POST;
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/codeintel/clusters/[id] — shape contract', () => {
  it('401 unauthenticated — same top-level shape, degraded false', async () => {
    const res = await POST(makeUnauthedRequest(3));
    expect(res.status).toBe(401);
    const body = await res.json();
    assertShape(body);
    expect(body.ok).toBe(false);
    expect(body.item).toBeNull();
    expect(body.degraded).toBe(false);
    assertNoLeak(body.error);
  });

  it('400 invalid cluster id — same top-level shape', async () => {
    const res = await POST(makeRequest('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    assertShape(body);
    expect(body.ok).toBe(false);
    expect(body.degraded).toBe(false);
  });

  it('207 DB chunk fetch failure — degraded shape, no raw DB error leaked', async () => {
    mockDbExecute.mockRejectedValueOnce(
      new Error('connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: ENOENT')
    );

    const res = await POST(makeRequest(5));
    expect(res.status).toBe(207);
    const body = await res.json();
    assertShape(body);
    expect(body.ok).toBe(false);
    expect(body.degraded).toBe(true);
    expect(body.item).toBeNull();
    assertNoLeak(body.error);
    // Must not contain socket path or connection string
    expect(body.error).not.toMatch(/PGSQL|ENOENT|socket/i);
  });

  it('207 no chunks found for cluster — degraded shape', async () => {
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    const res = await POST(makeRequest(7));
    expect(res.status).toBe(207);
    const body = await res.json();
    assertShape(body);
    expect(body.ok).toBe(false);
    expect(body.degraded).toBe(true);
    expect(body.item).toBeNull();
    assertNoLeak(body.error);
  });

  it('207 Ollama generate failure — degraded shape, no raw Ollama error leaked', async () => {
    mockDbExecute.mockResolvedValueOnce({
      rows: [makeChunkRow(), makeChunkRow('parseDoc', 'function', 'src/parse.ts', 'export function parseDoc() {}')],
    });
    mockFetch.mockImplementationOnce(() => makeOllamaDown());

    const res = await POST(makeRequest(2));
    expect(res.status).toBe(207);
    const body = await res.json();
    assertShape(body);
    expect(body.ok).toBe(false);
    expect(body.degraded).toBe(true);
    expect(body.item).toBeNull();
    assertNoLeak(body.error);
    expect(body.error).not.toMatch(/ECONNREFUSED/i);
  });

  it('207 DB upsert failure — degraded shape, no raw DB message leaked', async () => {
    mockDbExecute.mockResolvedValueOnce({
      rows: [makeChunkRow()],
    });
    // Ollama generate succeeds
    mockFetch.mockImplementationOnce(() =>
      makeOllamaGenOk('{"summary":"cluster does X","purpose":"handles X","patterns":[],"warnings":[],"tags":[]}')
    );
    // Ollama embed succeeds
    mockFetch.mockImplementationOnce(() =>
      makeOllamaEmbedOk(new Array(768).fill(0.1))
    );
    // DB upsert fails
    mockDbExecute.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "cluster_summaries_pkey"')
    );

    const res = await POST(makeRequest(4));
    expect(res.status).toBe(207);
    const body = await res.json();
    assertShape(body);
    expect(body.ok).toBe(false);
    expect(body.degraded).toBe(true);
    expect(body.item).toBeNull();
    assertNoLeak(body.error);
    expect(body.error).not.toMatch(/duplicate key|constraint|pkey/i);
  });

  it('200 happy path — success shape with item populated, no error', async () => {
    const summaryText = '{"summary":"handles auth flows","purpose":"auth layer","patterns":["middleware"],"warnings":[],"tags":["auth"]}';

    mockDbExecute.mockResolvedValueOnce({
      rows: [
        makeChunkRow('verifyJwt', 'function', 'src/auth.ts', 'export function verifyJwt(token: string) {}'),
        makeChunkRow('requireAuth', 'function', 'src/auth.ts', 'export function requireAuth(locals: App.Locals) {}'),
      ],
    });
    // Ollama generate
    mockFetch.mockImplementationOnce(() => makeOllamaGenOk(summaryText));
    // Ollama embed
    mockFetch.mockImplementationOnce(() => makeOllamaEmbedOk(new Array(768).fill(0.05)));
    // DB upsert
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    const res = await POST(makeRequest(1, { model: 'gemma4-rotorquant:latest-fast:latest', repoId: 'default' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    assertShape(body);
    expect(body.ok).toBe(true);
    expect(body.degraded).toBe(false);
    expect(body.error).toBeNull();
    // item must be populated
    expect(body.item).not.toBeNull();
    expect(body.item).toHaveProperty('gpuCluster', 1);
    expect(body.item).toHaveProperty('summary', summaryText);
    expect(body.item).toHaveProperty('summaryModel', 'gemma4-rotorquant:latest-fast:latest');
    expect(body.item).toHaveProperty('hasSummaryEmbedding', true);
  });

  it('200 happy path — hasSummaryEmbedding false when embed returns wrong dims', async () => {
    const summaryText = 'short summary text';

    mockDbExecute.mockResolvedValueOnce({ rows: [makeChunkRow()] });
    mockFetch.mockImplementationOnce(() => makeOllamaGenOk(summaryText));
    // embed returns 256-dim (wrong) — should be non-fatal
    mockFetch.mockImplementationOnce(() => makeOllamaEmbedOk(new Array(256).fill(0.1)));
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    const res = await POST(makeRequest(9));
    expect(res.status).toBe(200);
    const body = await res.json();
    assertShape(body);
    expect(body.ok).toBe(true);
    expect(body.item.hasSummaryEmbedding).toBe(false);
  });

  it('200 happy path — hasSummaryEmbedding false when embed call throws (non-fatal)', async () => {
    mockDbExecute.mockResolvedValueOnce({ rows: [makeChunkRow()] });
    mockFetch.mockImplementationOnce(() => makeOllamaGenOk('summary text'));
    // embed throws (non-fatal)
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error('embed timeout')));
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    const res = await POST(makeRequest(10));
    expect(res.status).toBe(200);
    const body = await res.json();
    assertShape(body);
    expect(body.ok).toBe(true);
    expect(body.item.hasSummaryEmbedding).toBe(false);
  });
});
