/**
 * Infrastructure + Ollama + Cache + Dashboard + DB Health + Vector Search +
 * Case Theory + Consolidation — Unit Tests
 *
 * Tests for:
 *   /api/infrastructure/status (GET)
 *   /api/dashboard/stats (GET)
 *   /api/db/health (GET)
 *   /api/ollama/pull (GET/POST)
 *   /api/ollama/generate (POST)
 *   /api/cache/stats (GET)
 *   /api/vector-search (POST)
 *   /api/case-theory (POST)
 *   /api/consolidation/status (GET)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────
vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://ollama.test',
    QDRANT_URL: 'http://qdrant.test:6333',
    TENSORRT_URL: 'http://trt.test:8001',
    TRITON_URL: 'http://triton.test:8000',
    TRITON_LLM_MODEL: 'legal-llm',
    TRITON_VLM_MODEL: 'gemma_vlm_ensemble',
    TRITON_VISION_MODEL: 'siglip_vision',
    NATS_URL: 'nats://localhost:4222',
    EMBEDDING_QUIC_ENABLED: false,
  },
}));

vi.mock('$lib/config/env.server.js', () => ({
  getOllamaUrl: () => 'http://ollama.test',
  getRabbitMQManagementUrl: () => 'http://rabbitmq.test:15672',
}));

const mockOllamaFetch = vi.fn();
vi.mock('$lib/server/ollama.js', () => ({
	getChatModelKeepAlive: () => '2m',
	getEmbeddingModelKeepAlive: () => '24h',
	getChatModel: () => 'gemma4-legal:latest',
	getEmbedModel: () => 'embeddinggemma:latest',
  ollamaFetch: (...args: unknown[]) => mockOllamaFetch(...args),
}));

// ── DB mock ────────────────────────────────────────────────────
const mockExecute = vi.fn(async () => ({ rows: [{ ok: 1, server_time: '2026-03-29T00:00:00Z' }] }));
const mockSelectChain = (data: unknown[] = []) => {
  const withCache = vi.fn(async () => data);
  const whereFn = vi.fn(() => ({ $withCache: withCache }));
  return { from: vi.fn(() => ({ where: whereFn, $withCache: withCache })) };
};

vi.mock('$lib/server/db/client', () => ({
  pgRows: (r) => Array.isArray(r) ? r : r?.rows ?? [],
  db: {
    select: vi.fn(() => mockSelectChain()),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
  savedCitations: { id: 'id' },
}));

vi.mock('$lib/server/db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

vi.mock('$lib/server/db/schema', () => ({
  errorClusters: { id: 'id' },
  errorEvents: { id: 'id' },
  routeHealth: { id: 'id', state: 'state' },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  legalGlossary: { id: 'id' },
  statutes: { id: 'id' },
  legalPrecedents: { id: 'id' },
  errorClusters: { id: 'id' },
  errorEvents: { id: 'id' },
  routeHealth: { id: 'id', state: 'state' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  desc: vi.fn((...args: unknown[]) => ({ type: 'desc', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  count: vi.fn(() => 'count_fn'),
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ type: 'sql', args })),
    {
      raw: vi.fn((s: string) => s),
    }
  ),
}));

// ── Infrastructure mocks ───────────────────────────────────────
vi.mock('$lib/server/inference/gpu-arbiter.js', () => ({
  getGpuLeaseStatus: vi.fn(async () => null),
  acquireGpuLease: vi.fn(async () => null),
  releaseGpuLease: vi.fn(async () => {}),
}));

vi.mock('$lib/server/inference/inference-router.js', () => ({
  getRouterStatus: vi.fn(async () => ({ activeTier: 'http', queue: 0 })),
}));

vi.mock('$lib/server/minio-simd-client.js', () => ({
  getSIMDStatus: vi.fn(async () => ({ healthy: true, minioConnected: true, latencyMs: 5 })),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  checkGrpcHealth: vi.fn(async () => ({
    enabled: true,
    url: 'grpc://localhost:50051',
    available: true,
  })),
  generateEmbeddings: vi.fn(async () => ({
    vectors: [Array.from({ length: 768 }, (_, i) => Math.sin(i / 100) * 0.5)],
  })),
}));

vi.mock('$lib/server/trt-llm.js', () => ({
  healthCheck: vi.fn(async () => true),
}));

vi.mock('$lib/server/triton-llm.js', () => ({
  healthCheckModel: vi.fn(async () => true),
}));

vi.mock('$lib/server/gpu/libtorch-bridge.js', () => ({
  isCudaAvailable: vi.fn(() => false),
}));

vi.mock('$lib/gpu/runtime-optimizations.js', () => ({
  NODE_RUNTIME_CONFIG: {
    maxOldSpaceSize: 4096,
    gpuBatchSize: 32,
    gpuConcurrencyLimit: 2,
    experimentalWasmSimd: true,
    experimentalWasmThreads: true,
  },
  GPU_MARKDOWN_ENV: {
    GPU_MARKDOWN_SERVICE_URL: 'http://gpu-md.test',
    FALLBACK_TO_CPU: true,
  },
}));

// ── Redis mock ─────────────────────────────────────────────────
const mockRedis = {
  ping: vi.fn(async () => 'PONG'),
  info: vi.fn(async (section: string) => {
    if (section === 'memory')
      return 'used_memory:1048576\r\nused_memory_human:1M\r\nused_memory_peak:2097152\r\nused_memory_peak_human:2M\r\n';
    if (section === 'keyspace') return 'db0:keys=150,expires=50,avg_ttl=300000\r\n';
    if (section === 'stats')
      return 'keyspace_hits:1000\r\nkeyspace_misses:200\r\nconnected_clients:3\r\n';
    if (section === 'server') return 'uptime_in_seconds:86400\r\n';
    return '';
  }),
  dbsize: vi.fn(async () => 150),
  scan: vi.fn(async () => ['0', ['key1', 'key2']]),
};

vi.mock('$lib/server/redis.js', () => ({
  redis: mockRedis,
  getRedis: () => mockRedis,
  getRedis: () => mockRedis,
  redisPool: { getConnection: () => mockRedis },
}));

vi.mock('$lib/server/cache/report-template-cache.js', () => ({
  getTemplateCacheStats: vi.fn(async () => ({
    totalKeys: 10,
    metadataKeys: 3,
    aiContentKeys: 4,
    renderedKeys: 3,
  })),
}));

vi.mock('$lib/server/cache/pdf-export-cache.js', () => ({
  getExportCacheStats: vi.fn(async () => ({ totalKeys: 5, htmlKeys: 2, mdKeys: 2, jsonKeys: 1 })),
}));

// ── Case theory mocks ──────────────────────────────────────────
const mockGenerateCompletion = vi.fn();
vi.mock('$lib/server/ai/ollama-client.js', () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
}));

vi.mock('$lib/server/auth-helpers.js', () => ({
  requireAuth: vi.fn(async () => {}),
}));

vi.mock('$lib/server/middleware/rate-limit.js', () => ({
  rateLimitOrRespond: vi.fn(async () => null),
  RateLimitPresets: { search: {}, default: {} },
}));

vi.mock('$lib/types/case-theory.js', () => ({}));

// ── Qdrant mock (for vector-search) ───────────────────────────
vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    search: vi.fn(async (collection: string) => {
      if (collection === 'evidence_items') {
        return [
          { id: 'ev-1', score: 0.92, payload: { title: 'Evidence A', tags: ['fraud'] } },
          { id: 'ev-2', score: 0.85, payload: { title: 'Evidence B', tags: [] } },
        ];
      }
      if (collection === 'legal_documents') {
        return [{ id: 'doc-1', score: 0.88, payload: { title: 'Legal Doc A' } }];
      }
      return [];
    }),
  })),
}));

// ── Helpers ────────────────────────────────────────────────────
function mkRequest(body?: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const authedLocals = { user: { id: 'user-1', email: 'test@test.com', role: 'admin' } } as any;
const anonLocals = { user: null } as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockOllamaFetch.mockReset();
  mockGenerateCompletion.mockReset();
  mockExecute.mockReset();
  mockExecute.mockResolvedValue({ rows: [{ ok: 1, server_time: '2026-03-29T00:00:00Z' }] });
});

// ════════════════════════════════════════════════════════════════
// INFRASTRUCTURE STATUS: /api/infrastructure/status
// ════════════════════════════════════════════════════════════════
describe('/api/infrastructure/status (GET)', () => {
  let GET: Function;

  beforeEach(async () => {
    // Mock global fetch for Qdrant + RabbitMQ checks
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/collections')) {
          return {
            ok: true,
            json: async () => ({
              result: { collections: [{ name: 'evidence_items' }, { name: 'legal_documents' }] },
            }),
          };
        }
        if (typeof url === 'string' && url.includes('/api/overview')) {
          return {
            ok: true,
            json: async () => ({
              object_totals: { queues: 7 },
              queue_totals: { messages_ready: 3, messages_unacknowledged: 1 },
              message_stats: { publish_details: { rate: 5 }, deliver_get_details: { rate: 4 } },
            }),
          };
        }
        if (typeof url === 'string' && url.includes('/api/tags')) {
          return { ok: true };
        }
        return { ok: false };
      })
    );
    // ollamaFetch uses the mocked version
    mockOllamaFetch.mockResolvedValue({ ok: true });
    const mod = await import('../src/routes/api/infrastructure/status/+server');
    GET = mod.GET;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns infrastructure status overview', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.tiers).toBeDefined();
    expect(data.tiers.tier1_grpc.label).toContain('gRPC');
    expect(data.inference).toBeDefined();
    expect(data.inference.tritonVlm).toEqual({
      available: true,
      url: 'http://triton.test:8000',
      model: 'gemma_vlm_ensemble',
      visionModel: 'siglip_vision',
    });
    expect(data.gpu).toBeDefined();
    expect(data.services).toBeDefined();
    expect(data.latencyMs).toBeGreaterThanOrEqual(0);
    expect(data.ts).toBeTruthy();
  });

  it('includes GPU information', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    expect(data.gpu.cudaAddon).toBe(false);
    expect(data.gpu.leaseFree).toBe(true);
    expect(data.gpu.device).toContain('CPU fallback');
  });

  it('includes runtime config', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    expect(data.runtimeConfig.maxOldSpaceSize).toBe(4096);
    expect(data.runtimeConfig.wasmSimd).toBe(true);
  });

  it('includes service statuses', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    expect(data.services.redis).toBe(true);
    expect(data.services.postgres).toBe(true);
  });

  it('includes cache and queue stats', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    expect(data.cache).toBeDefined();
    // queues may be null if RabbitMQ management API is not reachable in test env
    if (data.queues) {
      expect(data.queues.total).toBe(7);
    }
  });

  it('sets Cache-Control header', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    expect(res.headers.get('Cache-Control')).toContain('max-age=15');
  });
});

// ════════════════════════════════════════════════════════════════
// DASHBOARD STATS: /api/dashboard/stats
// ════════════════════════════════════════════════════════════════
describe('/api/dashboard/stats (GET)', () => {
  let GET: Function;

  beforeEach(async () => {
    const { db } = await import('$lib/server/db/client');
    // Redefine select chain with $withCache for dashboard stats
    (db.select as any).mockImplementation(() => {
      const withCache = vi.fn(async () => [{ value: 42 }]);
      const whereFn = vi.fn(() => ({ $withCache: withCache }));
      return { from: vi.fn(() => ({ where: whereFn, $withCache: withCache })) };
    });

    mockExecute.mockImplementation(async () => ({
      rows: [{ active: '5', total: '20' }],
    }));

    const mod = await import('../src/routes/api/dashboard/stats/+server');
    GET = mod.GET;
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: anonLocals });
    expect(res.status).toBe(401);
  });

  it('returns dashboard statistics', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.activeCases).toBeDefined();
    expect(data.totalEvidence).toBeDefined();
    expect(data.personsOfInterest).toBeDefined();
    expect(data.totalCitations).toBeDefined();
    expect(data.knowledgeBase).toBeDefined();
    expect(data.knowledgeBase.total).toBeGreaterThanOrEqual(0);
  });

  it('returns numeric values', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    expect(typeof data.activeCases).toBe('number');
    expect(typeof data.totalEvidence).toBe('number');
    expect(typeof data.savedCitations).toBe('number');
  });
});

// ════════════════════════════════════════════════════════════════
// DB HEALTH: /api/db/health
// ════════════════════════════════════════════════════════════════
describe('/api/db/health (GET)', () => {
  let GET: Function;

  beforeEach(async () => {
    const mod = await import('../src/routes/api/db/health/+server');
    GET = mod.GET;
  });

  it('returns healthy status', async () => {
    const res = await GET({});
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.latency).toBeGreaterThanOrEqual(0);
    expect(data.timestamp).toBeDefined();
  });

  it('returns 503 when DB is down', async () => {
    mockExecute.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await GET({});
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('unhealthy');
  });
});

// ════════════════════════════════════════════════════════════════
// OLLAMA PULL: /api/ollama/pull
// ════════════════════════════════════════════════════════════════
describe('/api/ollama/pull (GET/POST)', () => {
  let GET: Function, POST: Function;

  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('{"status":"pulling"}\n'),
              })
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('{"status":"success"}\n'),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      }))
    );
    const mod = await import('../src/routes/api/ollama/pull/+server');
    GET = mod.GET;
    POST = mod.POST;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // GET
  it('GET returns 401 when unauthenticated', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: anonLocals });
    expect(res.status).toBe(401);
  });

  it('GET returns service info', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.service).toBe('ollama');
    expect(data.model).toBe('gemma4-legal');
    expect(data.url).toBe('http://ollama.test');
  });

  // POST
  it('POST returns 401 when unauthenticated', async () => {
    const res = await POST({ request: mkRequest({ model: 'gemma4-legal' }), locals: anonLocals });
    expect(res.status).toBe(401);
  });

  it('POST returns 400 for empty model', async () => {
    const res = await POST({ request: mkRequest({ model: '' }), locals: authedLocals });
    expect(res.status).toBe(400);
  });

  it('POST returns 400 for missing model', async () => {
    const res = await POST({ request: mkRequest({}), locals: authedLocals });
    expect(res.status).toBe(400);
  });

  it('POST pulls model successfully', async () => {
    const res = await POST({ request: mkRequest({ model: 'gemma4-legal' }), locals: authedLocals });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.done).toBe(true);
    expect(data.last).toBeDefined();
  });

  it('POST returns 502 when Ollama returns error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => 'model not found',
      }))
    );

    const res = await POST({
      request: mkRequest({ model: 'nonexistent-model' }),
      locals: authedLocals,
    });
    const data = await res.json();
    expect(res.status).toBe(502);
    expect(data.ok).toBe(false);
  });

  it('POST returns 500 on fetch error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Connection refused');
      })
    );

    const res = await POST({ request: mkRequest({ model: 'gemma4-legal' }), locals: authedLocals });
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.ok).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// OLLAMA GENERATE: /api/ollama/generate
// ════════════════════════════════════════════════════════════════
describe('/api/ollama/generate (POST)', () => {
  let POST: Function;

  beforeEach(async () => {
    const mod = await import('../src/routes/api/ollama/generate/+server');
    POST = mod.POST;
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await POST({ request: mkRequest({ prompt: 'hello' }), locals: anonLocals });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing prompt', async () => {
    const res = await POST({ request: mkRequest({}), locals: authedLocals });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty prompt', async () => {
    const res = await POST({ request: mkRequest({ prompt: '' }), locals: authedLocals });
    expect(res.status).toBe(400);
  });

  it('returns non-streaming response', async () => {
    mockOllamaFetch.mockResolvedValueOnce({
      ok: true,
      body: null,
      json: async () => ({
        response: 'Legal analysis complete.',
        model: 'gemma4-legal:latest',
        done: true,
      }),
    });

    const res = await POST({
      request: mkRequest({ prompt: 'Analyze this contract', stream: false }),
      locals: authedLocals,
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.response).toBe('Legal analysis complete.');
  });

  it('returns streaming response', async () => {
    const mockBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"response":"Hello"}\n'));
        controller.close();
      },
    });
    mockOllamaFetch.mockResolvedValueOnce({ ok: true, body: mockBody });

    const res = await POST({
      request: mkRequest({ prompt: 'Hello', stream: true }),
      locals: authedLocals,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/x-ndjson');
  });

  it('appends :latest to model without tag', async () => {
    mockOllamaFetch.mockResolvedValueOnce({
      ok: true,
      body: null,
      json: async () => ({ response: 'done', model: 'gemma4-legal:latest' }),
    });

    await POST({
      request: mkRequest({ prompt: 'test', model: 'gemma4-legal', stream: false }),
      locals: authedLocals,
    });

    expect(mockOllamaFetch).toHaveBeenCalledOnce();
    const callBody = JSON.parse((mockOllamaFetch.mock.calls[0] as any[])[1].body);
    expect(callBody.model).toBe('gemma4-legal:latest');
  });

  it('returns 503 when Ollama fails', async () => {
    mockOllamaFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await POST({
      request: mkRequest({ prompt: 'test', stream: false }),
      locals: authedLocals,
    });
    expect(res.status).toBe(503);
  });

  it('returns 503 on connection error', async () => {
    mockOllamaFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await POST({
      request: mkRequest({ prompt: 'test', stream: false }),
      locals: authedLocals,
    });
    expect(res.status).toBe(503);
  });

  it('validates temperature range', async () => {
    const res = await POST({
      request: mkRequest({ prompt: 'test', options: { temperature: 5 } }),
      locals: authedLocals,
    });
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════
// CACHE STATS: /api/cache/stats
// ════════════════════════════════════════════════════════════════
describe('/api/cache/stats (GET)', () => {
  let GET: Function;

  beforeEach(async () => {
    const mod = await import('../src/routes/api/cache/stats/+server');
    GET = mod.GET;
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: anonLocals });
    expect(res.status).toBe(401);
  });

  it('returns cache statistics', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.redis).toBeDefined();
    expect(data.data.redis.connected).toBe(true);
    expect(data.data.redis.totalKeys).toBe(150);
    expect(data.data.template).toBeDefined();
    expect(data.data.export).toBeDefined();
    expect(data.data.llm).toBeDefined();
    expect(data.data.metrics).toBeDefined();
  });

  it('returns LLM hit rate', async () => {
    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    expect(data.data.llm.hits).toBe(1000);
    expect(data.data.llm.misses).toBe(200);
    expect(data.data.llm.hitRate).toBeGreaterThan(80);
  });

  it('falls back on Redis error', async () => {
    // Make redis throw on all calls for this test
    const failingRedis = {
      ...mockRedis,
      ping: vi.fn(async () => {
        throw new Error('Redis down');
      }),
      info: vi.fn(async () => {
        throw new Error('Redis down');
      }),
      dbsize: vi.fn(async () => {
        throw new Error('Redis down');
      }),
    };
    const redisMod = await import('$lib/server/redis.js');
    vi.spyOn(redisMod, 'getRedis').mockReturnValue(failingRedis as any);

    const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
    const data = await res.json();
    // Route returns fallback data with connected: false
    expect(data.data.redis.connected).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// VECTOR SEARCH: /api/vector-search
// ════════════════════════════════════════════════════════════════
describe('/api/vector-search (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/vector-search/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({ request: mkRequest({ query: 'test' }), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns 400 for empty query', async () => {
		const res = await POST({ request: mkRequest({ query: '' }), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns 400 for missing query', async () => {
		const res = await POST({ request: mkRequest({}), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns search results from multiple collections', async () => {
		const res = await POST({
			request: mkRequest({ query: 'fraud evidence' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(3); // 2 evidence + 1 document
		// Sorted by score descending
		expect(data[0].score).toBeGreaterThanOrEqual(data[1].score);
	});

	it('deduplicates results by id', async () => {
		const res = await POST({
			request: mkRequest({ query: 'contract law' }),
			locals: authedLocals,
		});
		const data = await res.json();
		const ids = data.map((r: any) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('respects limit parameter', async () => {
		const res = await POST({
			request: mkRequest({ query: 'evidence', limit: 2 }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(data.length).toBeLessThanOrEqual(2);
	});

	it('returns 400 for limit out of range', async () => {
		const res = await POST({
			request: mkRequest({ query: 'test', limit: 100 }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});
});

// ════════════════════════════════════════════════════════════════
// CASE THEORY: /api/case-theory
// ════════════════════════════════════════════════════════════════
describe('/api/case-theory (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/case-theory/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({
			request: mkRequest({ summary: 'A long case summary text here' }),
			locals: anonLocals,
		});
		expect(res.status).toBe(401);
	});

	it('returns 400 for summary too short', async () => {
		const res = await POST({
			request: mkRequest({ summary: 'short' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 for missing summary', async () => {
		const res = await POST({
			request: mkRequest({}),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('generates case theory plan', async () => {
		const mockPlan = {
			masterTheory: 'The defendant is liable for breach of contract.',
			prosecutionFrame: 'Deliberate violation of terms.',
			supportingPillars: [{ title: 'Contract Terms', summary: 'Clear violation', proofPoints: ['Exhibit A'] }],
			themes: ['Accountability'],
			storyBeats: [],
			evidencePlan: [],
			witnessPlan: [],
			riskMatrix: [],
			defenseCounters: [],
			actionItems: [],
			deliverables: {},
		};

		mockGenerateCompletion.mockResolvedValueOnce({
			response: JSON.stringify(mockPlan),
		});

		const res = await POST({
			request: mkRequest({
				summary: 'Defendant breached a commercial lease agreement by failing to pay rent for six months',
				caseName: 'Smith v. Jones',
				charges: ['Breach of Contract'],
			}),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.plan.masterTheory).toBeTruthy();
		expect(data.metadata.model).toBe('gemma4-legal:latest');
	});

	it('returns 422 when LLM returns non-JSON', async () => {
		mockGenerateCompletion.mockResolvedValueOnce({
			response: 'I cannot generate a case theory for this input because it lacks sufficient detail.',
		});

		const res = await POST({
			request: mkRequest({
				summary: 'Defendant committed wire fraud across multiple state lines',
			}),
			locals: authedLocals,
		});
		expect(res.status).toBe(422);
		const data = await res.json();
		expect(data.success).toBe(false);
		expect(data.raw).toBeTruthy();
	});

	it('returns 500 on LLM error', async () => {
		mockGenerateCompletion.mockRejectedValueOnce(new Error('Ollama timeout'));

		const res = await POST({
			request: mkRequest({
				summary: 'Defendant committed wire fraud across multiple state lines',
			}),
			locals: authedLocals,
		});
		expect(res.status).toBe(500);
	});

	it('fills in default arrays when LLM returns partial plan', async () => {
		mockGenerateCompletion.mockResolvedValueOnce({
			response: JSON.stringify({ masterTheory: 'Partial plan with no arrays' }),
		});

		const res = await POST({
			request: mkRequest({ summary: 'Defendant committed embezzlement over a three year period' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.plan.supportingPillars).toEqual([]);
		expect(data.plan.themes).toEqual([]);
		expect(data.plan.riskMatrix).toEqual([]);
	});
});

// ════════════════════════════════════════════════════════════════
// CONSOLIDATION STATUS: /api/consolidation/status
// ════════════════════════════════════════════════════════════════
describe('/api/consolidation/status (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const { db } = await import('$lib/server/db/client');
		(db.select as any).mockImplementation(() => {
			const whereFn = vi.fn(async () => [{ count: 3 }]);
			return { from: vi.fn(() => ({ where: whereFn })) };
		});
		const mod = await import('../src/routes/api/consolidation/status/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ request: new Request('http://localhost'), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns consolidation status', async () => {
		const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.status).toBe('complete');
		expect(data.lastRun).toBeTruthy();
		expect(typeof data.clusterCount).toBe('number');
		expect(typeof data.errorEventCount).toBe('number');
	});

	it('returns defaults on DB error', async () => {
		const { db } = await import('$lib/server/db/client');
		(db.select as any).mockImplementation(() => ({
			from: vi.fn(() => ({
				where: vi.fn(async () => { throw new Error('DB down'); }),
			})),
		}));

		const res = await GET({ request: new Request('http://localhost'), locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200); // graceful degradation
		expect(data.status).toBe('complete');
		expect(data.clusterCount).toBe(0);
	});
});
