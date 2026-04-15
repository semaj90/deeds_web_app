import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbUpdateWhere = vi.fn(async () => undefined);
const mockPoolQuery = vi.fn(async () => ({ rows: [{ ok: 1 }] }));
const mockRedisPing = vi.fn(async () => 'PONG');
const mockRedisInfo = vi.fn(async (section: string) => {
  if (section === 'memory') {
    return 'used_memory_human:28M\r\nused_memory_peak_human:29M\r\n';
  }
  if (section === 'keyspace') {
    return 'db0:keys=89341,expires=0,avg_ttl=0\r\n';
  }
  return '';
});

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    QDRANT_URL: 'http://127.0.0.1:6333',
    LANGEXTRACT_URL: 'http://127.0.0.1:8095',
    QUIC_HEALTH_URL: 'http://127.0.0.1:5178/health',
    GO_SEARCH_URL: '',
    GO_SEARCH_GRPC_URL: '127.0.0.1:50055',
    RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:5672',
    MINIO_ENDPOINT: '127.0.0.1',
    MINIO_PORT: '9000',
    COUCHDB_URL: 'http://admin:password@127.0.0.1:5984',
    NEO4J_URI: 'bolt://127.0.0.1:7687',
    NATS_URL: 'nats://127.0.0.1:4222',
    EMBEDDING_QUIC_ENABLED: true,
    EMBEDDING_GRPC_ENABLED: true,
    EMBEDDING_GRPC_URL: '127.0.0.1:50051',
    TENSORRT_URL: 'http://localhost:8099',
    TRITON_URL: 'http://localhost:8000',
    TRITON_LLM_MODEL: 'legal-llm',
    TRITON_VLM_MODEL: 'gemma_vlm_ensemble',
    TRITON_VISION_MODEL: 'siglip_vision',
  },
}));

vi.mock('$lib/config/env.server.js', () => ({
  getTrtLlmUrl: vi.fn(() => 'http://localhost:8099'),
  getTritonUrl: vi.fn(() => 'http://localhost:8000'),
  getRabbitMQManagementUrl: vi.fn(() => 'http://rabbitmq.test:15672'),
}));

vi.mock('$lib/server/circuit-breaker.js', () => ({
  ollamaBreaker: { getStatus: vi.fn(() => ({ state: 'CLOSED', failures: 0 })) },
  qdrantBreaker: { getStatus: vi.fn(() => ({ state: 'CLOSED', failures: 0 })) },
  redisBreaker: { getStatus: vi.fn(() => ({ state: 'CLOSED', failures: 0 })) },
  breakerEventLog: [],
}));

vi.mock('$lib/server/embedding/embed.js', () => ({
  getInFlightCount: vi.fn(() => 0),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  checkGrpcHealth: vi.fn(async () => ({ available: false, enabled: true, url: '127.0.0.1:50051' })),
}));

vi.mock('$lib/server/cache-metrics.js', () => ({
  cacheMetrics: {
    snapshot: vi.fn(() => ({
      uptimeSeconds: 0,
      memory: { hits: 0, misses: 0, total: 0, hitRate: 0 },
      redis: { hits: 0, misses: 0, total: 0, hitRate: 0, avgLatencyMs: 0, maxLatencyMs: 0, opCount: 0 },
      byPrefix: {},
    })),
  },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  serviceCapabilities: { serviceName: 'service_name' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  sql: Object.assign(vi.fn((...args: unknown[]) => ({ type: 'sql', args })), {
    raw: vi.fn((value: string) => value),
  }),
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mockDbUpdateWhere,
      })),
    })),
    execute: vi.fn(async () => ({ rows: [{ ok: 1 }] })),
  },
  pool: {
    query: mockPoolQuery,
  },
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: vi.fn(() => ({ ping: mockRedisPing })),
  redis: {
    ping: mockRedisPing,
    info: mockRedisInfo,
  },
}));

vi.mock('$lib/server/inference/gpu-arbiter.js', () => ({
  getGpuLeaseStatus: vi.fn(async () => null),
}));

vi.mock('$lib/server/inference/inference-router.js', () => ({
  getRouterStatus: vi.fn(async () => ({ preferredBackend: 'ollama', gpu: { leaseFree: true } })),
}));

vi.mock('$lib/server/langextract-client.js', () => ({
  getLangExtractStatus: vi.fn(async () => ({
    enabled: false,
    healthy: true,
    services: { spacy_enabled: true, ollama_available: true },
    version: '',
    latencyMs: 24,
    source: 'fallback',
    resolvedUrl: 'http://127.0.0.1:8095',
  })),
}));

vi.mock('$lib/server/trt-llm.js', () => ({
  healthCheck: vi.fn(async () => false),
}));

vi.mock('$lib/server/triton-llm.js', () => ({
  healthCheckModel: vi.fn(async () => false),
}));

vi.mock('$lib/server/gpu/libtorch-bridge.js', () => ({
  isCudaAvailable: vi.fn(() => false),
}));

vi.mock('$lib/gpu/runtime-optimizations.js', () => ({
  NODE_RUNTIME_CONFIG: {
    maxOldSpaceSize: 8192,
    gpuBatchSize: 16,
    gpuConcurrencyLimit: 4,
    experimentalWasmSimd: true,
    experimentalWasmThreads: true,
  },
  GPU_MARKDOWN_ENV: {
    GPU_MARKDOWN_SERVICE_URL: 'http://localhost:8098',
    FALLBACK_TO_CPU: true,
  },
}));

vi.mock('$lib/server/ollama.js', () => ({
	getChatModelKeepAlive: () => '2m',
	getEmbeddingModelKeepAlive: () => '24h',
	getChatModel: () => 'gemma4-legal:latest',
	getEmbedModel: () => 'embeddinggemma:latest',
  ollamaFetch: vi.fn(async () => ({ ok: true })),
}));

vi.mock('net', () => ({
  createConnection: ({ port }: { port: number }) => {
    const handlers = new Map<string, Array<() => void>>();
    const socket = {
      on(event: string, handler: () => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return socket;
      },
      destroy() {},
    };

    queueMicrotask(() => {
      const event = port === 4222 || port === 5672 ? 'connect' : 'error';
      for (const handler of handlers.get(event) ?? []) {
        handler();
      }
    });

    return socket;
  },
}));

describe('runtime connection contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (url === 'http://127.0.0.1:5178/health') {
          throw new Error('QUIC proxy down');
        }

        if (url === 'http://localhost:8099/health' || url === 'http://localhost:8000/v2/health/ready' || url === 'http://localhost:8096/health') {
          return { ok: false, json: async () => ({}) } as Response;
        }

        if (url.includes('/collections')) {
          return {
            ok: true,
            json: async () => ({ result: { collections: [{ name: 'evidence_items' }, { name: 'legal_documents' }] } }),
          } as Response;
        }

        if (url.includes('/api/overview')) {
          return {
            ok: true,
            json: async () => ({ object_totals: { queues: 7 }, queue_totals: { messages_ready: 0, messages_unacknowledged: 0 }, message_stats: { publish_details: { rate: 0 }, deliver_get_details: { rate: 0 } } }),
          } as Response;
        }

        return { ok: true, json: async () => ({ models: [] }) } as Response;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('separates langextract health from quic health in GET /api/health', async () => {
    const mod = await import('../src/routes/api/health/+server.ts');
    const res = await mod.GET({ url: new URL('http://localhost:5173/api/health') } as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checks.langextract.ok).toBe(true);
    expect(body.checks.quic.ok).toBe(false);
    expect(body.checks.nats.ok).toBe(true);
    expect(body.checks.trtllm.ok).toBe(false);
    expect(body.transport.tier2_quic.url).toBe('nats://127.0.0.1:4222');
    expect(body.embedding.quic.enabled).toBe(true);
  });

  it('reports infrastructure status with the current TRT and langextract contract', async () => {
    const mod = await import('../src/routes/api/infrastructure/status/+server');
    const res = await mod.GET({ locals: { user: { id: 'u-1' } } } as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.inference.tensorrt.url).toBe('http://localhost:8099');
    expect(body.inference.tensorrt.available).toBe(false);
    expect(body.inference.tritonVlm).toEqual({
      available: false,
      url: 'http://localhost:8000',
      model: 'gemma_vlm_ensemble',
      visionModel: 'siglip_vision',
    });
    expect(body.tiers.tier2_quic.natsUrl).toBe('nats://127.0.0.1:4222');
    expect(body.services.langextract).toMatchObject({
      enabled: false,
      healthy: true,
      resolvedUrl: 'http://127.0.0.1:8095',
    });
    expect(body.cache.qdrant.collectionCount).toBe(2);
  });
});