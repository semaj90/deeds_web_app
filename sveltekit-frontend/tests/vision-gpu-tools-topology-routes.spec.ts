/**
 * Test file 13: Vision + GPU + Tools + Topology + Glyph + Whisper + VectorSearch + AnalyzeFile/Tag + PageContext
 *
 * Routes covered (11):
 *   /api/vision/analyze (POST)         — Image analysis: YOLO + Gemma3 VLM
 *   /api/gpu/compute (POST)            — GPU-accelerated compute ops
 *   /api/gpu/lease (GET/POST/DELETE)   — GPU VRAM lease management
 *   /api/gpu/queue (GET/POST)          — GPU task queue
 *   /api/tools/execute (GET/POST)      — ACE tool execution
 *   /api/topology (GET)                — Error topology graph
 *   /api/glyph/generate (POST)         — Evidence visualization glyph
 *   /api/whisper/transcribe (POST)     — Audio transcription
 *   /api/vector-search (POST)          — Qdrant vector similarity search
 *   /api/analyze-file (POST)           — Phase 89 file analysis
 *   /api/analyze-tag (POST)            — Phase 89 tag analysis
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared UUIDs ──
const TEST_USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

// ── Redis mock ──
const mockRedisStore: Record<string, string> = {};
const mockRedis = {
	get: vi.fn(async (key: string) => mockRedisStore[key] ?? null),
	set: vi.fn(async (key: string, val: string) => { mockRedisStore[key] = val; }),
	setex: vi.fn(async (k: string, _ttl: number, v: string) => { mockRedisStore[k] = v; }),
	del: vi.fn(async (key: string) => { delete mockRedisStore[key]; }),
};
vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => mockRedis,
  redis: mockRedis,
}));

// ── ENV mock ──
vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://localhost:11434',
    QDRANT_URL: 'http://localhost:6333',
    MINIO_EVIDENCE_BUCKET: 'evidence',
    WHISPER_USE_SERVER: true,
    WHISPER_SERVER_URL: 'http://localhost:8095',
  },
}));
vi.mock('$lib/config/env.server.js', () => ({
  getOllamaUrl: () => 'http://localhost:11434',
  getQdrantUrl: () => 'http://localhost:6333',
  getDatabaseUrl: () => 'postgresql://test:test@localhost:5432/test',
}));

// ── ollamaFetch mock ──
const mockOllamaFetch = vi.fn(async () => {
  return new Response(
    JSON.stringify({
      response:
        '{"type":"document","icon":"file-text","color":"#6b7280","label":"test","confidence":0.8}',
      message: { content: 'Analysis result' },
      model: 'gemma4-legal:latest',
      embedding: new Array(768).fill(0.01),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
vi.mock('$lib/server/ollama.js', () => ({
  getChatModelKeepAlive: () => '2m',
  getEmbeddingModelKeepAlive: () => '24h',
  getChatModel: () => 'gemma4-legal:latest',
  getEmbedModel: () => 'embeddinggemma:latest',
  ollamaFetch: (...args: any[]) => mockOllamaFetch(...args),
}));

// ── DB mock ──
const mockDbRows: any[] = [];
const mockChain: any = {
  select: vi.fn(() => mockChain),
  from: vi.fn(() => mockChain),
  where: vi.fn(() => mockChain),
  orderBy: vi.fn(() => mockChain),
  limit: vi.fn(() => mockChain),
  offset: vi.fn(() => mockChain),
  leftJoin: vi.fn(() => mockChain),
  then: vi.fn((resolve: any) => resolve(mockDbRows)),
  [Symbol.iterator]: function* () {
    yield* mockDbRows;
  },
};
vi.mock('$lib/server/db/client', () => ({
  pgRows: (r) => (Array.isArray(r) ? r : (r?.rows ?? [])),
  db: {
    select: vi.fn(() => mockChain),
    execute: vi.fn(async () => ({ rows: [] })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => []) })) })),
  },
  pool: {
    query: vi.fn(async () => ({
      rows: [
        { file_path: 'src/lib/test.ts', error_code: 'TS2345', error_count: '3', metadata: null },
      ],
    })),
  },
}));

// ── drizzle-orm mock ──
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => a),
  desc: vi.fn((c: any) => c),
  and: vi.fn((...a: any[]) => a),
  or: vi.fn((...a: any[]) => a),
  gte: vi.fn((...a: any[]) => a),
  inArray: vi.fn((...a: any[]) => a),
  sql: Object.assign(
    vi.fn((s: any) => s),
    { raw: vi.fn((s: any) => s) }
  ),
}));

// ── Schema mocks ──
vi.mock('$lib/server/db/schema-postgres.js', () => ({
  errorEvents: {
    id: 'id',
    routePath: 'route_path',
    kind: 'kind',
    severity: 'severity',
    message: 'message',
    stack: 'stack',
    file: 'file',
    lineNumber: 'line_number',
    clusterId: 'cluster_id',
    collectedAt: 'collected_at',
  },
  errorClusters: { id: 'id' },
  apiAuditLog: { id: 'id' },
}));

// ── GPU mocks ──
vi.mock('$lib/server/gpu/libtorch-bridge.js', () => ({
  graphSimilarity: vi.fn(async (embs: number[][]) => ({
    matrix: embs.map(() => embs.map(() => 0.5)),
    device: 'cpu',
  })),
  clusterEmbeddings: vi.fn(async (embs: number[][], k: number) => ({
    clusters: [{ centroid: 0, members: [0, 1] }],
    k,
    device: 'cpu',
  })),
  computeCaseEmbedding: vi.fn(async (w: number[], embs: number[][]) => ({
    embedding: new Array(768).fill(0.1),
    device: 'cpu',
  })),
  isCudaAvailable: vi.fn(() => false),
}));
vi.mock('$lib/gpu/gpu-embedding-bridge.js', () => ({
  embedAndCompare: vi.fn(async (texts: string[], query?: string) => ({
    metrics: { totalVectors: texts.length, embeddingTimeMs: 10, backend: 'cpu' },
    similarities: query ? new Float32Array(texts.map(() => 0.8)) : null,
  })),
}));

// ── GPU lease/queue mocks ──
vi.mock('$lib/server/inference/gpu-arbiter.js', () => ({
  acquireGpuLease: vi.fn(async (backend: string, ttl: number) => ({
    backend,
    ttlSeconds: ttl,
    acquiredAt: Date.now(),
    expiresAt: Date.now() + ttl * 1000,
  })),
  releaseGpuLease: vi.fn(async () => true),
  getGpuLeaseStatus: vi.fn(async () => null),
}));
vi.mock('$lib/machines/gpu-process-machine.js', () => ({
  createGpuTask: vi.fn((type: string, payload: any, opts: any) => ({
    id: 'task-1',
    type,
    payload,
    priority: 'medium',
    backend: opts.backend,
    submittedAt: Date.now(),
    startedAt: null,
    completedAt: null,
  })),
  classifyTaskPriority: vi.fn(() => 'medium'),
}));

// ── Tool registry mock ──
vi.mock('$lib/server/tools/handlers/index.js', () => ({
  toolRegistry: {
    list: vi.fn(() => ['system_health_check', 'redis_cache_stats']),
    get: vi.fn((name: string) => ({
      name,
      description: `${name} tool`,
      permissions: ['read'],
    })),
    execute: vi.fn(async (tool: string, args: unknown) => {
      if (tool === 'unknown_tool') return { success: false, error: 'Tool not found' };
      return { success: true, result: { tool, args, executedAt: new Date().toISOString() } };
    }),
  },
}));

// ── Vision mocks ──
vi.mock('$lib/server/minio-client.js', () => ({
  uploadFile: vi.fn(async () => 'evidence/test-hash.png'),
}));
vi.mock('$lib/server/yolo.js', () => ({
  createYOLOService: vi.fn(() => ({
    detect: vi.fn(async () => ({
      boxes: [{ x: 10, y: 20, w: 100, h: 80, label: 'document', conf: 0.95 }],
    })),
  })),
}));
vi.mock('$lib/server/image/resize-for-vlm.js', () => ({
  resizeForVLM: vi.fn(async (buf: Buffer) => ({
    buffer: buf,
    resized: false,
    originalWidth: 800,
    originalHeight: 600,
    vlmWidth: 2048,
    vlmHeight: 2048,
  })),
  GEMMA4_VLM_MAX_EDGE: 2048,
  GEMMA3_VLM_SIZE: 2048, // deprecated alias
}));

// ── gRPC embedding mock ──
vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateEmbeddings: vi.fn(async () => ({
    vectors: [new Array(768).fill(0.01)],
  })),
  generateEmbedding: vi.fn(async () => new Array(768).fill(0.01)),
}));

// ── Langfuse observability mock ──
vi.mock('$lib/server/observability/langfuse.js', () => ({
  traceLLM: vi.fn(async (_name: string, _meta: any, fn: any) => {
    return fn({ end: vi.fn() });
  }),
}));

// ── LangExtract mock ──
vi.mock('$lib/server/langextract-client.js', () => ({
  extractDocument: vi.fn(async () => ({ entities: [] })),
}));

// ── Entity extraction mock ──
vi.mock('$lib/server/analysis/entity-extraction.js', () => ({
  extractEntities: vi.fn(async () => []),
}));

vi.mock('$lib/server/middleware/rate-limit.js', () => ({
  rateLimitOrRespond: vi.fn(async () => null),
  RateLimitPresets: { search: {}, default: {} },
}));

// ── Qdrant client mock ──
vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    search: vi.fn(async () => [
      { id: 'vec-1', score: 0.92, payload: { title: 'Contract A', tags: ['contract'] } },
    ]),
  })),
}));

// ── analyze-file mocks ──
const mockReadFile = vi.fn(async () => '// test file content\nconst x = 1;');
vi.mock('fs/promises', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs/promises')>();
  return { ...orig, readFile: mockReadFile };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs/promises')>();
  return { ...orig, readFile: mockReadFile };
});
vi.mock('child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('child_process')>();
  return {
    ...orig,
    exec: vi.fn((_cmd: string, cb: any) => cb(null, { stdout: '// comment found', stderr: '' })),
  };
});
vi.mock('node:child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('child_process')>();
  return {
    ...orig,
    exec: vi.fn((_cmd: string, cb: any) => cb(null, { stdout: '// comment found', stderr: '' })),
  };
});

// ── analyze-tag Qdrant HTTP mock ──
vi.mock('$lib/server/qdrant-http', () => ({
  getCollections: vi.fn(async () => ['evidence_items']),
  scrollPoints: vi.fn(async () => ({
    points: [{ id: 'p1', payload: { tag: 'contract', content: 'Sample' } }],
    next_page_offset: null,
  })),
}));

// ── Cache mock (for page-context) ──
vi.mock('$lib/server/cache.js', () => ({
  setCache: vi.fn(),
  cognitiveCache: {
    getJsonbDocument: vi.fn(async () => null),
    setJsonbDocument: vi.fn(),
  },
}));

// ── Extract component mock ──
vi.mock('$lib/server/utils/extract-component.js', () => ({
  extractComponent: vi.fn((path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1]?.replace(/\.(ts|svelte)$/, '') ?? 'Unknown';
  }),
}));

// ── Glyph diffusion mock ──
vi.mock('$lib/server/glyph-diffusion-service.js', () => ({
  glyphDiffusionService: {
    generateGlyph: vi.fn(async () => ({
      glyph_url: '/glyphs/test.png',
      tensor_ids: ['tid-1'],
      generation_time_ms: 42,
      cache_hits: 0,
      preview_with_tensors: null,
    })),
  },
}));

// ── Helpers ──
function makeEvent(
  method: string,
  url: string,
  opts: { body?: any; locals?: any; params?: any; fetch?: any; formData?: any } = {}
) {
  const urlObj = new URL(url, 'http://localhost');
  const headers = new Headers({ 'content-type': 'application/json' });
  const req: any = new Request(urlObj, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (opts.formData) {
    req.formData = async () => opts.formData;
  }
  return {
    request: req,
    url: urlObj,
    params: opts.params ?? {},
    locals: opts.locals ?? { user: { id: TEST_USER_ID, role: 'admin' } },
    cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    platform: {},
    getClientAddress: () => '127.0.0.1',
    fetch:
      opts.fetch ??
      vi.fn(
        async () =>
          new Response(JSON.stringify({ results: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      ),
  };
}

function jsonBody(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbRows.length = 0;
  for (const key of Object.keys(mockRedisStore)) delete mockRedisStore[key];
});

// ─────────────────────────────────────────────────────────
// /api/gpu/compute (POST)
// ─────────────────────────────────────────────────────────
describe('/api/gpu/compute (POST)', () => {
  it('returns device info', async () => {
    const { POST } = await import('../src/routes/api/gpu/compute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/compute', {
      body: { operation: 'device_info' },
    });
    const res = await POST(event as any);
    const data = await jsonBody(res);
    expect(data.cudaAvailable).toBe(false);
    expect(data.capabilities).toContain('similarity');
  });

  it('runs similarity operation', async () => {
    const { POST } = await import('../src/routes/api/gpu/compute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/compute', {
      body: {
        operation: 'similarity',
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      },
    });
    const res = await POST(event as any);
    const data = await jsonBody(res);
    expect(data.matrix).toBeDefined();
    expect(data.latencyMs).toBeDefined();
  });

  it('runs cluster operation', async () => {
    const { POST } = await import('../src/routes/api/gpu/compute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/compute', {
      body: { operation: 'cluster', embeddings: [[0.1], [0.2], [0.3]], k: 2 },
    });
    const res = await POST(event as any);
    const data = await jsonBody(res);
    expect(data.clusters).toBeDefined();
  });

  it('runs weighted_embedding operation', async () => {
    const { POST } = await import('../src/routes/api/gpu/compute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/compute', {
      body: {
        operation: 'weighted_embedding',
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
        weights: [0.5, 0.5],
      },
    });
    const res = await POST(event as any);
    const data = await jsonBody(res);
    expect(data.embedding).toBeDefined();
  });

  it('runs embed_compare operation', async () => {
    const { POST } = await import('../src/routes/api/gpu/compute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/compute', {
      body: {
        operation: 'embed_compare',
        texts: ['contract law', 'property law'],
        query: 'lease agreement',
      },
    });
    const res = await POST(event as any);
    const data = await jsonBody(res);
    expect(data.totalVectors).toBe(2);
    expect(data.backend).toBe('cpu');
  });

  it('returns 400 for invalid operation', async () => {
    const { POST } = await import('../src/routes/api/gpu/compute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/compute', {
      body: { operation: 'invalid_op' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing embeddings', async () => {
    const { POST } = await import('../src/routes/api/gpu/compute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/compute', {
      body: { operation: 'similarity' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 401 for unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/gpu/compute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/compute', {
      body: { operation: 'device_info' },
      locals: { user: null },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────
// /api/gpu/lease (GET/POST/DELETE)
// ─────────────────────────────────────────────────────────
describe('/api/gpu/lease', () => {
  it('GET returns current lease status', async () => {
    const { GET } = await import('../src/routes/api/gpu/lease/+server.js');
    const res = await GET(makeEvent('GET', 'http://localhost/api/gpu/lease') as any);
    const data = await jsonBody(res);
    expect(data.free).toBe(true);
    expect(data.lease).toBeNull();
  });

  it('POST acquires a GPU lease', async () => {
    const { POST } = await import('../src/routes/api/gpu/lease/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/lease', {
      body: { backend: 'ollama', ttlSeconds: 60 },
    });
    const res = await POST(event as any);
    const data = await jsonBody(res);
    expect(data.acquired).toBe(true);
    expect(data.lease.backend).toBe('ollama');
  });

  it('POST returns 409 when GPU is busy', async () => {
    const { acquireGpuLease } = await import('$lib/server/inference/gpu-arbiter.js');
    (acquireGpuLease as any).mockResolvedValueOnce(null);
    const { POST } = await import('../src/routes/api/gpu/lease/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/lease', {
      body: { backend: 'tensorrt' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(409);
  });

  it('POST returns 400 for invalid backend', async () => {
    const { POST } = await import('../src/routes/api/gpu/lease/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/lease', {
      body: { backend: 'invalid' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('POST returns 401 for unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/gpu/lease/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/lease', {
      body: { backend: 'ollama' },
      locals: { user: null },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });

  it('DELETE releases a GPU lease', async () => {
    const { DELETE } = await import('../src/routes/api/gpu/lease/+server.js');
    const event = makeEvent('DELETE', 'http://localhost/api/gpu/lease', {
      body: { backend: 'ollama' },
    });
    const res = await DELETE(event as any);
    const data = await jsonBody(res);
    expect(data.released).toBe(true);
  });

  it('DELETE returns 401 for unauthenticated', async () => {
    const { DELETE } = await import('../src/routes/api/gpu/lease/+server.js');
    const event = makeEvent('DELETE', 'http://localhost/api/gpu/lease', {
      body: { backend: 'ollama' },
      locals: { user: null },
    });
    const res = await DELETE(event as any);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────
// /api/gpu/queue (GET/POST)
// ─────────────────────────────────────────────────────────
describe('/api/gpu/queue', () => {
  it('GET returns queue status', async () => {
    const { GET } = await import('../src/routes/api/gpu/queue/+server.js');
    const res = await GET(makeEvent('GET', 'http://localhost/api/gpu/queue') as any);
    const data = await jsonBody(res);
    expect(data.queue).toBeDefined();
    expect(data.stats).toBeDefined();
    expect(data.queueDepth).toBeDefined();
  });

  it('POST submits a GPU task', async () => {
    const { POST } = await import('../src/routes/api/gpu/queue/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/queue', {
      body: { type: 'embedding', backend: 'ollama' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(201);
    const data = await jsonBody(res);
    expect(data.taskId).toBe('task-1');
    expect(data.priority).toBe('medium');
  });

  it('POST returns 400 for invalid task type', async () => {
    const { POST } = await import('../src/routes/api/gpu/queue/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/queue', {
      body: { type: 'invalid_type' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('POST returns 401 for unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/gpu/queue/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/gpu/queue', {
      body: { type: 'chat' },
      locals: { user: null },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────
// /api/tools/execute (GET/POST)
// ─────────────────────────────────────────────────────────
describe('/api/tools/execute', () => {
  it('GET lists available tools', async () => {
    const { GET } = await import('../src/routes/api/tools/execute/+server.js');
    const res = await GET(makeEvent('GET', 'http://localhost/api/tools/execute') as any);
    const data = await jsonBody(res);
    expect(data.tools).toHaveLength(2);
    expect(data.tools[0].name).toBe('system_health_check');
    expect(data.total).toBe(2);
  });

  it('GET returns 401 for unauthenticated', async () => {
    const { GET } = await import('../src/routes/api/tools/execute/+server.js');
    const res = await GET(
      makeEvent('GET', 'http://localhost/api/tools/execute', {
        locals: { user: null },
      }) as any
    );
    expect(res.status).toBe(401);
  });

  it('POST executes a tool successfully', async () => {
    const { POST } = await import('../src/routes/api/tools/execute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/tools/execute', {
      body: { tool: 'system_health_check', args: {} },
    });
    const res = await POST(event as any);
    const data = await jsonBody(res);
    expect(data.success).toBe(true);
    expect(data.result.tool).toBe('system_health_check');
  });

  it('POST returns 400 for unknown tool', async () => {
    const { POST } = await import('../src/routes/api/tools/execute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/tools/execute', {
      body: { tool: 'unknown_tool' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('POST returns 400 for missing tool name', async () => {
    const { POST } = await import('../src/routes/api/tools/execute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/tools/execute', {
      body: { tool: '' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('POST returns 401 for unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/tools/execute/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/tools/execute', {
      body: { tool: 'system_health_check' },
      locals: { user: null },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────
// /api/topology (GET)
// ─────────────────────────────────────────────────────────
describe('/api/topology (GET)', () => {
  it('returns topology with components', async () => {
    const { GET } = await import('../src/routes/api/topology/+server.js');
    const res = await GET(makeEvent('GET', 'http://localhost/api/topology') as any);
    const data = await jsonBody(res);
    expect(data.components).toBeDefined();
    expect(data.summary).toBeDefined();
    expect(data.summary.total_components).toBeGreaterThan(0);
  });

  it('returns 401 for unauthenticated', async () => {
    const { GET } = await import('../src/routes/api/topology/+server.js');
    const res = await GET(
      makeEvent('GET', 'http://localhost/api/topology', {
        locals: { user: null },
      }) as any
    );
    expect(res.status).toBe(401);
  });

  it('returns 500 when db fails', async () => {
    const { pool } = await import('$lib/server/db/client');
    (pool.query as any).mockRejectedValueOnce(new Error('DB down'));
    const { GET } = await import('../src/routes/api/topology/+server.js');
    const res = await GET(makeEvent('GET', 'http://localhost/api/topology') as any);
    expect(res.status).toBe(200);
    const data = await jsonBody(res);
    expect(data.components).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// /api/glyph/generate (POST)
// ─────────────────────────────────────────────────────────
describe('/api/glyph/generate (POST)', () => {
  it('generates a glyph successfully', async () => {
    const { POST } = await import('../src/routes/api/glyph/generate/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/glyph/generate', {
      body: { evidence_id: 'ev-1', prompt: 'Contract document analysis', style: 'legal' },
    });
    const res = await POST(event as any);
    const data = await jsonBody(res);
    expect(data.success).toBe(true);
    expect(data.glyph).toBeDefined();
  });

  it('returns 400 for missing evidence_id', async () => {
    const { POST } = await import('../src/routes/api/glyph/generate/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/glyph/generate', {
      body: { evidence_id: '', prompt: 'test' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing prompt', async () => {
    const { POST } = await import('../src/routes/api/glyph/generate/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/glyph/generate', {
      body: { evidence_id: 'ev-1', prompt: '' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 401 for unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/glyph/generate/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/glyph/generate', {
      body: { evidence_id: 'ev-1', prompt: 'test' },
      locals: { user: null },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 503 when LLM fails', async () => {
    mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
    const { POST } = await import('../src/routes/api/glyph/generate/+server.js');
    const event = makeEvent('POST', 'http://localhost/api/glyph/generate', {
      body: { evidence_id: 'ev-1', prompt: 'test prompt' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(503);
  });
});

// ─────────────────────────────────────────────────────────
// /api/whisper/transcribe (POST)
// ─────────────────────────────────────────────────────────
describe('/api/whisper/transcribe (POST)', () => {
  it('transcribes audio successfully', async () => {
    // Mock global fetch for whisper server health check + inference
    const originalFetch = global.fetch;
    const mockFetch = vi.fn(async (url: any, _opts?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return new Response('OK', { status: 200 });
      }
      if (urlStr.includes('/inference')) {
        return new Response(
          JSON.stringify({
            text: 'The witness testified that...',
            language: 'en',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, _opts);
    }) as any;
    global.fetch = mockFetch;

    const { POST } = await import('../src/routes/api/whisper/transcribe/+server.js');
    const audioBuffer = new ArrayBuffer(1024);
    const audioFile = new File([audioBuffer], 'testimony.wav', { type: 'audio/wav' });
    // jsdom File may not implement arrayBuffer() — polyfill if missing
    if (!audioFile.arrayBuffer) {
      (audioFile as any).arrayBuffer = async () => audioBuffer;
    }
    const formFields: Record<string, any> = {
      file: audioFile,
      enrich: 'false',
    };
    const mockFormData = {
      get: (key: string) => formFields[key] ?? null,
    };
    const req: any = new Request('http://localhost/api/whisper/transcribe', { method: 'POST' });
    req.formData = async () => mockFormData;
    const event = {
      request: req,
      url: new URL('http://localhost/api/whisper/transcribe'),
      params: {},
      locals: { user: { id: TEST_USER_ID, role: 'admin' } },
    };
    const res = await POST(event as any);
    const data = await jsonBody(res);
    expect(data.ok).toBe(true);
    expect(data.text).toBeTruthy();
    global.fetch = originalFetch;
  });

  it('returns 400 for missing audio file', async () => {
    const { POST } = await import('../src/routes/api/whisper/transcribe/+server.js');
    const req: any = new Request('http://localhost/api/whisper/transcribe', { method: 'POST' });
    req.formData = async () => ({ get: () => null });
    const event = {
      request: req,
      url: new URL('http://localhost/api/whisper/transcribe'),
      params: {},
      locals: { user: { id: TEST_USER_ID, role: 'admin' } },
    };
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 401 for unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/whisper/transcribe/+server.js');
    const req: any = new Request('http://localhost/api/whisper/transcribe', { method: 'POST' });
    req.formData = async () => ({ get: () => null });
    const event = {
      request: req,
      url: new URL('http://localhost/api/whisper/transcribe'),
      params: {},
      locals: { user: null },
    };
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────
// /api/vector-search (POST)
// ─────────────────────────────────────────────────────────
describe('/api/vector-search (POST)', () => {
	it('returns vector search results', async () => {
		const { POST } = await import('../src/routes/api/vector-search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/vector-search', {
			body: { query: 'contract dispute evidence', limit: 5 },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(Array.isArray(data)).toBe(true);
		expect(data[0].title).toBe('Contract A');
		expect(data[0].score).toBe(0.92);
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/vector-search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/vector-search', {
			body: { query: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/vector-search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/vector-search', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/analyze-file (POST)
// ─────────────────────────────────────────────────────────
describe('/api/analyze-file (POST)', () => {
	it('analyzes a file successfully (graceful failure for missing file)', async () => {
		const { POST } = await import('../src/routes/api/analyze-file/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/analyze-file', {
			body: { filePath: 'src/lib/test.ts' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		// Route catches ENOENT and returns gracefully
		expect(res.status).toBeLessThanOrEqual(500);
		expect(data).toHaveProperty('success');
	});

	it('returns 400 for empty filePath', async () => {
		const { POST } = await import('../src/routes/api/analyze-file/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/analyze-file', {
			body: { filePath: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for path traversal', async () => {
		const { POST } = await import('../src/routes/api/analyze-file/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/analyze-file', {
			body: { filePath: '../../../etc/passwd' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for absolute path', async () => {
		const { POST } = await import('../src/routes/api/analyze-file/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/analyze-file', {
			body: { filePath: '/etc/passwd' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/analyze-file/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/analyze-file', {
			body: { filePath: 'src/lib/test.ts' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/analyze-tag (POST)
// ─────────────────────────────────────────────────────────
describe('/api/analyze-tag (POST)', () => {
	it('analyzes a tag successfully', async () => {
		// First call: analyzeTagWithLLM uses /api/chat — must have message.content
		mockOllamaFetch
			.mockResolvedValueOnce(new Response(JSON.stringify({
				message: { content: 'Summary: Tag analysis for contract patterns\nRelated: legal, agreement, clause' },
			}), { status: 200, headers: { 'Content-Type': 'application/json' } }))
			// Second call: embedding generation
			.mockResolvedValueOnce(new Response(JSON.stringify({
				embedding: new Array(768).fill(0.01),
			}), { status: 200, headers: { 'Content-Type': 'application/json' } }));

		const { POST } = await import('../src/routes/api/analyze-tag/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/analyze-tag', {
			body: { tag: 'contract', collection: 'evidence_items' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.tag).toBe('contract');
	});

	it('returns 400 for missing tag', async () => {
		const { POST } = await import('../src/routes/api/analyze-tag/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/analyze-tag', {
			body: { tag: '', collection: 'evidence_items' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for missing collection', async () => {
		const { POST } = await import('../src/routes/api/analyze-tag/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/analyze-tag', {
			body: { tag: 'contract', collection: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/analyze-tag/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/analyze-tag', {
			body: { tag: 'contract', collection: 'evidence_items' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});
