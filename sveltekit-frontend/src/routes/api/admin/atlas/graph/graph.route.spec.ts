import { afterEach, describe, expect, it, vi } from 'vitest';

const { getNeo4jDriver, sessionRun, sessionClose, hgetall } = vi.hoisted(() => ({
  getNeo4jDriver: vi.fn(),
  sessionRun: vi.fn(),
  sessionClose: vi.fn(),
  hgetall: vi.fn(),
}));

vi.mock('$lib/server/neo4j-driver.js', () => ({ getNeo4jDriver }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => ({ hgetall }) }));

import { GET } from './+server.js';

const event = (authenticated: boolean) => ({
  locals: authenticated ? { user: { id: 'tester' } } : {},
  url: new URL('http://local.test/api/admin/atlas/graph'),
}) as never;

describe('GET /api/admin/atlas/graph', () => {
  afterEach(() => vi.clearAllMocks());

  it('rejects unauthenticated requests before reading Redis', async () => {
    const response = await GET(event(false));

    expect(response.status).toBe(401);
    expect(hgetall).not.toHaveBeenCalled();
    expect(getNeo4jDriver).not.toHaveBeenCalled();
  });

  it('uses the shared Neo4j driver and closes the session', async () => {
    hgetall.mockResolvedValue({
      'src/a.ts': JSON.stringify({ pr: 0.8, attn: 0.7, authority: 0.6, blend: 0.9 }),
    });
    sessionRun.mockResolvedValue({ records: [{ get: (key: string) => ({ src: 'src/a.ts', tgt: 'src/b.ts', rel: 'IMPORTS' })[key] }] });
    sessionClose.mockResolvedValue(undefined);
    getNeo4jDriver.mockReturnValue({ session: () => ({ run: sessionRun, close: sessionClose }) });

    const response = await GET(event(true));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nodes).toHaveLength(1);
    expect(body.edges).toEqual([{ source: 'src/a.ts', target: 'src/b.ts', type: 'IMPORTS' }]);
    expect(getNeo4jDriver).toHaveBeenCalledTimes(1);
    expect(sessionClose).toHaveBeenCalledTimes(1);
  });

  it('returns score nodes without graph edges when Neo4j credentials are missing', async () => {
    hgetall.mockResolvedValue({
      'src/a.ts': JSON.stringify({ pr: 0.8, attn: 0.7, authority: 0.6, blend: 0.9 }),
    });
    getNeo4jDriver.mockImplementation(() => {
      throw new Error('NEO4J_PASSWORD_REQUIRED');
    });

    const response = await GET(event(true));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nodes).toHaveLength(1);
    expect(body.edges).toEqual([]);
    expect(sessionRun).not.toHaveBeenCalled();
  });
});
