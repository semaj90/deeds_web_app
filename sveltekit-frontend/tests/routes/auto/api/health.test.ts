// @vitest-environment node
/**
 * ENHANCED TEST — verifies Auth, Zod validation, and Unified Health reporting.
 *
 * Route: src/routes/api/health/+server.ts
 * Handlers: GET
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';

const { mockBreakers, mockEnv, mockDb, mockGrpc } = vi.hoisted(() => ({
  mockBreakers: {
    ollama: { getStatus: vi.fn().mockReturnValue({ state: 'CLOSED' }) },
    qdrant: { getStatus: vi.fn().mockReturnValue({ state: 'CLOSED' }) },
    redis: { getStatus: vi.fn().mockReturnValue({ state: 'CLOSED' }) },
    events: []
  },
  mockEnv: {
    OLLAMA_BASE_URL: 'http://ollama',
    QDRANT_URL: 'http://qdrant',
    TENSORRT_URL: 'http://trt',
    TRITON_URL: 'http://triton',
    LANGEXTRACT_URL: 'http://lang',
    QUIC_HEALTH_URL: 'http://quic',
    GO_SEARCH_URL: 'http://go',
    RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
    COUCHDB_URL: 'http://couch',
    NEO4J_URI: 'bolt://localhost:7687',
    NATS_URL: 'nats://localhost:4222',
    MINIO_ENDPOINT: 'localhost',
    EMBEDDING_GRPC_ENABLED: true,
    EMBEDDING_GRPC_URL: 'localhost:50051',
    EMBEDDING_QUIC_ENABLED: false
  },
  mockDb: {
    pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
    db: { 
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue([])
        }))
      }))
    }
  },
  mockGrpc: {
    checkGrpcHealth: vi.fn().mockResolvedValue({ available: true, enabled: true })
  }
}));

vi.mock('$lib/server/circuit-breaker.js', () => ({
  ollamaBreaker: mockBreakers.ollama,
  qdrantBreaker: mockBreakers.qdrant,
  redisBreaker: mockBreakers.redis,
  breakerEventLog: mockBreakers.events
}));

vi.mock('$lib/server/env.server.ts', () => ({
  ENV: mockEnv,
  SEAWEED_MASTER_PORT: 9333
}));

vi.mock('$lib/server/db/client', () => ({
  pool: mockDb.pool,
  db: mockDb.db
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  serviceCapabilities: { serviceName: 'serviceName' }
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  checkGrpcHealth: mockGrpc.checkGrpcHealth
}));

vi.mock('$lib/server/embedding/embed.js', () => ({
  getInFlightCount: vi.fn().mockReturnValue(0)
}));

vi.mock('$lib/server/cache-metrics.js', () => ({
  cacheMetrics: { snapshot: vi.fn().mockReturnValue({}) }
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn()
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn().mockReturnValue('PONG')
}));

// Mock fetch globally
const globalFetch = vi.fn();
vi.stubGlobal('fetch', globalFetch);

describe('src/routes/api/health/+server.ts', () => {
  let handler: any;
  const mockUser = { id: 1, email: 'admin@deeds.ai' };

  beforeEach(async () => {
    vi.resetAllMocks();
    globalFetch.mockResolvedValue({ ok: true });
    vi.mocked(execFileSync).mockReturnValue('PONG');
    
    // Re-establish implementations
    mockGrpc.checkGrpcHealth.mockResolvedValue({ available: true, enabled: true });
    mockDb.pool.query.mockResolvedValue({ rows: [] });
    mockBreakers.ollama.getStatus.mockReturnValue({ state: 'CLOSED' });
    mockBreakers.qdrant.getStatus.mockReturnValue({ state: 'CLOSED' });
    mockBreakers.redis.getStatus.mockReturnValue({ state: 'CLOSED' });

    mockDb.db.update.mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue([])
      }))
    }));

    const mod = await import('../../../../src/routes/api/health/+server.js') as any;
    handler = mod.GET;
  });

  function makeReq(searchParams: string = '') {
    return {
      request: new Request(`http://localhost/api/health?${searchParams}`),
      locals: { user: mockUser },
      url: new URL(`http://localhost/api/health?${searchParams}`),
      params: {}
    };
  }

  it('200 even if not logged in (public endpoint)', async () => {
    const resp = await handler({ ...makeReq(), locals: {} });
    expect(resp.status).toBe(200);
  });

  it('400 for invalid service query', async () => {
    const resp = await handler(makeReq('service=invalid'));
    expect(resp.status).toBe(400);
  });

  it('200 for individual service health (redis)', async () => {
    const resp = await handler(makeReq('service=redis'));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.service).toBe('redis');
    expect(body.ok).toBe(true);
  });

  it('200 for individual service health (database)', async () => {
    mockDb.pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const resp = await handler(makeReq('service=database'));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.service).toBe('database');
    expect(body.ok).toBe(true);
  });

  it('200 for full unified health report', async () => {
    // Setup fetch mocks for various probes
    globalFetch.mockResolvedValue({ ok: true });
    
    const resp = await handler(makeReq());
    expect(resp.status).toBe(200);
    
    const body = await resp.json();
    expect(body.status).toBe('healthy');
    expect(body.checks.ollama.ok).toBe(true);
    expect(body.checks.qdrant.ok).toBe(true);
    expect(body.checks.postgres.ok).toBe(true);
    expect(body.checks.redis.ok).toBe(true);
    expect(body.uptime).toBeTypeOf('number');
  });

  it('returns degraded status if core service is down', async () => {
    // Mock ollama down
    globalFetch.mockImplementation(async (url: string) => {
      if (url.includes('ollama')) return { ok: false };
      return { ok: true };
    });

    const resp = await handler(makeReq());
    expect(resp.status).toBe(200);
    
    const body = await resp.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.ollama.ok).toBe(false);
  });
});
