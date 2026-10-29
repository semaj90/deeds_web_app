import { afterEach, describe, expect, it, vi } from 'vitest';

const { getNeo4jDriver, sessionRun, sessionClose, redisPing } = vi.hoisted(() => ({
  getNeo4jDriver: vi.fn(),
  sessionRun: vi.fn(),
  sessionClose: vi.fn(),
  redisPing: vi.fn(),
}));

vi.mock('$lib/server/neo4j-driver.js', () => ({ getNeo4jDriver }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => ({ ping: redisPing }) }));
vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    QDRANT_URL: 'http://qdrant.test',
    OLLAMA_BASE_URL: 'http://ollama.test',
  },
}));

import { GET } from './+server.js';

describe('GET /api/admin/atlas/health', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests before probing services', async () => {
    const response = await GET({ locals: {} } as never);

    expect(response.status).toBe(401);
    expect(getNeo4jDriver).not.toHaveBeenCalled();
  });

  it('uses the shared Neo4j driver and closes its session', async () => {
    redisPing.mockResolvedValue('PONG');
    sessionRun.mockResolvedValue({ records: [{ get: () => ({ toNumber: () => 12 }) }] });
    sessionClose.mockResolvedValue(undefined);
    getNeo4jDriver.mockReturnValue({ session: () => ({ run: sessionRun, close: sessionClose }) });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/collections')
        ? new Response(JSON.stringify({ result: { collections: [] } }), { status: 200 })
        : new Response(JSON.stringify({ models: [] }), { status: 200 }),
    ));

    const response = await GET({ locals: { user: { id: 'tester' } } } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.neo4j).toMatchObject({ ok: true, nodeCount: 12 });
    expect(getNeo4jDriver).toHaveBeenCalledTimes(1);
    expect(sessionClose).toHaveBeenCalledTimes(1);
  });

  it('reports missing Neo4j credentials as an unavailable dependency', async () => {
    redisPing.mockResolvedValue('PONG');
    getNeo4jDriver.mockImplementation(() => {
      throw new Error('NEO4J_PASSWORD_REQUIRED');
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/collections')
        ? new Response(JSON.stringify({ result: { collections: [] } }), { status: 200 })
        : new Response(JSON.stringify({ models: [] }), { status: 200 }),
    ));

    const response = await GET({ locals: { user: { id: 'tester' } } } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.neo4j).toMatchObject({ ok: false, detail: 'Error: NEO4J_PASSWORD_REQUIRED' });
    expect(sessionRun).not.toHaveBeenCalled();
  });
});
