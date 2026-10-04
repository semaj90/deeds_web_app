// @vitest-environment node
/**
 * Hermetic tests for GET /api/health/ready readiness fields (DB-READY-TESTS-01).
 * Everything but the route logic is mocked; Postgres is the only required service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('$lib/server/db/client', () => ({ db: { execute } }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => ({ ping: async () => 'PONG' }) }));
vi.mock('$lib/server/env.server.js', () => ({
  ENV: { OLLAMA_BASE_URL: 'http://ollama.test', QDRANT_URL: 'http://qdrant.test', TURBOVEC_SIDECAR: 'http://tv.test' },
}));
vi.mock('$lib/server/ollama.js', () => ({ ollamaFetch: vi.fn(async () => ({ ok: true })) }));
vi.mock('$lib/server/runtime-profile.js', () => {
  const svc = (state: string) => ({ state, rationale: 'test' });
  return {
    getParentAtlasRuntimeProfileManifest: () => ({
      profile: 'test',
      source: 'test',
      manifestVersion: 'test',
      features: {},
      notes: [],
      services: {
        postgres: svc('required'),
        redis: svc('disabled'),
        qdrant: svc('disabled'),
        neo4j: svc('disabled'),
        ollama: svc('optional'),
        engram_embed: svc('disabled'),
      },
    }),
  };
});

type Handler = (evt: { locals: Record<string, unknown> }) => Promise<Response>;
let GET: Handler;
const authed = { locals: { user: { id: '1' } } };

beforeEach(async () => {
  execute.mockReset();
  GET = (await import('../../../routes/api/health/ready/+server.js')).GET as unknown as Handler;
});

describe('GET /api/health/ready', () => {
  it('401 without a user', async () => {
    const res = await GET({ locals: {} });
    expect(res.status).toBe(401);
    expect((await res.json()).ready).toBe(false);
  });

  it('200 ready when Postgres is healthy', async () => {
    execute.mockResolvedValue([{ '?column?': 1 }]);
    const res = await GET(authed);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.services.postgres.readiness).toMatchObject({ state: 'healthy', retryable: false });
    expect(res.headers.get('Retry-After')).toBeNull();
  });

  it('503 + Retry-After: 5 while Postgres is starting (57P03), reported as starting not unavailable', async () => {
    execute.mockRejectedValue(Object.assign(new Error('the database system is starting up'), { code: '57P03' }));
    const res = await GET(authed);
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(body.ready).toBe(false);
    expect(body.checks.db).toBe(false);
    expect(body.services.postgres.readiness).toMatchObject({ state: 'starting', reason: 'STARTING_UP', retryable: true });
  });

  it('503 without Retry-After for a real outage (auth failure)', async () => {
    execute.mockRejectedValue(Object.assign(new Error('password authentication failed'), { code: '28P01' }));
    const res = await GET(authed);
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBeNull();
    expect(body.services.postgres.readiness).toMatchObject({ state: 'unavailable', retryable: false });
  });
});
