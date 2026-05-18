// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { mockReadFile, mockExistsSync, mockIngestDirectorySummaries } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockExistsSync: vi.fn(),
  mockIngestDirectorySummaries: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: mockReadFile };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: mockExistsSync };
});

vi.mock('$lib/server/indexer/directory-summarizer.js', () => ({
  ingestDirectorySummaries: (...args: unknown[]) => mockIngestDirectorySummaries(...args),
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    keys: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
  }),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    QDRANT_URL: 'http://localhost:6333',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.ts';

describe('/api/codebase-index/summarize-dirs', () => {
  let GET: (typeof import('../../src/routes/api/codebase-index/summarize-dirs/+server.js'))['GET'];
  let POST: (typeof import('../../src/routes/api/codebase-index/summarize-dirs/+server.js'))['POST'];

  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Mock Qdrant fetch to return SOM coordinates for test directories
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: {
        points: [
          { payload: { file_path: 'src/lib/server/cache/redis-exact-match.ts', som_cluster: 1, som_bmu_row: 0, som_bmu_col: 0 } },
          { payload: { file_path: 'src/routes/api/codebase-index/summarize-dirs/+server.ts', som_cluster: 2, som_bmu_row: 1, som_bmu_col: 1 } },
        ],
        next_page_offset: null,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({
      mode: 'fast',
      fileCount: 3,
      createdAt: '2026-05-04T12:00:00.000Z',
      files: [
        {
          rel: 'src/lib/server/cache/redis-exact-match.ts',
          tags: ['db', 'cache'],
          summary: 'Cache helper',
          routeHandlers: [],
          todos: [],
          isRoute: false,
        },
        {
          rel: 'src/routes/api/codebase-index/summarize-dirs/+server.ts',
          tags: ['route', 'auth'],
          summary: 'Route handler',
          routeHandlers: ['GET', 'POST'],
          todos: [],
          isRoute: true,
        },
        {
          rel: 'src/routes/api/codebase-index/summarize-dirs/helper.ts',
          tags: ['route'],
          summary: 'Helper',
          routeHandlers: [],
          todos: [],
          isRoute: false,
        },
      ],
    }));

    mockIngestDirectorySummaries.mockResolvedValue({
      directoriesProcessed: 2,
      wikiNotesWritten: 2,
      neo4jEdgesCreated: 1,
      communityRowsUpserted: 1,
      webSearchTriggered: 0,
      errors: [],
    });

    const mod = await import('../../src/routes/api/codebase-index/summarize-dirs/+server.js');
    GET = mod.GET;
    POST = mod.POST;
  });

  it('returns 401 when POST is unauthenticated', async () => {
    const event = makeEvent({
      method: 'POST',
      url: '/api/codebase-index/summarize-dirs',
    });

    const res = await POST(event as never);
    expect(res.status).toBe(401);
  });

  it('returns 424 when the graph json is missing', async () => {
    mockExistsSync.mockReturnValue(false);

    const event = makeAuthEvent({
      method: 'POST',
      url: '/api/codebase-index/summarize-dirs',
    });

    const res = await POST(event as never);
    expect(res.status).toBe(424);

    const body = await responseJson<Record<string, unknown>>(res);
    expect(body.error).toMatch('Fast AST graph not found');
  });

  it('returns 422 when the graph json has no files', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ files: [] }));

    const event = makeAuthEvent({
      method: 'POST',
      url: '/api/codebase-index/summarize-dirs',
    });

    const res = await POST(event as never);
    expect(res.status).toBe(422);
  });

  it('groups graph files into directory outputs and forwards them to the ingester', async () => {
    const event = makeAuthEvent({
      method: 'POST',
      url: '/api/codebase-index/summarize-dirs',
    });

    const res = await POST(event as never);
    expect(res.status).toBe(200);

    const body = await responseJson<Record<string, unknown>>(res);
    expect(body).toMatchObject({
      directoriesFound: 2,
    });
    expect(body).toHaveProperty('success', true);

    expect(mockIngestDirectorySummaries).toHaveBeenCalledTimes(1);
    expect(mockIngestDirectorySummaries).toHaveBeenCalledWith([
      expect.objectContaining({
        rel: 'src/lib/server/cache',
        score: 60,
        metrics: expect.objectContaining({ fileCount: 1, tsErrors: 0, apiCount: 0 }),
        ragSummary: 'src/lib/server/cache/redis-exact-match.ts',
      }),
      expect.objectContaining({
        rel: 'src/routes/api/codebase-index/summarize-dirs',
        score: 80,
        metrics: expect.objectContaining({ fileCount: 2, tsErrors: 0, apiCount: 2 }),
        ragSummary: expect.stringContaining('src/routes/api/codebase-index/summarize-dirs/+server.ts'),
      }),
    ]);
  });

  it('reports GET readiness from the graph json metadata', async () => {
    const event = makeAuthEvent({
      method: 'GET',
      url: '/api/codebase-index/summarize-dirs',
    });

    const res = await GET(event as never);
    expect(res.status).toBe(200);

    const body = await responseJson<Record<string, unknown>>(res);
    expect(body).toMatchObject({
      ready: true,
      mode: 'fast',
      fileCount: 3,
      createdAt: '2026-05-04T12:00:00.000Z',
    });
    expect(String(body.graphJsonPath)).toContain('docs');
  });
});