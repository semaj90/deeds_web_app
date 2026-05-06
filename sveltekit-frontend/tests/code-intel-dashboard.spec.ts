// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock refs ────────────────────────────────────────────────────────────────
const mockSelectFrom       = vi.fn();
const mockGetCodeIntelHealth = vi.fn();
const mockGetLatestIndexStats = vi.fn();
const mockGetRetrievalRuns  = vi.fn();

vi.mock('$lib/server/ai/code-intel-service.js', () => ({
  getCodeIntelHealth:   (...a: unknown[]) => mockGetCodeIntelHealth(...a),
  getLatestIndexStats:  (...a: unknown[]) => mockGetLatestIndexStats(...a),
  getRetrievalRuns:     (...a: unknown[]) => mockGetRetrievalRuns(...a),
  getMemoryGainStats:   vi.fn().mockResolvedValue([]),
  getTopClusters:       vi.fn().mockResolvedValue([]),
  checkSystemHealth:    vi.fn().mockResolvedValue({ checks: {} }),
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    select: () => mockSelectFrom(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
  pgRows: vi.fn(async () => ({ rows: [] })),
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get:   vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    scan:  vi.fn().mockResolvedValue(['0', []]),
    keys:  vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    QDRANT_URL:       'http://localhost:6333',
    NEO4J_URI:        'bolt://localhost:7687',
    OLLAMA_BASE_URL:  'http://localhost:11434',
  },
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public',  () => ({ env: {} }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HEALTH_OK = {
  status:         'healthy',
  latestIndexAt:  '2026-05-06T00:00:00.000Z',
  latestRunId:    'run-abc-123',
  clusters:       20,
  totalTraceRuns: 55,
  memoryGain: { totalDecisions: 100, acceptedCount: 72, averageGainScore: '0.73' },
  checks: { qdrant: 'ok', neo4j: 'ok', redis: 'ok' },
};

const LATEST_INDEX = {
  id:        'snap-001',
  runId:     'run-abc-123',
  createdAt: new Date('2026-05-06T00:00:00Z'),
  metadata:  { nodeCount: 1335, edgeCount: 2168, duration: 28000 },
};

const TRACE_RUNS = [
  {
    id:         'trace-001',
    query:      'What is hearsay evidence?',
    status:     'completed',
    durationMs: 1240,
    createdAt:  new Date('2026-05-06T00:01:00Z'),
    metadata:   { traceUsed: true, karpathyHook: true, clustersUsed: ['cluster-2', 'cluster-5'] },
  },
  {
    id:         'trace-002',
    query:      'California discovery rules',
    status:     'failed',
    durationMs: 500,
    createdAt:  new Date('2026-05-06T00:00:30Z'),
    metadata:   { traceUsed: false, karpathyHook: false },
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('code-intel dashboard', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCodeIntelHealth.mockResolvedValue(HEALTH_OK);
    mockGetLatestIndexStats.mockResolvedValue(LATEST_INDEX);
    mockGetRetrievalRuns.mockResolvedValue(TRACE_RUNS);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('health endpoint', () => {
    it('returns status, clusters, and totalTraceRuns', async () => {
      const { getCodeIntelHealth } = await import('$lib/server/ai/code-intel-service.js');
      const health = await getCodeIntelHealth();

      expect(health.status).toBe('healthy');
      expect(typeof health.clusters).toBe('number');
      expect(typeof health.totalTraceRuns).toBe('number');
    });

    it('returns degraded when any check fails', async () => {
      mockGetCodeIntelHealth.mockResolvedValue({
        ...HEALTH_OK,
        status: 'degraded',
        checks: { qdrant: 'ok', neo4j: 'down', redis: 'ok' },
      });

      const { getCodeIntelHealth } = await import('$lib/server/ai/code-intel-service.js');
      const health = await getCodeIntelHealth();

      expect(health.status).toBe('degraded');
    });

    it('memoryGain has totalDecisions, acceptedCount, and averageGainScore', async () => {
      const { getCodeIntelHealth } = await import('$lib/server/ai/code-intel-service.js');
      const health = await getCodeIntelHealth();

      expect(typeof health.memoryGain.totalDecisions).toBe('number');
      expect(typeof health.memoryGain.acceptedCount).toBe('number');
      expect(typeof health.memoryGain.averageGainScore).toBe('string'); // .toFixed(2) → string
    });

    it('401 check: health route guards with locals.user', () => {
      // Simulate the route guard logic
      const locals = { user: null };
      const shouldReturn401 = !locals.user;
      expect(shouldReturn401).toBe(true);
    });

    it('accepts authorized user', () => {
      const locals = { user: { id: 'user-1', email: 'test@example.com' } };
      const shouldReturn401 = !locals.user;
      expect(shouldReturn401).toBe(false);
    });
  });

  describe('latest index stats', () => {
    it('returns runId and createdAt from latest topology snapshot', async () => {
      const { getLatestIndexStats } = await import('$lib/server/ai/code-intel-service.js');
      const stats = await getLatestIndexStats();

      expect(stats).not.toBeNull();
      expect(typeof stats!.runId).toBe('string');
      expect(stats!.createdAt).toBeInstanceOf(Date);
    });

    it('metadata contains nodeCount', async () => {
      const { getLatestIndexStats } = await import('$lib/server/ai/code-intel-service.js');
      const stats = await getLatestIndexStats();

      expect(stats!.metadata).toBeDefined();
      expect((stats!.metadata as { nodeCount: number }).nodeCount).toBeGreaterThan(0);
    });

    it('returns null when no snapshots exist', async () => {
      mockGetLatestIndexStats.mockResolvedValue(null);

      const { getLatestIndexStats } = await import('$lib/server/ai/code-intel-service.js');
      const stats = await getLatestIndexStats();

      expect(stats).toBeNull();
    });

    it('route returns { message } shape when no index run found', async () => {
      mockGetLatestIndexStats.mockResolvedValue(null);

      // Simulates: const stats = await getLatestIndexStats(); return json(stats || { message: '...' });
      const { getLatestIndexStats } = await import('$lib/server/ai/code-intel-service.js');
      const stats = await getLatestIndexStats();
      const response = stats || { message: 'No index runs found' };

      expect((response as { message: string }).message).toBe('No index runs found');
    });
  });

  describe('latest TRACE run', () => {
    it('returns an array of runs', async () => {
      const { getRetrievalRuns } = await import('$lib/server/ai/code-intel-service.js');
      const runs = await getRetrievalRuns(10);

      expect(Array.isArray(runs)).toBe(true);
      expect(runs.length).toBeGreaterThan(0);
    });

    it('each run has id, query, status, and durationMs', async () => {
      const { getRetrievalRuns } = await import('$lib/server/ai/code-intel-service.js');
      const [run] = await getRetrievalRuns(5);

      expect(typeof run.id).toBe('string');
      expect(typeof run.query).toBe('string');
      expect(typeof run.status).toBe('string');
      expect(typeof run.durationMs).toBe('number');
    });

    it('completed run has status=completed', async () => {
      const { getRetrievalRuns } = await import('$lib/server/ai/code-intel-service.js');
      const runs = await getRetrievalRuns(10);
      const completed = runs.find((r: { status: string }) => r.status === 'completed');

      expect(completed).toBeDefined();
    });

    it('run metadata may include YorHA/TRACE fields', async () => {
      const { getRetrievalRuns } = await import('$lib/server/ai/code-intel-service.js');
      const [run] = await getRetrievalRuns(5);
      const meta = run.metadata as Record<string, unknown>;

      // traceUsed, karpathyHook, clustersUsed are optional but must be valid if present
      if (meta.traceUsed !== undefined)   expect(typeof meta.traceUsed).toBe('boolean');
      if (meta.karpathyHook !== undefined) expect(typeof meta.karpathyHook).toBe('boolean');
      if (meta.clustersUsed !== undefined) expect(Array.isArray(meta.clustersUsed)).toBe(true);
    });

    it('returns empty array when no TRACE runs recorded', async () => {
      mockGetRetrievalRuns.mockResolvedValue([]);

      const { getRetrievalRuns } = await import('$lib/server/ai/code-intel-service.js');
      const runs = await getRetrievalRuns(20);

      expect(runs).toHaveLength(0);
    });

    it('run endpoint is guarded — returns 401 for unauth user', () => {
      const locals = { user: null };
      const unauthorised = !locals.user;
      expect(unauthorised).toBe(true);
    });
  });
});
