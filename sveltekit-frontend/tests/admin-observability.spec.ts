// @vitest-environment node
/**
 * Observability endpoint contract tests.
 * Verifies shape + safety invariants without hitting live services.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock external I/O so tests run offline ────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  statSync: vi.fn(() => ({ mtimeMs: Date.now() - 3_600_000 })),
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: vi.fn(() => ({
    ping: () => Promise.resolve('PONG'),
    keys: () => Promise.resolve([]),
    exists: () => Promise.resolve(0),
  })),
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: {
    execute: () => Promise.resolve([{ ok: 1 }]),
  },
}));

vi.mock('drizzle-orm', () => ({ sql: (t: TemplateStringsArray) => t.join('') }));

// ── lazy-import handler ───────────────────────────────────────────────────────

let GET: (event: { locals: { user?: unknown } }) => Promise<Response>;

beforeEach(async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: false, status: 503, json: async () => ({}) })
  );
  ({ GET } = await import('../src/routes/api/admin/observability/+server.js'));
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('observability API shape', () => {
  it('returns ok JSON even when all services fail', async () => {
    const res = await GET({ locals: { user: { id: 'u1' } } });
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty('services');
    expect(body).toHaveProperty('graphify');
    expect(body).toHaveProperty('ace');
    expect(body).toHaveProperty('synthesisMemory');
    expect(body).toHaveProperty('generatedAt');
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await GET({ locals: {} });
    expect(res.status).toBe(401);
  });
});

describe('no write actions exposed', () => {
  it('GET handler is the only export', async () => {
    const mod = await import('../src/routes/api/admin/observability/+server.js');
    const keys = Object.keys(mod);
    expect(keys).toContain('GET');
    expect(keys).not.toContain('POST');
    expect(keys).not.toContain('PUT');
    expect(keys).not.toContain('PATCH');
    expect(keys).not.toContain('DELETE');
  });
});

describe('graphify file detection', () => {
  it('reports codebaseGraphExists based on existsSync result', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(false);
    const res = await GET({ locals: { user: { id: 'u1' } } });
    const body = await res.json() as { graphify: { codebaseGraphExists: boolean } };
    expect(body.graphify.codebaseGraphExists).toBe(false);
  });
});

describe('missing rerank_breakdown handling', () => {
  it('reports missingColumns as empty array when count is non-zero', async () => {
    const res = await GET({ locals: { user: { id: 'u1' } } });
    const body = await res.json() as { qdrantFeedback: { missingColumns: string[] } };
    // codebaseChunkCount is null (service down) → no missing column warning
    expect(Array.isArray(body.qdrantFeedback.missingColumns)).toBe(true);
  });
});

describe('ace Redis stats', () => {
  it('includes aceTopkCachedQueries and aceHitsCachedQueries fields', async () => {
    const res = await GET({ locals: { user: { id: 'u1' } } });
    const body = await res.json() as { ace: Record<string, unknown> };
    expect(body.ace).toHaveProperty('aceTopkCachedQueries');
    expect(body.ace).toHaveProperty('aceHitsCachedQueries');
    expect(typeof body.ace.aceTopkCachedQueries).toBe('number');
  });
});
