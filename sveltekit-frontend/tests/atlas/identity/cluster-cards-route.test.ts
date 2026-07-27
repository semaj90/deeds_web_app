// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTracedQuery,
  mockRedisGet,
  mockRedisSetex,
  mockRedisTtl,
} = vi.hoisted(() => ({
  mockTracedQuery: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSetex: vi.fn(),
  mockRedisTtl: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
  tracedQuery: mockTracedQuery,
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get: mockRedisGet,
    setex: mockRedisSetex,
    ttl: mockRedisTtl,
  }),
}));

describe('/api/atlas/cluster-cards route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRedisTtl.mockResolvedValue(280);
    mockRedisSetex.mockResolvedValue('OK');
  });

  it('returns 401 for unauthenticated GET instead of a 500', async () => {
    const mod = await import('../../../src/routes/api/atlas/cluster-cards/+server.js');
    const url = new URL('http://localhost/api/atlas/cluster-cards?limit=5');

    let status = 500;
    try {
      await mod.GET({
        request: new Request(url, { method: 'GET' }),
        url,
        params: {},
        locals: {},
      });
    } catch (err) {
      status = (err as { status?: number }).status ?? 500;
    }

    expect(status).toBe(401);
  });

  it('returns canonical cards from the live legacy contract path', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockTracedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            source_ref: 'src/routes/api/atlas/cluster-cards/+server.ts',
            feature_id: 'atlas.cluster-cards',
            packet_key: 'packet:123',
            cluster_id: '45',
            centroid_id: '258',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '45',
            centroid_dim: 768,
            created_at: '2026-07-01T00:00:00.000Z',
            updated_at: '2026-07-26T12:00:00.000Z',
            card: {
              id: '45',
              cluster_label: 'Cluster 45',
              summary: 'Legacy cluster summary',
              files: ['src/routes/api/atlas/cluster-cards/+server.ts'],
              features: ['atlas.cluster-cards'],
              member_count: 4,
              authority_score: 0.5,
            },
          },
        ],
      });

    const mod = await import('../../../src/routes/api/atlas/cluster-cards/+server.js');
    const response = await mod.POST({
      request: new Request('http://localhost/api/atlas/cluster-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceRef: 'cluster-cards',
          featureId: 'atlas.cluster-cards',
          limit: 5,
          aliasId: '123e4567-e89b-42d3-a456-426614174000',
        }),
      }),
      url: new URL('http://localhost/api/atlas/cluster-cards'),
      params: {},
      locals: { user: { id: 'user-1' } },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.totalCount).toBe(1);
    expect(payload.cache.hit).toBe(false);
    expect(payload.cache.key).toContain('ace:cluster-cards:v1:');
    expect(payload.trace.requestAliasId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(payload.clusterCards[0].clusterId).toBe('45');
    expect(payload.clusterCards[0].packetKeys).toEqual(['packet:123']);
    expect(payload.warnings).toContain('LEGACY_CLUSTER_CARDS_SCHEMA');
    expect(mockRedisSetex).toHaveBeenCalledOnce();
  });

  it('serves a validated cache hit when present', async () => {
    mockRedisGet.mockResolvedValueOnce(
      JSON.stringify([
        {
          schemaVersion: 1,
          clusterId: '1',
          clusterType: 'kmeans',
          domain: null,
          label: 'Cluster 1',
          summary: 'Cached',
          sourceRefs: ['src/lib/a.ts'],
          packetKeys: ['packet:a'],
          featureIds: ['feature.a'],
          memberCount: 1,
          score: 0.3,
          generatedAt: '2026-07-26T12:00:00.000Z',
          snapshotId: 'legacy-cluster-cards:1:768',
          centroidId: '1',
        },
      ])
    );

    const mod = await import('../../../src/routes/api/atlas/cluster-cards/+server.js');
    const response = await mod.GET({
      request: new Request('http://localhost/api/atlas/cluster-cards?limit=5', { method: 'GET' }),
      url: new URL('http://localhost/api/atlas/cluster-cards?limit=5'),
      params: {},
      locals: { user: { id: 'user-1' } },
    });

    const payload = await response.json();
    expect(payload.cache.hit).toBe(true);
    expect(payload.cache.status).toBe('hit');
    expect(payload.totalCount).toBe(1);
    expect(mockTracedQuery).not.toHaveBeenCalled();
  });
});
