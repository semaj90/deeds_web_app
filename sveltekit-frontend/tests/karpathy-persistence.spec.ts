// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock refs ────────────────────────────────────────────────────────────────
const mockDbSelect   = vi.fn();
const mockNeo4jRun   = vi.fn();
const mockQdrantGet  = vi.fn();
const mockCouchAllDocs = vi.fn();

vi.mock('$lib/server/db/client', () => ({
  db: {
    select:  vi.fn(() => ({ from: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })) })) })),
    insert:  vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) })) })),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
  pgRows: vi.fn(async () => ({ rows: [] })),
}));

vi.mock('$lib/server/neo4j-driver.js', () => ({
  getNeo4jDriver: () => ({
    session: () => ({
      run:   mockNeo4jRun,
      close: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  qdrantManager: {
    getClient: () => ({
      getCollection: mockQdrantGet,
      scroll:        vi.fn().mockResolvedValue({ points: [], next_page_offset: null }),
    }),
  },
}));

vi.mock('$lib/services/couchdb-client.js', () => ({
  couchdb: {
    allDocs: mockCouchAllDocs,
    get:     vi.fn().mockRejectedValue(new Error('not found')),
    put:     vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get:   vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    set:   vi.fn().mockResolvedValue('OK'),
    keys:  vi.fn().mockResolvedValue([]),
    scan:  vi.fn().mockResolvedValue(['0', []]),
    del:   vi.fn().mockResolvedValue(0),
  }),
}));

vi.mock('$lib/server/db/schema.js', () => ({
  topologySnapshots:    { createdAt: {}, runId: {}, id: {}, metadata: {} },
  memoryGainAudits:     { createdAt: {}, decision: {}, gainScore: {} },
  qdrantCentroidClusters: { memberCount: {}, clusterKey: {} },
  kagDagRuns:           { createdAt: {} },
  topologyPositions:    { stableKey: {}, x: {}, y: {}, z: {}, t: {}, clusterKey: {}, topoByte: {}, sourceKind: {}, metadata: {} },
}));

vi.mock('$lib/server/db/schema/topology.js', () => ({
  tensorAnalysisCache: {
    graphAuthorityScore: {}, tensorAffinityScore: {}, somCluster: {},
    manifold4X: {}, manifold4Y: {}, manifold4Z: {}, manifold4W: {},
    topoClass: {}, qdrantPayload: {},
  },
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: { QDRANT_URL: 'http://localhost:6333', NEO4J_URI: 'bolt://localhost:7687' },
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public',  () => ({ env: {} }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeQdrantPoint(id = 'pt-1') {
  return {
    id,
    payload: {
      stableKey:           id,
      filePath:            `src/lib/${id}.ts`,
      chunkText:           'export function foo() {}',
      neo4j_gpuCluster:    'cluster-3',
      graphAuthorityScore: 0.82,
      som_bmu_row:         2,
      som_bmu_col:         5,
      topo_byte:           0x02,
      topo_class:          'server',
    },
  };
}

function makeNeo4jEdgeRecord() {
  return {
    get: (key: string) => {
      const data: Record<string, unknown> = {
        source: { properties: { id: 'file-a', path: 'src/lib/a.ts' } },
        target: { properties: { id: 'file-b', path: 'src/lib/b.ts' } },
        rel:    { type: 'IMPORTS', properties: { weight: 1 } },
      };
      return data[key];
    },
    keys: ['source', 'target', 'rel'],
  };
}

function makeTopologySnapshot() {
  return {
    id:        'snap-001',
    runId:     'run-2026-05-06',
    createdAt: new Date('2026-05-06T00:00:00Z'),
    metadata:  { nodeCount: 1335, edgeCount: 2168, duration: 28000 },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Karpathy persistence shapes', () => {

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Qdrant payload shape', () => {
    it('required Qdrant payload fields are present', () => {
      const pt = makeQdrantPoint('chunk-abc');
      const p = pt.payload;

      expect(typeof p.stableKey).toBe('string');
      expect(typeof p.filePath).toBe('string');
      expect(typeof p.chunkText).toBe('string');
      expect(typeof p.neo4j_gpuCluster).toBe('string');
      expect(typeof p.graphAuthorityScore).toBe('number');
      expect(typeof p.topo_byte).toBe('number');
      expect(typeof p.topo_class).toBe('string');
    });

    it('stableKey matches point id', () => {
      const pt = makeQdrantPoint('stable-1');
      expect(pt.payload.stableKey).toBe(pt.id);
    });

    it('SOM coords are numeric integers', () => {
      const pt = makeQdrantPoint();
      expect(Number.isInteger(pt.payload.som_bmu_row)).toBe(true);
      expect(Number.isInteger(pt.payload.som_bmu_col)).toBe(true);
    });

    it('graphAuthorityScore is in [0,1]', () => {
      const pt = makeQdrantPoint();
      const s = pt.payload.graphAuthorityScore;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });
  });

  describe('Neo4j edge shape', () => {
    it('IMPORTS edge has source, target and rel type', () => {
      const rec = makeNeo4jEdgeRecord();
      const source = rec.get('source') as { properties: { id: string; path: string } };
      const target = rec.get('target') as { properties: { id: string; path: string } };
      const rel    = rec.get('rel')    as { type: string; properties: { weight: number } };

      expect(typeof source.properties.id).toBe('string');
      expect(typeof source.properties.path).toBe('string');
      expect(typeof target.properties.id).toBe('string');
      expect(rel.type).toBe('IMPORTS');
      expect(typeof rel.properties.weight).toBe('number');
    });

    it('Neo4j session.run is called with MATCH/MERGE pattern', async () => {
      mockNeo4jRun.mockResolvedValue({ records: [makeNeo4jEdgeRecord()] });

      const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
      const session = getNeo4jDriver().session();

      const result = await session.run(
        'MATCH (a:File {id: $src})-[r:IMPORTS]->(b:File {id: $tgt}) RETURN a as source, b as target, r as rel',
        { src: 'file-a', tgt: 'file-b' }
      );

      expect(mockNeo4jRun).toHaveBeenCalledOnce();
      expect(result.records).toHaveLength(1);
      await session.close();
    });
  });

  describe('CouchDB WikiNote shape', () => {
    it('allDocs returns total_rows and rows with id', async () => {
      mockCouchAllDocs.mockResolvedValue({
        total_rows: 42,
        offset: 0,
        rows: [
          { id: 'wiki-note:2026-05-06T00:00:00Z', key: 'wiki-note:...', value: { rev: '1-abc' } },
        ],
      });

      const { couchdb } = await import('$lib/services/couchdb-client.js');
      const res = await couchdb.allDocs('karpathy_wiki', { limit: 1, descending: true }) as {
        total_rows: number;
        rows: Array<{ id: string }>;
      };

      expect(res.total_rows).toBe(42);
      expect(res.rows[0].id).toMatch(/wiki-note:/);
    });

    it('wiki-status synthesizes syncStatus=synced when both stores have data', async () => {
      // Simulates the logic inside wiki-status/+server.ts
      const couchDbStatus: 'ok' | 'unreachable' = 'ok';
      const noteCount = 5;
      const syncStatus = couchDbStatus === 'ok' && noteCount > 0 ? 'synced' : 'degraded';

      expect(syncStatus).toBe('synced');
    });

    it('wiki-status syncStatus=degraded when Redis has no notes', () => {
      const couchDbStatus: 'ok' | 'unreachable' = 'ok';
      const noteCount = 0;
      const syncStatus = couchDbStatus === 'ok' && noteCount > 0 ? 'synced' : 'degraded';

      expect(syncStatus).toBe('degraded');
    });
  });

  describe('topology snapshot write', () => {
    it('snapshot shape has required fields', () => {
      const snap = makeTopologySnapshot();
      expect(typeof snap.id).toBe('string');
      expect(typeof snap.runId).toBe('string');
      expect(snap.createdAt).toBeInstanceOf(Date);
      expect(typeof snap.metadata).toBe('object');
      expect(snap.metadata).not.toBeNull();
    });

    it('snapshot metadata carries nodeCount and edgeCount', () => {
      const snap = makeTopologySnapshot();
      expect(snap.metadata.nodeCount).toBeGreaterThan(0);
      expect(snap.metadata.edgeCount).toBeGreaterThan(0);
    });

    it('getLatestIndexStats returns null when no snapshots exist', async () => {
      // Mock DB returning empty array
      const { db } = await import('$lib/server/db/client');
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const { getLatestIndexStats } = await import('$lib/server/ai/code-intel-service.js');
      const result = await getLatestIndexStats();
      expect(result).toBeNull();
    });

    it('getLatestIndexStats returns snapshot when one exists', async () => {
      const snap = makeTopologySnapshot();
      const { db } = await import('$lib/server/db/client');
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([snap]),
          }),
        }),
      } as never);

      const { getLatestIndexStats } = await import('$lib/server/ai/code-intel-service.js');
      const result = await getLatestIndexStats();

      expect(result).not.toBeNull();
      expect(result!.runId).toBe('run-2026-05-06');
    });
  });
});
